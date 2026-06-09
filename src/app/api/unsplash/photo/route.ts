import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { consumeRateLimit } from '@/lib/supabase/rateLimit';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/unsplash/photo?q=<destination>   [auth required]
 *
 * Server-side proxy to Unsplash so the access key never reaches the browser.
 * Returns the top-relevance landscape photo (+ photographer credit + the
 * download-tracking location) for a destination keyword, or { photo: null }.
 *
 * Caching: a durable `unsplash_cache` row per normalized query, shared across
 * ALL surfaces (trip covers, Discover destination cards, featured heroes). We
 * pull each destination from Unsplash at most once — every later request for
 * that destination is served from the DB. Survives redeploys (unlike the old
 * Next fetch cache) and carries the metadata every consumer needs to credit
 * the photo + fire the required download ping.
 *
 * Auth gate: signed-in users only (the demo-tier key is quota-drainable).
 */
interface UnsplashPhoto {
  url: string | null;
  photographer: string | null;
  photographerUrl: string | null;
  photoUrl: string | null;
  downloadLocation: string | null;
}

export async function GET(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  if (!query) {
    return NextResponse.json({ error: 'q required' }, { status: 400 });
  }
  const cacheKey = query.toLowerCase();

  const admin = createAdminClient();

  // 1. Durable shared cache — one pull per destination, ever. A cache hit
  //    never touches Unsplash and isn't rate-limited (it's a cheap PK lookup),
  //    so a page full of cached destinations browses freely.
  const { data: cached } = await admin
    .from('unsplash_cache')
    .select('url, photographer, photographer_url, photo_url, download_location')
    .eq('query', cacheKey)
    .maybeSingle();

  if (cached?.url) {
    return NextResponse.json({
      photo: {
        url: cached.url,
        photographer: cached.photographer,
        photographerUrl: cached.photographer_url,
        photoUrl: cached.photo_url,
        downloadLocation: cached.download_location,
      } satisfies UnsplashPhoto,
    });
  }

  // 2. Cache miss → live Unsplash pull. Rate-limit ONLY this path (the one that
  //    actually spends quota); generous burst since real misses are the long
  //    tail now that everything shares the cache.
  if (!(await consumeRateLimit(`unsplash_photo:user:${auth.ctx.userId}`, 60, 60))) {
    return NextResponse.json({ photo: null }, { status: 429 });
  }

  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
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
      // 403 = rate limited, 401 = bad key — return null, keep the placeholder.
      return NextResponse.json({ photo: null });
    }

    const data = await res.json();
    const photo = data?.results?.[0];
    if (!photo) return NextResponse.json({ photo: null });

    const resolved: UnsplashPhoto = {
      url: photo.urls?.regular ?? photo.urls?.small ?? null,
      photographer: photo.user?.name ?? null,
      photographerUrl: photo.user?.links?.html ?? null,
      photoUrl: photo.links?.html ?? null,
      downloadLocation: photo.links?.download_location ?? null,
    };

    // Persist for every future request for this destination. Upsert so two
    // concurrent misses don't collide on the primary key. Best-effort — a
    // failed write just means the next request re-pulls.
    if (resolved.url) {
      await admin
        .from('unsplash_cache')
        .upsert(
          {
            query: cacheKey,
            url: resolved.url,
            photographer: resolved.photographer,
            photographer_url: resolved.photographerUrl,
            photo_url: resolved.photoUrl,
            download_location: resolved.downloadLocation,
          },
          { onConflict: 'query' },
        );
    }

    return NextResponse.json({ photo: resolved });
  } catch (err) {
    console.warn('[unsplash] fetch failed:', err);
    return NextResponse.json({ photo: null });
  }
}
