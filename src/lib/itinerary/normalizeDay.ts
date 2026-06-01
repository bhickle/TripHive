import type { ItineraryDay } from '@/lib/types';

/**
 * Ensure a day loaded from the `itineraries.days` Json column has its three
 * track arrays present, so downstream `day.tracks.shared.map(...)` can't throw
 * on a legacy/partial row.
 *
 * The itinerary page funnels every day through `syncAiDays` (which does this
 * and more — track-label normalization, sorting). The group and print pages
 * read days straight from the API and previously relied on scattered `?.` /
 * `?? []` guards at each call site; running them through this one helper closes
 * that latent crash class in a single place (QA #17).
 */
export function normalizeDay(day: ItineraryDay): ItineraryDay {
  const tracks = (day?.tracks ?? {}) as Partial<ItineraryDay['tracks']>;
  return {
    ...day,
    tracks: {
      shared: Array.isArray(tracks.shared) ? tracks.shared : [],
      track_a: Array.isArray(tracks.track_a) ? tracks.track_a : [],
      track_b: Array.isArray(tracks.track_b) ? tracks.track_b : [],
    },
  };
}

/** Map a raw days array (possibly null/partial) through {@link normalizeDay}. */
export function normalizeDays(days: unknown): ItineraryDay[] {
  return Array.isArray(days) ? days.map((d) => normalizeDay(d as ItineraryDay)) : [];
}
