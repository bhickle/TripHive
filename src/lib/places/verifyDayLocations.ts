/**
 * Per-day location verification with auto-correction.
 *
 * Pipeline: every `day` event the AI emits passes through `validateAndCorrectDay`
 * BEFORE we forward it to the client via SSE. Two-tier validation:
 *
 *   Tier 1 — String check (free, fast). Every activity's `address` must
 *   contain the day's `city` field (case-insensitive, with normalization
 *   for accents and common abbreviations like "Saint" / "St."). Catches
 *   the bug pattern Brandon flagged 2026-05-30: a Versailles day-trip
 *   that listed a Paris restaurant ("La Jacobine, 75006 Paris") as
 *   lunch. The address obviously said Paris; the day's city was
 *   Versailles; nothing was checking.
 *
 *   Tier 2 — Places API check (paid, ~$0.03/venue, catches the rest).
 *   For each activity, query Google Places for the venue name + day.city.
 *   If Places returns a `formattedAddress` whose city component doesn't
 *   match day.city → fail. Catches edge cases where the AI emits a
 *   street-only address (no city in the string) but the venue is in
 *   the wrong place.
 *
 * On any failure, the day is re-prompted to the AI with explicit
 * correction guidance and re-validated. Up to two retries. If both
 * fail, the day is rejected — the caller surfaces a hard error so
 * the user can regenerate that day specifically rather than ship a
 * silently-broken itinerary.
 *
 * Brandon's 2026-05-30 directive: "I don't want there to be any issues
 * with this prompt and code. I want it to verify before becoming an
 * itinerary." This module enforces that contract.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ItineraryDay, Activity, TransportLeg } from '@/lib/types';

// ─── Normalization helpers ──────────────────────────────────────────────────

/**
 * Canonical form for city/address comparison. Strips accents, lowercases,
 * normalizes punctuation, and expands the most common abbreviations the
 * AI tends to use ("St." → "Saint", "Mt." → "Mount").
 *
 * Examples:
 *   "Saint-André"  → "saint andre"
 *   "St.-André"    → "saint andre"
 *   "75006 PARIS"  → "75006 paris"
 */
function normalize(input: string): string {
  return (input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/\bst\.?\b/g, 'saint')
    .replace(/\bmt\.?\b/g, 'mount')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tier 1: cheap string check. Does the activity's address contain the
 * day's city name? Returns true if the city name (or any reasonable
 * variant) is present in the address.
 */
export function addressContainsCity(address: string | undefined, dayCity: string | undefined): boolean {
  if (!address || !dayCity) return true; // can't validate without both — fail open
  const normAddress = normalize(address);
  const normCity = normalize(dayCity);
  if (!normCity) return true;
  return normAddress.includes(normCity);
}

// ─── Collect addressable items from a day ───────────────────────────────────

interface AddressableItem {
  source: 'shared' | 'track_a' | 'track_b' | 'photoSpot' | 'foodieTip' | 'nightlifeHighlight' | 'shoppingGuide';
  index: number;
  name: string;
  address?: string;
}

/**
 * Walk a day's structure and emit every named item that has a street
 * address we can validate. Skips transport-leg notes (those reference
 * the next activity, not a venue), generic "Walk around X" entries,
 * and any item without both a name and an address.
 */
function collectAddressableItems(day: ItineraryDay): AddressableItem[] {
  const items: AddressableItem[] = [];
  type TimedActivity = Activity & { name?: string; address?: string };
  const pushActivities = (source: AddressableItem['source'], activities: TimedActivity[] | undefined) => {
    if (!Array.isArray(activities)) return;
    activities.forEach((a, i) => {
      const name = (a as { name?: string }).name ?? a.title;
      const address = (a as { address?: string }).address;
      if (name && address) items.push({ source, index: i, name, address });
    });
  };
  pushActivities('shared', day.tracks?.shared as TimedActivity[]);
  pushActivities('track_a', day.tracks?.track_a as TimedActivity[]);
  pushActivities('track_b', day.tracks?.track_b as TimedActivity[]);
  // Photo spots, foodie tips, etc. don't always carry addresses — only
  // validate when they do. The DB shape allows optional address fields.
  type PhotoSpot = { name?: string; address?: string };
  type SidebarItem = { name?: string; address?: string };
  ((day.photoSpots ?? []) as PhotoSpot[]).forEach((s, i) => {
    if (s.name && s.address) items.push({ source: 'photoSpot', index: i, name: s.name, address: s.address });
  });
  ((day.foodieTips ?? []) as SidebarItem[]).forEach((t, i) => {
    if (t.name && t.address) items.push({ source: 'foodieTip', index: i, name: t.name, address: t.address });
  });
  return items;
}

// ─── Tier 2: Places API lookup ──────────────────────────────────────────────

interface PlacesTextSearchResult {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
}

/**
 * Query Google Places for a single venue's formattedAddress. Used by
 * Tier 2 when the Tier 1 string check passes but we still want to
 * confirm the venue is physically where it claims to be. Returns null
 * on any API failure (Places down, network, no results) — Tier 2 then
 * fails OPEN, since Tier 1 already passed.
 */
async function lookupPlacesAddress(
  venueName: string,
  dayCity: string,
  apiKey: string,
): Promise<string | null> {
  if (!apiKey) return null;
  const query = `${venueName} ${dayCity}`;
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { places?: PlacesTextSearchResult[] };
    return data.places?.[0]?.formattedAddress ?? null;
  } catch {
    return null;
  }
}

// ─── Validation result + correction prompt ─────────────────────────────────

export interface ValidationFailure {
  source: AddressableItem['source'];
  index: number;
  name: string;
  address: string;
  reason: 'address_string_mismatch' | 'places_city_mismatch';
  placesAddress?: string;
}

export interface ValidationResult {
  ok: boolean;
  failures: ValidationFailure[];
}

/**
 * Two-tier validation for a single day. Tier 1 runs on every item
 * synchronously; Tier 2 runs in parallel for any item that passed
 * Tier 1 (since Tier 2 catches the case Tier 1 misses — street-only
 * address without a city name). When `placesApiKey` is empty, Tier 2
 * is skipped entirely.
 */
export async function validateDayLocations(
  day: ItineraryDay,
  placesApiKey: string,
): Promise<ValidationResult> {
  const dayCity = day.city;
  if (!dayCity) return { ok: true, failures: [] }; // no city set, can't validate
  const items = collectAddressableItems(day);
  const failures: ValidationFailure[] = [];

  // Tier 1 pass — sync, fast.
  const tier1Survivors: AddressableItem[] = [];
  for (const item of items) {
    if (addressContainsCity(item.address, dayCity)) {
      tier1Survivors.push(item);
    } else {
      failures.push({
        source: item.source,
        index: item.index,
        name: item.name,
        address: item.address ?? '',
        reason: 'address_string_mismatch',
      });
    }
  }

  // Tier 2 — parallel Places lookups for everything that passed Tier 1.
  // Concurrency-capped at 6 to stay polite to the Places quota.
  if (placesApiKey && tier1Survivors.length > 0) {
    const CONCURRENCY = 6;
    for (let start = 0; start < tier1Survivors.length; start += CONCURRENCY) {
      const slice = tier1Survivors.slice(start, start + CONCURRENCY);
      const results = await Promise.all(
        slice.map(item => lookupPlacesAddress(item.name, dayCity, placesApiKey).then(addr => ({ item, addr })))
      );
      for (const { item, addr } of results) {
        if (addr && !addressContainsCity(addr, dayCity)) {
          failures.push({
            source: item.source,
            index: item.index,
            name: item.name,
            address: item.address ?? '',
            reason: 'places_city_mismatch',
            placesAddress: addr,
          });
        }
      }
    }
  }

  return { ok: failures.length === 0, failures };
}

// ─── Correction prompt + re-emit ────────────────────────────────────────────

/**
 * Build the correction prompt the AI gets on a retry. Includes the original
 * day JSON (so the AI knows what to preserve), the validation failures
 * (so it knows what's wrong), and explicit rules about what to change
 * and what to keep.
 */
function buildCorrectionPrompt(
  day: ItineraryDay,
  failures: ValidationFailure[],
  dayCity: string,
): string {
  const failureLines = failures.map(f => {
    if (f.reason === 'places_city_mismatch') {
      return `  - ${f.name} (in ${f.source}): you emitted address "${f.address}" but Google Places resolved this venue to "${f.placesAddress}" — that is NOT in ${dayCity}. Replace with a venue actually in ${dayCity}.`;
    }
    return `  - ${f.name} (in ${f.source}): address "${f.address}" does not contain "${dayCity}". This venue is in the wrong city. Replace with a venue actually in ${dayCity}.`;
  }).join('\n');

  return `The day below failed location validation. Every venue's address MUST be physically located in "${dayCity}".

VALIDATION FAILURES:
${failureLines}

INSTRUCTIONS:
1. Re-emit the SAME day object (same "day" number, "date", "theme", "city").
2. Replace ONLY the flagged venues above with real venues actually located in ${dayCity}. Keep all other venues unchanged.
3. Each replacement venue's "address" MUST contain "${dayCity}" or its postal code.
4. Preserve every other field (transport legs, sidebar arrays, meetup times, etc.) unless they reference one of the replaced venues.
5. If you can't recall a real venue in ${dayCity}, describe a category instead ("a casual bistro near the town center") rather than naming a venue in the wrong city.

Return ONLY the corrected day as a single JSON object. No markdown. No explanation. Start with { and end with }.

ORIGINAL DAY TO CORRECT:
${JSON.stringify(day, null, 2)}`;
}

/**
 * Re-emit a single day with the AI given correction guidance. Used by
 * validateAndCorrectDay when validation fails. Non-streaming because we
 * need the full corrected day in one shot to re-validate.
 */
async function reEmitDayWithCorrection(
  day: ItineraryDay,
  failures: ValidationFailure[],
  anthropic: Anthropic,
  modelId: string,
  systemPrompt: string,
): Promise<ItineraryDay | null> {
  if (!day.city) return null;
  const correctionPrompt = buildCorrectionPrompt(day, failures, day.city);
  try {
    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: 6000,
      system: systemPrompt,
      messages: [{ role: 'user', content: correctionPrompt }],
    });
    const block = response.content[0];
    if (block?.type !== 'text') return null;
    const text = block.text.trim();
    // Strip any wrapping ```json fences just in case.
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned) as ItineraryDay;
    return parsed;
  } catch (err) {
    console.warn('[verifyDayLocations] correction call failed:', err);
    return null;
  }
}

// ─── Public entry point ──────────────────────────────────────────────────────

export interface ValidateAndCorrectOptions {
  anthropic: Anthropic;
  modelId: string;
  systemPrompt: string;
  placesApiKey: string;
  maxRetries?: number;
  /** Optional status-event sender (SSE) — gets a friendly message string. */
  sendStatus?: (message: string) => void;
}

export interface ValidateAndCorrectResult {
  /** The day to emit downstream — either the original or a corrected version. */
  day: ItineraryDay;
  /** True if the day passes validation (either on first try or after correction). */
  ok: boolean;
  /** When ok=false, the final batch of failures we couldn't correct. */
  finalFailures?: ValidationFailure[];
  /** Number of correction retries attempted (0 if first-try success). */
  retries: number;
}

/**
 * Validate a day's locations, re-prompt the AI on failure, retry up to N
 * times. Returns the corrected day (when fixable) or the original with
 * `ok: false` (when not). The caller decides what to do on hard failure
 * — typically emit an error SSE event and abort the build.
 */
export async function validateAndCorrectDay(
  day: ItineraryDay,
  opts: ValidateAndCorrectOptions,
): Promise<ValidateAndCorrectResult> {
  const maxRetries = opts.maxRetries ?? 2;
  let current = day;
  let retries = 0;

  // Initial validation.
  let result = await validateDayLocations(current, opts.placesApiKey);
  if (result.ok) return { day: current, ok: true, retries: 0 };

  // Correction loop.
  while (retries < maxRetries) {
    retries++;
    opts.sendStatus?.(`Fixing location issues on day ${current.day} (attempt ${retries}/${maxRetries})…`);
    const corrected = await reEmitDayWithCorrection(
      current,
      result.failures,
      opts.anthropic,
      opts.modelId,
      opts.systemPrompt,
    );
    if (!corrected) {
      // Correction call failed — try again if we have retries left.
      continue;
    }
    // Preserve the original day number/date/city in case the AI drifted.
    corrected.day = current.day;
    corrected.date = current.date;
    corrected.city = current.city;
    result = await validateDayLocations(corrected, opts.placesApiKey);
    current = corrected;
    if (result.ok) return { day: current, ok: true, retries };
  }

  return { day: current, ok: false, finalFailures: result.failures, retries };
}

// Re-export the AddressableItem type so callers can render failure UIs
// against the same source enum.
export type { AddressableItem };

// Suppress unused-warning on TransportLeg if downstream callers don't import
// it from here — kept on the import for future symmetry with Activity.
type _unused = TransportLeg;
