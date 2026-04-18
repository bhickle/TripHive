import { NextRequest, NextResponse } from 'next/server';
import { ALL_DESTINATIONS, FEATURED_NAMES } from '@/data/destinations';

// ─── Local scoring ────────────────────────────────────────────────────────────
function score(dest: typeof ALL_DESTINATIONS[0], q: string): number {
  const name    = dest.name.toLowerCase();
  const country = dest.country.toLowerCase();
  const region  = (dest.region ?? '').toLowerCase();

  let s = 0;

  if (name === q)                s += 20;
  else if (name.startsWith(q))   s += 12;
  else if (name.includes(q))     s += 6;

  if (country === q)             s += 8;
  else if (country.startsWith(q)) s += 4;
  else if (country.includes(q))  s += 2;

  if (region.startsWith(q))      s += 3;
  else if (region.includes(q))   s += 1;

  if (FEATURED_NAMES.has(name))  s += 3;
  if (dest.type === 'city'    && s > 0) s += 1;
  if (dest.type === 'country' && s > 0) s -= 0.5;

  return s;
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
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`
      );
      const data = await res.json();

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
      // Fall through to local on ZERO_RESULTS or other non-error statuses
    } catch {
      // Fall through to local on network error
    }
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
