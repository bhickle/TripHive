import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { TIER_LIMITS, SubscriptionTier } from '@/lib/types';

// Extend Vercel function timeout to 5 minutes (300s).
// Itinerary generation streams 64K tokens per pass; a 10-day trip with two
// continuation passes can take 3–4 minutes of wall-clock time. Without this
// the default 60s limit kills the stream mid-day, causing truncation.
// Requires Vercel Pro or higher (Hobby plan max is 60s).
export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert travel planner with deep local knowledge of destinations worldwide.
You create detailed, realistic, and genuinely useful day-by-day itineraries.
You always recommend REAL venues with accurate names and addresses.
You balance popular highlights with authentic off-the-beaten-path experiences.
You adapt itineraries based on group composition, budget, and interests.
Use American English spelling and phrasing throughout (e.g. "neighborhood" not "neighbourhood", "center" not "centre", "organize" not "organise").
Photo spot tips must be ONE concise sentence only — no more than 20 words. Never write multiple sentences for a photo spot tip.
CRITICAL — NEVER INVENT EVENTS: Never assign a specific scheduled game, concert, show, or live event to a specific date. Sports games, concerts, and live performances have unpredictable schedules. If a venue hosts live events, write that travelers should check the official website or ticketing platform for current dates — never fabricate a fixture date, game time, or show schedule.
Return ONLY valid JSON — no markdown, no explanation, no code fences.`;

interface BookedFlight {
  airline?: string;
  flightNumber?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  departureTime?: string;
  arrivalTime?: string;
  returnDepartureTime?: string;
  returnArrivalTime?: string;
  returnDepartureAirport?: string; // open-jaw: different return departure airport (Nomad)
  returnArrivalAirport?: string;   // open-jaw: different return arrival airport (Nomad)
}

interface BookedHotel {
  name?: string;
  address?: string;
  checkIn?: string;
  checkOut?: string;
}

interface GooglePlace {
  name: string;
  address: string;
  placeId: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  types?: string[];
  openingHours?: string[]; // weekdayDescriptions e.g. ["Monday: 11:00 AM – 9:00 PM", ...]
}

function getSuggestedTrackLabels(priorities: string[]): { a: string; b: string } | null {
  const highEnergy = priorities.filter(p => ['adventure', 'sports', 'nightlife', 'themepark'].includes(p));
  const hasNature = priorities.includes('nature');
  const hasBeach = priorities.includes('beach');
  const lowEnergy = priorities.filter(p => ['wellness', 'culture', 'history', 'food', 'shopping', 'budget', 'family', 'accessibility'].includes(p));

  // Only suggest labels if there's a genuine split
  if ((highEnergy.length === 0 && !hasNature && !hasBeach) || lowEnergy.length === 0) return null;

  let labelA = '';
  if (highEnergy.includes('adventure') && highEnergy.includes('sports')) labelA = 'Adventure & Sports';
  else if (highEnergy.includes('themepark') && highEnergy.includes('adventure')) labelA = 'Thrills & Adventure';
  else if (highEnergy.includes('themepark')) labelA = 'Parks & Thrills';
  else if (highEnergy.includes('adventure') || hasNature) labelA = 'Outdoors & Adventure';
  else if (hasBeach && highEnergy.includes('adventure')) labelA = 'Beach & Adventure';
  else if (hasBeach) labelA = 'Coast & Water';
  else if (highEnergy.includes('sports')) labelA = 'Active & Sporty';
  else if (highEnergy.includes('nightlife')) labelA = 'Nightlife & Energy';
  else labelA = 'Active & Outdoors';

  let labelB = '';
  if (lowEnergy.includes('family')) labelB = 'Family Time';
  else if (lowEnergy.includes('culture') && lowEnergy.includes('history')) labelB = 'Culture & History';
  else if (lowEnergy.includes('wellness') && lowEnergy.includes('culture')) labelB = 'Culture & Wellness';
  else if (lowEnergy.includes('culture') || lowEnergy.includes('history')) labelB = 'Culture & Sightseeing';
  else if (lowEnergy.includes('wellness')) labelB = 'Rest & Wellness';
  else if (lowEnergy.includes('food') && lowEnergy.includes('shopping')) labelB = 'Food & Shopping';
  else if (lowEnergy.includes('food')) labelB = 'Food & Slow Mornings';
  else if (lowEnergy.includes('shopping')) labelB = 'Shopping & Wandering';
  else if (lowEnergy.includes('budget')) labelB = 'Local & Budget-Friendly';
  else labelB = 'Slow & Scenic';

  return { a: labelA, b: labelB };
}

// ─── Seasonal context ─────────────────────────────────────────────────────────
// Returns date-aware rules about what sports/events are in or out of season,
// and seasonal travel context (Christmas markets, cherry blossoms, etc.)
function getSeasonalContext(startDate: string, destination: string): string {
  const month = new Date(startDate + 'T12:00:00').getMonth() + 1; // 1–12
  const dest = destination.toLowerCase();
  const lines: string[] = ['\nSEASONAL CONTEXT — enforce these rules strictly:'];

  // North American sports seasons
  const mlbActive   = month >= 4 && month <= 10;
  const nflActive   = month >= 9 || month <= 1;
  const nbaActive   = month >= 10 || month <= 6;
  const nhlActive   = month >= 10 || month <= 6;
  const mlsActive   = month >= 3 && month <= 10;
  const collegeFootball = month >= 9 || month === 1;

  if (!mlbActive)  lines.push('- MLB BASEBALL is OUT OF SEASON (runs April–October). Do NOT include baseball games or reference them as schedulable.');
  else             lines.push('- MLB is in season — stadium visits valid; direct travelers to the official team website for game dates. Never invent a specific game.');
  if (!nflActive)  lines.push('- NFL FOOTBALL is OUT OF SEASON (runs September–January). Do NOT include football games.');
  else             lines.push('- NFL is in season — stadium visits valid; direct travelers to the official schedule for game dates. Never invent a specific game.');
  if (!nbaActive)  lines.push('- NBA BASKETBALL is OUT OF SEASON (runs October–June). Do NOT include basketball games.');
  else             lines.push('- NBA is in season — arena visits valid; direct travelers to the official schedule. Never invent a specific game.');
  if (!nhlActive)  lines.push('- NHL HOCKEY is OUT OF SEASON (runs October–June). Do NOT include hockey games.');
  else             lines.push('- NHL is in season — arena visits valid; direct travelers to the official schedule. Never invent a specific game.');
  if (!mlsActive)  lines.push('- MLS SOCCER is OUT OF SEASON (runs March–October). Do NOT include soccer matches.');
  if (!collegeFootball) lines.push('- COLLEGE FOOTBALL is OUT OF SEASON (runs September–January). Do NOT include college games.');

  // Seasonal travel context
  if (month === 11 || month === 12)
    lines.push('- CHRISTMAS MARKETS: Open late November through December 24 across Europe. If the destination has a famous market, include at least one visit.');
  if (month === 3 || month === 4)
    lines.push('- CHERRY BLOSSOM SEASON (late March–mid April): In Japan, Washington DC, and other blossom destinations, prioritize viewing spots if applicable.');
  if ((month === 1 || month === 2) && (dest.includes('new orleans') || dest.includes('louisiana')))
    lines.push('- MARDI GRAS SEASON: If trip dates overlap with Mardi Gras, highlight parade routes, jazz clubs, and king cake stops.');
  if (month >= 6 && month <= 8)
    lines.push('- SUMMER: Long daylight hours — evening activities can run later. Outdoor venues at their best. Note heat and crowd peaks at popular sites.');
  if (month === 12 || month === 1 || month === 2)
    lines.push('- WINTER: Shorter daylight hours — plan activity blocks accordingly. Ski resorts are at peak season where applicable.');
  if (month >= 6 && month <= 11 && (dest.includes('caribbean') || dest.includes('gulf coast') || dest.includes('florida') || dest.includes('bahamas')))
    lines.push('- HURRICANE SEASON (June–November): Note this in practicalNotes. Travel insurance is strongly recommended.');
  if (month >= 5 && month <= 10 && (dest.includes('southeast asia') || dest.includes('thailand') || dest.includes('vietnam') || dest.includes('bali') || dest.includes('india')))
    lines.push('- MONSOON SEASON: Note wet season conditions in practicalNotes. Pack accordingly.');

  return lines.join('\n');
}

interface PlacesApiNewResult {
  id?: string;
  displayName?: { text: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  types?: string[];
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
  };
}

const PRICE_LEVEL_MAP: Record<string, string> = {
  PRICE_LEVEL_FREE: '$0',
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

async function fetchDestinationPlaces(
  destination: string,
  apiKey: string
): Promise<{ restaurants: GooglePlace[]; attractions: GooglePlace[] }> {
  const searchPlaces = async (query: string): Promise<GooglePlace[]> => {
    try {
      const res = await fetch(
        'https://places.googleapis.com/v1/places:searchText',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': [
              'places.id',
              'places.displayName',
              'places.formattedAddress',
              'places.rating',
              'places.userRatingCount',
              'places.priceLevel',
              'places.types',
              'places.regularOpeningHours.weekdayDescriptions',
            ].join(','),
          },
          body: JSON.stringify({ textQuery: query, maxResultCount: 20 }),
        }
      );
      const data = await res.json();
      if (!data.places?.length) {
        console.warn(`[fetchDestinationPlaces] No places returned for: ${query}`);
        return [];
      }

      const raw: GooglePlace[] = (data.places as PlacesApiNewResult[]).map(p => ({
        name: p.displayName?.text ?? '',
        address: p.formattedAddress ?? '',
        placeId: p.id ?? '',
        rating: p.rating,
        reviewCount: p.userRatingCount,
        priceLevel: p.priceLevel,
        types: p.types ?? [],
        openingHours: p.regularOpeningHours?.weekdayDescriptions,
      })).filter(p => p.name);

      // Quality filter: 4.0+ rating with meaningful review count
      // Adaptive threshold — fall back to 3.5/5 reviews for sparse small-town results
      const highQuality = raw.filter(p => (p.rating ?? 0) >= 4.0 && (p.reviewCount ?? 0) >= 20);
      const fallback    = raw.filter(p => (p.rating ?? 0) >= 3.5 && (p.reviewCount ?? 0) >= 5);

      const filtered = highQuality.length >= 5 ? highQuality : fallback;
      console.log(`[fetchDestinationPlaces] "${query}": ${raw.length} raw → ${filtered.length} quality-filtered`);
      return filtered;
    } catch (err) {
      console.error('[fetchDestinationPlaces] Error:', err);
      return [];
    }
  };

  const [restaurants, attractions] = await Promise.all([
    searchPlaces(`restaurants in ${destination}`),
    searchPlaces(`things to do attractions in ${destination}`),
  ]);

  return { restaurants, attractions };
}

function formatPlaceForPrompt(p: GooglePlace): string {
  let line = `• ${p.name} — ${p.address}`;
  const meta: string[] = [];
  if (p.rating)       meta.push(`★${p.rating}`);
  if (p.reviewCount)  meta.push(`${p.reviewCount} reviews`);
  if (p.priceLevel && PRICE_LEVEL_MAP[p.priceLevel]) meta.push(PRICE_LEVEL_MAP[p.priceLevel]);
  if (meta.length)    line += ` (${meta.join(', ')})`;
  if (p.openingHours?.length) {
    line += `\n    Hours: ${p.openingHours.join(' | ')}`;
  }
  return line;
}

function buildPrompt(params: {
  destination: string;
  startDate: string;
  endDate: string;
  tripLength: number;
  groupType: string;
  priorities: string[];
  budget: number;
  budgetBreakdown: Record<string, number>;
  ageRanges: string[];
  accessibilityNeeds: string[];
  localMode?: boolean;
  dateNight?: boolean;
  curiosityLevel?: number;
  modality?: string;
  accommodationType?: string;
  bookedFlight?: BookedFlight | null;
  bookedHotel?: BookedHotel | null;    // legacy single-hotel (kept for backward compat)
  bookedHotels?: BookedHotel[];        // preferred: array of hotels for multi-hotel trips
  bookedCar?: { company?: string; pickupLocation?: string; carClass?: string; confirmationRef?: string } | null;
  mustHaves?: string[];                // user's non-negotiable places/experiences
  destinations?: string[];             // ordered city list for multi-city trips
  daysPerDestination?: Record<string, number>; // optional day allocation per city
  additionalContext?: string;          // free-text notes from the user ("anything else?")
  realPlaces?: { restaurants: GooglePlace[]; attractions: GooglePlace[] } | null;
  multiCityPlaces?: Record<string, { restaurants: GooglePlace[]; attractions: GooglePlace[] }> | null;
  organizerPersona?: { priorities: string[]; vibes?: string[] } | null;
  memberPersonas?: Array<{ name: string; priorities: string[]; curiosity?: string }>;
  groupSize?: number;
}) {
  const {
    destination, startDate, endDate, tripLength,
    groupType, priorities, budget, budgetBreakdown,
    ageRanges, accessibilityNeeds,
    localMode, dateNight, curiosityLevel, modality, accommodationType,
    bookedFlight, realPlaces,
  } = params;
  const mustHaves = params.mustHaves ?? [];
  const destinations = params.destinations ?? [];
  const daysPerDestination = params.daysPerDestination ?? {};
  const additionalContext = (params.additionalContext ?? '').trim();
  const multiCityPlaces = params.multiCityPlaces ?? null;
  const bookedCar = params.bookedCar ?? null;
  const organizerPersona = params.organizerPersona ?? null;
  const memberPersonas = params.memberPersonas ?? [];
  const groupSize = params.groupSize ?? 2;

  // ── Organizer persona context ──────────────────────────────────────────────
  // The trip's stated priorities (above) define the VIBE of this specific trip.
  // The organizer's saved travel persona is their general travel identity —
  // used here to quietly add texture and, for groups of 4+, to suggest split days.
  const personaText = (() => {
    // Generate persona text when there's either an organizer persona OR member preferences
    if ((!organizerPersona || organizerPersona.priorities.length === 0) && memberPersonas.length === 0) return '';

    // Find persona priorities that diverge from the trip's stated priorities —
    // these are the organizer's personal interests that didn't make the trip vibe cut
    const tripPriorities = new Set(priorities.map(p => p.toLowerCase()));
    const orgPriorities = organizerPersona?.priorities ?? [];
    const personaOnly = orgPriorities.filter(p => !tripPriorities.has(p.toLowerCase()));
    const overlap = orgPriorities.filter(p => tripPriorities.has(p.toLowerCase()));

    // Build the texture line: what the organizer cares about beyond the trip vibe
    const personaInterests = orgPriorities.join(', ');

    let text = orgPriorities.length > 0
      ? `\nORGANIZER TRAVEL PERSONA (background context — use to add texture, not to override trip vibe):
The organizer's general travel style leans toward: ${personaInterests}.
${overlap.length > 0 ? `This aligns with the trip's stated priorities (${overlap.join(', ')}) — lean into these confidently.` : ''}
${personaOnly.length > 0 ? `The organizer also personally values ${personaOnly.join(', ')} even though it isn't the focus of this trip. Where it fits naturally into the schedule without derailing the trip vibe, thread in a moment that honours this — a neighbourhood food market on the way to a museum, a scenic detour that satisfies a nature lover, etc. Don't force it; let it be incidental.` : ''}`
      : '';

    // Layer 2: weave in member preferences when they exist — this gives the AI
    // real group-level data to create splits that genuinely serve the whole crew.
    if (memberPersonas.length > 0) {
      const memberLines = memberPersonas.map(m => {
        const pace = m.curiosity ? ` (pace: ${m.curiosity})` : '';
        return `  - ${m.name}: ${m.priorities.join(', ')}${pace}`;
      }).join('\n');
      text += `

GROUP MEMBER PREFERENCES (collected at join time):
${memberLines}
Use these to understand the diversity of interests in the group. Where member priorities diverge significantly from the organizer's, this strengthens the case for a split day — propose a track that serves each interest cluster. Merge overlapping preferences (e.g. multiple members interested in food → it's a genuine group priority).`;
    }

    // Split track guidance — only for groups of 4+ (solo/couple/small groups don't need to split)
    // Activates when organizer has personal interests diverging from trip vibe, OR when member
    // preferences show genuine divergence (even without organizer persona data).
    const hasMemberDivergence = memberPersonas.length >= 2 && (() => {
      // Check if member priorities cover both high-energy and low-energy categories
      const allMemberPriorities = memberPersonas.flatMap(m => m.priorities.map(p => p.toLowerCase()));
      const highEnergy = ['adventure', 'sports', 'nightlife', 'active', 'outdoors'];
      const lowEnergy = ['wellness', 'culture', 'history', 'food', 'shopping', 'relaxation'];
      const hasHigh = allMemberPriorities.some(p => highEnergy.some(h => p.includes(h)));
      const hasLow = allMemberPriorities.some(p => lowEnergy.some(l => p.includes(l)));
      return hasHigh && hasLow;
    })();

    if (groupSize >= 4 && (personaOnly.length > 0 || hasMemberDivergence)) {
      const splitReason = personaOnly.length > 0
        ? `One track could lean into the organizer's personal interests (${personaOnly.join(', ')}); the other stays anchored to the main trip vibe (${Array.from(tripPriorities).join(', ')})`
        : `Base each track on the clusters of member interests revealed above`;
      text += `

SPLIT TRACK SUGGESTION (group of ${groupSize}): With a group this size and divergent interests, consider proposing 1–2 split days where travelers can divide by preference and reconvene for dinner. ${splitReason}. Only split on days where the schedule naturally accommodates it — never force a split on a day with a group anchor event or a transition leg. Both tracks must rejoin for dinner at a shared venue (set dinnerMeetupLocation for those days).`;
    }

    return text;
  })();

  // Normalise hotels: prefer bookedHotels array; fall back to legacy single bookedHotel field
  const bookedHotels: BookedHotel[] = params.bookedHotels?.length
    ? params.bookedHotels
    : params.bookedHotel
    ? [params.bookedHotel]
    : [];
  const hasPreBookedHotel = bookedHotels.length > 0;

  const priorityText = priorities.length > 0
    ? priorities.join(', ')
    : 'balanced mix of culture, food, and sightseeing';

  const suggestedTrackLabels = getSuggestedTrackLabels(priorities);

  const accessibilityText = accessibilityNeeds.filter(n => n !== 'No special needs').join(', ') || 'none';

  // Travel style context
  const explorerPct = curiosityLevel ?? 50;
  const travelStyleText = explorerPct >= 70
    ? 'adventurous explorer — strongly prefers hidden gems, local haunts, and off-the-beaten-path experiences over famous tourist sites'
    : explorerPct >= 40
    ? 'balanced traveler — mix of iconic sights and authentic local discoveries'
    : 'comfort-focused — prefers well-reviewed, accessible, and easy-to-navigate attractions';

  const localModeText = localMode
    ? '\n- LOCAL INSIDER MODE: For every day, include the iconic tourist highlight AND a local alternative nearby — a neighborhood cafe instead of the tourist-facing one, a local market instead of the souvenir shop. Both options appear side by side so the group can choose. Never skip the famous landmark entirely — just pair it with a genuine local counterpart.'
    : '';

  const dateNightText = dateNight
    ? '\n- DATE NIGHT: On the most fitting evening of the trip (typically mid-trip, not the first or last night), reserve the dinner slot for a romantic, special experience — a candlelit restaurant, a scenic rooftop, a private tasting, or something the destination is known for that feels intimate and memorable. Label the dinner on that day as "Date Night 🌙" and write the description in a warm, romantic tone. All other evenings should be planned normally.'
    : '';

  // If a confirmed rental car is declared, it overrides the modality preference entirely
  const modalityText = bookedCar
    ? '' // car rental rule will be injected in preBookingText below
    : (modality && modality !== 'mix'
        ? `\n- Primary transport: ${modality} — build routes and day plans around this mode`
        : '');

  const accommodationText = accommodationType
    ? `\n- Staying in: ${accommodationType} — factor this into meeting points and daily logistics`
    : '';

  // Sports-specific guidance (Item 12: no speculative event schedules)
  const sportsText = priorities.includes('sports')
    ? `\n- SPORTS PRIORITY: This group loves sports. Include visits to major stadiums, arenas, and iconic sports venues in ${destination} — even if no game is scheduled, a stadium tour is a must. If the destination has a notable sports hall of fame (baseball, football, basketball, hockey, soccer, golf, etc.), include it as a dedicated stop. Include sports bars and fan zones where locals actually watch games, and any neighborhoods where sports culture runs deep. For any venue where a live game could be scheduled, mention the team(s) that play there and remind travelers to check the official team website for game dates — do NOT invent or speculate on specific fixture dates, as schedules change.`
    : '';

  // Food priority — elevated foodie experience throughout the entire itinerary
  const hasFoodPriority = priorities.includes('food');
  const hasNightlifePriority = priorities.includes('nightlife');
  const hasShoppingPriority = priorities.includes('shopping');
  const foodText = hasFoodPriority
    ? `\n- FOODIE PRIORITY — ELEVATED STANDARDS FOR EVERY MEAL AND FOOD EXPERIENCE:
  This group is serious about food. Eating is not a logistical checkpoint — it is the highlight of the day. Apply these rules across every single meal slot in the itinerary:

  RESTAURANT SELECTION:
  - Every breakfast, lunch, and dinner must be handpicked as if a food editor chose it. No chain restaurants, hotel buffets, or tourist-trap spots.
  - Prioritize: neighborhood institutions beloved by locals, chefs doing exciting regional or seasonal cuisine, markets with legendary vendors, and spots with a distinctive personality or story.
  - Mix the experience across the trip: a standing counter one morning, a lively market breakfast another, a chef's tasting lunch, a celebrated local trattoria for dinner — never two similar dining experiences back-to-back.
  - At least one meal per day should feature a dish that is iconic or unique to this destination — something you genuinely cannot get back home.

  RESTAURANT DESCRIPTIONS:
  - Each restaurant description MUST include: (1) what to order — name 2-3 specific dishes or items, be concrete and appetizing, (2) why locals love it — the reputation, history, or cult following behind it, (3) the vibe — is it a loud bustling market? an intimate counter? a breezy courtyard?
  - Write descriptions like a food writer: evocative, specific, and mouthwatering. "A local burger joint" is not acceptable. "A hole-in-the-wall counter that's been frying the city's best smash burgers since 1978 — order the double with pickled jalapeños" is.
  - Never use generic phrases like "great food" or "nice atmosphere" — always be specific about WHAT and WHY.

  DAY THEMES:
  - Each day's theme should reflect the food journey, not just the sights — e.g. "Morning Market & Rooftop Dinner", "Street Food Day & Night Market", "Old Quarter Tastings & Chef's Counter".

  COOKING CLASSES & FOOD EXPERIENCES:
  - Include at least one bookable food experience across the trip — a hands-on cooking class, a guided food or market tour, a brewery or distillery tasting, a winery visit, or a drink-focused experience (cocktail masterclass, sake tasting, mezcal bar flight). These should feel like experiences, not just meals.
  - Locale-specific cuisines: highlight dishes and ingredients that are genuinely unique to this region or city — things that can't be replicated back home.

  BONUS FOODIE TIPS (every day):
  Generate a "foodieTips" array on EVERY day with 3-4 bonus food finds specific to that day's neighborhoods and areas — things that don't fit neatly into a meal slot. Think: the best coffee near the morning's first activity, a legendary mid-afternoon snack stop in that neighborhood, a specialty food shop worth browsing on the way, or a late-night street food stall near the evening venue. Each day's tips must be geographically relevant to where the group actually is that day — not generic city-wide tips recycled across days. Label each with the best time to visit so the group can slot them in naturally.`
    : '';

  // Photography guidance — iconic spots always included; extra depth when photography is a priority
  const photoText = priorities.includes('photography')
    ? `\n- PHOTOGRAPHY PRIORITY: In addition to the iconic must-photograph landmarks (always required — see Rule 11), each activity description should note photographic potential with golden hour and blue hour timing, the best angles, and any access restrictions (tripod rules, drone restrictions, flash prohibited). Add 1-2 extra photoSpots per day that go beyond the famous spots — local viewpoints, rooftop bars with skyline views, street murals, market scenes, reflections, and neighborhood street photography gems. Include at least one spot that most tourists miss. Note the best time of day to shoot each key location.`
    : '';

  // Nature priority (Item 13)
  const natureText = priorities.includes('nature')
    ? `\n- NATURE PRIORITY: This group prioritizes time outdoors and natural settings. Anchor at least one activity per day in nature — national parks, botanical gardens, scenic trails, rivers and waterfalls, viewpoints, forests, and wildlife areas. Include camping or picnic spots where the destination supports it (scenic overlooks, lakeside spots, park meadows). If the destination has winter landscapes, include skiing, snowshoeing, or glacier walks where applicable. For hiking or walking activities, specify the trail name and approximate difficulty level. Mix quieter natural escapes with any urban sightseeing — never pack every hour with city activities if the group chose nature. Note: if Beach/Coastline is also selected as a priority, coastal activities will be handled by that priority block.`
    : '';

  // Nightlife priority (Item 13)
  const nightlifeText = priorities.includes('nightlife')
    ? `\n- NIGHTLIFE PRIORITY: This group wants to fully experience the local after-dark scene. Include a varied mix of: live music venues (jazz bars, indie stages, acoustic sets), craft cocktail bars and mixology lounges, speakeasies and hidden bars (where the destination has them), karaoke bars (especially in cities where this is a local institution), brewery or distillery tours with evening tastings, comedy clubs and magic shows, rooftop bars with views, and any well-known nightlife districts. Dinner should flow naturally into the evening's nightlife. Note cover charges and reservation recommendations where known. Favor spots where locals actually go — avoid tourist-trap party strips.`
    : '';

  // Shopping priority (Item 13)
  const shoppingText = priorities.includes('shopping')
    ? `\n- SHOPPING PRIORITY: This group enjoys discovering local goods, markets, and one-of-a-kind finds. Include: a local artisan market or bazaar, well-curated independent boutiques (not international chains), a food or produce market for local specialties, craft and design districts the destination is known for, and — where available — design-your-own or make-your-own workshops (leather goods, ceramics, textiles, jewelry, spirits, or any local craft) where travelers can create something unique to take home. If the destination has a luxury or bespoke shopping scene, include at least one elevated experience. Descriptions should highlight what makes each spot special and what to look for.`
    : '';

  // History priority (Item 13)
  const historyText = priorities.includes('history')
    ? `\n- HISTORY PRIORITY: This group is passionate about history and heritage. Beyond the obvious landmarks, include: lesser-known historic districts and old quarters, walking tours focused on specific eras or events, significant archaeological and architectural sites, local history museums and specialized collections, and the stories behind specific buildings and monuments. Where available, include ghost tours, historical reenactments, and darker or macabre history experiences (battle sites, crypts, prison tours, plague history, catacombs) — these are often the most memorable and undersold part of a destination's story. Activity descriptions should always include historical context: when it was built, what happened here, why it matters, and any legends or lesser-known facts that bring the history to life.`
    : '';

  // Wellness priority (Item 13)
  const wellnessText = priorities.includes('wellness')
    ? `\n- WELLNESS PRIORITY: This group values rest and rejuvenation alongside exploration. Include: a traditional spa, hammam, or bathhouse experience, a morning yoga or meditation session, scenic slow walks or gentle nature activities, and at least one healthy or mindful dining experience. Pace the days with intentional breathing room — avoid packing every hour. At least one activity per day should be low-intensity or explicitly restorative. Note any wellness experiences that are uniquely tied to the local culture (onsen in Japan, hammam in Morocco, sauna culture in Scandinavia, temazcal in Mexico, etc.) — these are must-dos for a wellness-focused traveler.`
    : '';

  // Adventure priority (Item 13)
  const adventureText = priorities.includes('adventure')
    ? `\n- ADVENTURE PRIORITY: This group craves active, high-energy, and adrenaline-fueled experiences. Include at least one physically demanding or thrill-seeking activity per day — hiking, cycling tours, water sports, ziplining, kayaking, rock climbing, surfing, skydiving, bungee jumping, white-water rafting, or similar. Also include unique immersive experiences where available: indoor skydiving, immersive challenge experiences, escape rooms with physical elements, or next-gen entertainment venues that push the envelope. For each adventure activity, include the operator name if known, approximate duration, difficulty level, and any gear or booking requirements. Add packingTips for all adventure activities.`
    : '';

  // Culture priority (Item 13)
  const cultureText = priorities.includes('culture')
    ? `\n- CULTURE PRIORITY: This group is drawn to the arts, local traditions, and creative scene. Include: contemporary and classical art museums and galleries, immersive or interactive art experiences (large-scale installations, experiential exhibitions, digital art museums), live performances (theater, dance, live music, or a local festival if in season), a visit to a culturally significant neighborhood or creative district, and a hands-on cultural experience unique to this destination (artisan workshop, cooking class, community market, local ceremony). Descriptions should convey what makes each experience culturally meaningful and what the group will take away from it.`
    : '';

  // Beach / Coastline priority
  const beachText = priorities.includes('beach')
    ? `\n- BEACH & COASTLINE PRIORITY: This group wants to fully embrace the coastal experience. Include: prime beach spots with notes on swimming conditions and crowd levels, coastal walking trails and cliff-top viewpoints, water activities (snorkeling, surfing, paddleboarding, kayaking, boat trips, sailing, whale or dolphin watching if in season), coastal seafood dining with ocean views, and sunset-watching spots along the water. At least one morning or afternoon block each day should be oriented around the coast or water. Note beach access tips (paid entry, parking, facilities). If the destination has multiple distinct beaches with different characters (lively beach vs. secluded cove vs. snorkeling reef), showcase the variety.`
    : '';

  // Theme Park priority
  const themeParkText = priorities.includes('themepark')
    ? `\n- THEME PARK PRIORITY: This group wants to make the most of world-class theme parks and entertainment complexes. Include: major theme parks near the destination with strategy tips (arrive early, which rides or areas to prioritize first, best days of the week for shorter queues), water parks and seasonal parks in the area, after-dark park experiences where available, and any dining within the parks that genuinely stands out. Note whether Express Pass, Lightning Lane, or equivalent skip-the-line options are recommended and worth the cost. If the destination has multiple parks, suggest the best order and pacing across the trip. Include at least one non-park day activity nearby for variety and park-fatigue recovery.`
    : '';

  // Family / Kids priority
  const familyText = priorities.includes('family')
    ? `\n- FAMILY & KIDS PRIORITY: This group is traveling with children — plan every day with this in mind. Include: age-appropriate attractions (zoos, aquariums, children's museums, interactive science centers, playgrounds, and parks), family-friendly dining where kids are welcome and the menu has options beyond chicken tenders, and activities with manageable durations (no more than 90 minutes per stop for younger children). Build each day with a rest window — avoid scheduling more than 3 activity blocks without a break. For each activity, note minimum age or height requirements, family ticket options or discount availability, and practical facilities (restrooms, stroller access, nursing areas). Include at least one genuine "wow moment" activity per day that will be memorable for kids of any age — something they'll still be talking about at dinner.`
    : '';

  // Budget-conscious priority
  const budgetConsciousText = priorities.includes('budget')
    ? `\n- BUDGET-CONSCIOUS PRIORITY: This group wants to experience the destination without overspending. Prioritize: free and low-cost attractions (public parks, free museum days, self-guided walking tours, public viewpoints, beaches, local markets), street food and affordable neighborhood restaurants over tourist-facing dining (with specific dish recommendations to order), free or cheap public transport options with day pass tips, and any destination-specific money-saving strategies (city tourism cards, combo tickets, happy hour windows, free entry days at major attractions). For each paid activity, note the approximate entry price. Suggest at least one free or lower-cost alternative for any high-cost activity. Flag common tourist traps where visitors routinely overpay for a mediocre experience.`
    : '';

  // Accessibility priority
  const accessibilityPriorityText = priorities.includes('accessibility')
    ? `\n- ACCESSIBILITY PRIORITY: This group includes travelers with mobility, sensory, or other accessibility needs — plan every activity with this as a baseline requirement. For every activity and venue, note: wheelchair and stroller accessibility (step-free entry, elevator or lift availability, accessible restrooms), availability of audio guides or assistive listening devices at museums and cultural sites, surface conditions for outdoor activities (paved paths vs. cobblestone vs. uneven terrain), and any alternatives for activities with limited accessibility. Prioritize venues with strong accessibility provisions. If the destination has known challenges (hilly terrain, cobblestone streets, limited elevator coverage), flag them explicitly and suggest practical workarounds. Include at least one activity per day that is fully accessible with no caveats.`
    : '';

  // Multi-city routing rules — injected when destinations array has 2+ cities
  // Priority: explicit destinations list > hotel city fields > skip
  const multiCityText = (() => {
    let cities: string[] = [];
    if (destinations.length >= 2) {
      cities = destinations;
    } else if (bookedHotels.length >= 2) {
      // Fall back to hotel city fields (new field added to BookedHotel)
      const hotelCities = bookedHotels
        .map((h: BookedHotel & { city?: string }) => (h.city || '').trim())
        .filter(Boolean);
      const unique = Array.from(new Set(hotelCities));
      if (unique.length >= 2) cities = unique;
    }
    if (cities.length < 2) return '';

    // Build day allocation string if user provided it
    const allocatedCities = cities.filter(c => (daysPerDestination[c] ?? 0) > 0);
    let dayAllocationText = '';
    if (allocatedCities.length > 0) {
      // Compute cumulative day ranges so the AI knows exactly which day numbers go in each city
      let cursor = 1;
      const ranges = allocatedCities.map(c => {
        const n = daysPerDestination[c];
        const range = `Days ${cursor}–${cursor + n - 1}: ${c} (${n} night${n === 1 ? '' : 's'})`;
        cursor += n;
        return range;
      });
      dayAllocationText = `\nDAY ALLOCATION (user-specified — follow exactly): ${ranges.join('; ')}. Total trip: ${tripLength} days. CRITICAL: You MUST generate ALL ${tripLength} day objects — do not stop after the first city. Every day from Day 1 through Day ${tripLength} must appear in your JSON array.`;
    } else {
      // Even without explicit allocation, remind AI to generate all days
      dayAllocationText = `\nCRITICAL: Generate ALL ${tripLength} days (Day 1 through Day ${tripLength}). Divide days proportionally across cities: ${cities.map(c => `${c}: ~${Math.floor(tripLength / cities.length)} days`).join(', ')}.`;
    }

    return `
MULTI-CITY TRIP — CRITICAL ROUTING RULES:
This trip visits multiple cities in this order: ${cities.join(' → ')}.${dayAllocationText}
ABSOLUTE RULE — NO DUPLICATE DAY NUMBERS: Every day object must have a unique "day" value. Day 1, Day 2, Day 3… through Day ${tripLength}. Never emit two objects with the same day number. If a city transition happens on Day 3, that transition IS Day 3 — do not re-use 3 for the next city's arrival.
You MUST follow ALL of these rules:

1. VISIT ORDER: Travel through the cities exactly in the order listed above. Never skip ahead and double back.
2. REALISTIC TRAVEL TIMES — apply these minimums before scheduling any inter-city leg:
   - Same-country rail or bus: 1.5 hrs minimum; 200–400 km routes often take 3–5 hrs
   - International flights (even short-haul): minimum 4 hrs door-to-door (check-in + flight + immigration + ground transport)
   - Driving between cities: 300 km ≈ 3.5 hrs, 500 km ≈ 5.5 hrs at realistic road speeds
3. NO SAME-DAY IMPOSSIBLE HOPS: If travel between two cities takes more than 3 hours, that travel must occupy most of a day — do not schedule full activity blocks on both ends.
4. TRANSITION DAYS: On any day the group moves cities, plan: light morning activity near the departing city → inter-city transport leg → 1–2 arrival activities near the new city only.
5. CITY-NIGHT ALIGNMENT: Each day's activities must be in the city where the group sleeps that night. Never schedule activities in City B when the group's hotel that night is in City A.
6. LOGICAL DAY ASSIGNMENT: Use the hotel check-in/check-out dates (if provided) to determine which city covers which dates. If no hotels provided, divide the trip length proportionally across cities.
7. GEOGRAPHIC INTEGRITY — RESTAURANTS AND ACTIVITIES: Every restaurant and activity must ONLY appear on days when the group is physically in that city. Once the group has departed City A, ZERO restaurants or activities from City A may appear in the itinerary. If the group is in Budapest on Days 1–3 and Vienna on Days 4–6, then ALL restaurants on Days 4–6 must be in Vienna — not Budapest. This rule has no exceptions, even if a Budapest restaurant is excellent. The city sequence is ${cities.join(' → ')} — enforce it strictly for every single activity and restaurant slot.`;
  })();

  // Must-haves: hard-requirement text injected if user specified any
  const mustHaveText = mustHaves.length > 0
    ? `\n- MUST-HAVES (non-negotiable — each item below MUST appear as a named activity somewhere in the itinerary. Do not omit or replace any of them):\n${mustHaves.map(m => `    • ${m}`).join('\n')}\n  TRACK ASSIGNMENT FOR MUST-HAVES: Place each must-have on the most logical track. Examples: "Holiday Markets" → shopping/culture track; a hike or outdoor excursion → adventure/nature track; a specific restaurant → foodie/shared track; a museum or historical site → culture/history track. Never dump must-haves arbitrarily into shared — match the track to the activity type.`
    : '';

  // Build pre-booking context text
  let preBookingText = '';
  if (bookedFlight) {
    const outbound = bookedFlight.departureTime && bookedFlight.arrivalTime
      ? `Outbound: departs ${bookedFlight.departureAirport || 'origin'} at ${bookedFlight.departureTime}, arrives ${bookedFlight.arrivalAirport || destination} at ${bookedFlight.arrivalTime}.`
      : '';
    const returnFlight = bookedFlight.returnDepartureTime
      ? `Return: departs ${bookedFlight.returnDepartureTime}${bookedFlight.returnArrivalTime ? `, arrives ${bookedFlight.returnArrivalTime}` : ''}.`
      : '';
    const isOpenJaw = bookedFlight.returnDepartureAirport &&
      bookedFlight.returnDepartureAirport.trim() !== '' &&
      bookedFlight.returnDepartureAirport !== bookedFlight.arrivalAirport;

    preBookingText += `\nPRE-BOOKED FLIGHTS (${bookedFlight.airline || ''} ${bookedFlight.flightNumber || ''}):
  ${outbound}
  ${returnFlight}
  → Day 1 must account for arrival time — no activities before the flight lands. Last day must end by departure time.
  → Flights are already paid; exclude flight cost from budget recommendations.${isOpenJaw ? `
  → OPEN-JAW TRIP: The group's return flight departs from ${bookedFlight.returnDepartureAirport}. The final day must route toward ${bookedFlight.returnDepartureAirport} — do NOT route back to ${bookedFlight.arrivalAirport}. Activities on the last day should be in or near ${bookedFlight.returnDepartureAirport}, or logically along the route to it. Include a transport leg to ${bookedFlight.returnDepartureAirport} airport on the last day.` : ''}`;
  }

  if (hasPreBookedHotel) {
    if (bookedHotels.length === 1) {
      // Single hotel — same home-base rules as before
      const h = bookedHotels[0];
      preBookingText += `\nPRE-BOOKED HOTEL (home base for all planning):
  - Name: ${h.name || 'pre-booked hotel'}${h.address ? `, ${h.address}` : ''}
  - Check-in: ${h.checkIn || startDate}, Check-out: ${h.checkOut || endDate}
  → This is the group's home base. Apply the following rules throughout every day:
    - Breakfast each day should be at or within easy reach of this hotel (walkable or a short rideshare)
    - Day 1: first activity after check-in should be close to the hotel neighborhood so the group can drop bags and orient themselves
    - Each day should end with the group able to return to the hotel — include a transportToNext leg on the final activity of the day pointing back toward the hotel if it is not already nearby
    - Last day: plan activities that naturally work toward the hotel for checkout, then onward to the airport/station if a return flight is booked
    - meetupLocation each day should reference the hotel lobby or the nearest landmark to it
  → Hotel cost is already paid; exclude hotel from budget recommendations.`;
    } else {
      // Multi-hotel trip — assign the correct hotel per night based on check-in/out dates
      preBookingText += `\nPRE-BOOKED HOTELS — this is a multi-hotel trip. Use the correct hotel as the home base for each night it covers:\n`;
      bookedHotels.forEach((h, idx) => {
        preBookingText += `  Hotel ${idx + 1}: "${h.name || `Hotel ${idx + 1}`}"${h.address ? `, ${h.address}` : ''}`;
        if (h.checkIn || h.checkOut) {
          preBookingText += ` | Check-in: ${h.checkIn || '?'} → Check-out: ${h.checkOut || '?'}`;
        }
        preBookingText += '\n';
      });
      preBookingText += `  → For each day, look at the date and use whichever hotel's check-in/check-out window covers that night as the home base.
  → Home-base rules (apply per hotel for the nights it covers):
    - Breakfast is near the hotel the group WOKE UP IN (the departing hotel on transition days, NOT the arriving hotel). The group has not yet traveled — they are still at the morning hotel. Never place breakfast at a hotel they have not checked into yet.
    - Lunch on transition days should be somewhere practical along the travel route between the two cities.
    - Dinner and all evening activities should be near the ARRIVING hotel's neighborhood — the group has checked in by this point.
    - Day activities should cluster around areas accessible from that day's home base
    - Each day should end with the group able to return to the night's hotel
    - On transition days (checking out of one hotel and into another): plan a late-morning checkout, schedule the inter-city transport leg in the itinerary as a visible activity (e.g. "Train to [Next City]" in the shared track), then route afternoon/evening activities toward the new hotel's neighborhood; include a luggage-storage note if check-in is not until late afternoon
    - meetupLocation each day should reference the active morning hotel lobby or nearest landmark
  → All hotel costs are already paid; exclude hotel from budget recommendations.`;
    }
  }

  // Pre-booked rental car — overrides modality and locks transport mode for the trip
  if (bookedCar) {
    const carDetails = [
      bookedCar.company ? `Rental company: ${bookedCar.company}` : null,
      bookedCar.carClass ? `Vehicle class: ${bookedCar.carClass}` : null,
      bookedCar.pickupLocation ? `Pickup: ${bookedCar.pickupLocation}` : null,
      bookedCar.confirmationRef ? `Confirmation: ${bookedCar.confirmationRef}` : null,
    ].filter(Boolean).join('. ');
    preBookingText += `\nPRE-BOOKED RENTAL CAR (CONFIRMED):
  ${carDetails}
  → CRITICAL: This group has a confirmed rental car for the entire trip. Apply these rules without exception:
    - Use "car_rental" as the transportToNext mode for ALL inter-activity legs longer than 15 minutes
    - Do NOT suggest taxis, rideshares, buses, trains, or any other transport for city-to-city or inter-area legs
    - Park-and-walk is fine within dense urban cores (walkable distances <1km) — note "Street parking near X" in the transport leg
    - Day routes should be circular or logically sequential to minimize backtracking — think road-trip logic, not point-to-point public transit
    - For multi-city trips: the car enables flexible departure times — no need to match train/bus schedules
    - Car rental cost is already paid; exclude car hire from budget recommendations`;
  }

  // Hotel recommendation context (only when no hotel is pre-booked)
  const needsHotelSuggestions = !hasPreBookedHotel;
  const hotelBudgetPerNight = Math.round((budgetBreakdown.hotel ?? 0) / tripLength);
  const hotelPriceTier = hotelBudgetPerNight < 80
    ? 'budget ($)'
    : hotelBudgetPerNight < 180
    ? 'mid-range ($$)'
    : hotelBudgetPerNight < 350
    ? 'upscale ($$$)'
    : 'luxury ($$$$)';
  // Build lodging type instruction from accommodationType preference
  const accomTypes = (accommodationType ?? '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
  const accomTypeLabel = accomTypes.length > 0
    ? (() => {
        const map: Record<string, string> = {
          hotel: 'hotels',
          airbnb: 'Airbnb / vacation rentals',
          hostel: 'hostels',
          resort: 'resorts',
        };
        return accomTypes.map((t: string) => map[t] || t).join(' or ');
      })()
    : 'hotels';
  const lodgingTypeInstruction = accomTypes.length > 0 && !(accomTypes.length === 1 && accomTypes[0] === 'hotel')
    ? `matching the traveler's preferred lodging type (${accomTypeLabel}) at the ${hotelPriceTier} price tier`
    : `matching the ${hotelPriceTier} price tier`;

  // Per-day budget constraints
  const dailyFoodBudget = Math.round((budgetBreakdown.food ?? 0) / tripLength);
  const dailyExperiencesBudget = Math.round((budgetBreakdown.experiences ?? 0) / tripLength);

  // Meal price level based on travel style
  const mealPriceLevels = explorerPct < 40
    ? { breakfast: 1, lunch: 1, dinner: 2 }
    : explorerPct < 70
    ? { breakfast: 1, lunch: 2, dinner: 2 }
    : { breakfast: 2, lunch: 2, dinner: 3 };

  // Accessibility walking rule
  const hasLimitedMobility = accessibilityNeeds.includes('Wheelchair accessible') || accessibilityNeeds.includes('Limited mobility');
  const walkingRuleText = hasLimitedMobility
    ? `MOBILITY NEEDS ACTIVE: Walking segments must be under 0.25 miles (0.4 km) each, and total walking across the entire day must not exceed 1 mile (1.6 km). Use rideshare or taxi for any activity pair more than 0.25 miles apart. Choose tightly clustered activities and plan transport between every location. Do not rely on "short walks" — be explicit with mode of transport for every segment.`
    : `HARD WALKING LIMIT: No single walking segment between consecutive activities may exceed 1 mile (1.6 km). This is a firm limit — if two activities are farther apart than 1 mile, you MUST insert a transport leg (taxi, rideshare, metro, or bus) between them. Total walking across the day should not exceed 4 miles (6.5 km). Cluster activities geographically whenever possible.`;

  return `Generate a ${tripLength}-day travel itinerary for the following trip:

TRIP DETAILS:
- Destination: ${destinations.length >= 2 ? `Multi-city — ${destinations.join(' → ')}` : destination}
- Dates: ${startDate} to ${endDate} (${tripLength} days)
- Group type: ${groupType || 'friends'}
- Budget: $${budget.toLocaleString()} total
  - Flights: $${budgetBreakdown.flights ?? 0}
  - Hotel: $${budgetBreakdown.hotel ?? 0}
  - Food: $${budgetBreakdown.food ?? 0} ($${dailyFoodBudget}/day)
  - Experiences: $${budgetBreakdown.experiences ?? 0} ($${dailyExperiencesBudget}/day)
  - Transport: $${budgetBreakdown.transport ?? 0}
- Priorities: ${priorityText}
- Age ranges in group: ${ageRanges.length > 0 ? ageRanges.join(', ') : '18-35'}
- Accessibility needs: ${accessibilityText}
- Travel style: ${travelStyleText}${localModeText}${dateNightText}${modalityText}${accommodationText}${sportsText}${photoText}${foodText}${natureText}${nightlifeText}${historyText}${wellnessText}${shoppingText}${adventureText}${cultureText}${beachText}${themeParkText}${familyText}${budgetConsciousText}${accessibilityPriorityText}${mustHaveText}${additionalContext ? `\n- ADDITIONAL NOTES FROM THE TRAVELER (treat these as high-priority preferences that should shape the itinerary): ${additionalContext}` : ''}${personaText}${preBookingText}${multiCityText}

${(() => {
    // Multi-city: inject per-city place sections
    if (multiCityPlaces && Object.keys(multiCityPlaces).length >= 2) {
      const sections: string[] = [];
      for (const [city, places] of Object.entries(multiCityPlaces)) {
        if (!places || (places.restaurants.length === 0 && places.attractions.length === 0)) continue;
        let section = `\nCRITICAL — REAL PLACES IN ${city.toUpperCase()} ONLY (verified via Google Places):\nOn days when the group is in ${city}, use ONLY these venues. Do NOT invent restaurants or activities for ${city}.\nOPENING HOURS: schedule each venue only within its listed hours. QUALITY & CURATION rules apply as normal.\n`;
        if (places.restaurants.length > 0) {
          section += `\nREAL RESTAURANTS IN ${city.toUpperCase()}:\n${places.restaurants.map(r => formatPlaceForPrompt(r)).join('\n')}`;
        }
        if (places.attractions.length > 0) {
          section += `\n\nREAL ATTRACTIONS IN ${city.toUpperCase()}:\n${places.attractions.map(a => formatPlaceForPrompt(a)).join('\n')}`;
        }
        sections.push(section);
      }
      if (sections.length > 0) return sections.join('\n') + '\n';
    }

    if (!realPlaces || (realPlaces.restaurants.length === 0 && realPlaces.attractions.length === 0)) return '';
    const { restaurants, attractions } = realPlaces;

    let section = `\nCRITICAL — REAL PLACES ONLY (verified via Google Places):
You MUST use ONLY the venues listed below for restaurants and activities. Do NOT invent, guess, or hallucinate any place names, businesses, or addresses.
Every restaurant and activity in the itinerary must come from one of these two lists — no exceptions.
IMPORTANT EXEMPTIONS: The hotelSuggestions array (when required) and photoSpots are NOT bound by this restriction — use your knowledge to recommend real, well-regarded hotels and photo locations even if they are not in the lists below.

OPENING HOURS RULES (strictly enforce):
- Each venue's opening hours are listed. Schedule it ONLY within those hours.
- A restaurant closed before 10:00 AM cannot be breakfast. One opening at 5:00 PM cannot be lunch.
- If hours are not listed for a venue, apply common-sense defaults (restaurants: noon–10 PM; parks/outdoor sites: all day).
- Do NOT schedule any venue outside its listed hours even if it creates a scheduling gap — fill gaps with a venue that IS open.

QUALITY & CURATION RULES (travel agent standard):
- All venues are pre-filtered for quality (minimum rating + review count). Prefer venues with more reviews when choosing between similar options.
- Match price level to the trip budget. Venues marked $$$$ are not appropriate for budget trips.
- For restaurants: read the types and hours to determine meal fit.
  - Cafes, bakeries, diners open before 10 AM → breakfast-appropriate.
  - Restaurants opening at or after 11 AM → lunch/dinner only.
  - Venues closing before 4 PM → breakfast/lunch only, never dinner.
  - Bars and pubs → dinner or after, never breakfast or lunch.
- Vary cuisine and activity type across meals and days. Do not repeat the same venue or same cuisine type back-to-back.
- If the lists are sparse (small town), reduce daily activities to match what actually exists. Reuse a restaurant across days before inventing a fake one.`;

    if (restaurants.length > 0) {
      section += `\n\nREAL RESTAURANTS IN ${destination}:\n`;
      section += restaurants.map(r => formatPlaceForPrompt(r)).join('\n');
    }
    if (attractions.length > 0) {
      section += `\n\nREAL ATTRACTIONS & ACTIVITIES IN ${destination}:\n`;
      section += attractions.map(a => formatPlaceForPrompt(a)).join('\n');
    }
    return section + '\n';
  })()}
OUTPUT FORMAT — return a JSON array of exactly ${tripLength} day objects.

IMPORTANT: The FIRST day object (day 1) must include these additional top-level fields before "day":
  "title" — a concise, evocative 3-6 word trip name incorporating the destination and top priority (e.g. "Venice Food & History Adventure", "Bangkok Nights & Street Food", "Kyoto Temples & Quiet Gardens"). This will display as the trip name throughout the app.
  "practicalNotes" — a one-time block of essential destination knowledge (only on day 1, omit from all other days):${needsHotelSuggestions ? `
  "hotelSuggestions" — since no hotel has been pre-booked, include lodging suggestions ${lodgingTypeInstruction} (only on day 1, omit from all other days):${destinations.length >= 2 ? `
    For this multi-city trip (${destinations.join(' → ')}), include 1-2 options per city so the group knows where to stay in each location. Structure the array with a "city" field on each entry so the app can group them:` : ''}
    [
      {
        ${destinations.length >= 2 ? '"city": "City name this lodging is in",' : ''}
        "name": "Property name",
        "neighborhood": "Area/district name",
        "address": "Full address",
        "pricePerNight": 150,
        "priceLevel": 2,
        "whyRecommended": "One sentence on why this is a great choice — location, reputation, amenities, or vibe",
        "bookingUrl": "https://www.booking.com/searchresults.html?ss=PROPERTY+NAME+CITY&checkin=${startDate}&checkout=${endDate}"
      }
    ]
    Choose properties that are: (1) real and accurately named, (2) well-located — ideally central or near transport hubs, (3) highly regarded for their category.${destinations.length >= 2 ? ` For each city in the multi-city route, include 1-2 options — this helps the group plan where to base themselves in each leg of the trip.` : ' Vary the 3 suggestions slightly — e.g. one closer to the main sights, one in a quieter/hipper neighborhood, one that offers the best value.'} The bookingUrl should be a Booking.com search URL pre-filled with the property name and city.` : ''}${hasFoodPriority ? `
  "foodieTips" — since food is a top priority, include this array on EVERY day (not just day 1) with 3-4 bonus finds specific to that day's neighborhoods. Schema:
    [
      {
        "name": "Specific place, stall, or vendor name — be precise, not generic",
        "type": "coffee bar | street stall | food market | specialty shop | food hall | late-night spot | bakery | bar snack | tasting room | other",
        "neighborhood": "District or area name",
        "why": "What makes this place worth a detour — the story, reputation, or cult following. Vivid and specific.",
        "orderThis": "The 1-3 exact items to order — dish names or products. Make it mouthwatering.",
        "timeOfDay": "morning | midday | afternoon | evening | late-night | any",
        "priceRange": "$ | $$ | $$$ (rough cost per person)",
        "tip": "One practical insider tip — when to arrive, cash vs card, secret menu, etc."
      }
    ]
    Rules: (1) Tips must be DIFFERENT from the daily track restaurants — these are bonus discoveries, spontaneous stops. (2) Must be real, specifically named establishments. (3) Geographically anchored to where the group is that day — no recycled city-wide tips across days. (4) Write each "why" like a food writer: opinionated and concrete. (5) Vary the type each day — don't repeat the same category two days in a row.` : ''}
${hasNightlifePriority ? `
  "nightlifeHighlights" — since nightlife is a top priority, include an array of 5-7 evening venues curated for this destination (day 1 only, covers full trip):
    [
      {
        "name": "Bar, club, or venue name — specific and real",
        "type": "cocktail bar | rooftop bar | live music | jazz bar | wine bar | craft beer | club | lounge | pub | speakeasy",
        "neighborhood": "District or area name",
        "vibe": "The atmosphere in one sentence — packed and loud? intimate and moody? locals-only dive?",
        "bestNight": "Best night or time to visit — e.g. 'Thursday jazz nights', 'weekends from 11pm', 'any evening'",
        "openFrom": "Rough opening time and last entry if known — e.g. '8pm until late'",
        "tip": "One practical tip — reservation required, cover charge, dress code, best seat in the house, etc."
      }
    ]
    Rules: (1) All venues must be real and specifically named — no invented bars. (2) Vary the type: include at least one live music venue, one cocktail bar, and one locals-only spot. (3) Write "vibe" with personality — specific, atmospheric, opinionated. (4) No tourist-trap venues — the list should read like a local's guide.` : ''}
${hasShoppingPriority ? `
  "shoppingGuide" — since shopping is a top priority, include an array of 5-7 curated shopping spots (day 1 only, covers full trip):
    [
      {
        "name": "Market, shop, or district name — specific and real",
        "type": "flea market | artisan market | food market | boutique | vintage | craft | design | neighborhood | specialty shop | department",
        "neighborhood": "District or area",
        "what": "What you'll find — name specific goods, products, brands, or specialties. Be vivid.",
        "bestFor": "Who this is best for — bargain hunters? design lovers? foodies? souvenir seekers?",
        "openDays": "Days and hours — e.g. 'Saturdays 8am–3pm only' or 'Mon–Sat 10am–7pm'",
        "tip": "One insider tip — arrive early for best selection, cash preferred, haggling expected, hidden floor, etc."
      }
    ]
    Rules: (1) Prioritize local and independent over international chains. (2) Vary the type — at least one food/produce market, one craft or artisan market, and one neighborhood to browse. (3) Include specific items or products to look for — don't be generic. (4) Be real and accurately named.` : ''}
    {
      "currency": "Local currency name, symbol, approximate USD exchange rate, and whether cards are widely accepted or cash is preferred",
      "tipping": "Local tipping customs and typical amounts or percentages by context (restaurant, taxi, hotel)",
      "customs": "2-3 key cultural customs, dress codes (e.g. covering shoulders at religious sites), or etiquette points travelers should know",
      "entryRequirements": "Visa requirements for US/EU/UK passport holders, and any biometric/registration requirements. For Schengen Area destinations: note the EU Entry/Exit System (EES) — first-time visitors must register fingerprints and a facial photo at the border; allow extra time at entry points.",
      "safetyTips": "Top 2-3 practical safety or health tips specific to this destination (e.g. tap water safety, common scams, areas to avoid at night)",
      "usefulPhrases": ["Local phrase = English meaning", "Local phrase = English meaning", "Local phrase = English meaning"]
    }

[
  {
    "title": "Evocative trip name here (day 1 only)",
    "practicalNotes": { ... (day 1 only) },${hasNightlifePriority ? `
    "nightlifeHighlights": [ ... (day 1 only, nightlife priority trips) ],` : ''}${hasShoppingPriority ? `
    "shoppingGuide": [ ... (day 1 only, shopping priority trips) ],` : ''}
    "day": 1,
    "date": "${startDate}",
    "city": "Primary city or town for this day (e.g. 'Paris', 'Reykjavik', 'Kyoto') — used for per-day weather. For day trips from a base city, use the base city.",
    "theme": "Evocative 3-5 word theme for the day",
    "photoSpots": [
      {
        "name": "Specific viewpoint or location name",
        "timeOfDay": "golden hour",
        "tip": "One-sentence tip on what to capture and how"
      }
    ],${hasFoodPriority ? `
    "foodieTips": [
      {
        "name": "Specific place or stall name near today's area",
        "type": "coffee bar | street stall | food market | specialty shop | bakery | late-night spot | other",
        "neighborhood": "District or area name",
        "why": "What makes it worth a detour — vivid and specific",
        "orderThis": "1-3 exact items to order",
        "timeOfDay": "morning | afternoon | evening | late-night | any",
        "priceRange": "$ | $$ | $$$",
        "tip": "One practical insider tip"
      }
    ],` : ''}
    "destinationTip": "One punchy, specific insider sentence about something this city or region is distinctly known for — a food, drink, tradition, or quirk tied to the day's location. E.g. 'Bavaria is famous for its weisswurst — order it before noon, never after, at any traditional beer hall.' Rotate the topic across days (food one day, drink another, local tradition another).",
    "trackALabel": null,
    "trackBLabel": null,
    "dinnerMeetupLocation": null,
    "tracks": {
      "shared": [
        {
          "id": "act_d1_1",
          "dayNumber": 1,
          "timeSlot": "07:30–09:00",
          "name": "Venue Name",
          "title": "Venue Name",
          "address": "Full street address, City, Country",
          "website": "https://venue-website.com",
          "isRestaurant": true,
          "mealType": "breakfast",
          "track": "shared",
          "priceLevel": ${mealPriceLevels.breakfast},
          "description": "Why this restaurant is recommended — cite the source of its reputation (e.g. 'A local institution since 1962, beloved by Venetians for its hand-rolled pastries' or 'Named best breakfast spot by local food critics, packed with residents every morning')",
          "costEstimate": 12,
          "confidence": 0.9,
          "verified": true,
          "packingTips": [],
          "transportToNext": {
            "mode": "walk",
            "durationMins": 8,
            "distanceMiles": 0.3,
            "notes": "Brief direction or landmark-based note, e.g. 'Walk north along the canal to the bridge'"
          }
        },
        {
          "id": "act_d1_2",
          "dayNumber": 1,
          "timeSlot": "09:00–11:30",
          "name": "Activity Venue Name",
          "title": "Activity Venue Name",
          "address": "Full street address, City, Country",
          "website": "https://venue-website.com",
          "isRestaurant": false,
          "mealType": null,
          "track": "shared",
          "priceLevel": 2,
          "description": "One sentence description of why this is worth visiting",
          "costEstimate": 25,
          "confidence": 0.9,
          "verified": true,
          "packingTips": [],
          "transportToNext": {
            "mode": "walk",
            "durationMins": 12,
            "distanceMiles": 0.5,
            "notes": "Head south towards the main square"
          }
        }
      ],
      "track_a": [],
      "track_b": []
    },
    "meetupTime": "09:00",
    "meetupLocation": "Hotel lobby"
  }
]

SPLIT TRACK DECISION — follow this logic exactly:
- Count the selected priorities: ${priorities.join(', ') || 'none'}
- SPLIT if: the priorities include at least one high-energy option (adventure, sports, nightlife, nature) AND at least one low-energy option (wellness, culture, history, food, shopping). These represent genuinely different paces that can't be served by a single shared schedule.
- DO NOT SPLIT if: all priorities are in the same energy band, or the group type is "solo" or "couple".
- When you DO split: apply splits on middle days only (not Day 1 arrival or last day departure). Mornings should always be shared. Splits happen in the afternoon block. Groups reconvene for the evening meetup.
- trackALabel and trackBLabel: when splitting, replace null with short 2-4 word descriptive labels. These display directly in the UI.${suggestedTrackLabels ? ` Based on this group's priorities (${priorities.join(', ')}), use EXACTLY these labels: "${suggestedTrackLabels.a}" / "${suggestedTrackLabels.b}". Do not vary the wording — copy them verbatim on every day that splits. The same label pair must appear on every split day throughout the entire itinerary. Never rename a track mid-trip.` : ` Examples: "Active & Outdoors" / "Culture & Relaxation", "Nightlife & Energy" / "Slow & Scenic". Pick one pair and use it IDENTICALLY on every split day — never rename tracks between days.`}
- When NOT splitting: set trackALabel and trackBLabel to null and leave track_a and track_b as empty arrays.
- NEVER duplicate an activity across both track_a and track_b. If an activity suits both tracks equally, place it in shared. The purpose of split tracks is diverging options — different experiences, not the same experience labeled twice.
- dinnerMeetupLocation: on days with a split (track_a and track_b populated), set this to the dinner restaurant name and address so both groups know where to reconvene in the evening. On non-split days, set to null.

MEAL REQUIREMENTS — every day must include exactly 3 restaurant activities:
1. Breakfast (isRestaurant: true, mealType: "breakfast"): timeSlot 07:30–09:00, priceLevel ${mealPriceLevels.breakfast}
   → Place near the hotel/accommodation or the first morning activity
2. Lunch (isRestaurant: true, mealType: "lunch"): timeSlot 12:30–14:00, priceLevel ${mealPriceLevels.lunch}
   → Place geographically near the midday activities — minimize detour from the day's flow
3. Dinner (isRestaurant: true, mealType: "dinner"): timeSlot 19:00–21:00, priceLevel ${mealPriceLevels.dinner}
   → Place near the evening meetup location
For EACH restaurant: recommend a real, named establishment. In the description, state WHY it is recommended — cite its reputation (local institution, award recognition, neighborhood favorite, featured in local food press, etc.). Do not fabricate Google star ratings; instead describe the source of the restaurant's acclaim. Choose spots that are close to surrounding activities to keep transit minimal.
RESTAURANTS ALWAYS IN SHARED TRACK: All restaurant activities (isRestaurant: true) must ALWAYS be placed in the "shared" track — never in track_a or track_b. Meals are a shared group experience. The only exception is a trip explicitly themed around diverging dining preferences, which is rare. In all standard itineraries, restaurants go in shared.
CRITICAL — NO DUPLICATE VENUES: Every venue name across the ENTIRE itinerary must be unique — this applies to BOTH restaurants AND non-restaurant activities. You have ${tripLength} days × 3 meals = ${tripLength * 3} restaurant slots and multiple activity slots — each slot must use a different named establishment. Never repeat any venue name on a second day or across tracks, even if it was highly rated. Variety is essential.

TRANSPORT BETWEEN ACTIVITIES:
Every activity must include a "transportToNext" field:
- mode: walk | rideshare | car_rental | taxi | metro | bus | train | ferry | water-taxi | tuk-tuk | cable-car | tram
- durationMins: estimated travel time in minutes
- distanceMiles: distance in miles (use 0 for car/rideshare where exact route varies)
- notes: CRITICAL — this must describe the journey FROM the CURRENT activity TO the NEXT activity. The note must reference the destination of the NEXT activity (e.g., if walking to a castle next, write "Walk north along the river to the castle entrance"). Never describe a route to a place you already visited, and never reference the previous activity's destination. Always look FORWARD to where the group is going next.
Set transportToNext to null on the last activity of each day (no onward journey needed).
DAY-TRIP / EXCURSION RETURN RULE: On any day where the group travels outside their home city or base hotel (e.g., Versailles from Paris, Salzburg from Munich, a coastal day trip), the last activity of that excursion MUST include a transportToNext leg explicitly routing the group back to the home city or hotel. Never leave the group stranded at the excursion site with no return journey shown. The return leg must be realistic: same mode they used to get there (train back, rideshare back, etc.) with accurate duration.

MODE SELECTION RULES (based on travel time):
- Under 15 min: walk (if terrain allows) or rideshare
- 15–30 min: rideshare or taxi (quick local hop)
- 30–60 min: rideshare OR car_rental (either works — use car_rental if a rental is already part of the trip)
- Over 60 min: car_rental (a shared rideshare for 1+ hour is unreasonably expensive; a rental is the right call)
- In cities with excellent transit (Paris, London, Tokyo, NYC, Amsterdam, Berlin, Barcelona, Rome, etc.): prefer metro/tram/bus over rideshare for any leg up to 60 min
- For destinations without reliable rideshare apps (rural areas, many parts of Southeast Asia, Africa, etc.): use taxi or local transit instead of rideshare
${walkingRuleText}

GEOGRAPHIC CLUSTERING RULE: When a transport leg (car, bus, train, or excursion) moves the group to a new town or region, ALL activities scheduled after that transport leg — until the next transport leg — must cluster within 0.5 miles of each other around a central point in that town. Restaurants must always be within walking distance of the immediately preceding activity — never require a separate drive just for a meal. If two activities in the same town are more than 0.5 miles apart, insert a transport leg between them.

DAILY BUDGET ENFORCEMENT:
- Food budget: $${dailyFoodBudget} per person per day — the sum of costEstimate for all 3 restaurant activities must not exceed this amount
- Experiences budget: $${dailyExperiencesBudget} per person per day — the sum of costEstimate for all non-restaurant activities must not exceed this amount
- If free activities (museums with free entry, walking tours, parks) are available, use them to stay within budget while still filling the day

RULES:
1. Use REAL venue names and real addresses for ${destination}
2. Include 4-6 activities per day total (including the 3 required meals), spread naturally across the day
3. timeSlot format must be "HH:MM–HH:MM" using an en-dash (–)
4. priceLevel: 0=free, 1=$, 2=$$, 3=$$$, 4=$$$$
5. costEstimate is per-person in USD
6. id format: "act_d{dayNumber}_{index}" (e.g. act_d1_1, act_d1_2)
7. Day themes should be evocative and specific: "Golden Circle & Geysers" not "Sightseeing Day"
8. Vary the pace — not every day should be packed. Include slower, wandering time.
9. The first and last days should account for travel/arrival/departure logistics
10. meetupTime and meetupLocation are the MORNING departure point — the place where the whole group gathers at the start of the day before heading out. meetupLocation must ALWAYS be the hotel lobby (e.g. "Hotel lobby" or "[Hotel Name] lobby"). meetupTime must equal the timeSlot start of the very FIRST activity of that day (e.g. if the day's first activity starts at "09:00", meetupTime is "09:00"). Never set meetupTime to a time after the first activity starts — the group meets first, then heads out. Do NOT generate a "Group Meetup" activity in the tracks array; use meetupTime/meetupLocation exclusively. For solo or couple trips (groupType "solo" or "couple"), set meetupTime and meetupLocation to null on every day — group meetup points are irrelevant for individual travelers.
11. photoSpots: REQUIRED on every itinerary, every day — include 1-3 per day regardless of whether photography is a selected priority. Always include the destination's iconic must-photograph landmarks (e.g. Trevi Fountain in Rome, Eiffel Tower in Paris, Hagia Sophia in Istanbul) as the primary spot on the relevant day. These are the shots every visitor wants and they must not be omitted. Pair each with a specific time of day (sunrise/golden hour/blue hour/midday) and one actionable shooting tip (best angle, where to stand, what to frame). Additional spots can be local or lesser-known but the famous landmark always anchors the list.
12. packingTips: for any outdoor, hiking, excursion, tour, or physical activity include 2-4 short packing tips (e.g. "Wear sturdy walking shoes", "Bring a water bottle", "Sunscreen essential"). Leave empty array [] for restaurants, museums, and low-key activities.
13. Respect the travel style: ${explorerPct >= 70 ? 'prioritize hidden gems and local spots over famous tourist sites' : explorerPct >= 40 ? 'balance iconic sights with local discoveries' : 'focus on well-reviewed and accessible attractions'}
14. Age ranges present: ${ageRanges.length > 0 ? ageRanges.join(', ') : '18-35'} — if children (Under 12 or 12-17) are in the group, ensure all shared-track activities are family-appropriate. Use split tracks to give adults-only options in the afternoon when children are present alongside adults.
15. "title" and "practicalNotes" fields appear ONLY on day 1. All other day objects must not include these fields.
16. NEVER INVENT SCHEDULED EVENTS: Do not assign a specific scheduled game, concert, festival, or live performance to a specific date unless it is a recurring, date-independent, permanent offering (e.g. a weekly farmers market, a permanent museum exhibit). For any live event venue, describe it and direct travelers to the official website or a ticketing platform (Ticketmaster, AXS, SeatGeek) to check current dates. This rule overrides any priority or must-have instruction.
17. destinationTip: include on EVERY day object — one punchy, specific insider fact about the destination for that day's city. Rotate the topic across days (food, drink, tradition, cultural quirk, etc.). Never repeat the same topic two days in a row.
18. trackALabel and trackBLabel must be IDENTICAL strings on every day that has a split. Decide the label pair once for the whole trip and repeat it exactly on every split day — never rename or rephrase a track label between days.
${getSeasonalContext(startDate, destination)}

Return ONLY the JSON array. No markdown. No explanation. Start with [ and end with ].`;
}

// Recover a valid JSON array from a truncated response by finding the last
// complete day object (depth-0 closing brace) and closing the array there.
function recoverTruncatedArray(raw: string): string {
  let depth = 0;
  let inString = false;
  let escape = false;
  let lastCompleteObjEnd = -1;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') {
      depth--;
      // depth === 1 means we just closed a top-level day object inside the array
      if (depth === 1 && ch === '}') lastCompleteObjEnd = i;
    }
  }

  if (lastCompleteObjEnd > 0) {
    return raw.slice(0, lastCompleteObjEnd + 1) + ']';
  }
  return raw;
}

// ── JSON helpers ──────────────────────────────────────────────────────────────

/** Clean common Claude JSON quirks (smart quotes, trailing commas). */
function cleanJson(raw: string): string {
  return raw
    .replace(/[\u201C\u201D]/g, '"')   // curly double quotes → straight
    .replace(/[\u2018\u2019]/g, "'")   // curly single quotes → straight
    .replace(/,(\s*[}\]])/g, '$1');    // trailing commas before } or ]
}

// ── Streaming POST handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ── Auth guard — must be logged in to generate itineraries ─────────────────
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bad request';
    return NextResponse.json({ error: 'BAD_REQUEST', message }, { status: 400 });
  }

  // ── Pre-stream checks (return plain JSON so client can handle them simply) ──

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      error: 'NO_API_KEY',
      message: 'Add ANTHROPIC_API_KEY to .env.local to enable AI generation',
    }, { status: 503 });
  }

  // Resolve subscription tier + organizer persona in one query
  let userTier: SubscriptionTier = 'free';
  let organizerPersona: { priorities: string[]; vibes?: string[] } | null = null;
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (user?.id) {
      const adminClient = createAdminClient();
      const { data: profile } = await adminClient
        .from('profiles')
        .select('subscription_tier, travel_persona')
        .eq('id', user.id)
        .single();
      if (profile?.subscription_tier) {
        userTier = profile.subscription_tier as SubscriptionTier;
      }
      if (profile?.travel_persona && typeof profile.travel_persona === 'object') {
        const p = profile.travel_persona as Record<string, unknown>;
        const priorities = Array.isArray(p.priorities) ? p.priorities as string[] : [];
        const vibes = Array.isArray(p.vibes) ? p.vibes as string[] : undefined;
        if (priorities.length > 0) organizerPersona = { priorities, vibes };
      }
    }
  } catch { /* fall back to free, no persona */ }

  // ── Layer 2: member preferences from trip_members ─────────────────────────
  // When the request includes a tripId and the trip has members who joined via
  // the invite flow, fetch their saved preferences (priorities, accommodation,
  // curiosity). These feed into the split-track prompt so the AI proposes tracks
  // that genuinely serve the group's divergent interests.
  let memberPersonas: Array<{ name: string; priorities: string[]; curiosity?: string }> = [];
  const requestBodyTripId = body?.tripId as string | undefined;
  if (requestBodyTripId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestBodyTripId)) {
    try {
      const adminClient = createAdminClient();
      const { data: members } = await adminClient
        .from('trip_members')
        .select('name, preferences')
        .eq('trip_id', requestBodyTripId)
        .not('preferences', 'is', null);

      if (members?.length) {
        for (const m of members) {
          const prefs = m.preferences as Record<string, unknown> | null;
          if (prefs && Array.isArray(prefs.priorities) && prefs.priorities.length > 0) {
            memberPersonas.push({
              name: m.name ?? 'A member',
              priorities: prefs.priorities as string[],
              curiosity: typeof prefs.curiosity === 'string' ? prefs.curiosity : undefined,
            });
          }
        }
      }
    } catch { /* non-blocking */ }
  }

  const tierLimits = TIER_LIMITS[userTier];
  const requestedLength = Number(body.tripLength) || 7;

  if (requestedLength > tierLimits.maxTripDays) {
    return NextResponse.json({
      error: 'TRIP_LENGTH_LIMIT',
      message: `Your ${userTier} plan supports itineraries up to ${tierLimits.maxTripDays} days. Upgrade to generate longer trips.`,
    }, { status: 403 });
  }

  // Token budget scales with trip length.
  // Real-world measurement: each day object uses 8,000–12,000 tokens of JSON
  // (shared track 3-4 activities + track_a/b, 3 restaurants, transport legs,
  //  photo spots, destination tip, meetup, descriptions).
  // Multi-city trips run higher (~11K/day) due to inter-city transport legs,
  // arrival/departure logistics, and richer city descriptions.
  // Use 10,500 tokens × days, capped at 64K. For any 7-day trip this always
  // hits the 64K cap, giving the first pass the maximum output budget.
  const modelId = 'claude-sonnet-4-6';
  const isMultiCity = Array.isArray(body.destinations) && (body.destinations as string[]).length > 1;
  const tokensPerDay = isMultiCity ? 11000 : 10000;
  const maxTokens = Math.min(64000, Math.max(24000, requestedLength * tokensPerDay));

  // Use pre-fetched places from client if available (they were fetched on Step 8 / Review),
  // otherwise fall back to fetching here. This removes the ~10-15s wait before streaming starts.
  let realPlaces: { restaurants: GooglePlace[]; attractions: GooglePlace[] } | null =
    (body.preFetchedRealPlaces as { restaurants: GooglePlace[]; attractions: GooglePlace[] } | null) ?? null;
  let multiCityPlaces: Record<string, { restaurants: GooglePlace[]; attractions: GooglePlace[] }> | null =
    (body.preFetchedMultiCityPlaces as Record<string, { restaurants: GooglePlace[]; attractions: GooglePlace[] }> | null) ?? null;

  const hasPreFetched = realPlaces !== null || multiCityPlaces !== null;

  if (!hasPreFetched && process.env.GOOGLE_MAPS_KEY) {
    try {
      const requestedDestinations = (body.destinations as string[] | undefined) ?? [];
      if (requestedDestinations.length >= 2) {
        // Multi-city: fetch for up to 4 cities in parallel
        const citiesToFetch = requestedDestinations.slice(0, 4);
        const results = await Promise.allSettled(
          citiesToFetch.map(city => fetchDestinationPlaces(city, process.env.GOOGLE_MAPS_KEY!))
        );
        multiCityPlaces = {};
        results.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            multiCityPlaces![citiesToFetch[idx]] = result.value;
            console.log(`[generate-itinerary] Places for "${citiesToFetch[idx]}": ${result.value.restaurants.length} restaurants, ${result.value.attractions.length} attractions`);
          }
        });
        realPlaces = multiCityPlaces[citiesToFetch[0]] ?? null;
      } else {
        const placesQuery = requestedDestinations[0] || (body.destination as string);
        realPlaces = await fetchDestinationPlaces(placesQuery, process.env.GOOGLE_MAPS_KEY);
        console.log(`[generate-itinerary] Real places for "${body.destination}": ${(realPlaces as {restaurants: unknown[]}).restaurants.length} restaurants, ${(realPlaces as {attractions: unknown[]}).attractions.length} attractions`);
      }
    } catch (err) {
      console.warn('[generate-itinerary] Could not fetch real places:', err);
    }
  } else if (hasPreFetched) {
    console.log('[generate-itinerary] Using pre-fetched places from client — skipping Google Places fetch');
  }

  const prompt = buildPrompt({
    destination: body.destination as string,
    startDate: body.startDate as string,
    endDate: body.endDate as string,
    tripLength: body.tripLength as number,
    groupType: body.groupType as string,
    priorities: body.priorities as string[],
    budget: body.budget as number,
    budgetBreakdown: body.budgetBreakdown as Record<string, number>,
    ageRanges: body.ageRanges as string[],
    accessibilityNeeds: body.accessibilityNeeds as string[],
    localMode: body.localMode as boolean,
    dateNight: body.dateNight as boolean,
    curiosityLevel: body.curiosityLevel as number,
    modality: body.modality as string,
    accommodationType: body.accommodationType as string,
    bookedFlight: body.bookedFlight as BookedFlight | null,
    bookedHotel: body.bookedHotel as BookedHotel | null,   // legacy
    bookedHotels: body.bookedHotels as BookedHotel[],      // preferred
    bookedCar: body.bookedCar as { company?: string; pickupLocation?: string; carClass?: string; confirmationRef?: string } | null,
    mustHaves: (body.mustHaves as string[] | undefined) ?? [],
    destinations: (body.destinations as string[] | undefined) ?? [],
    daysPerDestination: (body.daysPerDestination as Record<string, number> | undefined) ?? {},
    additionalContext: (body.additionalContext as string | undefined) ?? '',
    realPlaces,
    multiCityPlaces,
    organizerPersona,
    memberPersonas,
    groupSize: Number(body.groupSize) || 2,
  });

  // ── Open SSE stream ──────────────────────────────────────────────────────────
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      /** Encode and enqueue one SSE event. */
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* controller already closed */ }
      };

      try {
        const anthropicStream = await client.messages.create({
          model: modelId,
          max_tokens: maxTokens,
          stream: true,
          system: SYSTEM_PROMPT,
          messages: [
            { role: 'user', content: prompt },
          ],
        });

        // ── Character-level JSON object extractor ───────────────────────────
        // We scan the token stream character by character, tracking brace
        // depth so we can detect the exact moment each top-level day object
        // is complete and emit it immediately as an SSE event.
        let buffer = '';
        let braceDepth = 0;
        let inString = false;
        let escape = false;
        let objStart = -1;
        let dayIndex = 0;
        const collectedDays: Record<string, unknown>[] = [];

        for await (const event of anthropicStream) {
          if (event.type !== 'content_block_delta') continue;
          if (event.delta.type !== 'text_delta') continue;

          for (const ch of event.delta.text) {
            // String / escape tracking (so braces inside string values are ignored)
            if (escape)                      { escape = false; buffer += ch; continue; }
            if (ch === '\\' && inString)     { escape = true;  buffer += ch; continue; }
            if (ch === '"')                  { inString = !inString; buffer += ch; continue; }
            if (inString)                    { buffer += ch; continue; }

            buffer += ch;

            if (ch === '{') {
              if (braceDepth === 0) objStart = buffer.length - 1; // mark start of day object
              braceDepth++;
            } else if (ch === '}' && braceDepth > 0) {
              braceDepth--;
              if (braceDepth === 0 && objStart >= 0) {
                // Candidate complete day object: buffer[objStart..end]
                const rawObj = buffer.slice(objStart);
                try {
                  const dayObj = JSON.parse(cleanJson(rawObj)) as Record<string, unknown>;

                  // Day 1 carries trip-level meta fields — extract and emit separately
                  if (dayIndex === 0) {
                    send({
                      type: 'meta',
                      title: dayObj.title ?? null,
                      practicalNotes: dayObj.practicalNotes ?? null,
                      hotelSuggestions: dayObj.hotelSuggestions ?? null,
                      nightlifeHighlights: dayObj.nightlifeHighlights ?? null,
                      shoppingGuide: dayObj.shoppingGuide ?? null,
                    });
                    delete dayObj.title;
                    delete dayObj.practicalNotes;
                    delete dayObj.hotelSuggestions;
                    delete dayObj.nightlifeHighlights;
                    delete dayObj.shoppingGuide;
                    // foodieTips intentionally NOT extracted — stays on each day object
                  }

                  send({ type: 'day', index: dayIndex, data: dayObj });
                  collectedDays.push(dayObj);
                  dayIndex++;

                  // Trim the buffer — the object has been consumed
                  buffer = '';
                  objStart = -1;
                } catch {
                  // Malformed object (rare) — keep scanning; don't advance dayIndex
                  // Reset depth tracking so the next { starts fresh
                  objStart = -1;
                }
              }
            }
          }
        }

        // ── Continuation loop for trips where a pass ran short ───────────────
        // Each pass may produce fewer days than requested (common for 7+ day trips
        // that exceed the 64K output token cap). We retry up to MAX_CONTINUATIONS
        // times using a self-contained compact prompt that avoids conflicting with
        // the original "generate N days from day 1" instruction.
        const MAX_CONTINUATIONS = 4;
        let contAttempt = 0;

        while (dayIndex < requestedLength && contAttempt < MAX_CONTINUATIONS) {
          contAttempt++;
          const remaining = requestedLength - dayIndex;
          console.log(`[generate-itinerary] Pass ${contAttempt}: have ${dayIndex}/${requestedLength} days — requesting days ${dayIndex + 1}–${requestedLength}`);

          // Build a compact summary of already-generated days so the model
          // knows exactly what exists and won't regenerate any of it.
          const generatedSummary = collectedDays
            .map((d) => {
              const cityNote = d.city ? ` (${String(d.city)})` : '';
              return `Day ${String(d.day ?? '')}: ${String(d.theme ?? 'generated')}${cityNote}`;
            })
            .join('\n');

          const contDestinations = (body.destinations as string[] | undefined) ?? [];
          const contDaysPerDest = (body.daysPerDestination as Record<string, number> | undefined) ?? {};
          const isMultiCityCont = contDestinations.length > 1;
          const lastCity = collectedDays.length > 0
            ? (collectedDays[collectedDays.length - 1] as Record<string, unknown>).city as string | undefined
            : undefined;

          // Compute the date for the next day to generate
          const contStartDate = (() => {
            if (collectedDays.length > 0) {
              const lastDay = collectedDays[collectedDays.length - 1] as Record<string, unknown>;
              const lastDate = lastDay.date as string | undefined;
              if (lastDate) {
                const d = new Date(lastDate + 'T12:00:00');
                d.setDate(d.getDate() + 1);
                return d.toISOString().split('T')[0];
              }
            }
            return body.startDate as string;
          })();

          // Brief top-10 venue hints so continuation days use real places too
          const placesHint = (() => {
            const src = isMultiCityCont && lastCity
              ? (multiCityPlaces?.[lastCity] ?? realPlaces)
              : realPlaces;
            if (!src) return '';
            const rList = src.restaurants.slice(0, 10).map(r => `${r.name} (${r.address})`).join('; ');
            const aList = src.attractions.slice(0, 10).map(a => `${a.name} (${a.address})`).join('; ');
            return `\nREAL VENUES — use these for remaining days:\nRestaurants: ${rList}\nActivities: ${aList}\n`;
          })();

          const multiCityNote = isMultiCityCont
            ? `Multi-city route: ${contDestinations.join(' → ')}. ` +
              `Allocation: ${contDestinations.map(c => `${c}=${contDaysPerDest[c] ?? '?'}d`).join(', ')}. `
            : '';

          // ── Self-contained continuation prompt ────────────────────────────
          // CRITICAL: Do NOT append the full original prompt here.
          // The original prompt contains "generate a ${tripLength}-day itinerary
          // starting from Day 1" which conflicts with the continuation directive
          // and causes the model to regenerate from Day 1 instead of continuing.
          const compactContPrompt = [
            `You are an expert travel planner. Continue an in-progress ${requestedLength}-day itinerary.`,
            ``,
            `TRIP: ${body.destination as string} | ${body.startDate as string} to ${body.endDate as string} | ${requestedLength} days total`,
            `GROUP: ${body.groupType as string} | Priorities: ${(body.priorities as string[]).join(', ')}`,
            `Budget: $${body.budget as number} total`,
            multiCityNote ? multiCityNote.trim() : '',
            ``,
            `ALREADY COMPLETE — do NOT regenerate these ${dayIndex} days:`,
            generatedSummary,
            ``,
            lastCity ? `The group ended Day ${dayIndex} in ${lastCity}.` : '',
            placesHint,
            `YOUR TASK: Output ONLY day objects ${dayIndex + 1} through ${requestedLength} (${remaining} day${remaining === 1 ? '' : 's'}), starting from ${contStartDate}.`,
            ``,
            `Day schema (use exact field names):`,
            `{"day":<N>,"date":"YYYY-MM-DD","city":"<city>","theme":"<3-5 word theme>","photoSpots":[{"name":"...","timeOfDay":"...","tip":"..."}],"destinationTip":"<one insider fact>","trackALabel":null,"trackBLabel":null,"dinnerMeetupLocation":null,"tracks":{"shared":[<activities>],"track_a":[],"track_b":[]},"meetupTime":"<HH:MM>","meetupLocation":"Hotel lobby"}`,
            ``,
            `Activity schema:`,
            `{"id":"act_d<N>_<i>","dayNumber":<N>,"timeSlot":"HH:MM–HH:MM","name":"venue","title":"venue","address":"full address","website":"https://...","isRestaurant":<bool>,"mealType":<null|"breakfast"|"lunch"|"dinner">,"track":"shared","priceLevel":<0-4>,"description":"why visit","costEstimate":<USD>,"confidence":0.9,"verified":true,"packingTips":[],"transportToNext":{"mode":"walk|rideshare|metro|taxi|train","durationMins":<N>,"distanceMiles":<N>,"notes":"to next place"}|null}`,
            ``,
            `Rules:`,
            `- Every day: breakfast (07:30–09:00, mealType:"breakfast"), lunch (12:30–14:00, mealType:"lunch"), dinner (19:00–21:00, mealType:"dinner") + 2-3 non-meal activities`,
            `- All activities go in shared track; track_a and track_b stay as empty arrays []`,
            `- transportToNext is null on the LAST activity of each day only`,
            `- Use REAL venue names and full street addresses in ${body.destination as string}`,
            `- Day ${requestedLength} is the departure day — light schedule ending at airport/station`,
            `- "meetupTime" must equal the start time of the first activity that day`,
            ``,
            `Return ONLY the JSON array for days ${dayIndex + 1}–${requestedLength}. No markdown. No explanation. Start with [ and end with ].`,
          ].filter(Boolean).join('\n');

          try {
            const contStream = await client.messages.create({
              model: modelId,
              // Give at least 16K tokens even for 1 remaining day (descriptions are verbose)
              max_tokens: Math.min(64000, Math.max(remaining * tokensPerDay, 16000)),
              stream: true,
              system: SYSTEM_PROMPT, // enforce JSON-only output
              messages: [{ role: 'user', content: compactContPrompt }],
            });

            let contBuf = '';
            let contDepth = 0;
            let contInStr = false;
            let contEsc = false;
            let contStart = -1;
            const daysBefore = dayIndex; // detect if this pass produces anything

            for await (const ev of contStream) {
              if (ev.type !== 'content_block_delta') continue;
              if (ev.delta.type !== 'text_delta') continue;

              for (const ch of ev.delta.text) {
                if (contEsc)                       { contEsc = false; contBuf += ch; continue; }
                if (ch === '\\' && contInStr)      { contEsc = true;  contBuf += ch; continue; }
                if (ch === '"')                    { contInStr = !contInStr; contBuf += ch; continue; }
                if (contInStr)                     { contBuf += ch; continue; }

                contBuf += ch;

                if (ch === '{') {
                  if (contDepth === 0) contStart = contBuf.length - 1;
                  contDepth++;
                } else if (ch === '}' && contDepth > 0) {
                  contDepth--;
                  if (contDepth === 0 && contStart >= 0) {
                    const rawObj = contBuf.slice(contStart);
                    try {
                      const dayObj = JSON.parse(cleanJson(rawObj)) as Record<string, unknown>;

                      // Deduplication guard: skip any day number we already have.
                      // The model occasionally restarts from Day 1 — reject those.
                      const parsedDayNum = typeof dayObj.day === 'number' ? dayObj.day : (dayIndex + 1);
                      if (parsedDayNum <= dayIndex) {
                        console.warn(`[generate-itinerary] Cont pass ${contAttempt}: skipping duplicate day ${parsedDayNum} (already have ${dayIndex} days)`);
                        contBuf = '';
                        contStart = -1;
                      } else {
                        send({ type: 'day', index: dayIndex, data: dayObj });
                        collectedDays.push(dayObj);
                        dayIndex++;
                        contBuf = '';
                        contStart = -1;
                      }
                    } catch {
                      contStart = -1;
                    }
                  }
                }
              }
            }

            // If the model returned nothing new, no point retrying — it's stuck
            if (dayIndex === daysBefore) {
              console.warn(`[generate-itinerary] Continuation pass ${contAttempt} produced 0 days — stopping retry loop`);
              break;
            }
          } catch (contErr) {
            console.warn(`[generate-itinerary] Continuation pass ${contAttempt} failed:`, contErr);
            // Break rather than retry on hard errors (rate limits, network, etc.)
            break;
          }
        }

        if (dayIndex < requestedLength) {
          console.warn(`[generate-itinerary] Trip ended with ${dayIndex}/${requestedLength} days after ${contAttempt} continuation attempt(s)`);
        }

        // Signal stream end to client. Include total days emitted so the client
        // can detect partial results (e.g. truncated generation).
        send({ type: 'done', daysEmitted: dayIndex, model: modelId });

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[generate-itinerary] stream error:', message);
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx/proxy buffering
    },
  });
}
