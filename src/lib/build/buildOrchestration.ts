/**
 * Itinerary build orchestration — the pure, server-safe logic for splitting a
 * trip into 3-day chunks, resuming a partial build, deduping venues across
 * chunk seams, and summarizing the prior chunk for continuity.
 *
 * This is a 1:1 mirror of the browser's build loop in
 * `src/app/trip/[id]/itinerary/Client.tsx` (the `?mode=generating` effect).
 * The background-build worker uses these so it produces the EXACT same chunk
 * plan and per-chunk prompts the browser does — no drift. (The browser still
 * has its own inline copies for now; they'll be pointed at this module once the
 * worker's parity is confirmed, so the duplication is temporary and verified by
 * the parallel-then-flip bake.)
 *
 * Pure functions only — no I/O, no React, no Supabase. Trivially testable.
 */

import type { ItineraryDay } from '@/lib/types';

/** Days per generation chunk — exists only to stay under Vercel's maxDuration. */
export const CHUNK_SIZE = 3;

export interface BuildSegment {
  cityName: string;
  dayStart: number;   // 1-based, absolute within the whole trip
  dayCount: number;
  /** false = arrival chunk (first chunk of a city); true = continuation. */
  sameCity: boolean;
}

/**
 * Build the ordered chunk list for a trip. Mirrors Client.tsx ~1049–1145.
 * - 2+ explicit cities → allocate days per city (explicit or even split) and
 *   chunk each city by CHUNK_SIZE (first chunk per city = arrival).
 * - single city > CHUNK_SIZE days → straight 3-day chunks.
 * - single city ≤ CHUNK_SIZE days → returns [] (the route builds it in one
 *   call with no citySegment).
 */
export function computeSegments(opts: {
  destination: string;
  tripLength: number;
  destinations?: string[] | null;
  daysPerDestination?: Record<string, number> | null;
}): BuildSegment[] {
  const { destination, tripLength, destinations, daysPerDestination } = opts;
  const segments: BuildSegment[] = [];
  const cities = (destinations ?? []).filter((c) => c && c.trim());

  if (cities.length > 1) {
    const tripLen = Math.max(cities.length, tripLength || 0);
    const dpd = daysPerDestination ?? {};
    const hasExplicit = cities.some((c) => (dpd[c] ?? 0) > 0);
    const alloc: Record<string, number> = {};
    if (hasExplicit) {
      let assigned = 0;
      for (const c of cities) { alloc[c] = Math.max(0, dpd[c] ?? 0); assigned += alloc[c]; }
      if (assigned < tripLen) alloc[cities[cities.length - 1]] += tripLen - assigned;
    } else {
      const base = Math.floor(tripLen / cities.length);
      let rem = tripLen - base * cities.length;
      for (const c of cities) { alloc[c] = base + (rem > 0 ? 1 : 0); if (rem > 0) rem--; }
    }

    let dayStart = 1;
    for (const cityName of cities) {
      const cityDays = alloc[cityName] ?? 0;
      if (cityDays <= 0) continue;
      let chunkStart = dayStart;
      let cityRemaining = cityDays;
      let chunkInCity = 0;
      while (cityRemaining > 0) {
        const cnt = Math.min(CHUNK_SIZE, cityRemaining);
        segments.push({ cityName, dayStart: chunkStart, dayCount: cnt, sameCity: chunkInCity > 0 });
        chunkStart += cnt;
        cityRemaining -= cnt;
        chunkInCity++;
      }
      dayStart += cityDays;
    }
  } else if ((tripLength || 0) > CHUNK_SIZE) {
    const cityName = destination || 'destination';
    let chunkStart = 1;
    let remaining = tripLength;
    let chunkIdx = 0;
    while (remaining > 0) {
      const cnt = Math.min(CHUNK_SIZE, remaining);
      segments.push({ cityName, dayStart: chunkStart, dayCount: cnt, sameCity: chunkIdx > 0 });
      chunkStart += cnt;
      remaining -= cnt;
      chunkIdx++;
    }
  }

  return segments;
}

/**
 * First day number not yet persisted (resume point). Mirrors Client.tsx
 * ~1183–1202. Returns tripLength+1 when everything is already built.
 */
export function findResumeStartDay(persistedDays: ItineraryDay[], tripLength: number): number {
  const completed = new Set(
    persistedDays
      .map((d) => (typeof d.day === 'number' ? d.day : null))
      .filter((n): n is number => n !== null),
  );
  let resumeStartFromDay = tripLength + 1;
  for (let i = 1; i <= tripLength; i++) {
    if (!completed.has(i)) { resumeStartFromDay = i; break; }
  }
  return resumeStartFromDay;
}

/**
 * Trim the segment list to only the missing tail when resuming. Mirrors
 * Client.tsx ~1216–1250. A segment straddling the resume point is clipped and
 * forced to sameCity=true (it's now a mid-trip continuation, not an arrival).
 */
export function narrowSegmentsForResume(
  segments: BuildSegment[],
  resumeStartFromDay: number,
  destination: string,
  tripLength: number,
): BuildSegment[] {
  if (resumeStartFromDay <= 1) return segments;
  if (segments.length === 0) {
    return [{
      cityName: destination || 'destination',
      dayStart: resumeStartFromDay,
      dayCount: tripLength - resumeStartFromDay + 1,
      sameCity: true,
    }];
  }
  const narrowed: BuildSegment[] = [];
  for (const seg of segments) {
    const segEnd = seg.dayStart + seg.dayCount - 1;
    if (segEnd < resumeStartFromDay) continue; // fully done — drop
    if (seg.dayStart >= resumeStartFromDay) {
      narrowed.push(seg);
    } else {
      narrowed.push({
        ...seg,
        dayStart: resumeStartFromDay,
        dayCount: segEnd - resumeStartFromDay + 1,
        sameCity: true,
      });
    }
  }
  return narrowed;
}

/**
 * Every venue name on a day (all tracks + sidebar lists). Mirrors Client.tsx
 * ~1257–1279. Used to build the cross-chunk "don't reuse" list.
 */
export function collectDayVenues(d: ItineraryDay): string[] {
  const names = new Set<string>();
  for (const trackKey of ['shared', 'track_a', 'track_b'] as const) {
    for (const a of (d.tracks?.[trackKey] ?? [])) {
      const n = (a as { name?: string; title?: string }).name
            ?? (a as { name?: string; title?: string }).title;
      if (n) names.add(n);
    }
  }
  for (const s of (d.photoSpots ?? [])) { if (s.name) names.add(s.name); }
  for (const t of (d.foodieTips ?? [])) { if (t.name) names.add(t.name); }
  for (const s of (d.nightlifeHighlights ?? [])) { if (s.name) names.add(s.name); }
  for (const s of (d.shoppingGuide ?? [])) { if (s.name) names.add(s.name); }
  return Array.from(names);
}

/**
 * Restaurant names on a day (explicit isRestaurant OR a food-shaped name).
 * Mirrors Client.tsx ~1286–1308. Surfaced as a stricter "never reuse" list.
 */
export function collectDayRestaurants(d: ItineraryDay): string[] {
  const names = new Set<string>();
  const restaurantKeywords = /\b(restaurant|caf[eé]|bistro|brasserie|trattoria|osteria|tavern|tavola|pub|gastropub|eatery|kitchen|diner|bar|bakery|patisserie|p[âa]tisserie|boulangerie|coffee|izakaya|ramen|sushi|chophouse|steakhouse|grill|cantina|cevicheria|taqueria|pizzeria|food market|food hall)\b/i;
  for (const trackKey of ['shared', 'track_a', 'track_b'] as const) {
    for (const a of (d.tracks?.[trackKey] ?? [])) {
      const aa = a as { name?: string; title?: string; isRestaurant?: boolean };
      const n = aa.name ?? aa.title;
      if (!n) continue;
      if (aa.isRestaurant || restaurantKeywords.test(n)) names.add(n);
    }
  }
  for (const t of (d.foodieTips ?? [])) { if (t.name) names.add(t.name); }
  return Array.from(names);
}

/**
 * The compact continuity hint handed to the next chunk: "<theme>, <first
 * non-restaurant activity>", capped at 80 chars. Mirrors Client.tsx ~1558–1570.
 */
export function buildPrevContext(lastDay: ItineraryDay | undefined): string | null {
  if (!lastDay) return null;
  const theme = (lastDay.theme as string) || '';
  const shared = lastDay.tracks?.shared as Array<{ name?: string; title?: string; isRestaurant?: boolean }> | undefined;
  const firstAct = shared?.find((a) => !a.isRestaurant);
  const actName = firstAct ? (firstAct.name || firstAct.title || '') : '';
  return [theme, actName].filter(Boolean).join(', ').slice(0, 80) || null;
}
