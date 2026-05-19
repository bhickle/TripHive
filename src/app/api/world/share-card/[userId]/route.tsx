import { ImageResponse } from 'next/og';
import { createAdminClient } from '@/lib/supabase/admin';
import { destinationToCountry, countryToContinent } from '@/lib/world/countryLookup';

/** Card-strip photo: real photo first, falls back to trip cover_image when
 *  the strip has fewer than 6 uploaded photos. */
interface CardPhoto {
  url: string;
  isCover: boolean;
}

/**
 * GET /api/world/share-card/[userId]
 *
 * Server-renders a 1200×630 PNG share card summarising a user's travels:
 *   - First name + "'s World" headline
 *   - Big country count + secondary stats (cities · continents · days)
 *   - Row of passport-stamp emojis (one per completed trip)
 *   - Photo strip of up to 4 recent trip photos
 *   - tripcoord watermark + URL
 *
 * Public — anyone with the URL can fetch it. Used as the OG-image for
 * the public /share/world/[userId] landing page so the link previews
 * richly on Twitter / iMessage / Slack / WhatsApp.
 *
 * Cache: the PNG is cached for 1h (s-maxage=3600) so a viral share
 * doesn't repeatedly hit Supabase. Stale-while-revalidate keeps the
 * social-platform fetch fast even after expiry.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STAMP_EMOJI: Record<string, string> = {
  food: '🥖',
  nightlife: '🍸',
  history: '🏛️',
  culture: '🎭',
  beach: '🏖️',
  nature: '🌿',
  adventure: '⚡',
  sports: '⛹️',
  wellness: '💆',
  shopping: '🛍️',
  photography: '📷',
  themepark: '🎢',
  family: '👨‍👩‍👧',
};

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

export async function GET(_req: Request, { params }: { params: { userId: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.userId)) {
    return new Response('Invalid user id', { status: 400 });
  }

  try {
    const supabase = createAdminClient();

    // ── Profile + trips + photos in parallel ───────────────────────────────
    const [profileRes, tripsRes] = await Promise.all([
      supabase.from('profiles').select('name').eq('id', params.userId).single(),
      supabase
        .from('trips')
        .select('id, destination, start_date, end_date, preferences, cover_image')
        .eq('organizer_id', params.userId)
        .not('end_date', 'is', null),
    ]);

    const userName = (profileRes.data?.name ?? '').split(' ')[0] || 'A traveler';

    // Status from dates rather than the stored column — matches the
    // same logic used by the live /world page.
    const todayMs = Date.now();
    const completedTrips = (tripsRes.data ?? []).filter(
      t => t.end_date && new Date(t.end_date + 'T12:00:00').getTime() < todayMs,
    );

    // ── Aggregate stats ────────────────────────────────────────────────────
    const countries = new Set<string>();
    const cities = new Set<string>();
    const continents = new Set<string>();
    let daysAbroad = 0;
    const stamps: string[] = [];

    for (const t of completedTrips) {
      const country = destinationToCountry(t.destination);
      if (country) {
        countries.add(country);
        const continent = countryToContinent(country);
        if (continent) continents.add(continent);
      }
      const city = t.destination.split(',')[0]?.trim();
      if (city) cities.add(city);

      if (t.start_date && t.end_date) {
        const ms = new Date(t.end_date + 'T12:00:00').getTime() - new Date(t.start_date + 'T12:00:00').getTime();
        const days = Math.round(ms / 86400000);
        if (days > 0) daysAbroad += days;
      }

      // Primary stamp emoji is driven by the trip's top priority.
      const prefs = t.preferences as { priorities?: string[] } | null;
      const topPriority = (prefs?.priorities ?? []).map(p => p.toLowerCase()).find(p => STAMP_EMOJI[p]) ?? 'culture';
      stamps.push(STAMP_EMOJI[topPriority] ?? STAMP_EMOJI.culture);
    }

    // ── Card photos (up to 6) ──────────────────────────────────────────────
    // Pull the 6 most-recent uploaded trip photos. If we don't have 6,
    // fill the rest from trip cover_images so the strip always feels rich
    // for active travellers — matches the cover-image fallback on /world.
    const CARD_PHOTO_LIMIT = 6;
    const tripIds = completedTrips.map(t => t.id);
    const cardPhotos: CardPhoto[] = [];
    if (tripIds.length > 0) {
      const { data: photos } = await supabase
        .from('trip_photos')
        .select('public_url')
        .in('trip_id', tripIds)
        .order('created_at', { ascending: false })
        .limit(CARD_PHOTO_LIMIT);
      for (const p of photos ?? []) {
        if (p.public_url) cardPhotos.push({ url: p.public_url, isCover: false });
      }
    }
    // Cover-image backfill — most-recent trip first.
    if (cardPhotos.length < CARD_PHOTO_LIMIT) {
      const recentCovers = completedTrips
        .slice()
        .sort((a, b) => (b.end_date ?? '').localeCompare(a.end_date ?? ''))
        .map(t => t.cover_image)
        .filter((u): u is string => !!u);
      // Dedupe in case the same image appears as both uploaded photo and cover.
      const seen = new Set(cardPhotos.map(p => p.url));
      for (const url of recentCovers) {
        if (cardPhotos.length >= CARD_PHOTO_LIMIT) break;
        if (seen.has(url)) continue;
        cardPhotos.push({ url, isCover: true });
        seen.add(url);
      }
    }

    const countryCount = countries.size;
    const cityCount = cities.size;
    const continentCount = continents.size;

    // ── Render ─────────────────────────────────────────────────────────────
    // Satori (next/og) caveats: only flexbox layout, no grid, every
    // element must have `display: flex` if it has multiple children,
    // limited CSS subset. Inline styles only.
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(135deg, #fdf6e3 0%, #f9efd2 100%)',
            padding: '52px 64px',
            fontFamily: '"Georgia", serif',
            color: '#27272a',
            position: 'relative',
          }}
        >
          {/* Top bar: brand + stamp row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontFamily: '"Courier New", monospace', fontWeight: 700, fontSize: 22, letterSpacing: '0.18em', color: '#7c6e3a' }}>
                TRIPCOORD ✦ PASSPORT
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {stamps.slice(0, 6).map((emoji, i) => (
                <span key={i} style={{ fontSize: 36 }}>{emoji}</span>
              ))}
            </div>
          </div>

          {/* Headline */}
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 38 }}>
            <span style={{ fontSize: 28, color: '#7c6e3a', letterSpacing: '0.04em' }}>
              {countryCount > 0 ? `${userName}'s world so far` : `${userName} is just getting started`}
            </span>
          </div>

          {/* Hero stat */}
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 14 }}>
            <span style={{ fontFamily: '"Georgia", serif', fontStyle: 'italic', fontSize: 168, lineHeight: 1, fontWeight: 600, color: '#5b5028' }}>
              {countryCount}
            </span>
            <span style={{ fontSize: 30, color: '#7c6e3a', marginTop: -4, letterSpacing: '0.04em' }}>
              {countryCount === 1 ? 'country explored' : 'countries explored'}
            </span>
          </div>

          {/* Sub-stats row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '22px', marginTop: 22, fontFamily: '"Courier New", monospace', fontSize: 22, fontWeight: 700, color: '#5b5028', letterSpacing: '0.06em' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: 26 }}>·</span>
              {cityCount} {cityCount === 1 ? 'CITY' : 'CITIES'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: 26 }}>·</span>
              {continentCount} {continentCount === 1 ? 'CONTINENT' : 'CONTINENTS'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: 26 }}>·</span>
              {daysAbroad} DAYS ABROAD
            </span>
          </div>

          {/* Spacer to push the photo strip to the bottom */}
          <div style={{ display: 'flex', flex: 1 }} />

          {/* Photo strip (or empty-state hint).
              6 photos at 162×96, slightly tighter than the old 4×230×130
              so the strip fits the wider count without spilling the
              1072px usable width (64px padding × 2). Cover-image
              fallbacks get a dashed amber border so a power user can
              tell them apart from real uploads. */}
          {cardPhotos.length > 0 ? (
            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
              {cardPhotos.map((p, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    width: 162,
                    height: 96,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: p.isCover ? '2px dashed #c4b07a' : '2px solid #d4c89a',
                    backgroundColor: '#fff8e6',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt=""
                    width={162}
                    height={96}
                    style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontFamily: '"Courier New", monospace',
                fontSize: 18,
                color: '#7c6e3a',
                letterSpacing: '0.08em',
                fontWeight: 700,
              }}
            >
              FIRST TRIP PHOTOS COMING SOON ✦ tripcoord.ai
            </div>
          )}

          {/* Footer URL */}
          {cardPhotos.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                marginTop: 18,
                fontFamily: '"Courier New", monospace',
                fontSize: 18,
                color: '#7c6e3a',
                letterSpacing: '0.1em',
                fontWeight: 700,
              }}
            >
              tripcoord.ai/world
            </div>
          )}
        </div>
      ),
      {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        headers: {
          // Cache aggressively at the edge — the card content changes
          // slowly (new trip completion) and stale-while-revalidate keeps
          // social-platform fetches snappy.
          'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    );
  } catch (err) {
    console.error('[share-card]', err);
    return new Response('Could not generate share card', { status: 500 });
  }
}
