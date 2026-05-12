import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';

/**
 * GET /api/unsplash/photo?q=<destination>   [auth required]
 *
 * Server-side proxy to Unsplash so the access key never reaches the browser.
 * Returns the top-relevance landscape photo for a destination keyword, or
 * { photo: null } if no key is configured, the search returns nothing, or
 * Unsplash rate-limits us.
 *
 * Auth gate: pre-launch QA flagged this as a quota-drainable endpoint —
 * the 50 req/hr demo-tier key would burn down quickly from anonymous
 * abuse. Now signed-in users only.
 *
 * Caching: Next.js fetch cache holds each query response for 7 days. With
 * curated DEST_PHOTOS handling popular destinations synchronously in
 * TripCard, this endpoint only fires for the long tail — and then at most
 * once per destination per week.
 */
export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  if (!query) {
    return NextResponse.json({ error: 'q required' }, { status: 400 });
  }

  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    // No key configured — let the client gracefully fall back to placeholder.
    return NextResponse.json({ photo: null });
  }

  try {
    const apiUrl =
      `https://api.unsplash.com/search/photos` +
      `?query=${encodeURIComponent(query)}` +
      `&orientation=landscape&per_page=1&content_filter=high`;

    const res = await fetch(apiUrl, {
      headers: { Authorization: `Client-ID ${key}` },
      next: { revalidate: 60 * 60 * 24 * 7 },
    });

    if (!res.ok) {
      // 403 = rate limited, 401 = bad key. Either way, return null and let
      // the client keep its placeholder rather than surfacing an error.
      return NextResponse.json({ photo: null });
    }

    const data = await res.json();
    const photo = data?.results?.[0];
    if (!photo) return NextResponse.json({ photo: null });

    return NextResponse.json({
      photo: {
        url: photo.urls?.regular ?? photo.urls?.small ?? null,
        photographer: photo.user?.name ?? null,
        photographerUrl: photo.user?.links?.html ?? null,
        photoUrl: photo.links?.html ?? null,
        downloadLocation: photo.links?.download_location ?? null,
      },
    });
  } catch (err) {
    console.warn('[unsplash] fetch failed:', err);
    return NextResponse.json({ photo: null });
  }
}
