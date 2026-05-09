import { NextResponse } from 'next/server';

/**
 * POST /api/og-preview
 * Body: { url: string }
 *
 * Server-side fetch + Open Graph parse for a user-supplied URL. Used by
 * the wishlist page so pasted links render as rich preview cards
 * (title / image / description / site name).
 *
 * SSRF protections:
 *   - Only http/https schemes
 *   - Block private IP ranges + localhost
 *   - 5s timeout
 *   - Cap response body at 512KB before parsing
 *   - Set a TripCoord User-Agent so site owners can identify our bot
 *
 * Caching: Next.js fetch cache holds each URL response for 24h, so a
 * popular link only round-trips to the source site once per day across
 * all users.
 *
 * Failure modes are silent (return { preview: null }) — the client
 * just stores the bare URL when we can't extract metadata.
 */
export async function POST(req: Request) {
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
    // endpoint as if it does.
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host === '0.0.0.0' ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^fc00:/.test(host) ||
      /^fd00:/.test(host) ||
      host === '::1'
    ) {
      return NextResponse.json({ error: 'unsupported host' }, { status: 400 });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    let html = '';
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; TripCoordBot/1.0; +https://tripcoord.ai)',
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
