import { NextResponse } from 'next/server';
import { isGoogleMapsUrl } from '@/lib/google/parseMapsUrl';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { consumeRateLimit } from '@/lib/supabase/rateLimit';

/**
 * POST /api/google/resolve
 *
 * Resolves a short Google Maps URL (maps.app.goo.gl / goo.gl/maps) by
 * following its HTTP redirect chain and returning the final long-form
 * URL. Body: { url: string }   Response: { resolvedUrl: string }
 *
 * Why this lives server-side: the redirect-following fetch can't run in
 * the browser because Google blocks CORS on these endpoints.
 *
 * No Google Places API cost — just a few HEAD-equivalent fetches.
 *
 * Security model
 *   - requireAuth() gates the endpoint so an anonymous caller can't
 *     drain Vercel function quota by spamming resolve requests. Both
 *     in-app callers (wishlist + itinerary modal) are already
 *     authenticated user flows.
 *   - Input URL is validated against the Google-Maps host allowlist.
 *   - Redirects are followed MANUALLY: at each hop we re-validate the
 *     `Location` header against the allowlist before issuing the next
 *     request. This closes the SSRF surface that `redirect: 'follow'`
 *     opened (intermediate hops would otherwise fire against attacker-
 *     controlled hosts, since `fetch` only exposes the FINAL `res.url`
 *     to our allowlist check).
 *   - 5s wall-clock budget total across all hops. 5 hop maximum.
 *   - No cookies / referrer forwarded.
 */

export const runtime = 'nodejs';

const RESOLVE_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 5;

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  // Per-user rate limit — follows a redirect chain server-side; bound abuse (QA #21).
  if (!(await consumeRateLimit(`google_resolve:user:${auth.ctx.userId}`, 30, 60))) {
    return NextResponse.json({ error: 'RATE_LIMITED', message: 'Too many requests — please slow down.' }, { status: 429 });
  }

  let url: string;
  try {
    const body = await request.json();
    url = typeof body?.url === 'string' ? body.url : '';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!url || !isGoogleMapsUrl(url)) {
    return NextResponse.json({ error: 'Not a Google Maps URL' }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

  try {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'tripcoord-LinkResolver/1.0' },
      });

      // Drop the response body promptly — we only read status + Location.
      // Keeps the connection from sitting open while waiting on GC.
      await res.body?.cancel().catch(() => { /* already closed */ });

      // 3xx with a Location header → validate it and continue.
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) {
          clearTimeout(timer);
          return NextResponse.json({ error: 'Redirect without Location header' }, { status: 502 });
        }
        // Some servers return relative redirects — resolve against the
        // current URL before allowlist check.
        const next = new URL(location, current).toString();
        if (!isGoogleMapsUrl(next)) {
          clearTimeout(timer);
          return NextResponse.json({ error: 'Redirect target is not a Google Maps URL' }, { status: 422 });
        }
        current = next;
        continue;
      }

      // Non-3xx terminal response. The `current` URL is the final one.
      clearTimeout(timer);
      if (!isGoogleMapsUrl(current)) {
        return NextResponse.json({ error: 'Resolved URL is not a Google Maps URL' }, { status: 422 });
      }
      return NextResponse.json({ resolvedUrl: current });
    }

    clearTimeout(timer);
    return NextResponse.json({ error: 'Too many redirects' }, { status: 508 });
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (controller.signal.aborted) {
      return NextResponse.json({ error: 'Resolve timed out' }, { status: 504 });
    }
    return NextResponse.json({ error: `Resolve failed: ${message}` }, { status: 502 });
  }
}
