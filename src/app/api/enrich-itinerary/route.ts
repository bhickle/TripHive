import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { requireTripAccess } from '@/lib/supabase/tripAccess';
import { checkAiCredits, incrementAiCreditsUsed } from '@/lib/supabase/aiCredits';
import type { Json } from '@/lib/supabase/database.types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * POST /api/enrich-itinerary
 *
 * Generates the per-day sidebar arrays (photoSpots, foodieTips,
 * nightlifeHighlights, shoppingGuide, priorityHighlights, destinationTip)
 * for one or more days of an existing trip. Used to fill in "Daily
 * Highlights" on manually-built trips, or to refresh stale ones on
 * AI-built trips.
 *
 * Body: {
 *   tripId: string,
 *   dayNumbers?: number[]   // default: every day on the trip
 * }
 *
 * Cost: 1 credit per enriched day (AI_CREDIT_COSTS.enrich_day).
 *
 * Returns: { days: ItineraryDay[] } — the updated full days array.
 *
 * Auth: caller must be a trip member (organizer/co-organizer/member).
 *
 * Why not just re-run /api/generate-itinerary? Full generation regenerates
 * the activities (10K+ output tokens/day on Sonnet) which is overkill
 * when the user only wants to fill in highlights. This route uses Haiku
 * with a tight prompt — about ~1500 tokens/day output, ~50x cheaper.
 */

interface ActivityLite {
  name?: string;
  title?: string;
  neighborhood?: string;
  city?: string;
  address?: string;
  // Surface isRestaurant so the route can detect days missing meals
  // and ask the AI to fill them in (parsed uploads without restaurants
  // are the common case).
  isRestaurant?: boolean;
  mealType?: 'breakfast' | 'lunch' | 'dinner' | null;
}

interface DayLite {
  day: number;
  date?: string;
  city?: string | null;
  theme?: string | null;
  tracks?: {
    shared?: ActivityLite[];
    track_a?: ActivityLite[];
    track_b?: ActivityLite[];
  };
}

/** Count restaurant activities on a day (across all tracks). Used to
 *  decide whether the AI should fill in breakfast/lunch/dinner. */
function countRestaurants(day: DayLite): number {
  const acts: ActivityLite[] = [
    ...(day.tracks?.shared ?? []),
    ...(day.tracks?.track_a ?? []),
    ...(day.tracks?.track_b ?? []),
  ];
  return acts.filter(a => a.isRestaurant === true).length;
}

/** Render a day's existing activities into a compact context string the
 *  enrichment AI can anchor its picks to. We pass venue names and any
 *  available neighborhood so the AI keeps its photo/food/nightlife picks
 *  in the same geographic cluster the user is actually visiting. */
function summarizeDay(day: DayLite): string {
  const acts: ActivityLite[] = [
    ...(day.tracks?.shared ?? []),
    ...(day.tracks?.track_a ?? []),
    ...(day.tracks?.track_b ?? []),
  ];
  const items = acts
    .map(a => {
      const name = a.name || a.title;
      if (!name) return null;
      const neighborhood = a.neighborhood ? ` (${a.neighborhood})` : '';
      return `${name}${neighborhood}`;
    })
    .filter((s): s is string => !!s);
  const city = day.city ? `City: ${day.city}. ` : '';
  const theme = day.theme ? `Theme: ${day.theme}. ` : '';
  return `${city}${theme}Activities: ${items.length > 0 ? items.join('; ') : '(none listed)'}`;
}

function buildEnrichmentPrompt(
  destination: string,
  priorities: string[],
  days: DayLite[],
  /** Day numbers that need breakfast/lunch/dinner restaurant suggestions
   *  added to their tracks. Empty set = highlights only (original behavior). */
  daysNeedingRestaurants: Set<number>,
  /** budgetTierLevel from preferences. Drives priceLevel cap on restaurants.
   *  Defaults to 50 (MID-RANGE) when missing. */
  budgetTierLevel: number,
): string {
  const hasFood = priorities.includes('food');
  const hasNightlife = priorities.includes('nightlife');
  const hasShopping = priorities.includes('shopping');
  const hasPhoto = priorities.includes('photography');

  // Same priority-array taxonomy buildPrompt uses — passes through to
  // priorityHighlights so the sidebar renders consistently.
  const discoveryPriorities = priorities.filter(p =>
    ['nature', 'culture', 'history', 'sports', 'wellness', 'adventure',
     'beach', 'themepark', 'family'].includes(p)
  );

  // Per-meal priceLevel ceilings mirror the buildPrompt-internal logic
  // in generate-itinerary so enrichment-added restaurants don't outrun
  // the user's budget tier.
  const mealPriceLevels = budgetTierLevel < 30
    ? { breakfast: 1, lunch: 1, dinner: 2 }
    : budgetTierLevel < 60
    ? { breakfast: 1, lunch: 2, dinner: 2 }
    : budgetTierLevel < 85
    ? { breakfast: 2, lunch: 2, dinner: 3 }
    : { breakfast: 2, lunch: 3, dinner: 4 };
  const maxRestaurantPriceLevel = budgetTierLevel < 85 ? 3 : 4;

  // List the day numbers that need restaurants so the per-day prompt
  // text can be conditional. (We still ask for highlights on every day.)
  const restaurantDayList = days
    .filter(d => daysNeedingRestaurants.has(d.day))
    .map(d => d.day);

  const daysBlock = days
    .map(d => {
      const restaurantMark = daysNeedingRestaurants.has(d.day)
        ? ' [needs breakfast/lunch/dinner suggestions — day has no restaurants yet]'
        : '';
      return `\n  Day ${d.day}${restaurantMark} — ${summarizeDay(d)}`;
    })
    .join('');

  return `You generate per-day sidebar highlights for an existing travel itinerary in ${destination}.

The user's selected priorities: ${priorities.length > 0 ? priorities.join(', ') : '(none)'}.

For each day below, the user already has a set of activities planned. Your job is to surface 1–2 photo spots, ${hasFood ? 'foodie tips, ' : ''}${hasNightlife ? 'nightlife venues, ' : ''}${hasShopping ? 'shopping picks, ' : ''}${discoveryPriorities.length > 0 ? `${discoveryPriorities.join('/')}-priority spots, ` : ''}and a destination tip — each anchored to the neighborhoods or theme the user is already in that day.

Days to enrich:${daysBlock}

Return ONLY valid JSON — no markdown, no commentary — matching this shape:

{
  "days": [
    {
      "day": <number, matching one of the day numbers above>,
      "photoSpots": [
        { "name": "specific named landmark/viewpoint", "neighborhood": "district", "timeOfDay": "sunrise|golden hour|blue hour|midday|sunset|night|any", "tip": "one actionable shooting tip (angle, where to stand, what to frame)" }
      ],
      ${hasFood ? `"foodieTips": [
        { "name": "specific real venue", "type": "coffee bar|street stall|food market|specialty shop|food hall|late-night spot|bakery|bar snack|tasting room|other", "neighborhood": "district", "why": "1-sentence vivid reason", "orderThis": "1-3 specific items to order", "timeOfDay": "morning|midday|afternoon|evening|late-night|any", "priceRange": "$ | $$ | $$$", "tip": "one insider tip" }
      ],` : ''}
      ${hasNightlife ? `"nightlifeHighlights": [
        { "name": "real venue", "type": "cocktail bar|wine bar|dive bar|club|live music|rooftop|other", "neighborhood": "district", "why": "1-sentence vivid reason", "orderThis": "house drink or 1-2 things to try", "timeOfDay": "early evening|late evening|late-night|any", "priceRange": "$ | $$ | $$$", "tip": "one insider tip" }
      ],` : ''}
      ${hasShopping ? `"shoppingGuide": [
        { "name": "real shop/market/district", "type": "boutique|market|design store|bookshop|vintage|department store|gallery|other", "neighborhood": "district", "why": "1-sentence vivid reason", "orderThis": "1-3 specific things to look for", "timeOfDay": "morning|afternoon|evening|any", "priceRange": "$ | $$ | $$$", "tip": "one insider tip" }
      ],` : ''}
      ${discoveryPriorities.length > 0 ? `"priorityHighlights": [
        { "name": "real specific spot/activity/site", "neighborhood": "district", "priority": "${discoveryPriorities.join('|')}", "description": "1-sentence reason this is worth seeing" }
      ],` : ''}
      "destinationTip": "one punchy insider fact about this city or region tied to the day's theme/neighborhood"${restaurantDayList.length > 0 ? `,
      "restaurants": [
        { "name": "real restaurant name", "neighborhood": "district near today's activities", "mealType": "breakfast|lunch|dinner", "timeSlot": "HH:MM–HH:MM (en-dash)", "address": "full street address if known else null", "priceLevel": <0-${maxRestaurantPriceLevel}>, "description": "1-sentence why this spot — cite the source of its reputation (local institution, neighborhood favorite, etc.)" }
      ]` : ''}
    }
  ]
}

RULES:
1. Each photoSpots array must have 1–2 entries. ${hasPhoto ? 'Include the iconic must-photograph landmark for the destination on at least one day.' : 'Mix iconic and lesser-known.'}
${hasFood ? '2. foodieTips: exactly 2 per day, anchored to that day\'s neighborhoods. Do NOT recycle a venue across multiple days. Skip restaurants the user already has in their activities.' : ''}
${hasNightlife ? '3. nightlifeHighlights: exactly 2 per day. Same anchoring + dedup rules.' : ''}
${hasShopping ? '4. shoppingGuide: exactly 2 per day. Same anchoring + dedup rules.' : ''}
${discoveryPriorities.length > 0 ? `5. priorityHighlights: 1–2 per day covering the discovery priorities (${discoveryPriorities.join(', ')}). Anchor to neighborhoods.` : ''}
${discoveryPriorities.length === 0 ? '5.' : '6.'} destinationTip: punchy, specific, tied to the day's location. Rotate the topic across days (food → tradition → quirky fact → etc.).
${discoveryPriorities.length === 0 ? '6.' : '7.'} All venues must be real and accurately named. Anchor to the neighborhoods the user is already visiting that day — don't send them across town.
${discoveryPriorities.length === 0 ? '7.' : '8.'} Return exactly ${days.length} day objects, one for each day above, in order.${restaurantDayList.length > 0 ? `
${discoveryPriorities.length === 0 ? '8.' : '9.'} RESTAURANT BACKFILL — for ONLY these day numbers: ${restaurantDayList.join(', ')}, include the "restaurants" array with EXACTLY 3 entries: one breakfast, one lunch, one dinner. Each must be a REAL named restaurant in ${destination}, geographically anchored to the day's existing activities (no cross-town detours). Time slots: breakfast 07:30–09:00, lunch 12:30–14:00, dinner 19:00–21:00 (en-dash). Use mealType: "breakfast" | "lunch" | "dinner". priceLevel ceilings: breakfast ≤ ${mealPriceLevels.breakfast}, lunch ≤ ${mealPriceLevels.lunch}, dinner ≤ ${mealPriceLevels.dinner} (NEVER exceed ${maxRestaurantPriceLevel} on any meal). Address is best-effort — null is acceptable if you're not sure. Do NOT include restaurants for days NOT in that list, and do NOT re-suggest a restaurant the user already has in their day's activities. The description should cite the source of the restaurant's reputation, not invent a star rating.` : ''}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  // Parse body up-front so we can reach tripId for the access check.
  let body: { tripId?: string; dayNumbers?: number[]; includeRestaurants?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { tripId, dayNumbers, includeRestaurants } = body;
  if (!tripId || typeof tripId !== 'string') {
    return NextResponse.json({ error: 'tripId required' }, { status: 400 });
  }

  // Member-scoped: anyone on the trip can enrich its highlights (this is
  // a collab-friendly action like adding a packing item, not a destructive
  // edit). Restricting to organizer feels too narrow.
  const access = await requireTripAccess(tripId);
  if (!access.ok) return access.response;
  const { supabase } = access.ctx;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'NO_API_KEY' }, { status: 503 });
  }

  // Fetch the trip's days + preferences. We need:
  //  - itineraries.days (the source of truth for current state)
  //  - trips.destination + preferences.priorities (drives the prompt shape)
  const [{ data: trip }, { data: itinerary }] = await Promise.all([
    supabase.from('trips').select('destination, preferences').eq('id', tripId).single(),
    supabase.from('itineraries').select('days, meta').eq('trip_id', tripId).maybeSingle(),
  ]);
  if (!trip || !itinerary) {
    return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  }

  const days = (itinerary.days as unknown as DayLite[] | null) ?? [];
  if (days.length === 0) {
    return NextResponse.json({ error: 'Trip has no days to enrich yet' }, { status: 400 });
  }

  // Resolve which days to enrich. Default to every day; if the caller
  // specified day numbers, filter to those (validating they exist).
  const requestedDayNums = Array.isArray(dayNumbers)
    ? dayNumbers.filter(n => typeof n === 'number')
    : days.map(d => d.day);
  const targetDays = days.filter(d => requestedDayNums.includes(d.day));
  if (targetDays.length === 0) {
    return NextResponse.json({ error: 'No matching days to enrich' }, { status: 400 });
  }

  // Charge per day. Two-phase: gate-first, charge-after-success.
  const credits = await checkAiCredits(
    auth.ctx.userId,
    auth.ctx.tier,
    'enrich_day',
  );
  if (!credits.ok) return credits.response;
  // The cost above is for one day; for batch enrichment we want to
  // charge the per-day cost × N. Override the cost field so the
  // increment phase debits the full amount.
  credits.ctx.cost = credits.ctx.cost * targetDays.length;

  // Now check the user can actually afford the full batch.
  if (!credits.ctx.exempt && credits.ctx.used + credits.ctx.cost > credits.ctx.limit) {
    return NextResponse.json(
      {
        error: 'CREDITS_EXHAUSTED',
        message: `Enriching ${targetDays.length} day${targetDays.length === 1 ? '' : 's'} costs ${credits.ctx.cost} credits — you have ${Math.max(0, credits.ctx.limit - credits.ctx.used)} left.`,
        used: credits.ctx.used,
        limit: credits.ctx.limit,
        cost: credits.ctx.cost,
      },
      { status: 402 },
    );
  }

  // Pull priorities + budget tier from trips.preferences. Fallback to the
  // itinerary meta.preferences (older schema). Empty array / default 50
  // is fine — the prompt handles missing values.
  const preferences = (trip.preferences ?? {}) as { priorities?: string[]; curiosityLevel?: number };
  const metaPrefs = ((itinerary.meta as { preferences?: { priorities?: string[]; curiosityLevel?: number } } | null)?.preferences ?? {}) as { priorities?: string[]; curiosityLevel?: number };
  const priorities = preferences.priorities ?? metaPrefs.priorities ?? [];
  const budgetTierLevel = preferences.curiosityLevel ?? metaPrefs.curiosityLevel ?? 50;

  // When the caller asks to backfill restaurants, only apply to target
  // days that actually have zero restaurants. Days that already have
  // meals are skipped to avoid duplicating the user's existing plan.
  const daysNeedingRestaurants = new Set<number>();
  if (includeRestaurants) {
    for (const d of targetDays) {
      if (countRestaurants(d) === 0) daysNeedingRestaurants.add(d.day);
    }
  }

  const destination = (trip.destination as string) ?? 'this destination';
  const userPrompt = buildEnrichmentPrompt(
    destination,
    priorities,
    targetDays,
    daysNeedingRestaurants,
    budgetTierLevel,
  );

  let parsed: { days: Array<Record<string, unknown>> };
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      // Per-day output is ~800-1500 tokens; for a 7-day trip with all
      // priorities turned on this comfortably fits under 8K.
      max_tokens: 8000,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const raw = (message.content[0] as { text: string }).text;
    const cleaned = raw
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '')
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/,\s*([}\]])/g, '$1')
      .trim();
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart === -1 || objEnd === -1) throw new Error('No JSON object in response');
    parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1));
  } catch (err) {
    console.error('[enrich-itinerary] AI call failed:', err);
    return NextResponse.json(
      { error: 'ENRICHMENT_FAILED', message: 'Could not generate highlights. Please try again.' },
      { status: 500 },
    );
  }

  if (!Array.isArray(parsed?.days) || parsed.days.length === 0) {
    return NextResponse.json(
      { error: 'ENRICHMENT_FAILED', message: 'AI returned no highlights — please try again.' },
      { status: 500 },
    );
  }

  // Merge: for each parsed day, find the matching day by number and
  // overwrite the sidebar fields. Activities + tracks untouched.
  const enrichmentByDay = new Map<number, Record<string, unknown>>();
  for (const ed of parsed.days) {
    const dn = typeof ed.day === 'number' ? ed.day : null;
    if (dn !== null) enrichmentByDay.set(dn, ed);
  }

  /** Build a full Activity object from an AI-emitted restaurant shape.
   *  The enrich endpoint produces a slim shape (name, neighborhood,
   *  mealType, timeSlot, address, priceLevel, description); we fill in
   *  the rest with defaults so the itinerary page renders it correctly. */
  const buildRestaurantActivity = (
    dayNum: number,
    idx: number,
    r: Record<string, unknown>,
  ): Record<string, unknown> => {
    const name = typeof r.name === 'string' ? r.name : '';
    const mealType = r.mealType === 'breakfast' || r.mealType === 'lunch' || r.mealType === 'dinner'
      ? r.mealType
      : null;
    return {
      id: `enrich_d${dayNum}_r${idx + 1}_${Date.now().toString(36)}`,
      name,
      title: name,
      timeSlot: typeof r.timeSlot === 'string' ? r.timeSlot : (
        mealType === 'breakfast' ? '07:30–09:00' :
        mealType === 'lunch' ? '12:30–14:00' :
        '19:00–21:00'
      ),
      description: typeof r.description === 'string' ? r.description : '',
      address: typeof r.address === 'string' ? r.address : null,
      website: null,
      isRestaurant: true,
      mealType,
      track: 'shared',
      priceLevel: typeof r.priceLevel === 'number' ? r.priceLevel : 2,
      costEstimate: 0,
      confidence: 0.8,
      verified: false,
      packingTips: [],
      transportToNext: null,
      // Surface neighborhood so the itinerary page can show it in the
      // activity card meta row.
      neighborhood: typeof r.neighborhood === 'string' ? r.neighborhood : undefined,
    };
  };

  const mergedDays = days.map(d => {
    const enriched = enrichmentByDay.get(d.day);
    if (!enriched) return d;
    // Treat the existing day object as a loose record so we can preserve
    // fields the AI omitted. DayLite only types the fields we read for
    // prompt context, not the sidebar fields we're writing here.
    const existing = d as unknown as Record<string, unknown>;

    // Restaurant backfill: only fires when this day was in the
    // daysNeedingRestaurants set AND the AI returned a "restaurants"
    // array. We append to tracks.shared so the itinerary page's
    // existing sort-by-timeSlot logic handles ordering.
    let mergedTracks = existing.tracks as {
      shared?: unknown[]; track_a?: unknown[]; track_b?: unknown[];
    } | undefined;
    if (
      daysNeedingRestaurants.has(d.day) &&
      Array.isArray(enriched.restaurants) &&
      enriched.restaurants.length > 0
    ) {
      const newRestaurants = (enriched.restaurants as Array<Record<string, unknown>>)
        .filter(r => typeof r.name === 'string' && r.name.trim().length > 0)
        .map((r, i) => buildRestaurantActivity(d.day, i, r));
      const existingShared = Array.isArray(mergedTracks?.shared) ? (mergedTracks?.shared as unknown[]) : [];
      mergedTracks = {
        shared: [...existingShared, ...newRestaurants],
        track_a: mergedTracks?.track_a,
        track_b: mergedTracks?.track_b,
      };
    }

    return {
      ...existing,
      ...(mergedTracks ? { tracks: mergedTracks } : {}),
      // Keep existing values if AI omitted the field; otherwise overwrite.
      photoSpots: enriched.photoSpots ?? existing.photoSpots ?? null,
      foodieTips: enriched.foodieTips ?? existing.foodieTips ?? null,
      nightlifeHighlights: enriched.nightlifeHighlights ?? existing.nightlifeHighlights ?? null,
      shoppingGuide: enriched.shoppingGuide ?? existing.shoppingGuide ?? null,
      priorityHighlights: enriched.priorityHighlights ?? existing.priorityHighlights ?? null,
      destinationTip: enriched.destinationTip ?? existing.destinationTip ?? null,
    };
  });

  // Persist. If this fails, we still want the user to see the result so
  // they can retry the save manually — but currently the client expects
  // a successful 200 to optimistically merge, so a save failure surfaces
  // as a clean error.
  const { error: updateErr } = await supabase
    .from('itineraries')
    .update({ days: mergedDays as unknown as Json[] })
    .eq('trip_id', tripId);
  if (updateErr) {
    console.error('[enrich-itinerary] save failed:', updateErr);
    return NextResponse.json(
      { error: 'SAVE_FAILED', message: 'Generated highlights but couldn\'t save them. Please retry.' },
      { status: 500 },
    );
  }

  await incrementAiCreditsUsed(auth.ctx.userId, credits.ctx);

  return NextResponse.json({
    days: mergedDays,
    enrichedDayCount: targetDays.length,
    restaurantsAddedCount: daysNeedingRestaurants.size * 3,
  });
}
