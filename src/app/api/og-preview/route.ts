import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { consumeRateLimit } from '@/lib/supabase/rateLimit';
import dns from 'node:dns/promises';

export const runtime = 'nodejs';

// SSRF: reject an IP literal in any private/loopback/link-local/ULA/CGNAT
// range. Used for both the URL hostname (when it's already an IP) and every
// DNS-resolved A/AAAA address. Mirrors fetch-reference's isUnsafeIp.
function isUnsafeIp(ipRaw: string): boolean {
  const host = ipRaw.toLowerCase();
  return (
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '::' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
    /^169\.254\./.test(host) ||      // link-local, incl. AWS/GCP metadata IP
    /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(host) || // CGNAT
    /^fc00:/.test(host) ||
    /^fd[0-9a-f]{2}:/.test(host) ||  // unique local addrs (full ULA range)
    /^fe80:/.test(host) ||           // IPv6 link-local
    /^::ffff:/.test(host)            // IPv4-mapped IPv6 (don't trust)
  );
}

/**
 * Resolve a hostname to its A/AAAA addresses and verify NONE land in a
 * private/loopback/link-local range. Resolution failure → unsafe (we don't
 * fetch hosts we couldn't verify). Catches "public-looking" hostnames an
 * attacker controls that resolve to internal IPs.
 */
async function resolvedHostIsSafe(hostname: string): Promise<boolean> {
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (addresses.length === 0) return false;
    for (const a of addresses) {
      if (isUnsafeIp(a.address)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /api/og-preview   [auth required]
 * Body: { url: string }
 *
 * Server-side fetch + Open Graph parse for a user-supplied URL. Used by
 * the wishlist page so pasted links render as rich preview cards
 * (title / image / description / site name).
 *
 * Auth gate: pre-launch QA flagged this as a P0 — without auth, anyone
 * could use the endpoint as an HTTP-fetch proxy (cache-amplified). The
 * SSRF blocklist below mitigates the worst class of abuse (internal
 * network probes) but doesn't stop generic web scraping.
 *
 * SSRF protections:
 *   - Only http/https schemes
 *   - Block private IP ranges + localhost
 *   - 5s timeout
 *   - Cap response body at 512KB before parsing
 *   - Set a tripcoord User-Agent so site owners can identify our bot
 *
 * Caching: Next.js fetch cache holds each URL response for 24h, so a
 * popular link only round-trips to the source site once per day across
 * all users.
 *
 * Failure modes are silent (return { preview: null }) — the client
 * just stores the bare URL when we can't extract metadata.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  // Per-user rate limit — this is an outbound-fetch proxy; bound one account
  // from looping it (QA #21).
  if (!(await consumeRateLimit(`og_preview:user:${auth.ctx.userId}`, 30, 60))) {
    return NextResponse.json({ error: 'RATE_LIMITED', message: 'Too many requests — please slow down.' }, { status: 429 });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url required' }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: 'invalid url' }, { status: 400 });
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'unsupported protocol' }, { status: 400 });
    }
    // SSRF: refuse private/loopback hosts. Defensive — Vercel functions
    // shouldn't have access to internal networks anyway, but treat the
    // endpoint as if it does. Two stages: (1) literal denylist + IP-literal
    // range check on the URL hostname; (2) DNS resolution + range check on
    // every resolved A/AAAA, so a "public-looking" hostname that resolves to
    // an internal IP is caught before the fetch fires.
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      isUnsafeIp(host)
    ) {
      return NextResponse.json({ error: 'unsupported host' }, { status: 400 });
    }
    if (!(await resolvedHostIsSafe(host))) {
      return NextResponse.json({ error: 'unsupported host' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    let html = '';
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        // Don't auto-follow redirects — a public host could 30x to an internal
        // one, bypassing the SSRF guard we ran against the original hostname.
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; tripcoordBot/1.0; +https://tripcoord.ai)',
          Accept: 'text/html,application/xhtml+xml',
        },
        next: { revalidate: 60 * 60 * 24 },
      });
      if (!res.ok) {
        return NextResponse.json({ preview: null });
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html')) {
        return NextResponse.json({ preview: null });
      }
      const text = await res.text();
      html = text.slice(0, 512 * 1024);
    } catch {
      return NextResponse.json({ preview: null });
    } finally {
      clearTimeout(timeoutId);
    }

    // Pull common Open Graph + Twitter fallbacks. Regex is fine for v1 —
    // we don't need to handle every weird HTML shape, just the standard
    // <meta property="og:..." content="..."> form most sites emit.
    const ogProperty = (prop: string): string | null => {
      const propRe = new RegExp(
        `<meta\\s+[^>]*property=["']${prop}["'][^>]*content=["']([^"']*)["']`,
        'i',
      );
      const propMatch = html.match(propRe);
      if (propMatch?.[1]) return decodeHtml(propMatch[1]);
      const swapRe = new RegExp(
        `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*property=["']${prop}["']`,
        'i',
      );
      const swapMatch = html.match(swapRe);
      if (swapMatch?.[1]) return decodeHtml(swapMatch[1]);
      return null;
    };
    const twName = (name: string): string | null => {
      const re = new RegExp(
        `<meta\\s+[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`,
        'i',
      );
      const m = html.match(re);
      if (m?.[1]) return decodeHtml(m[1]);
      return null;
    };
    const titleTag = (): string | null => {
      const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      return m?.[1] ? decodeHtml(m[1].trim()) : null;
    };

    const title = ogProperty('og:title') || twName('twitter:title') || titleTag();
    const description = ogProperty('og:description') || twName('twitter:description');
    const rawImage = ogProperty('og:image') || twName('twitter:image');
    const siteName = ogProperty('og:site_name');

    if (!title && !description && !rawImage) {
      return NextResponse.json({ preview: null });
    }

    // Resolve relative image paths against the source URL so the client
    // can render them directly without re-resolving.
    let image: string | null = null;
    if (rawImage) {
      try {
        image = new URL(rawImage, url).href;
      } catch {
        image = null;
      }
    }

    return NextResponse.json({
      preview: {
        url,
        title: title ?? null,
        description: description ?? null,
        image,
        siteName: siteName ?? null,
      },
    });
  } catch (err) {
    console.error('og-preview error:', err);
    return NextResponse.json({ preview: null });
  }
}

// Decode the handful of HTML entities OG-tag values commonly contain.
// Full entity decoding is overkill for our use case — these five cover
// 99%+ of what we'll see in the wild.
function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}
