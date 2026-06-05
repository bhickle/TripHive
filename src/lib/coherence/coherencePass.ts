/**
 * Whole-trip coherence + dedup pass.
 *
 * Runs over a COMPLETE, assembled itinerary (every day generated) — the thing
 * per-day verification can't catch, because it only ever sees one day at a time.
 * Two parts:
 *
 *   1. DEDUPE (applied) — deterministic cross-day duplicate detection + an
 *      AI-generated, verify-before-show replacement. The classic chunk-seam
 *      artifact is the same restaurant/attraction landing on two days because
 *      each 3-day slice was a separate AI call. We keep the first occurrence and
 *      swap a genuinely-different, location-verified venue into the later one.
 *
 *   2. QUALITY (advisory) — one cheap Haiku pass that REPORTS pacing / variety /
 *      budget-drift / continuity observations over the whole trip. Read-only in
 *      v1: it returns findings the caller can surface or log; it does not rewrite
 *      good days (that's deliberately out of scope until we can grade it).
 *
 * Architecture-independent: this is a pure server function. The current
 * build-complete flow OR the future Inngest background worker can both call it
 * as the final step before a trip is marked "ready."
 *
 * FAIL-OPEN throughout: any AI/Places/parse failure leaves the itinerary exactly
 * as it was. Worst case it changes nothing — it can never corrupt or drop a day.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ItineraryDay, Activity } from '@/lib/types';
import {
  addressContainsCity,
  lookupPlacesAddress,
  type LocationCacheContext,
} from '@/lib/places/verifyDayLocations';
import type { createAdminClient } from '@/lib/supabase/admin';

type Track = 'shared' | 'track_a' | 'track_b';
const TRACKS: Track[] = ['shared', 'track_a', 'track_b'];

// ─── Public shapes ────────────────────────────────────────────────────────────

export interface CoherenceChange {
  kind: 'dedupe_replaced' | 'dedupe_flagged';
  day: number;
  track: Track;
  original: string;
  replacement?: string;
  note: string;
}

export interface QualityFinding {
  kind: 'pacing' | 'variety' | 'budget' | 'continuity';
  day?: number;
  detail: string;
}

export interface CoherenceResult {
  /** The (possibly) corrected days — same array when nothing changed. */
  days: ItineraryDay[];
  /** Applied edits (dedupe replacements / flags). */
  changes: CoherenceChange[];
  /** Advisory quality observations — NOT applied to the itinerary. */
  qualityFindings: QualityFinding[];
  ok: boolean;
}

export interface CoherenceDeps {
  anthropic: Anthropic;
  /** Google Places key — replacements are grounded in real places + verified. */
  placesApiKey: string;
  /** Admin client for the global venue_location_cache (optional; null = no DB cache). */
  supabase?: ReturnType<typeof createAdminClient> | null;
  /** Sonnet for replacement venue generation (real venues = quality-critical). */
  replacementModel?: string;
  /** Haiku for the structured quality report. */
  qualityModel?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type NamedActivity = Activity & { name?: string; address?: string; mealType?: string | null };

function activityName(a: NamedActivity): string {
  return (a.name ?? a.title ?? '').trim();
}

/** Normalize a venue name for duplicate matching: lowercase, strip punctuation /
 *  diacritics, collapse whitespace. ("Café Léon!" and "cafe leon" collide.) */
function normName(s: string): string {
  return (s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generic filler we should NOT treat as a dedupable venue: free time, hotel
 * meals, "walk around X", transfers, etc. These legitimately recur and have no
 * specific venue to swap. Only named venues WITH an address are dedupable.
 */
const GENERIC_RE = /\b(free time|free morning|free afternoon|free evening|breakfast at (the )?hotel|hotel breakfast|check[- ]?in|check[- ]?out|relax|rest|leisure|explore|wander|walk around|stroll|downtime|on your own|optional|transfer|transit|travel to|depart|arrival|return to)\b/i;

function isDedupable(a: NamedActivity): boolean {
  const name = activityName(a);
  if (!name || name.length < 3) return false;
  if (!a.address || a.address.trim().length === 0) return false; // no venue to verify a swap against
  if (GENERIC_RE.test(name)) return false;
  return true;
}

interface VenueRef {
  dayIdx: number;
  dayNumber: number;
  track: Track;
  actIdx: number;
  activity: NamedActivity;
}

/** Every dedupable venue across the trip, in day-then-track order. */
function collectVenues(days: ItineraryDay[]): VenueRef[] {
  const out: VenueRef[] = [];
  days.forEach((day, dayIdx) => {
    for (const track of TRACKS) {
      const list = (day.tracks?.[track] ?? []) as NamedActivity[];
      if (!Array.isArray(list)) continue;
      list.forEach((activity, actIdx) => {
        if (isDedupable(activity)) {
          out.push({ dayIdx, dayNumber: day.day, track, actIdx, activity });
        }
      });
    }
  });
  return out;
}

/**
 * Cross-DAY duplicates only. Same normalized venue name appearing on 2+ distinct
 * days → keep the earliest occurrence, return the rest as the ones to replace.
 * (Same venue twice on ONE day is rare and usually intentional — e.g. a café you
 * return to — so we don't touch within-day repeats.)
 */
function detectDuplicates(venues: VenueRef[]): VenueRef[] {
  const byName = new Map<string, VenueRef[]>();
  for (const v of venues) {
    const key = normName(activityName(v.activity));
    if (!key) continue;
    (byName.get(key) ?? byName.set(key, []).get(key)!).push(v);
  }
  const toReplace: VenueRef[] = [];
  for (const refs of Array.from(byName.values())) {
    const distinctDays = new Set(refs.map(r => r.dayNumber));
    if (distinctDays.size < 2) continue; // only on one day (or one entry) → fine
    // Keep the earliest day's occurrence; replace the later ones.
    const sorted = [...refs].sort((a, b) => a.dayNumber - b.dayNumber || a.dayIdx - b.dayIdx);
    toReplace.push(...sorted.slice(1));
  }
  return toReplace;
}

// ─── Real-Places grounding (compact mirror of suggest-activity) ───────────────

const PRICE_LEVEL_MAP: Record<string, string> = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

async function fetchRealPlaces(city: string, isRestaurant: boolean, apiKey: string): Promise<string> {
  if (!apiKey || !city) return '';
  try {
    const query = isRestaurant ? `restaurants in ${city}` : `things to do attractions in ${city}`;
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 15, languageCode: 'en' }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return '';
    const data = await res.json() as {
      places?: Array<{ displayName?: { text?: string }; formattedAddress?: string; rating?: number; userRatingCount?: number; priceLevel?: string }>;
    };
    return (data.places ?? [])
      .filter(p => (p.rating ?? 0) >= 3.5 && (p.userRatingCount ?? 0) >= 5 && p.displayName?.text)
      .map(p => {
        const meta = [p.rating ? `★${p.rating}` : '', p.priceLevel && PRICE_LEVEL_MAP[p.priceLevel] ? PRICE_LEVEL_MAP[p.priceLevel] : ''].filter(Boolean);
        return `• ${p.displayName!.text} — ${p.formattedAddress ?? ''}${meta.length ? ` (${meta.join(', ')})` : ''}`;
      })
      .join('\n');
  } catch {
    return '';
  }
}

// ─── Verified replacement generation ──────────────────────────────────────────

interface ReplacementContext {
  city: string;
  dayNumber: number;
  timeSlot: string;
  track: Track;
  isRestaurant: boolean;
  mealType?: string | null;
  duplicateName: string;
  excludeNames: string[];
}

/** JSON-extract helper — strips fences/smart-quotes/trailing commas, slices to the object. */
function parseLooseJson<T>(text: string): T | null {
  try {
    let c = text
      .replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
      .replace(/,(\s*[}\]])/g, '$1')
      .trim();
    const s = c.indexOf('{'); const e = c.lastIndexOf('}');
    if (s === -1 || e === -1) return null;
    c = c.slice(s, e + 1);
    return JSON.parse(c) as T;
  } catch {
    return null;
  }
}

/**
 * Generate ONE location-verified replacement for a duplicate venue. Mirrors
 * suggest-activity: ground on real Places, generate with Sonnet, verify
 * (Tier 1 string + Tier 2 Places), up to 2 retries excluding rejected picks.
 * Returns a partial Activity to merge, or null if it couldn't produce a
 * verified replacement (caller then leaves the duplicate untouched).
 */
async function generateVerifiedReplacement(
  ctx: ReplacementContext,
  deps: CoherenceDeps,
  cache: LocationCacheContext,
): Promise<{ name: string; address: string; description?: string; priceLevel?: number } | null> {
  const model = deps.replacementModel ?? 'claude-sonnet-4-6';
  const realPlaces = await fetchRealPlaces(ctx.city, ctx.isRestaurant, deps.placesApiKey);

  const buildPrompt = (extraExclude: string[]): string => {
    const exclude = [...ctx.excludeNames, ...extraExclude];
    return `You are fixing a duplicate in a travel itinerary. The ${ctx.isRestaurant ? 'restaurant' : 'venue'} "${ctx.duplicateName}" appears on more than one day. Suggest ONE genuinely different replacement.

CONTEXT:
- City: ${ctx.city}
- Day ${ctx.dayNumber}, time slot ${ctx.timeSlot}${ctx.mealType ? `, ${ctx.mealType}` : ''}
- It must be a REAL, currently-operating ${ctx.isRestaurant ? 'restaurant/café' : 'attraction or experience'} physically located in ${ctx.city}.

HARD CONSTRAINT — do NOT suggest any of these (already used elsewhere on the trip):
${exclude.map(n => `- ${n}`).join('\n') || '- (none)'}

Return ONLY this JSON (no markdown, no prose):
{"name":"Venue name","address":"Full street address, ${ctx.city}","description":"One sentence on why it's worth visiting","priceLevel":2}
${realPlaces ? `\nPICK FROM THESE REAL, QUALITY-FILTERED PLACES IN ${ctx.city} (★3.5+):\n${realPlaces}` : ''}`;
  };

  const rejected: string[] = [];
  for (let attempt = 0; attempt <= 2; attempt++) {
    let msg;
    try {
      msg = await deps.anthropic.messages.create({
        model,
        max_tokens: 600,
        messages: [{ role: 'user', content: buildPrompt(rejected) }],
      });
    } catch {
      return null; // AI failure → leave duplicate as-is
    }
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
    const parsed = parseLooseJson<{ name?: string; address?: string; description?: string; priceLevel?: number }>(text);
    const name = parsed?.name?.trim();
    const address = parsed?.address?.trim();
    if (!name || !address) return null;

    // Don't accept a "replacement" that's just the same venue or another excluded one.
    const normNew = normName(name);
    if (normNew === normName(ctx.duplicateName) || ctx.excludeNames.some(n => normName(n) === normNew)) {
      rejected.push(name);
      continue;
    }

    // Verify-before-show: Tier 1 string + Tier 2 Places (cached). Fail-open on
    // API issues (Tier 1 already passed), fail-CLOSED on a confirmed wrong city.
    const tier1 = addressContainsCity(address, ctx.city);
    if (!tier1) { rejected.push(name); continue; }
    if (deps.placesApiKey) {
      const placesAddr = await lookupPlacesAddress(name, ctx.city, deps.placesApiKey, cache);
      if (placesAddr && !addressContainsCity(placesAddr, ctx.city)) { rejected.push(name); continue; }
    }
    return { name, address, description: parsed?.description, priceLevel: parsed?.priceLevel };
  }
  return null; // exhausted retries without a verified pick
}

// ─── Quality report (advisory, Haiku) ─────────────────────────────────────────

/** Compact textual digest of the trip the quality model reasons over. */
function tripDigest(days: ItineraryDay[]): string {
  return days.map(d => {
    const acts = TRACKS.flatMap(t => ((d.tracks?.[t] ?? []) as NamedActivity[])
      .map(a => `${a.timeSlot ?? ''} ${activityName(a)}${a.isRestaurant ? ' [meal]' : ''}`.trim()));
    return `Day ${d.day}${d.city ? ` (${d.city})` : ''}${d.theme ? ` — ${d.theme}` : ''}:\n${acts.map(a => `  - ${a}`).join('\n')}`;
  }).join('\n');
}

async function analyzeQuality(days: ItineraryDay[], deps: CoherenceDeps): Promise<QualityFinding[]> {
  const model = deps.qualityModel ?? 'claude-haiku-4-5';
  const prompt = `You are reviewing a COMPLETE multi-day travel itinerary for coherence problems introduced by assembling it in separate chunks. Report observations only — do NOT rewrite anything.

Check for:
- pacing: a day overloaded while another is thin; a day missing breakfast/lunch/dinner coverage.
- variety: the same theme/category repeated on back-to-back days when it doesn't look intentional (e.g. 3 museum-heavy days in a row).
- budget: the price tier drifting noticeably richer or cheaper across days.
- continuity: a "tomorrow we'll…" style reference that doesn't actually resolve the next day.

Return ONLY this JSON (no markdown):
{"findings":[{"kind":"pacing|variety|budget|continuity","day":<number or null>,"detail":"one concise sentence"}]}
Return an empty findings array if the trip looks coherent. Be conservative — only flag real issues.

ITINERARY:
${tripDigest(days)}`;

  try {
    const msg = await deps.anthropic.messages.create({
      model,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
    const parsed = parseLooseJson<{ findings?: QualityFinding[] }>(text);
    if (!parsed?.findings || !Array.isArray(parsed.findings)) return [];
    return parsed.findings
      .filter(f => f && typeof f.detail === 'string' && ['pacing', 'variety', 'budget', 'continuity'].includes(f.kind))
      .slice(0, 12);
  } catch {
    return [];
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Run the whole-trip coherence pass. Applies dedupe fixes (returns a new days
 * array when anything changed) and attaches advisory quality findings.
 */
export async function runCoherencePass(
  days: ItineraryDay[],
  deps: CoherenceDeps,
): Promise<CoherenceResult> {
  // Absolute backstop — never throw into the build path.
  try {
    if (!Array.isArray(days) || days.length === 0) {
      return { days, changes: [], qualityFindings: [], ok: true };
    }

    const cache: LocationCacheContext = {
      supabase: deps.supabase ?? null,
      memo: new Map<string, string | null>(),
    };

    // ── 1. Dedupe (applied) ──────────────────────────────────────────────────
    const venues = collectVenues(days);
    const duplicates = detectDuplicates(venues);
    const changes: CoherenceChange[] = [];

    // Running exclude set = every venue already on the trip + every replacement
    // we choose, so two duplicates never get swapped to the same new venue.
    const usedNames = new Set(venues.map(v => normName(activityName(v.activity))));

    // Work on a deep-ish copy only if we actually have duplicates to fix.
    let workingDays = days;
    if (duplicates.length > 0) {
      workingDays = days.map(d => ({
        ...d,
        tracks: {
          shared: [...((d.tracks?.shared ?? []) as Activity[])],
          track_a: [...((d.tracks?.track_a ?? []) as Activity[])],
          track_b: [...((d.tracks?.track_b ?? []) as Activity[])],
        },
      }));
    }

    for (const dup of duplicates) {
      const day = workingDays[dup.dayIdx];
      const list = day.tracks[dup.track] as NamedActivity[];
      const current = list[dup.actIdx] as NamedActivity | undefined;
      // Guard: the index still points at the same venue we detected.
      if (!current || normName(activityName(current)) !== normName(activityName(dup.activity))) continue;

      const city = day.city ?? '';
      if (!city) {
        changes.push({ kind: 'dedupe_flagged', day: day.day, track: dup.track, original: activityName(current), note: 'Duplicate venue, but no day.city to source a verified replacement — left as-is.' });
        continue;
      }

      const replacement = await generateVerifiedReplacement(
        {
          city,
          dayNumber: day.day,
          timeSlot: current.timeSlot ?? '',
          track: dup.track,
          isRestaurant: !!current.isRestaurant,
          mealType: current.mealType ?? null,
          duplicateName: activityName(current),
          excludeNames: Array.from(usedNames).length ? venues.map(v => activityName(v.activity)) : [],
        },
        deps,
        cache,
      );

      if (!replacement) {
        changes.push({ kind: 'dedupe_flagged', day: day.day, track: dup.track, original: activityName(current), note: 'Duplicate venue — could not produce a verified replacement, left as-is.' });
        continue;
      }

      // Merge the replacement onto the existing activity so notes/votes/track/
      // timeSlot survive (same principle as the activity-edit fix).
      list[dup.actIdx] = {
        ...current,
        name: replacement.name,
        title: replacement.name,
        address: replacement.address,
        description: replacement.description ?? current.description ?? '',
        priceLevel: replacement.priceLevel ?? current.priceLevel,
        // It's a fresh venue — drop stale place identity + verification flags.
        placeId: undefined,
        verified: false,
        googleVerified: false,
        website: undefined,
        wasReplaced: true,
      };
      usedNames.add(normName(replacement.name));
      changes.push({ kind: 'dedupe_replaced', day: day.day, track: dup.track, original: activityName(current), replacement: replacement.name, note: 'Cross-day duplicate replaced with a verified alternative.' });
    }

    // ── 2. Quality report (advisory, read-only) ──────────────────────────────
    const qualityFindings = await analyzeQuality(workingDays, deps);

    return { days: workingDays, changes, qualityFindings, ok: true };
  } catch (err) {
    console.error('[coherencePass] unexpected error — returning days unchanged:', err);
    return { days, changes: [], qualityFindings: [], ok: false };
  }
}
