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
import type { createAdminClient } from '@/lib/supabase/admin';

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
 * Exonym → endonym aliases. The AI's English `day.city` ("Lisbon") often
 * doesn't appear verbatim in a real local-language address ("…, 1100-053
 * Lisboa, Portugal"), so a naive substring check fails EVERY venue in those
 * cities and the verify gate drops the whole day — which silently zeroed out
 * builds for Lisbon, Munich, Florence, etc. (2026-05-31 launch-blocker QA).
 *
 * Keys + values are pre-normalized (lowercase, accent-stripped) to match
 * `normalize()` output. This only ADDS accepted spellings for known city
 * pairs — it never weakens the wrong-city catch (a Paris address on a
 * Versailles day still fails, because "paris" isn't an alias of "versailles").
 */
const CITY_ALIASES: Record<string, string[]> = {
  lisbon: ['lisboa'],
  porto: ['oporto'], oporto: ['porto'],
  munich: ['munchen', 'muenchen'],
  cologne: ['koln', 'koeln'],
  nuremberg: ['nurnberg', 'nuernberg'],
  florence: ['firenze'],
  rome: ['roma'],
  milan: ['milano'],
  naples: ['napoli'],
  venice: ['venezia'],
  turin: ['torino'],
  genoa: ['genova'],
  padua: ['padova'],
  vienna: ['wien'],
  prague: ['praha'],
  warsaw: ['warszawa'],
  krakow: ['cracow'], cracow: ['krakow'],
  moscow: ['moskva'],
  athens: ['athina', 'athinai'],
  seville: ['sevilla'],
  lyon: ['lyons'],
  geneva: ['geneve', 'genf'],
  zurich: ['zuerich'],
  copenhagen: ['kobenhavn', 'koebenhavn'],
  gothenburg: ['goteborg', 'goeteborg'],
  antwerp: ['antwerpen'],
  brussels: ['bruxelles', 'brussel'],
  bruges: ['brugge'],
  ghent: ['gent'],
  bucharest: ['bucuresti'],
  belgrade: ['beograd'],
  kyiv: ['kiev'], kiev: ['kyiv'],
  mumbai: ['bombay'], bombay: ['mumbai'],
  beijing: ['peking'],
};

/**
 * Tier 1: cheap string check. Does the activity's address contain the
 * day's city name (or a known local-language variant of it)? Returns true
 * if any accepted spelling of the city is present in the address.
 */
export function addressContainsCity(address: string | undefined, dayCity: string | undefined): boolean {
  if (!address || !dayCity) return true; // can't validate without both — fail open
  const normAddress = normalize(address);
  // Use the city core only — drop a trailing ", Country" / ", State" so
  // "Lisbon, Portugal" checks against "lisbon", not "lisbon portugal" (which
  // a "…Lisboa, Portugal" address would never contain as a contiguous run).
  const cityCore = normalize(dayCity.split(',')[0]);
  if (!cityCore) return true;
  const candidates = [cityCore, ...(CITY_ALIASES[cityCore] ?? [])];
  return candidates.some(c => normAddress.includes(c));
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

// ─── Location cache (venue_location_cache) ──────────────────────────────────
//
// Tier 2 Places lookups used to fire on EVERY build with zero reuse — the
// single biggest variable cost in the build pipeline. This cache makes the
// resolved address reusable across builds AND users (it's global: a venue's
// address is a property of the venue, not the trip). Mirrors the proven
// pattern in verifyVenues.ts `runVerificationPass`, but stored in its own
// table so it never touches the open/closed-status cache path.

/** 30-day TTL. Addresses barely change, but this keeps the table small and
 *  lets the existing expire-venue-cache cron sweep it on the same cadence. */
const LOCATION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface LocationCacheContext {
  /** Admin client (bypasses RLS). When null, lookups still run but the
   *  results aren't persisted — only the in-request memo applies. */
  supabase: ReturnType<typeof createAdminClient> | null;
  /** Per-request memo: cacheKey → resolved formattedAddress (null = Places
   *  returned no result; a real cached negative). Shared across the initial
   *  validation and any correction re-checks so the unchanged venues on a
   *  corrected day aren't re-looked-up. */
  memo: Map<string, string | null>;
}

/** Canonical cache key for a (venue, city) pair. City is part of the key so
 *  "Hard Rock Cafe" in Rome never collides with the one in Orlando. */
function buildLocationCacheKey(venueName: string, city: string): string {
  return `${normalize(venueName)}|${normalize(city)}`;
}

type PlacesLookupOutcome =
  | { kind: 'found'; address: string }
  | { kind: 'no_result' } // Places responded, zero matches → safe to cache as null
  | { kind: 'error' };    // network/API failure → do NOT cache (transient)

/** Like lookupPlacesAddress but distinguishes "no result" (cacheable) from
 *  "error" (not cacheable), which the cache needs to avoid baking in a blip. */
async function lookupPlacesAddressDetailed(
  venueName: string,
  dayCity: string,
  apiKey: string,
): Promise<PlacesLookupOutcome> {
  if (!apiKey) return { kind: 'error' };
  const query = `${venueName} ${dayCity}`;
  try {
    // Hard per-lookup timeout. Without it a hung Places call could stall a
    // whole build chunk until the 300s function limit, truncating the trip
    // (QA #25 — long builds timing out). A timeout surfaces as 'error', which
    // fails OPEN (the day is kept, Tier 1 already passed), so this only ever
    // trades a slow verification for a fast pass-through — never a dropped day.
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { kind: 'error' };
    const data = await res.json() as { places?: PlacesTextSearchResult[] };
    const addr = data.places?.[0]?.formattedAddress;
    return addr ? { kind: 'found', address: addr } : { kind: 'no_result' };
  } catch {
    return { kind: 'error' };
  }
}

/** Upsert resolved lookups (found + no_result) for future builds. Non-fatal:
 *  a write failure just means the next build re-pays that Places call. */
async function upsertLocationCache(
  supabase: ReturnType<typeof createAdminClient>,
  rows: Array<{ cache_key: string; venue_name: string; city: string; formatted_address: string | null }>,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('venue_location_cache')
    .upsert(rows, { onConflict: 'cache_key' });
  if (error) console.warn('[verifyDayLocations] location cache upsert failed:', error.message);
}

/**
 * Query Google Places for a single venue's formattedAddress. Used by
 * Tier 2 when the Tier 1 string check passes but we still want to
 * confirm the venue is physically where it claims to be. Returns null
 * on any API failure (Places down, network, no results) — Tier 2 then
 * fails OPEN, since Tier 1 already passed.
 */
export async function lookupPlacesAddress(
  venueName: string,
  dayCity: string,
  apiKey: string,
  cache?: LocationCacheContext,
): Promise<string | null> {
  if (!apiKey) return null;
  const key = buildLocationCacheKey(venueName, dayCity);

  // In-request memo first (covers repeats + correction re-checks).
  if (cache?.memo.has(key)) return cache.memo.get(key) ?? null;

  // Then the shared DB cache, if a client was supplied.
  if (cache?.supabase) {
    const { data } = await cache.supabase
      .from('venue_location_cache')
      .select('formatted_address, checked_at')
      .eq('cache_key', key)
      .maybeSingle();
    if (data && Date.now() - new Date(data.checked_at).getTime() < LOCATION_CACHE_TTL_MS) {
      cache.memo.set(key, data.formatted_address);
      return data.formatted_address;
    }
  }

  // Miss → Places call.
  const outcome = await lookupPlacesAddressDetailed(venueName, dayCity, apiKey);
  if (outcome.kind === 'error') return null; // don't cache transient failures
  const addr = outcome.kind === 'found' ? outcome.address : null;
  cache?.memo.set(key, addr);
  if (cache?.supabase) {
    await upsertLocationCache(cache.supabase, [
      { cache_key: key, venue_name: venueName, city: dayCity, formatted_address: addr },
    ]);
  }
  return addr;
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
  cache?: LocationCacheContext,
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

  // Tier 2 — Places lookups for everything that passed Tier 1, cached.
  // A local memo is always used (so the city-match check below has the
  // resolved address even with no DB cache); the DB read/write only happens
  // when a supabase client was supplied via `cache`.
  if (placesApiKey && tier1Survivors.length > 0) {
    const memo = cache?.memo ?? new Map<string, string | null>();
    const supabase = cache?.supabase ?? null;

    // One key per survivor; resolve uniques once (a venue repeated on the
    // same day, or already memoized from a prior correction pass, is free).
    const keyed = tier1Survivors.map(item => ({ item, key: buildLocationCacheKey(item.name, dayCity) }));
    const repForKey = new Map(keyed.map(k => [k.key, k.item]));
    const uniqueKeys = Array.from(repForKey.keys());

    // Bulk-read the cache for keys we don't already have memoized.
    if (supabase) {
      const toRead = uniqueKeys.filter(k => !memo.has(k));
      if (toRead.length > 0) {
        const { data: rows } = await supabase
          .from('venue_location_cache')
          .select('cache_key, formatted_address, checked_at')
          .in('cache_key', toRead);
        const now = Date.now();
        for (const row of rows ?? []) {
          if (now - new Date(row.checked_at).getTime() < LOCATION_CACHE_TTL_MS) {
            memo.set(row.cache_key, row.formatted_address);
          }
        }
      }
    }

    // Places-call the still-unknown keys, concurrency-capped at 6.
    const misses = uniqueKeys.filter(k => !memo.has(k));
    const newRows: Array<{ cache_key: string; venue_name: string; city: string; formatted_address: string | null }> = [];
    const CONCURRENCY = 6;
    for (let start = 0; start < misses.length; start += CONCURRENCY) {
      const slice = misses.slice(start, start + CONCURRENCY);
      const results = await Promise.all(
        slice.map(key => {
          const item = repForKey.get(key)!;
          return lookupPlacesAddressDetailed(item.name, dayCity, placesApiKey).then(outcome => ({ key, item, outcome }));
        }),
      );
      for (const { key, item, outcome } of results) {
        if (outcome.kind === 'error') continue; // fail open, don't cache
        const addr = outcome.kind === 'found' ? outcome.address : null;
        memo.set(key, addr);
        newRows.push({ cache_key: key, venue_name: item.name, city: dayCity, formatted_address: addr });
      }
    }

    // Persist the new lookups for future builds (+ users).
    if (supabase && newRows.length > 0) await upsertLocationCache(supabase, newRows);

    // City-match check using the resolved addresses. `undefined` (a Places
    // error with no memo entry) and `null` (no result) both fail open — same
    // as the pre-cache behavior where a null lookup was skipped.
    for (const { item, key } of keyed) {
      const addr = memo.get(key);
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
  /** Optional admin client for the global Places location cache. When omitted
   *  or null, verification still runs — just without cross-build caching. */
  supabase?: ReturnType<typeof createAdminClient> | null;
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

  // One cache context for this day, shared across the initial validation and
  // every correction re-check — so a corrected day only Places-calls the
  // venue that actually changed, not the whole day again.
  const cache: LocationCacheContext = {
    supabase: opts.supabase ?? null,
    memo: new Map<string, string | null>(),
  };

  // Initial validation.
  let result = await validateDayLocations(current, opts.placesApiKey, cache);
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
    result = await validateDayLocations(corrected, opts.placesApiKey, cache);
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
