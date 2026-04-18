import { NextRequest, NextResponse } from 'next/server';
import { ALL_DESTINATIONS, FEATURED_NAMES } from '@/data/destinations';

// ─── Scoring ──────────────────────────────────────────────────────────────────
// Determines result relevance. Higher = shown first.
function score(dest: typeof ALL_DESTINATIONS[0], q: string): number {
  const name    = dest.name.toLowerCase();
  const country = dest.country.toLowerCase();
  const region  = (dest.region ?? '').toLowerCase();

  let s = 0;

  // Name matches (highest priority)
  if (name === q)                s += 20;
  else if (name.startsWith(q))   s += 12;
  else if (name.includes(q))     s += 6;

  // Country matches
  if (country === q)             s += 8;
  else if (country.startsWith(q)) s += 4;
  else if (country.includes(q))  s += 2;

  // Region / state matches
  if (region.startsWith(q))      s += 3;
  else if (region.includes(q))   s += 1;

  // Boost well-known travel destinations
  if (FEATURED_NAMES.has(name))  s += 3;

  // Prefer cities over countries when name matches (cities are more useful)
  if (dest.type === 'city'    && s > 0) s += 1;
  if (dest.type === 'country' && s > 0) s -= 0.5;

  return s;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim().toLowerCase();

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const scored = ALL_DESTINATIONS
    .map(dest => ({ dest, s: score(dest, q) }))
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
