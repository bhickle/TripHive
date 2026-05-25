import { destinationToCountry, countryToContinent } from './countryLookup';

/**
 * Canonical "My World" stats computation.
 *
 * Both the owner's My World page (`/api/world`) and the public share landing
 * (`/share/world/[userId]`) compute their headline numbers from these helpers
 * so the two surfaces can't drift. (They used to: the share page counted only
 * the destination's first segment for cities and date-diff nights for days,
 * while /api/world uses the tagged multi-city list and trip length — so a
 * shared card under-counted cities and showed different day totals.)
 */

export type WorldTripRow = {
  destination: string;
  start_date: string | null;
  end_date: string | null;
  trip_length: number | null;
  visited_cities: string[] | null;
};

/**
 * Date-derived trip status. "completed" = the trip's end date is in the past.
 * Noon-padded parse avoids west-of-UTC off-by-one. `now` is normalized to the
 * caller's value as-is; pass a midnight-floored Date for day-granular results.
 */
export function computeTripStatus(
  t: { start_date: string | null; end_date: string | null },
  now: Date,
): 'planning' | 'active' | 'completed' {
  if (!t.start_date) return 'planning';
  const start = new Date(t.start_date + 'T12:00:00');
  if (now < start) return 'planning';
  if (!t.end_date) return 'active';
  const end = new Date(t.end_date + 'T12:00:00');
  return now <= end ? 'active' : 'completed';
}

/**
 * Cities for a trip — the user-tagged `visited_cities` (multi-city list) when
 * present, else the destination's first comma segment. Trimmed, empties dropped.
 */
export function extractTripCities(
  t: { destination: string; visited_cities: string[] | null },
): string[] {
  if (t.visited_cities && t.visited_cities.length > 0) {
    return t.visited_cities.map(c => c.trim()).filter((s): s is string => !!s);
  }
  const first = t.destination.split(',')[0]?.trim();
  return first ? [first] : [];
}

/** Days for one trip — trip length when set, else date-diff (ceil) nights. */
export function tripDays(
  t: { start_date: string | null; end_date: string | null; trip_length: number | null },
): number {
  if (t.trip_length && t.trip_length > 0) return t.trip_length;
  if (!t.start_date || !t.end_date) return 0;
  const s = new Date(t.start_date + 'T12:00:00').getTime();
  const e = new Date(t.end_date + 'T12:00:00').getTime();
  if (isNaN(s) || isNaN(e) || e < s) return 0;
  return Math.ceil((e - s) / 86_400_000);
}

export type WorldStats = {
  totalCities: number;
  totalCountries: number;
  totalContinents: number;
  daysAbroad: number;
};

/**
 * Headline stats across a user's COMPLETED owned trips. Single source of truth
 * for both /api/world and the public share page.
 */
export function computeWorldStats(trips: WorldTripRow[], now: Date = new Date()): WorldStats {
  // Midnight-floor so "completed" is day-granular and stable regardless of the
  // time of day the page is rendered.
  const ref = new Date(now);
  ref.setHours(0, 0, 0, 0);

  const cities = new Set<string>();
  const countries = new Set<string>();
  const continents = new Set<string>();
  let daysAbroad = 0;

  for (const t of trips) {
    if (computeTripStatus(t, ref) !== 'completed') continue;
    for (const c of extractTripCities(t)) cities.add(c);
    const country = destinationToCountry(t.destination);
    if (country) {
      countries.add(country);
      const cont = countryToContinent(country);
      if (cont) continents.add(cont);
    }
    daysAbroad += tripDays(t);
  }

  return {
    totalCities: cities.size,
    totalCountries: countries.size,
    totalContinents: continents.size,
    daysAbroad,
  };
}
