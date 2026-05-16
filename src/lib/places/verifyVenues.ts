/**
 * Post-generation venue verification — catches AI-generated venues that
 * are permanently closed or impossible to verify.
 *
 * Why this exists: the fetch-time `businessStatus` filter in
 * `generate-itinerary` drops closed venues from the Places list BEFORE
 * the prompt sees them. That handles the common case. But two leaks
 * remain:
 *
 *   1. The AI occasionally invents venues outside the provided Places
 *      list, despite "use only this list" rules in the prompt.
 *   2. `hotelSuggestions` and `photoSpots` are explicitly exempt from
 *      the Places-list constraint — those come straight from training
 *      data, which can be years out of date.
 *
 * This module runs after generation, queries Google Places for each
 * named venue in the itinerary, and produces a verification map keyed
 * by a normalized venue name. The map is persisted to
 * `itineraries.meta.venueVerification` and the UI reads it to show a
 * "⚠ verify current status" badge on flagged venues.
 *
 * No schema changes required — `itineraries.meta` is already a JSON blob.
 */

import type { ItineraryDay, Activity } from '@/lib/types';

export type VerificationStatus =
  | 'operational'
  | 'closed_permanently'
  | 'closed_temporarily'
  | 'unknown';

export interface VenueVerificationEntry {
  status: VerificationStatus;
  /** Day this venue appeared on (1-based). Useful for surfacing per-day warnings. */
  dayNumber?: number;
  /** What category the venue showed up in — restaurant/activity/hotel/photo/etc. */
  category?: string;
  /** The Places API's top-match name when it differed from the AI's name —
   *  helpful for debugging weak matches. */
  matchedName?: string;
  /** ISO timestamp of when we ran the check. */
  checkedAt: string;
}

/** Top-level shape persisted to `itineraries.meta.venueVerification`. */
export interface VenueVerificationMap {
  /** Keyed by `normalizeVenueKey(name)`. Lookups should use the same helper. */
  entries: Record<string, VenueVerificationEntry>;
  /** When the most recent verification pass ran (ISO). */
  lastRunAt: string;
  /** Summary counts for telemetry / quick display. */
  counts: {
    total: number;
    operational: number;
    closedPermanently: number;
    closedTemporarily: number;
    unknown: number;
  };
}

/**
 * Canonical key for a venue name. Lower-cased, alpha-numerics + spaces only,
 * collapsed whitespace. Used as the map key so lookups from the UI side don't
 * have to know the exact casing/punctuation the AI emitted.
 *
 * Examples:
 *   "Joe's Diner"           → "joes diner"
 *   "Mythos Restaurant"     → "mythos restaurant"
 *   "Café del Mar (Ibiza)"  → "cafe del mar ibiza"     // diacritics stripped
 */
export function normalizeVenueKey(name: string): string {
  return (name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A venue we want to verify, plus the metadata we'll attach to the result. */
interface NamedVenue {
  name: string;
  dayNumber?: number;
  category: string;
}

/**
 * Walk every day in the itinerary and pull out the named venues we want
 * to verify. Deduped on the normalized key — if the same restaurant shows
 * up on day 1 and day 4, we only verify it once and the entry references
 * the first day it appeared on.
 *
 * What's included:
 *   - Activities with isRestaurant=true (those are the highest-value
 *     checks because restaurants close most often)
 *   - Non-restaurant activities that have a named venue (skip generic
 *     "Walk around Trastevere"-style entries by requiring an address or
 *     a placeId on top of a name)
 *   - foodieTips, nightlifeHighlights, shoppingGuide
 *   - photoSpots (training-data sourced — explicitly worth checking)
 *
 * NOT included:
 *   - priorityHighlights — those are often broad neighborhood or theme
 *     references where a Places lookup would be ambiguous
 *   - destinationTip / theme — descriptive text, not venues
 *   - hotelSuggestions — those live on the trip meta, not on a day; the
 *     caller passes them in separately (see collectHotelSuggestions)
 */
export function extractNamedVenues(days: ItineraryDay[]): NamedVenue[] {
  const seen = new Map<string, NamedVenue>();
  const addOnce = (name: string | undefined, dayNumber: number | undefined, category: string) => {
    if (!name || !name.trim()) return;
    const key = normalizeVenueKey(name);
    if (!key || seen.has(key)) return;
    seen.set(key, { name: name.trim(), dayNumber, category });
  };

  for (const day of days) {
    if (!day) continue;
    const trackKeys = ['shared', 'track_a', 'track_b'] as const;
    for (const tk of trackKeys) {
      const acts = (day.tracks?.[tk] ?? []) as Activity[];
      for (const a of acts) {
        // For activities, the named venue lives on `name` (when the AI
        // populated it as a specific place) — fall back to `title` only
        // when `address` or `placeId` is present (heuristic: if there's
        // address-level data, the title IS the venue name).
        const venueName = a.name ?? (a.address || a.placeId ? a.title : undefined);
        if (a.isRestaurant) {
          addOnce(venueName, day.day, 'restaurant');
        } else if (venueName) {
          addOnce(venueName, day.day, 'activity');
        }
      }
    }

    for (const ft of day.foodieTips ?? []) addOnce(ft.name, day.day, 'foodie_tip');
    for (const nh of day.nightlifeHighlights ?? []) addOnce(nh.name, day.day, 'nightlife');
    for (const sg of day.shoppingGuide ?? []) addOnce(sg.name, day.day, 'shopping');
    for (const ps of day.photoSpots ?? []) addOnce(ps.name, day.day, 'photo_spot');
  }
  return Array.from(seen.values());
}

/**
 * Hotel suggestions live on `itinerary.meta.hotelSuggestions`, not inside
 * the days. Separate helper so the route can pass them in alongside the
 * day-extracted venues.
 */
export interface HotelSuggestionInput {
  name?: string | null;
}
export function collectHotelSuggestions(
  hotelSuggestions: HotelSuggestionInput[] | null | undefined,
): NamedVenue[] {
  if (!hotelSuggestions || hotelSuggestions.length === 0) return [];
  const seen = new Set<string>();
  const out: NamedVenue[] = [];
  for (const h of hotelSuggestions) {
    if (!h?.name) continue;
    const key = normalizeVenueKey(h.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: h.name.trim(), category: 'hotel' });
  }
  return out;
}

interface PlacesTextSearchResult {
  id?: string;
  displayName?: { text?: string };
  businessStatus?: string;
  formattedAddress?: string;
}

/**
 * Query Google Places for a single venue and resolve its operating status.
 *
 * Confidence guard: if the top result's name doesn't share meaningful
 * tokens with the AI's name (e.g. AI said "Joe's Diner", Places returned
 * "Joey's Bistro") we return 'unknown' rather than guessing. Better to
 * surface "we couldn't verify" than to flag a closed venue that's actually
 * a totally different business.
 */
async function verifyVenueStatus(
  venue: NamedVenue,
  cityHint: string,
  apiKey: string,
): Promise<{ status: VerificationStatus; matchedName?: string }> {
  // Append the city to disambiguate common venue names ("Joe's Diner"
  // exists in dozens of cities; "Joe's Diner Orlando" pinpoints).
  const query = cityHint ? `${venue.name} ${cityHint}` : venue.name;

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.businessStatus,places.formattedAddress',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 3 }),
    });
    if (!res.ok) {
      return { status: 'unknown' };
    }
    const data = await res.json() as { places?: PlacesTextSearchResult[] };
    const top = data.places?.[0];
    if (!top) return { status: 'unknown' };

    const topName = top.displayName?.text ?? '';
    // Token-overlap confidence check. Require at least one shared
    // non-trivial token (length > 3) between the query name and the
    // top result — keeps "Joe's Diner" from matching "Joey's Bistro"
    // just because they're both in the same city. Short tokens (le, of,
    // bar, the) are filtered to avoid false positives.
    const queryTokens = new Set(
      normalizeVenueKey(venue.name).split(' ').filter(t => t.length > 3),
    );
    const resultTokens = new Set(
      normalizeVenueKey(topName).split(' ').filter(t => t.length > 3),
    );
    let overlap = 0;
    queryTokens.forEach(t => { if (resultTokens.has(t)) overlap++; });
    // If query has no long tokens at all (e.g. "Bar Italia"), accept the
    // match on city presence alone — these are unavoidable ambiguities
    // and our city hint is already in the query.
    const confident = queryTokens.size === 0 || overlap >= 1;
    if (!confident) {
      return { status: 'unknown', matchedName: topName };
    }

    const bs = top.businessStatus;
    if (bs === 'CLOSED_PERMANENTLY') {
      return { status: 'closed_permanently', matchedName: topName !== venue.name ? topName : undefined };
    }
    if (bs === 'CLOSED_TEMPORARILY') {
      return { status: 'closed_temporarily', matchedName: topName !== venue.name ? topName : undefined };
    }
    if (bs === 'OPERATIONAL' || !bs) {
      return { status: 'operational' };
    }
    return { status: 'unknown', matchedName: topName };
  } catch {
    return { status: 'unknown' };
  }
}

/**
 * Run verification across the full venue list with a small concurrency
 * cap. Returns the persistence-ready map.
 */
export async function runVerificationPass(
  venues: NamedVenue[],
  cityHint: string,
  apiKey: string,
  concurrency = 8,
): Promise<VenueVerificationMap> {
  const entries: Record<string, VenueVerificationEntry> = {};
  const counts = { total: 0, operational: 0, closedPermanently: 0, closedTemporarily: 0, unknown: 0 };
  const checkedAt = new Date().toISOString();

  // Simple parallelism: chunk the venues array and Promise.all each chunk.
  // Google's quota is generous; concurrency=8 keeps total wall time low
  // without risking 429s on small accounts.
  for (let i = 0; i < venues.length; i += concurrency) {
    const chunk = venues.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(async v => ({ venue: v, result: await verifyVenueStatus(v, cityHint, apiKey) })),
    );
    for (const { venue, result } of results) {
      const key = normalizeVenueKey(venue.name);
      entries[key] = {
        status: result.status,
        dayNumber: venue.dayNumber,
        category: venue.category,
        matchedName: result.matchedName,
        checkedAt,
      };
      counts.total++;
      if (result.status === 'operational') counts.operational++;
      else if (result.status === 'closed_permanently') counts.closedPermanently++;
      else if (result.status === 'closed_temporarily') counts.closedTemporarily++;
      else counts.unknown++;
    }
  }

  return { entries, lastRunAt: checkedAt, counts };
}
