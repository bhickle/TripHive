import { NextRequest, NextResponse } from 'next/server';
import { ALL_DESTINATIONS, FEATURED_NAMES } from '@/data/destinations';

// ─── Local scoring ────────────────────────────────────────────────────────────
function score(dest: typeof ALL_DESTINATIONS[0], q: string): number {
  const name    = dest.name.toLowerCase();
  const country = dest.country.toLowerCase();
  const region  = (dest.region ?? '').toLowerCase();

  let base = 0;

  // Base match score — must be > 0 for any bonuses to apply
  if (name === q)                base += 20;
  else if (name.startsWith(q))   base += 12;
  else if (name.includes(q))     base += 6;

  if (country === q)             base += 8;
  else if (country.startsWith(q)) base += 4;
  else if (country.includes(q))  base += 2;

  if (region.startsWith(q))      base += 3;
  else if (region.includes(q))   base += 1;

  // No match at all — skip entirely
  if (base === 0) return 0;

  // Bonuses only applied when there's already a real match
  if (FEATURED_NAMES.has(name))  base += 3;
  if (dest.type === 'city')      base += 1;
  if (dest.type === 'country')   base -= 0.5;

  return base;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const apiKey = process.env.GOOGLE_MAPS_KEY;

  // ── Google Places Autocomplete (cities) ──────────────────────────────────
  if (apiKey) {
    try {
      const params = new URLSearchParams({
        input: q,
        key:   apiKey,
        types: '(cities)',
      });

      const res  = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`,
        { headers: { Referer: 'https://www.tripcoord.ai' } }
      );
      const data = await res.json();

      // Log status so we can diagnose key/restriction issues
      console.log('[destinations/search] Google status:', data.status, '| query:', q);

      if (data.status === 'OK' && data.predictions?.length) {
        const results = data.predictions.slice(0, 8).map((p: {
          place_id: string;
          structured_formatting: { main_text: string; secondary_text: string };
          types: string[];
        }) => ({
          placeId: p.place_id,
          name:    p.structured_formatting.main_text,
          address: p.structured_formatting.secondary_text,
          types:   p.types ?? ['locality'],
        }));

        return NextResponse.json({ results, source: 'google' });
      }

      // Return the status so we can diagnose from the API response itself
      if (data.status !== 'ZERO_RESULTS') {
        console.warn('[destinations/search] Google non-OK status:', data.status, data.error_message);
      }
    } catch (err) {
      console.error('[destinations/search] Google fetch error:', err);
    }
  } else {
    console.log('[destinations/search] No GOOGLE_MAPS_KEY — using local fallback');
  }

  // ── Local fallback ────────────────────────────────────────────────────────
  const ql = q.toLowerCase();
  const scored = ALL_DESTINATIONS
    .map(dest => ({ dest, s: score(dest, ql) }))
    .filter(({ s }) => s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 8);

  const results = scored.map(({ dest }) => ({
    placeId: `dest_${dest.name}_${dest.country}`.replace(/\s+/g, '_').toLowerCase(),
    name:    dest.name,
    address: dest.region ? `${dest.region}, ${dest.country}` : dest.country,
    types:   [dest.type],
  }));

  return NextResponse.json({ results, source: 'local' });
}
