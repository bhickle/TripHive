import { NextResponse } from 'next/server';
import { isGoogleMapsUrl } from '@/lib/google/parseMapsUrl';

/**
 * POST /api/google/resolve
 *
 * Resolves a short Google Maps URL (maps.app.goo.gl / goo.gl/maps) by
 * following its HTTP redirect and returning the final long-form URL.
 * Body: { url: string }   Response: { resolvedUrl: string }
 *
 * Why this lives server-side: the redirect-following fetch can't run in
 * the browser because Google blocks CORS on these endpoints. The server
 * fetch is unrestricted.
 *
 * No Google Places API cost — just a single HEAD-equivalent fetch.
 *
 * Hardened against URL-validator bypass: the input must already match
 * isGoogleMapsUrl(), so this endpoint can't be used as a generic
 * server-side fetch proxy.
 */

export const runtime = 'nodejs';

const RESOLVE_TIMEOUT_MS = 5000;

export async function POST(request: Request) {
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
    // GET (not HEAD) because some Google short URLs return the redirect
    // only on GET. `redirect: 'follow'` makes fetch chase the chain
    // and expose the final URL on the response object.
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      // Don't ship cookies / referrer — keeps this endpoint stateless
      // and avoids leaking user context across the redirect.
      headers: { 'User-Agent': 'TripCoord-LinkResolver/1.0' },
    });
    clearTimeout(timer);

    // Final URL is the post-redirect URL. If no redirect happened (the
    // input was already a long URL), this still works — it just returns
    // the input.
    const resolvedUrl = res.url;
    if (!resolvedUrl || !isGoogleMapsUrl(resolvedUrl)) {
      return NextResponse.json({ error: 'Resolved URL is not a Google Maps URL' }, { status: 422 });
    }

    return NextResponse.json({ resolvedUrl });
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (controller.signal.aborted) {
      return NextResponse.json({ error: 'Resolve timed out' }, { status: 504 });
    }
    return NextResponse.json({ error: `Resolve failed: ${message}` }, { status: 502 });
  }
}
