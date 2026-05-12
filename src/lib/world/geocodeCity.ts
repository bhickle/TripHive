/**
 * Server-side city → lat/lon resolver with a 3-tier cache:
 *
 *   1. Hardcoded CITY_COORDS dictionary (~120 popular destinations)
 *      → instant, zero cost
 *   2. city_geocache Supabase table (Google Geocoding API results
 *      cached forever)
 *      → one DB query, ~10ms
 *   3. Google Geocoding API call (only on first miss for a given
 *      city + country pair)
 *      → ~$0.005 per call, result is then cached for everyone
 *
 * Falls back to country centroid when all three miss (typo, geocoding
 * failure, etc.). Returns null only when even the country is unknown.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { CITY_COORDS, COUNTRY_CENTROIDS } from './cityCoords';

type AdminClient = ReturnType<typeof createAdminClient>;

interface GeocodeResult {
  lat: number;
  lon: number;
  source: 'hardcoded' | 'cache' | 'google' | 'centroid';
}

/** Normalize a city name for cache keying — trim, lower-case,
 *  collapse internal whitespace, strip everything after the first
 *  comma (so "Paris, France" and "Paris" share a cache entry). */
function cityKey(city: string): string {
  return city.trim().split(',')[0].trim().toLowerCase().replace(/\s+/g, ' ');
}

function countryKey(country: string | null): string {
  return (country ?? '').trim().toLowerCase();
}

/** Hit Google Geocoding API for a city + country, cache the result. */
async function fetchAndCache(
  supabase: AdminClient,
  city: string,
  country: string | null,
  apiKey: string,
): Promise<GeocodeResult | null> {
  try {
    const query = country ? `${city}, ${country}` : city;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json() as {
      status: string;
      results?: Array<{ geometry?: { location?: { lat: number; lng: number } } }>;
    };
    if (data.status !== 'OK' || !data.results?.length) return null;
    const loc = data.results[0]?.geometry?.location;
    if (!loc) return null;

    // Cache. ON CONFLICT DO NOTHING via upsert+ignoreDuplicates so
    // concurrent first-miss requests don't error on the unique key.
    await supabase
      .from('city_geocache')
      .upsert({
        city_key: cityKey(city),
        country_key: countryKey(country),
        display_city: city.trim().split(',')[0].trim(),
        display_country: country,
        lat: loc.lat,
        lon: loc.lng,
        source: 'google_geocoding',
      }, { onConflict: 'city_key,country_key', ignoreDuplicates: true });

    return { lat: loc.lat, lon: loc.lng, source: 'google' };
  } catch (err) {
    console.warn('[geocodeCity] Google API failed:', err);
    return null;
  }
}

/**
 * Resolve a city to lat/lon. Tries hardcoded → cache → Google → centroid.
 * Returns null if even the country fallback is unavailable.
 *
 * @param supabase - Admin Supabase client (writes to city_geocache)
 * @param city - City name (e.g. "Paris", "Pittsburgh, PA")
 * @param country - Canonical country name (e.g. "France") for cache key + centroid fallback
 */
export async function geocodeCity(
  supabase: AdminClient,
  city: string,
  country: string | null,
): Promise<{ lat: number; lon: number; source: GeocodeResult['source'] } | null> {
  if (!city) return null;

  // Tier 1 — hardcoded
  const firstSeg = city.trim().split(',')[0].trim();
  const hardcoded = CITY_COORDS[firstSeg] ?? CITY_COORDS[city.trim()];
  if (hardcoded) {
    return { lat: hardcoded[1], lon: hardcoded[0], source: 'hardcoded' };
  }

  // Tier 2 — cache lookup
  const ck = cityKey(city);
  const cok = countryKey(country);
  try {
    const { data: cached } = await supabase
      .from('city_geocache')
      .select('lat, lon')
      .eq('city_key', ck)
      .eq('country_key', cok)
      .maybeSingle();
    if (cached) {
      return { lat: Number(cached.lat), lon: Number(cached.lon), source: 'cache' };
    }
  } catch (err) {
    console.warn('[geocodeCity] cache lookup failed:', err);
  }

  // Tier 3 — Google Geocoding (only when key is configured)
  const apiKey = process.env.GOOGLE_MAPS_KEY;
  if (apiKey) {
    const fetched = await fetchAndCache(supabase, city, country, apiKey);
    if (fetched) return fetched;
  }

  // Tier 4 — country centroid fallback
  if (country && COUNTRY_CENTROIDS[country]) {
    const centroid = COUNTRY_CENTROIDS[country];
    return { lat: centroid[1], lon: centroid[0], source: 'centroid' };
  }

  return null;
}

/** Resolve a batch of cities in parallel. Used by /api/world to fill
 *  every visited city's pin in one trip through the cache. */
export async function geocodeCities(
  supabase: AdminClient,
  cities: Array<{ city: string; country: string | null }>,
): Promise<Map<string, { lat: number; lon: number }>> {
  const result = new Map<string, { lat: number; lon: number }>();
  // Process in parallel — each call hits independent rows + may make its
  // own external request. Don't fan out so wide that Google's per-second
  // rate limit kicks in; cap concurrency at 8.
  const CONCURRENCY = 8;
  for (let i = 0; i < cities.length; i += CONCURRENCY) {
    const batch = cities.slice(i, i + CONCURRENCY);
    const resolved = await Promise.all(
      batch.map(async ({ city, country }) => {
        const r = await geocodeCity(supabase, city, country);
        return { city, r };
      }),
    );
    for (const { city, r } of resolved) {
      if (r) result.set(city, { lat: r.lat, lon: r.lon });
    }
  }
  return result;
}
