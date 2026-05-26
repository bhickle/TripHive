import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { getTripRole } from '@/lib/supabase/tripAccess';
import { checkAiCredits, incrementAiCreditsUsed } from '@/lib/supabase/aiCredits';
import { persistGenerationDays } from '@/lib/supabase/persistGenerationDays';
import type { Json } from '@/lib/supabase/database.types';
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

// ── Retry helpers for transient Anthropic failures ──────────────────────────
// Anthropic returns 529 / overloaded_error during peak load and 5xx for
// internal hiccups. Without retries, a single overload kills the whole
// generation and the user sees a partial trip (e.g. 11 requested → 4 emitted).
function isRetryableAnthropicError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; error?: { error?: { type?: string }; type?: string }; message?: string };
  if (e.status === 429 || e.status === 500 || e.status === 502 || e.status === 503 || e.status === 504 || e.status === 529) {
    return true;
  }
  const innerType = e.error?.error?.type ?? e.error?.type;
  if (innerType === 'overloaded_error' || innerType === 'rate_limit_error' || innerType === 'api_error') {
    return true;
  }
  const msg = typeof e.message === 'string' ? e.message : '';
  if (msg.includes('overloaded_error') || msg.includes('rate_limit_error') || msg.includes('"Overloaded"')) return true;
  if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|socket hang up/i.test(msg)) return true;
  return false;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); }, { once: true });
  });
}

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

// ─── Weekday helpers ──────────────────────────────────────────────────────────
// Compute the day-of-week for each trip day server-side and pass it into the
// prompt explicitly. Google Places returns opening hours keyed by weekday name
// (`Monday: 11:00 AM – 9:00 PM`, …) and the prompt previously expected the
// model to match those to each day's date on its own — which LLMs get wrong
// often enough to send users to a closed venue. Now the prompt shows e.g.
// `Day 1 (Tuesday, May 5)` so the model can pair "Tuesday" hours to Day 1
// without any internal calendar arithmetic.
function formatWeekdayLong(dateStr: string): string {
  // Noon-pad so YYYY-MM-DD parses as local noon (avoids UTC midnight → wrong
  // weekday in timezones west of UTC).
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

function formatDateWithWeekday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

/**
 * Build a day-by-day weekday + date mapping for the prompt:
 *   - Day 1 (Tuesday, May 5)
 *   - Day 2 (Wednesday, May 6)
 *   ...
 *
 * For chunked trips (segmentDayStart > 1), the day numbers start at the chunk
 * offset so the mapping aligns with the CRITICAL DAY NUMBERING directive.
 */
function buildWeekdayMap(startDate: string, dayCount: number, segmentDayStart: number = 1): string {
  if (!startDate || dayCount <= 0) return '';
  const lines: string[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(startDate + 'T12:00:00');
    d.setDate(d.getDate() + i);
    const dayNum = segmentDayStart + i;
    lines.push(`  - Day ${dayNum} (${formatDateWithWeekday(d.toISOString().slice(0, 10))})`);
  }
  return lines.join('\n');
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

  // Orlando: three distinct theme-park properties that the model otherwise
  // blurs into a single "Orlando theme parks" bucket. Without this rule the
  // AI confidently puts Harry Potter rides inside Walt Disney World, lists
  // EPCOT Food & Wine for a January trip, etc.
  if (dest.includes('orlando') || dest.includes('walt disney world') || dest.includes('universal orlando')) {
    lines.push(
      "- ORLANDO HAS MULTIPLE DISTINCT PARK PROPERTIES — DO NOT MIX THEM. Walt Disney World Resort (Magic Kingdom, EPCOT, Disney's Hollywood Studios, Disney's Animal Kingdom, Disney Springs, Disney's water parks) and Universal Orlando Resort (Universal Studios Florida, Islands of Adventure, Volcano Bay, CityWalk, Epic Universe) are SEPARATE properties owned by different companies, located on opposite sides of Orlando (~15 miles apart), and require different tickets. SeaWorld Orlando is a third separate property. Attractions, rides, restaurants, character experiences, in-park transportation, hotel benefits, and seasonal events at one property DO NOT APPLY to the others. When naming any park-day activity, always state which property it belongs to (e.g. \"Mythos Restaurant at Islands of Adventure (Universal Orlando)\", not \"Mythos at Orlando theme parks\"). Never put Harry Potter attractions inside Disney; never put Disney character meet-and-greets inside Universal; never describe FastPass/Lightning Lane inside Universal (Universal has Express Pass, not Lightning Lane). Each park-day should commit to ONE property — do not hop between Disney and Universal on the same day."
    );

    // Named Orlando events with hard date windows. Mentioning these outside
    // their window is a confidence-destroying mistake — the user shows up
    // and the event doesn't exist.
    const isFoodAndWine = month >= 8 && month <= 11;
    const isHorrorNights = month === 9 || month === 10;
    const isVeryMerry   = month === 11 || month === 12;
    const isFlowerGarden = month === 3 || month === 4 || month === 5;

    if (!isFoodAndWine) lines.push(
      "- EPCOT INTERNATIONAL FOOD & WINE FESTIVAL (Disney) runs late August through mid-November ONLY. This trip is outside that window — do NOT list it as a current activity or describe it as available now. You may briefly note in a destinationTip that the festival runs annually Aug–Nov for future planning, but it is NOT happening for this trip."
    );
    if (!isHorrorNights) lines.push(
      "- HALLOWEEN HORROR NIGHTS (Universal Orlando) runs early September through early November ONLY. Outside that window — do NOT include it as a scheduled activity or describe it as available."
    );
    if (!isVeryMerry) lines.push(
      "- DISNEY HOLIDAY EVENTS (Mickey's Very Merry Christmas Party, EPCOT International Festival of the Holidays, Jollywood Nights) run mid-November through December ONLY. Outside that window — do NOT include them."
    );
    if (!isFlowerGarden) lines.push(
      "- EPCOT INTERNATIONAL FLOWER & GARDEN FESTIVAL (Disney) runs March through May ONLY. Outside that window — do NOT include it."
    );
  }

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
  /** Google Places business status. We filter to OPERATIONAL only — closed
   *  venues would otherwise leak into the prompt with stale opening hours
   *  attached and the AI would happily schedule them. Possible values:
   *  OPERATIONAL, CLOSED_TEMPORARILY, CLOSED_PERMANENTLY. */
  businessStatus?: string;
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
              'places.businessStatus',
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

      // businessStatus filter runs FIRST: Places returns CLOSED_PERMANENTLY
      // venues with their last-known hours attached. If we don't drop them
      // here, the AI sees a perfectly-formatted "open Tue–Sun 11am–10pm"
      // restaurant in the list and confidently schedules it for dinner.
      // OPERATIONAL is the only status we accept; CLOSED_TEMPORARILY is
      // also dropped because temp closures often outlast the trip window
      // (renovation, lease dispute, etc.) and re-open dates are unreliable.
      const operationalOnly = (data.places as PlacesApiNewResult[])
        .filter(p => !p.businessStatus || p.businessStatus === 'OPERATIONAL');
      const droppedClosed = data.places.length - operationalOnly.length;
      if (droppedClosed > 0) {
        console.log(`[fetchDestinationPlaces] "${query}": dropped ${droppedClosed} closed venues`);
      }

      const raw: GooglePlace[] = operationalOnly.map(p => ({
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
  flexibleDates?: boolean;
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
  referenceContent?: string;           // extracted text from links the user saved on a wishlist item (inspiration, not requirements)
  /** Organizer's home country. Personalizes the Trip Essentials entry/visa
   *  note to the traveler's passport instead of assuming a US/EU/UK one. */
  homeCountry?: string;
  /** Optional per-day outlines from the Trip Builder's "do you generally know
   *  what you want each day?" question. Index = day number - 1; entry is a
   *  short free-text outline the user wrote for that specific day. Empty
   *  strings are ignored. The AI uses these as a strong steer for what to
   *  schedule on each day while still emitting the full schema. */
  dailyOutlines?: string[];
  realPlaces?: { restaurants: GooglePlace[]; attractions: GooglePlace[] } | null;
  multiCityPlaces?: Record<string, { restaurants: GooglePlace[]; attractions: GooglePlace[] }> | null;
  organizerPersona?: { priorities: string[]; vibes?: string[] } | null;
  /** Organizer's preferred itinerary pace, collected in Trip Builder
   *  alongside the priorities step. Same shape as member.pace so the
   *  prompt can fold it into the same daily-density calibration. */
  organizerPace?: 'relaxed' | 'balanced' | 'packed' | null;
  memberPersonas?: Array<{
    name: string;
    priorities: string[];
    pace?: string;
    curiosity?: string;
    dietary?: { tags: string[]; notes?: string };
    accessibility?: { needs: string[]; notes?: string };
    budgetPerDay?: number;
  }>;
  groupSize?: number;
  /** Optional editorial backbone from a Featured Itinerary the user is
   *  building from ("Start planning this trip" on /discover/[slug]).
   *  Each entry is a per-day list of editorial picks the AI should keep
   *  as named venues where they fit the user's priorities + pace. The
   *  AI still emits the full ItineraryDay schema (addresses, priceLevel,
   *  sidebar arrays, etc.) — featuredSeed is a starting point, not a copy. */
  featuredSeed?: {
    title: string;
    days: Array<{
      day: number;
      title?: string;
      activities: Array<{
        time?: string;
        title?: string;
        description?: string;
        affiliate_url?: string;
      }>;
    }>;
  } | null;
}) {
  const {
    destination, startDate, endDate, tripLength,
    groupType, budget,
    localMode, dateNight, curiosityLevel, flexibleDates, modality, accommodationType,
    bookedFlight, realPlaces, featuredSeed,
  } = params;
  // Guard optional/potentially-missing array fields against undefined at runtime.
  // budgetBreakdown is moved out of the destructure because it's accessed via
  // .hotel / .food / etc. throughout the prompt builder; if the payload omits
  // it (e.g. the regenerate-from-itinerary flow), undefined-property access
  // crashes buildPrompt before SSE opens, returning a 500 that surfaces in
  // the UI as the generic "Generation failed" message.
  const budgetBreakdown  = params.budgetBreakdown  ?? {};
  const priorities       = params.priorities       ?? [];
  const ageRanges        = params.ageRanges        ?? [];
  const accessibilityNeeds = params.accessibilityNeeds ?? [];
  const mustHaves = params.mustHaves ?? [];
  const destinations = params.destinations ?? [];
  const daysPerDestination = params.daysPerDestination ?? {};
  const additionalContext = (params.additionalContext ?? '').trim();
  const referenceContent = (params.referenceContent ?? '').trim();
  // Entry/visa guidance is personalized to the organizer's passport when we
  // know their home country, instead of the legacy US/EU/UK assumption — the
  // groundwork for serving non-US travelers.
  const homeCountry = (params.homeCountry ?? '').trim();
  const passportClause = homeCountry ? `a ${homeCountry} passport holder` : 'US, EU, and UK passport holders';
  // Per-day outlines from the "do you know what you want each day?" wizard branch.
  // Trimmed + filtered to non-empty entries. We keep the indexing (day N → outlines[N-1])
  // so empty days don't shift the rest.
  const dailyOutlines = (params.dailyOutlines ?? []).map(s => (s ?? '').trim());
  const hasDailyOutlines = dailyOutlines.some(s => s.length > 0);
  const dailyOutlinesText = hasDailyOutlines
    ? `\n\nUSER-SUPPLIED DAILY OUTLINES — the traveler has told us what they generally want to do each day. Build each day around the outline they wrote for that day index. Still emit the full schema (3 meals, 4-6 activities, transport legs, sidebar arrays, etc.) — the outline is the SKELETON; you fill in the venues, timing, and supporting picks. Where an outline names a specific venue, USE THAT VENUE (verify it's real and apply the same hours/price constraints as any other pick). Where an outline is vague ("museum day", "explore the old town"), interpret it generously but keep that day's focus on what they asked for. If an outline is empty for a given day, build that day normally from the priorities and rules above. Outlines:\n${dailyOutlines.map((o, i) => o ? `  Day ${i + 1}: ${o}` : `  Day ${i + 1}: (no specific request — build normally)`).join('\n')}`
    : '';
  const multiCityPlaces = params.multiCityPlaces ?? null;
  const bookedCar = params.bookedCar ?? null;
  const organizerPersona = params.organizerPersona ?? null;
  const organizerPace = params.organizerPace ?? null;
  const memberPersonas = params.memberPersonas ?? [];
  const groupSize = params.groupSize ?? 2;

  // ── Organizer persona context ──────────────────────────────────────────────
  // The trip's stated priorities (above) define the VIBE of this specific trip.
  // The organizer's saved travel persona is their general travel identity —
  // used here to quietly add texture and, for groups of 4+, to suggest split days.
  // Organizer pace line — short, separate from the longer persona block
  // because pace applies on every trip even when persona/members are empty.
  // Maps to a clear daily-density instruction so the AI biases scheduling
  // toward the buyer's stated preference. Members' paces (when present)
  // are layered on top inside personaText.
  const organizerPaceText = organizerPace
    ? `\nORGANIZER PACE: ${organizerPace}. ${
        organizerPace === 'relaxed' ? 'Schedule fewer activities per day with generous downtime — 2-3 anchor activities plus meals.' :
        organizerPace === 'packed' ? 'Pack each day densely — 4-5 activities plus meals, minimal downtime.' :
        'Balanced density — 3-4 activities per day plus meals and breathing room.'
      }`
    : '';

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
        // Prefer the structured `pace` field; fall back to legacy `curiosity` string.
        const paceText = m.pace ?? m.curiosity;
        const pace = paceText ? ` (pace: ${paceText})` : '';
        return `  - ${m.name}: ${m.priorities.join(', ')}${pace}`;
      }).join('\n');
      text += `

GROUP MEMBER PREFERENCES (collected at join time):
${memberLines}
Use these to understand the diversity of interests in the group. Where member priorities diverge significantly from the organizer's, this strengthens the case for a split day — propose a track that serves each interest cluster. Merge overlapping preferences (e.g. multiple members interested in food → it's a genuine group priority).`;

      // ── Cross-group constraints — Trip Pass mini-wizard fields ──────────
      // Dietary tags are unioned across the group: every food venue must
      // satisfy ALL of them simultaneously. Accessibility needs are unioned
      // and applied as hard constraints on every SHARED activity (split
      // tracks can be more strenuous, but members must be able to opt out).
      // Food budget is the *minimum* across the group and applies ONLY to
      // food picks — never to attractions or activities.
      const allDietary = Array.from(new Set(memberPersonas.flatMap(m => m.dietary?.tags ?? [])));
      const dietaryNotes = memberPersonas.map(m => m.dietary?.notes).filter(Boolean) as string[];
      if (allDietary.length > 0 || dietaryNotes.length > 0) {
        const tagLines = allDietary.map(t => `  - ${t.replace(/_/g, ' ')}`).join('\n');
        const notesBlock = dietaryNotes.length > 0
          ? `\nAdditional notes: ${dietaryNotes.join(' · ')}`
          : '';
        text += `

GROUP DIETARY REQUIREMENTS (hard constraints — every food venue MUST accommodate ALL of these):
${tagLines}${notesBlock}
When picking restaurants, cafés, and food spots, only choose venues with menu options that satisfy every requirement above. If a venue can't accommodate (e.g., a traditional steakhouse for a strict vegan), pick a different venue. Don't bury this in a footnote — it's a hard filter.`;
      }

      const allAccessibility = Array.from(new Set(memberPersonas.flatMap(m => m.accessibility?.needs ?? [])));
      const accessibilityNotes = memberPersonas.map(m => m.accessibility?.notes).filter(Boolean) as string[];
      if (allAccessibility.length > 0 || accessibilityNotes.length > 0) {
        const needsLines = allAccessibility.map(n => `  - ${n.replace(/_/g, ' ')}`).join('\n');
        const notesBlock = accessibilityNotes.length > 0
          ? `\nAdditional notes: ${accessibilityNotes.join(' · ')}`
          : '';
        text += `

GROUP ACCESSIBILITY NEEDS (hard constraints on every SHARED activity):
${needsLines}${notesBlock}
Every activity in the SHARED track must accommodate these needs. Split tracks (Track A / Track B) MAY be more strenuous if members can comfortably opt out, but the shared/full-group portions cannot. If a flagship attraction can't be made accessible, propose an alternative or surface the workaround as a daily Tip (e.g., "Skip the stairs at the Acropolis; the visitor centre on the south slope has a step-free elevator route").`;
      }

      const memberBudgets = memberPersonas
        .map(m => m.budgetPerDay)
        .filter((b): b is number => typeof b === 'number' && b > 0);
      if (memberBudgets.length > 0) {
        const minBudget = Math.min(...memberBudgets);
        text += `

GROUP FOOD BUDGET CAP: $${minBudget}/person/day
Apply this cap ONLY to food venue picks (restaurants, cafés, food markets, food tours). Keep meal recommendations within this per-person daily ceiling so the lowest-budget member of the group isn't priced out of group meals. Do NOT apply this cap to museums, attractions, tours, or activities — those can exceed the food budget freely; members can opt out individually if they don't want to spend.`;
      }
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

  // curiosityLevel maps to a budget/comfort TIER, not an exploration axis.
  // The Step 7 wizard slider is labeled "Backpacker → Luxury" with helper
  // text describing hostels at low / premium hotels + fine dining at high.
  // Earlier code interpreted this as "exploration appetite" (hidden gems vs
  // iconic sights) which is orthogonal — exploration is now driven by the
  // priorities array (history, culture, food, etc.) and the localMode flag.
  // This slider purely sets the spend tier. Boundaries match the wizard's
  // own helper-text breakpoints: <30 budget, <60 mid, <85 comfort, ≥85 luxury.
  const budgetTierLevel = curiosityLevel ?? 50;
  const travelStyleText = budgetTierLevel >= 85
    ? 'LUXURY tier — premium hotels (5-star feel), fine dining and tasting menus, private transfers, top-shelf curated experiences. Avoid budget eateries, hostels, dive bars.'
    : budgetTierLevel >= 60
    ? 'COMFORT tier — well-rated 4-star hotels, quality restaurants with the occasional special meal, smooth logistics (rideshare or private transport when transit is impractical).'
    : budgetTierLevel >= 30
    ? 'MID-RANGE tier — comfortable 3-star hotels or mid-tier vacation rentals, a mix of casual and nicer dining, public transit with occasional rideshare.'
    : 'BUDGET tier — hostels or budget hotels, street food and local cafes, public transit, value-conscious activity picks. Avoid Michelin tasting menus, $$$$ resorts, private transfers.';

  // When localMode is on, the user has indicated this is a REPEAT visit —
  // they've already covered the famous tourist landmarks and want a "deeper
  // cut" itinerary on this trip. This explicitly OVERRIDES rule 11's
  // requirement to anchor every day with the iconic landmark in photoSpots,
  // because the user has been to those before.
  const localModeText = localMode
    ? '\n- REPEAT-VISITOR MODE (override): This traveler has been to this destination before and has already visited the famous tourist landmarks. SKIP or strongly de-emphasize the iconic must-see SIGHTS, MUSEUMS, AND ATTRACTIONS (Eiffel Tower, Trevi Fountain, Hagia Sophia, the Louvre, the Acropolis, etc.) — INCLUDING in the photoSpots arrays. Replace them with: lesser-known museums and galleries, second-tier neighborhoods worth exploring, niche markets, craft and design districts, residential pockets with character, hidden viewpoints, off-the-beaten-path historic sites, and cultural spots first-time visitors typically miss. SCOPE: this rule applies to ATTRACTIONS, sights, museums, and photo spots — NOT to restaurants or food venues. Food picks (breakfast, lunch, dinner, foodie tips, nightlife) must continue to respect the budget tier above; do not downgrade or upgrade food choices based on this flag. This rule overrides rule 11\'s "always include iconic must-photograph landmarks" instruction.'
    : '';

  const dateNightText = dateNight
    ? '\n- DATE NIGHT: On the most fitting evening of the trip (typically mid-trip, not the first or last night), reserve the dinner slot for a romantic, special experience — a candlelit restaurant, a scenic rooftop, a private tasting, or something the destination is known for that feels intimate and memorable. Label the dinner on that day as "Date Night 🌙" and write the description in a warm, romantic tone. All other evenings should be planned normally.'
    : '';

  // When the user started this trip from a Featured Itinerary ("Start
  // planning this trip" on /discover/[slug]), inject the editorial picks
  // as an "EDITORIAL BACKBONE" so the AI keeps those venues where they
  // fit the user's priorities + pace. The AI still emits the full
  // schema (addresses, priceLevel, sidebar arrays, transport legs, etc.)
  // — featuredSeed seeds named venues, not the entire day. Picks that
  // clash with the user's priorities (e.g., a vegan caller, a steakhouse
  // pick) should be swapped out by the AI rather than forced in.
  const featuredSeedText = featuredSeed && featuredSeed.days.length > 0
    ? (() => {
        const lines: string[] = [];
        lines.push(`\n- EDITORIAL BACKBONE: This trip is inspired by tripcoord's "${featuredSeed.title}" itinerary. The picks below are anchor recommendations — keep the named venues where they fit the user's priorities, pace, and budget tier; you MAY shift them between days, swap an individual pick for an equivalent if it clashes with the user's dietary/accessibility/priority constraints, and you MUST still emit every field of the full schema (addresses, timeSlot, priceLevel, isRestaurant, sidebar arrays, etc.). When an editorial pick is a real named landmark/restaurant/attraction in the destination, prefer it over generating a similar venue of your own. This rule overrides Rule 11's iconic-landmarks default WHEN an editorial pick already covers the iconic stop for a given day. Otherwise Rule 11 applies normally.`);
        for (const d of featuredSeed.days) {
          const dayTitle = d.title ? ` — ${d.title}` : '';
          lines.push(`  Day ${d.day}${dayTitle}:`);
          for (const a of d.activities) {
            const parts: string[] = [];
            if (a.time) parts.push(`[${a.time}]`);
            if (a.title) parts.push(a.title);
            const trail = a.description ? ` — ${a.description}` : '';
            lines.push(`    - ${parts.join(' ')}${trail}`);
          }
        }
        return lines.join('\n');
      })()
    : '';

  // If a confirmed rental car is declared, it overrides the modality preference entirely
  const modalityText = bookedCar
    ? '' // car rental rule will be injected in preBookingText below
    : (modality && modality !== 'mix'
        ? (() => {
            // The bare "Primary transport: X" line was too soft — Rome trip user
            // picked "train" but the model still picked rideshares for short hops
            // because MODE SELECTION RULES below default to rideshare for sub-30-min
            // legs. Make the user's choice override those defaults explicitly.
            const m = modality.toLowerCase();
            if (m === 'train' || m === 'transit' || m === 'metro' || m === 'public_transit') {
              return `\n- PRIMARY TRANSPORT — PUBLIC TRANSIT (user-selected): The traveler explicitly chose train/metro/public transit. This is a HARD constraint that OVERRIDES the default MODE SELECTION RULES below.
  - Within-city movement: default to WALK for legs under 1 mile / 20 min, and METRO/TRAM/BUS for everything longer. Do NOT pick rideshare/taxi for any within-city leg unless walking + transit is genuinely impractical (late-night safety, heavy luggage on transfer day, accessibility need, or a venue with no transit within 0.8 mi). When you do fall back to rideshare, state the reason in the transport note ("metro doesn't run past 23:30 — rideshare back").
  - Between cities: train (or ferry where geographically required). Never rideshare/car_rental between cities when this preference is set.
  - In every applicable transport note, name the specific line/stop ("Metro Line A to Spagna", "Tram 8 from Trastevere to Largo Argentina") so the traveler can follow it.`;
            }
            if (m === 'walking' || m === 'walk') {
              return `\n- PRIMARY TRANSPORT — WALKING (user-selected): The traveler wants to walk this trip. Cluster every day's activities within a walkable footprint (each consecutive activity ≤ 1.2 mi from the previous one) so transport legs are walk-only. Only fall back to metro/tram/rideshare when a single leg genuinely exceeds 1.5 mi or terrain makes walking unreasonable; explain the fallback in the transport note. This OVERRIDES the default MODE SELECTION RULES below.`;
            }
            return `\n- Primary transport: ${modality} — build routes and day plans around this mode. This preference overrides the default MODE SELECTION RULES below when they conflict.`;
          })()
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

  // Note: there used to be a `priorityHighlights` block here that produced
  // per-priority sidebar reference cards (nature/history/etc.) for the
  // itinerary page. The sidebar redesign moved those priorities into the
  // daily activities themselves — the model weaves them into the itinerary
  // via the priority text blocks below (natureText, historyText, etc.) —
  // and the sidebar now only carries discovery add-ons (food/photo/
  // nightlife/shopping) in a unified Day Highlights section.
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
    ? `\n- PHOTOGRAPHY PRIORITY: Each activity description should note photographic potential with golden hour and blue hour timing, the best angles, and any access restrictions (tripod rules, drone restrictions, flash prohibited). Each day's photoSpots array should contain EXACTLY 2 entries: one iconic anchor location for that day's neighborhoods, and one off-the-beaten-path local view (rooftop, street mural, market scene, reflection, or hidden viewpoint most tourists miss). Note the best time of day to shoot each.`
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
    ? `\n- THEME PARK PRIORITY: This group wants to make the most of world-class theme parks and entertainment complexes. Include: major theme parks near the destination with strategy tips (arrive early, which rides or areas to prioritize first, best days of the week for shorter queues), water parks and seasonal parks in the area, after-dark park experiences where available, and any dining within the parks that genuinely stands out. Note whether Express Pass, Lightning Lane, or equivalent skip-the-line options are recommended and worth the cost. If the destination has multiple parks, suggest the best order and pacing across the trip. Include at least one non-park day activity nearby for variety and park-fatigue recovery.

THEME PARK DAY STRUCTURE — when a day's main draw is a theme park, follow these rules strictly:
  • One park per day MAXIMUM. Do not list multiple distinct parks on the same day even if they are nearby. Visiting two parks in one day is exhausting and unrealistic.
  • If theme parks are a TOP priority for this group, you MAY repeat the same park across two consecutive days (e.g. Disneyland day 3 + Disneyland day 4) when it has enough content to justify a second day. Different parks still go on different days.
  • Start time: the first activity of a park day must start AT OR JUST BEFORE the park's typical opening time. Use specific real opening hours when known (e.g. "08:00 — Park gates" / "09:00 — Indiana Jones Adventure"). Do not schedule any activities before park opening except short hotel-to-park transit.
  • The park visit IS the major activity of the day — name specific attractions/rides/shows by name as the day's activities (not "Spend the day at Disneyland"). Schedule 4-6 named in-park activities per day with realistic time slots.
  • Food on park days must be IN-PARK or within easy walking distance / free shuttle service from the park gate. Do NOT suggest restaurants that require driving, paid taxi, or significant transit — the group is committed to the park for the day. In-park dining picks should call out which lands/sections they're in (e.g. "Blue Bayou — New Orleans Square") so they fit the rider's path.
  • Schedule a midday rest / swim / relaxation break (90 min – 2 hr) — back to the hotel pool, a quiet park area, the resort spa, or a hotel air-conditioning break. Park days are physically demanding; this prevents the group from burning out by 4pm.${ageRanges.some(a => /under|kid|0-?5|6-?12|13-?17/i.test(a)) ? ' Especially important when traveling with children.' : ''}
  • Other (non-park) activities: keep these to a MINIMUM on park days. Don't pad the day with sightseeing or attractions — the park is the experience. The midday rest break and the evening section are the only non-park slots.
  • Evenings: shopping and dining go HERE, after the park closes (or after the family leaves the park). Suggest nearby shopping districts, restaurants outside the park gates, brewery / cocktail / nightlife spots, fireworks viewpoints, or quiet evening strolls. Don't load shopping/dining suggestions into the morning or midday — the group is in the park.
  • Individual attractions tied to a specific park (rides, character meet-and-greets, parade routes, fireworks shows inside the park) MUST NOT be suggested as standalone activities on a day when that parent park is NOT on the itinerary. The attraction is part of the park experience; without the park ticket and the park context, the suggestion is useless.`
    : '';

  // Family / Kids priority
  const familyText = priorities.includes('family')
    ? `\n- FAMILY & KIDS PRIORITY: This group is traveling with children — plan every day with this in mind. Include: age-appropriate attractions (zoos, aquariums, children's museums, interactive science centers, playgrounds, and parks), family-friendly dining where kids are welcome and the menu has options beyond chicken tenders, and activities with manageable durations (no more than 90 minutes per stop for younger children). Build each day with a rest window — avoid scheduling more than 3 activity blocks without a break. For each activity, note minimum age or height requirements, family ticket options or discount availability, and practical facilities (restrooms, stroller access, nursing areas). Include at least one genuine "wow moment" activity per day that will be memorable for kids of any age — something they'll still be talking about at dinner.`
    : '';

  // Budget-conscious priority. Kept for backward-compat: the 'budget'
  // chip was removed from the Trip Builder Top Priorities (2026-05-08)
  // because the budget-tier slider already covers cost preferences. New
  // trips will never set this flag, but trips generated before that
  // change can still re-trigger this prompt branch on regenerate.
  const budgetConsciousText = priorities.includes('budget')
    ? `\n- BUDGET-CONSCIOUS PRIORITY: This group wants to experience the destination without overspending. Prioritize: free and low-cost attractions (public parks, free museum days, self-guided walking tours, public viewpoints, beaches, local markets), street food and affordable neighborhood restaurants over tourist-facing dining (with specific dish recommendations to order), free or cheap public transport options with day pass tips, and any destination-specific money-saving strategies (city tourism cards, combo tickets, happy hour windows, free entry days at major attractions). For each paid activity, note the approximate entry price. Suggest at least one free or lower-cost alternative for any high-cost activity. Flag common tourist traps where visitors routinely overpay for a mediocre experience.`
    : '';

  // Accessibility priority. Kept for backward-compat: the 'accessibility'
  // chip was removed from the Trip Builder Top Priorities (2026-05-08)
  // because mobility needs are already collected via a dedicated builder
  // question. Same regenerate-only path as budgetConsciousText above.
  const accessibilityPriorityText = priorities.includes('accessibility')
    ? `\n- ACCESSIBILITY PRIORITY: This group includes travelers with mobility, sensory, or other accessibility needs — plan every activity with this as a baseline requirement. For every activity and venue, note: wheelchair and stroller accessibility (step-free entry, elevator or lift availability, accessible restrooms), availability of audio guides or assistive listening devices at museums and cultural sites, surface conditions for outdoor activities (paved paths vs. cobblestone vs. uneven terrain), and any alternatives for activities with limited accessibility. Prioritize venues with strong accessibility provisions. If the destination has known challenges (hilly terrain, cobblestone streets, limited elevator coverage), flag them explicitly and suggest practical workarounds. Include at least one activity per day that is fully accessible with no caveats.`
    : '';

  // ── Cacheable priority guidance ──────────────────────────────────────────────
  // These priority-conditional blocks are stable for the duration of a trip
  // generation: they depend ONLY on the user's selected priorities, never on
  // trip-specific values like destination, dates, group size, or places. We
  // concatenate them here and the call sites send them as a separate system
  // block with cache_control so multi-city segments, open-stream retries, and
  // continuation passes all hit the same cached prefix on Anthropic's side.
  // Excluded from this set: sportsText (interpolates destination), foodText
  // is included because it does NOT interpolate. Verify before adding any
  // future priority block — a single byte of trip-specific content makes the
  // whole prefix uncacheable.
  const cacheableGuidance = [
    foodText,
    photoText,
    natureText,
    nightlifeText,
    historyText,
    wellnessText,
    shoppingText,
    adventureText,
    cultureText,
    beachText,
    themeParkText,
    familyText,
    budgetConsciousText,
    accessibilityPriorityText,
  ].filter(Boolean).join('');

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

  // Hotel recommendation context (only when no hotel is pre-booked).
  //
  // Trip Builder collects budget PER PERSON (Step 7 is explicitly labeled
  // "Budget Breakdown (per person)"). For hotels we need the per-ROOM nightly
  // budget to pick the right tier — a 4-person group at $150/person/night
  // can afford a $600/night room, not a $150/night room. Multiply by
  // groupSize before classifying. Stays use trip nights (length - 1) since
  // the last day is typically a check-out morning.
  const needsHotelSuggestions = !hasPreBookedHotel;
  const tripNights = Math.max(1, tripLength - 1);
  const hotelBudgetPerNightPerPerson = Math.round((budgetBreakdown.hotel ?? 0) / tripNights);
  const hotelBudgetPerNightPerRoom = hotelBudgetPerNightPerPerson * Math.max(1, groupSize ?? 1);
  // Tier thresholds reflect typical PER-ROOM market pricing (room rate,
  // not per-person share). Was previously bucketed off per-person budget,
  // which silently under-tiered every group trip.
  const hotelPriceTier = hotelBudgetPerNightPerRoom < 100
    ? 'budget ($)'
    : hotelBudgetPerNightPerRoom < 250
    ? 'mid-range ($$)'
    : hotelBudgetPerNightPerRoom < 500
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

  // Meal price level based on budget tier (was previously keyed off
  // "explorerPct" — same slider, fixed semantics: high tier = nicer meals).
  // Per Brandon's note 2026-05-11: cap mid/comfort at $$$ explicitly so
  // the AI stops occasionally writing $$$$ on default-budget trips.
  // Only LUXURY tier may hit priceLevel 4, and only at dinner (where
  // Michelin / tasting-menu picks belong).
  const mealPriceLevels = budgetTierLevel < 30
    ? { breakfast: 1, lunch: 1, dinner: 2 }
    : budgetTierLevel < 60
    ? { breakfast: 1, lunch: 2, dinner: 2 }
    : budgetTierLevel < 85
    ? { breakfast: 2, lunch: 2, dinner: 3 }
    : { breakfast: 2, lunch: 3, dinner: 4 };

  // Hard ceiling on priceLevel across all restaurant activities, enforced
  // both in the prompt (Rule 4) and in a server-side clamp after streaming.
  // Tiered so $$$/$$$$ are reserved for higher budgets — previously every
  // tier below LUXURY shared a $$$ ceiling, so mid-budget ("middle of the
  // slider") trips still drifted into $$$ restaurants:
  //   BUDGET / MID (<60) → $$ max · COMFORT (<85) → $$$ · LUXURY (>=85) → $$$$
  const maxRestaurantPriceLevel = budgetTierLevel < 60 ? 2 : budgetTierLevel < 85 ? 3 : 4;
  // Michelin / tasting-menu language is allowed only at LUXURY tier;
  // at every other tier the prompt explicitly forbids it.
  const michelinAllowed = budgetTierLevel >= 85;

  // Accessibility / pace walking rule. Most-restrictive wins: explicit
  // mobility needs > elderly (65+) > default. Even without an explicit
  // accessibility selection, an elderly traveler tightens the walking budget
  // because the default 4-mile/day limit is unrealistic for many seniors.
  //
  // Match by keyword rather than exact label so the rule survives wizard
  // copy changes ("Wheelchair access" vs "Wheelchair accessible" etc.) and
  // catches any near-miss phrasing the user might encounter.
  const hasLimitedMobility = accessibilityNeeds.some(n => {
    const lc = (n ?? '').toLowerCase();
    return lc.includes('wheelchair') || lc.includes('mobility') || lc.includes('cane') || lc.includes('walker');
  });
  const hasElderly = ageRanges.includes('65+');
  const hasSeniors = hasElderly || ageRanges.includes('51-65');
  const walkingRuleText = hasLimitedMobility
    ? `MOBILITY NEEDS ACTIVE: Walking segments must be under 0.25 miles (0.4 km) each, and total walking across the entire day must not exceed 1 mile (1.6 km). Use rideshare or taxi for any activity pair more than 0.25 miles apart. Choose tightly clustered activities and plan transport between every location. Do not rely on "short walks" — be explicit with mode of transport for every segment.`
    : hasElderly
    ? `ELDERLY MEMBERS (65+) IN GROUP — RESTRICTED WALKING: walking segments under 0.5 miles (0.8 km) each, total daily walking under 2 miles (3.2 km). Insert a transport leg (taxi, rideshare, metro, or bus) between any pair of activities more than 0.5 miles apart. Prefer venues with elevators or step-free entry, indoor seating, and accessible restrooms. Pace must be relaxed — schedule sit-down breaks (afternoon coffee, garden bench, shaded plaza) between high-energy activities.`
    : `HARD WALKING LIMIT: No single walking segment between consecutive activities may exceed 1 mile (1.6 km). This is a firm limit — if two activities are farther apart than 1 mile, you MUST insert a transport leg (taxi, rideshare, metro, or bus) between them. Total walking across the day should not exceed 4 miles (6.5 km). Cluster activities geographically whenever possible.`;

  // Group-type tone — friends/family/business/couple/solo each shape the
  // itinerary's vibe in concrete ways beyond the meetup-skip rule for
  // solo/couple. Was previously only surfaced as the bare "Group type: friends"
  // line in trip details; now actively guides venue selection.
  const groupTypeKey = (groupType || 'friends').toLowerCase();
  const groupTypeText = (() => {
    switch (groupTypeKey) {
      case 'solo':
        return '\n- SOLO TRAVELER vibe: optimize for the lone-traveler experience. Favor venues welcoming to dining alone (counter seating, communal tables, lively bars). Include a few low-pressure social touchpoints when the priorities align (group cooking class, brewery tour, walking tour with strangers). Avoid "for the group" excursions that assume a party.';
      case 'couple':
        return '\n- COUPLE vibe: lean toward intimate, romance-friendly experiences — quiet restaurants over loud group spots, sunset views, scenic walks, shared activities. Build in private moments (a sunset cocktail, a slow morning) instead of packed group events.';
      case 'family':
        return '\n- FAMILY vibe: every shared activity must be family-appropriate regardless of specific ages — high-chair seating where kids are present, accessible restrooms, manageable distances, predictable food (something kid-pleasing on the menu). Avoid late-night spots and adult-only venues from the shared track. Use split tracks when ages indicate older kids/teens to give parents an adults-only window.';
      case 'business':
        return '\n- BUSINESS vibe: assume tight schedules and limited free windows. Prefer venues within walking distance of the hotel, fast and consistent service (highly-reviewed established restaurants over experimental spots), and modular short-block activities rather than long booked excursions. Build flexibility — the user may need to step away for a call.';
      case 'friends':
      default:
        return '\n- FRIENDS GROUP vibe: prioritize social, group-friendly venues — restaurants that take reservations for parties, bars with shared energy, group activities (cooking class, boat day, brewery tour), food spots with shareable plates. Avoid intimate-couple-only venues on shared days.';
    }
  })();

  // Senior-without-65+-elderly (51-65 only) — relaxed pace cue without
  // hard-restricting walking. The 65+ branch above already covers tighter
  // limits.
  const seniorPaceText = hasSeniors && !hasElderly
    ? '\n- SENIOR MEMBERS (51-65) PRESENT: build in pacing — sit-down lunch instead of grab-and-go, an afternoon coffee/break window, walking segments under 1 mile each. Avoid back-to-back high-intensity activities and 9pm+ dinners.'
    : '';

  // The wizard's "I have flexible dates" toggle means the user opted into a
  // length-only flow — the dates the API receives are server-side defaults
  // (e.g. 2026-09-15), not user-chosen. Without this hint, the model treats
  // those defaults as hard requirements and won't suggest better timing.
  const flexibleDatesText = flexibleDates
    ? `\n- FLEXIBLE DATES: The traveler has not committed to specific dates — the dates above are placeholder defaults. Treat the trip length (${tripLength} days) as the firm constraint, and feel free to recommend a better season or month for ${destination} where it would meaningfully improve the experience (better weather, fewer crowds, key seasonal events). Note any timing recommendation prominently in the practicalNotes so the traveler can choose dates accordingly.`
    : '';

  const userPrompt = `Generate a ${tripLength}-day travel itinerary for the following trip:

TRIP DETAILS:
- Destination: ${destinations.length >= 2 ? `Multi-city — ${destinations.join(' → ')}` : destination}
- Dates: ${startDate} to ${endDate} (${tripLength} days)
${startDate ? `- Day-by-day calendar (use this to match each venue's per-weekday opening hours to the actual day — do NOT rely on your own date arithmetic):\n${buildWeekdayMap(startDate, tripLength)}` : ''}
- Group type: ${groupType || 'friends'}
- Group size: ${groupSize ?? 1} ${(groupSize ?? 1) === 1 ? 'person' : 'people'}
- Budget (per person, USD): $${budget.toLocaleString()}
  - Flights: $${budgetBreakdown.flights ?? 0} per person
  - Hotel: $${budgetBreakdown.hotel ?? 0} per person ($${hotelBudgetPerNightPerPerson}/night per person, $${hotelBudgetPerNightPerRoom}/night per room for the ${groupSize ?? 1}-person group → ${hotelPriceTier})
  - Food: $${budgetBreakdown.food ?? 0} per person ($${dailyFoodBudget}/day per person)
  - Experiences: $${budgetBreakdown.experiences ?? 0} per person ($${dailyExperiencesBudget}/day per person)
  - Transport: $${budgetBreakdown.transport ?? 0} per person
- Priorities: ${priorityText}
- Age ranges in group: ${ageRanges.length > 0 ? ageRanges.join(', ') : '18-35'}
- Accessibility needs: ${accessibilityText}
- Travel style / budget tier: ${travelStyleText}${groupTypeText}${seniorPaceText}${localModeText}${dateNightText}${flexibleDatesText}${modalityText}${accommodationText}${sportsText}${mustHaveText}${additionalContext ? `\n- ADDITIONAL NOTES FROM THE TRAVELER (treat these as high-priority preferences that should shape the itinerary): ${additionalContext}` : ''}${referenceContent ? `\n- REFERENCE MATERIAL THE TRAVELER SAVED (from links they bookmarked for this trip — draw on the specific, practical ideas here (places, neighborhoods, dishes, local tips) where they fit the priorities and dates; treat it as inspiration, NOT fixed requirements, and ignore anything off-topic, promotional, or impractical): ${referenceContent}` : ''}${organizerPaceText}${personaText}${preBookingText}${multiCityText}${featuredSeedText}

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
- Each venue's opening hours are listed per weekday (e.g. "Monday: 11:00 AM – 9:00 PM"). The "Day-by-day calendar" above tells you the exact weekday of each day's date — use it to pair the right weekday's hours to the right day. Do NOT compute the weekday yourself; rely on the calendar.
- A venue with "Mondays: Closed" cannot be scheduled on a day whose date falls on a Monday. Pick a different venue.
- A restaurant closed before 10:00 AM cannot be breakfast. One opening at 5:00 PM cannot be lunch.
- If hours are not listed for a venue, apply common-sense defaults (restaurants: noon–10 PM; parks/outdoor sites: all day).
- Do NOT schedule any venue outside its listed hours even if it creates a scheduling gap — fill gaps with a venue that IS open.

QUALITY & CURATION RULES (travel agent standard):
- All venues are pre-filtered for quality (minimum rating + review count). Prefer venues with more reviews when choosing between similar options.
- Match price level to the trip budget. The hotel tier for this trip is ${hotelPriceTier} (per-room budget $${hotelBudgetPerNightPerRoom}/night). Restaurants and activities should match the same overall price band — venues marked $$$$ are not appropriate for budget trips, and $ dive bars / chain food courts are not appropriate for luxury-tier trips. Read the user's budget and select accordingly.
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
  "foodieTips" — since food is a top priority, include this array on EVERY day with EXACTLY 2 bonus finds specific to that day's neighborhoods. Schema:
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
  "nightlifeHighlights" — since nightlife is a top priority, include this array on EVERY day with EXACTLY 2 evening venues anchored to that day's neighborhoods (where the group spent the day or will end the day):
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
    Rules: (1) All venues must be real and specifically named — no invented bars. (2) Geographically anchored to where the group is that day — no recycled city-wide picks across days. (3) Vary the type across the trip — don't repeat the same category two days in a row, and aim for a mix overall (live music, cocktail bar, locals-only spot, etc.). (4) Write "vibe" with personality — specific, atmospheric, opinionated. (5) No tourist-trap venues — the list should read like a local's guide.` : ''}
${hasShoppingPriority ? `
  "shoppingGuide" — since shopping is a top priority, include this array on EVERY day with EXACTLY 2 curated shopping spots anchored to that day's neighborhoods:
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
    Rules: (1) Prioritize local and independent over international chains. (2) Geographically anchored to where the group is that day — no recycled city-wide picks across days. (3) Vary the type across the trip — aim for a mix overall (one food/produce market, one craft or artisan market, one neighborhood to browse, etc.) without repeating the same category two days in a row. (4) Include specific items or products to look for — don't be generic. (5) Be real and accurately named.` : ''}
    {
      "currency": "Local currency name, symbol, approximate USD exchange rate, and whether cards are widely accepted or cash is preferred",
      "tipping": "Local tipping customs and typical amounts or percentages by context (restaurant, taxi, hotel)",
      "customs": "2-3 key cultural customs, dress codes (e.g. covering shoulders at religious sites), or etiquette points travelers should know",
      "entryRequirements": "Visa/entry requirements for ${passportClause} traveling to this destination (if it's a domestic trip within their own country, say plainly that no visa or passport is needed), plus any biometric/registration requirements. For Schengen Area destinations: note the EU Entry/Exit System (EES) — first-time visitors must register fingerprints and a facial photo at the border; allow extra time at entry points.",
      "safetyTips": "Top 2-3 practical safety or health tips specific to this destination (e.g. tap water safety, common scams, areas to avoid at night)",
      "usefulPhrases": ["Local phrase = English meaning", "Local phrase = English meaning", "Local phrase = English meaning"]
    }
  "departureInfo" — a one-time block of headed-home logistics for the trip's last day (only on day 1, omit from all other days). Render target: the LAST day of the trip in the UI. Schema:
    {
      "airport": "Name + IATA code of the airport the group flies out of (e.g. 'Glasgow International (GLA)'). If the trip has no return flight (road trip, end-of-trip is checkout, etc.), set to null.",
      "recommendedArrival": "How early to arrive at the airport — distinguish domestic vs international where relevant (e.g. 'Arrive 2 hours before domestic, 3 hours before international flights')",
      "transitTip": "Best way to get to the airport from the last day's likely neighborhood — name the actual rail line, bus route, or airport shuttle, and rough cost/time (e.g. 'The Express bus from Buchanan St. takes 25 min for £8 — faster and cheaper than a taxi for a single traveler')",
      "lastDayTimingTip": "Practical guidance on when to leave the city given common flight times — e.g. 'For afternoon transatlantic flights, plan to wrap up activities by 11am and head airport-ward by noon'",
      "customsTips": "Specific to flying OUT of this destination back to the US/EU/UK — duty-free allowances on local items (cheese, alcohol, leather, etc.), restricted items that may be confiscated, agricultural / wildlife product warnings, and any country-specific exit tax or VAT-refund process worth knowing",
      "luggageStorageTip": "If the last day is long and the hotel checkout is early (typical 11am), where can the group store bags? Hotel concierge bag-drop is the default; mention named local left-luggage services or train station lockers if they're notably better."
    }

[
  {
    "title": "Evocative trip name here (day 1 only)",
    "practicalNotes": { ... (day 1 only) },
    "departureInfo": { ... (day 1 only — used on the trip's last day in the UI) },${hasNightlifePriority ? `
    "nightlifeHighlights": [ ... (EVERY day — exactly 2 venues anchored to this day's neighborhoods) ],` : ''}${hasShoppingPriority ? `
    "shoppingGuide": [ ... (EVERY day — exactly 2 spots anchored to this day's neighborhoods) ],` : ''}
    "day": 1,
    "date": "${startDate}",
    "city": "Primary city or town for this day (e.g. 'Paris', 'Reykjavik', 'Kyoto') — used for per-day weather. For day trips from a base city, use the base city.",
    "theme": "Evocative 3-5 word theme for the day",
    "photoSpots": [
      {
        "name": "Specific viewpoint or location name (EXACTLY 2 entries per day — anchored to this day's neighborhoods)",
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
   → Place WITHIN COMFORTABLE WALKING DISTANCE OF THE HOTEL (≤ 0.6 mi / 10 min walk). Travelers want to bookend the night close to where they're sleeping so they don't end the evening with a long ride home tired/half-drunk. If a special-occasion or destination-defining dinner has to be elsewhere, that's a once-a-trip exception — every OTHER night's dinner anchors near the hotel. Breakfast also defaults near the hotel (Rule 1 above); this dinner rule mirrors that so the day OPENS and CLOSES at home base.
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

DAILY BUDGET ENFORCEMENT — these are the user's explicit budget limits and must be respected:
- FOOD: $${dailyFoodBudget} per person per day. The sum of costEstimate values across the 3 restaurant activities (breakfast + lunch + dinner) MUST be ≤ $${dailyFoodBudget}. Pick venues whose realistic per-person bill fits — fine-dining steakhouses don't fit a $40/day food budget; street food and casual cafes don't fit a $300/day food budget either (a luxury food budget should buy luxury meals). Match the level.
- EXPERIENCES: $${dailyExperiencesBudget} per person per day. The sum of costEstimate values across non-restaurant activities MUST be ≤ $${dailyExperiencesBudget}. If free activities exist (free museums, walking tours, parks, viewpoints) use them to balance pricier ones.
- HOTEL TIER: ${hotelPriceTier}. The group's per-room nightly budget is $${hotelBudgetPerNightPerRoom}. Hotel pricePerNight in hotelSuggestions must be ≤ $${hotelBudgetPerNightPerRoom} (per room) and within the ${hotelPriceTier} band. Do not suggest properties that would visibly exceed this budget.
- VENUE SELECTION: When a budget is luxury-tier, lean upscale (skip dive bars and budget eateries). When a budget is budget-tier, lean local (skip $$$$ tasting menus). The traveler set this budget deliberately.

RULES:
1. Use REAL venue names and real addresses for ${destination}
2. Include 4-6 activities per day total (including the 3 required meals), spread naturally across the day. EVERY day's schedule MUST extend from morning through evening — never end a day's activity list at midday or early afternoon. The last activity of every day should fall in the late afternoon, evening, or night (typically the dinner restaurant or a post-dinner experience). If you find yourself running out of room while emitting a day, drop a sidebar entry (one nightlifeHighlight, one shoppingGuide entry, one photoSpot) BEFORE you cut activities short.
3. timeSlot format must be "HH:MM–HH:MM" using an en-dash (–)
4. priceLevel: 0=free, 1=$, 2=$$, 3=$$$, 4=$$$$. **HARD CEILING: for restaurant activities on this trip, priceLevel MUST be ≤ ${maxRestaurantPriceLevel}.** Do not emit priceLevel 4 unless the budget tier is LUXURY. Budget and mid-range trips should center on $ and $$ (never $$$ or $$$$); comfort trips may add $$$; only LUXURY uses $$$$. Michelin-starred or tasting-menu restaurants ${michelinAllowed ? 'are explicitly welcome on this trip (LUXURY tier)' : 'must NOT appear on this trip — pick neighborhood favorites, local institutions, and well-reviewed mid-tier spots instead'}.
5. costEstimate is per-person in USD
6. id format: "act_d{dayNumber}_{index}" (e.g. act_d1_1, act_d1_2)
7. Day themes should be evocative and specific: "Golden Circle & Geysers" not "Sightseeing Day"
8. Vary the pace — not every day should be packed. Include slower, wandering time.
9. The first and last days should account for travel/arrival/departure logistics
10. meetupTime and meetupLocation are the MORNING departure point — the place where the whole group gathers at the start of the day before heading out. meetupLocation must ALWAYS be the hotel lobby (e.g. "Hotel lobby" or "[Hotel Name] lobby"). meetupTime must equal the timeSlot start of the very FIRST activity of that day (e.g. if the day's first activity starts at "09:00", meetupTime is "09:00"). Never set meetupTime to a time after the first activity starts — the group meets first, then heads out. Do NOT generate a "Group Meetup" activity in the tracks array; use meetupTime/meetupLocation exclusively. For solo or couple trips (groupType "solo" or "couple"), set meetupTime and meetupLocation to null on every day — group meetup points are irrelevant for individual travelers.
11. photoSpots: REQUIRED on every itinerary, every day — include 1-3 per day regardless of whether photography is a selected priority. Always include the destination's iconic must-photograph landmarks (e.g. Trevi Fountain in Rome, Eiffel Tower in Paris, Hagia Sophia in Istanbul) as the primary spot on the relevant day. These are the shots every visitor wants and they must not be omitted. Pair each with a specific time of day (sunrise/golden hour/blue hour/midday) and one actionable shooting tip (best angle, where to stand, what to frame). Additional spots can be local or lesser-known but the famous landmark always anchors the list.
12. packingTips: for any outdoor, hiking, excursion, tour, or physical activity include 2-4 short packing tips (e.g. "Wear sturdy walking shoes", "Bring a water bottle", "Sunscreen essential"). Leave empty array [] for restaurants, museums, and low-key activities.
13. Respect the budget tier above — match every venue, hotel, and activity to that comfort level. For LUXURY tier, lean upscale (skip dive bars, hostels, fast food, $ casual). For BUDGET tier, lean local-value (skip Michelin tasting menus, $$$$ resorts, private guided tours). MID-RANGE and COMFORT should mix appropriately. Exploration appetite (hidden gems vs iconic sights) is shaped by the priorities array and localMode flag — not this slider.
14. Age ranges present: ${ageRanges.length > 0 ? ageRanges.join(', ') : '18-35'} — if children (Under 12 or 12-17) are in the group, ensure all shared-track activities are family-appropriate. Use split tracks to give adults-only options in the afternoon when children are present alongside adults.
15. "title", "practicalNotes", and "departureInfo" fields appear ONLY on day 1. All other day objects must not include these fields.
16. NEVER INVENT SCHEDULED EVENTS: Do not assign a specific scheduled game, concert, festival, or live performance to a specific date unless it is a recurring, date-independent, permanent offering (e.g. a weekly farmers market, a permanent museum exhibit). For any live event venue, describe it and direct travelers to the official website or a ticketing platform (Ticketmaster, AXS, SeatGeek) to check current dates. This rule overrides any priority or must-have instruction.
17. destinationTip: include on EVERY day object — one punchy, specific insider fact about the destination for that day's city. Rotate the topic across days (food, drink, tradition, cultural quirk, etc.). Never repeat the same topic two days in a row.
18. trackALabel and trackBLabel must be IDENTICAL strings on every day that has a split. Decide the label pair once for the whole trip and repeat it exactly on every split day — never rename or rephrase a track label between days.
19. PER-DAY DISCOVERY ARRAYS — these are MANDATORY on every day they apply to. Each day MUST include the FULL array, populated with the required number of items, BEFORE the day's closing brace. Do NOT emit a day with these arrays missing or empty when their priority is set — a day without them is INVALID and will be rejected. ${hasFoodPriority ? `When food priority is set, every day MUST include "foodieTips" with EXACTLY 2 entries anchored to that day's neighborhoods. ` : ''}${hasNightlifePriority ? `When nightlife priority is set, every day MUST include "nightlifeHighlights" with EXACTLY 2 entries anchored to that day's neighborhoods. ` : ''}${hasShoppingPriority ? `When shopping priority is set, every day MUST include "shoppingGuide" with EXACTLY 2 entries anchored to that day's neighborhoods. ` : ''}Always emit these arrays inline within their day object on the FIRST emission — never defer to a later pass.
20. FLAGSHIP / ANCHOR ATTRACTIONS — every destination has 1–3 must-see anchor venues that define a trip there. Florence → Uffizi Gallery + Accademia (David). Rome → Colosseum + Vatican Museums + Pantheon. Paris → Louvre + Eiffel Tower + Notre-Dame area. London → British Museum + Tower of London. Amsterdam → Rijksmuseum + Van Gogh Museum. Madrid → Prado. Athens → Acropolis + Acropolis Museum. Vienna → Schönbrunn + Kunsthistorisches. Barcelona → Sagrada Família + Park Güell. Tokyo → Senso-ji + a major museum (Mori Art / TeamLab / National Museum). NYC → Met + MoMA + Statue of Liberty. DC → Smithsonian (at least one). Cairo → Egyptian Museum + Pyramids. Whatever the city, identify its flagship museum / art-and-history anchor and its flagship landmark and INCLUDE THEM as scheduled activities unless the user has explicitly opted out (e.g. they checked "I've been here before — focus on hidden gems" or chose only nightlife/beach priorities with no culture/history/family). For ${destination} specifically, identify the 1–3 flagship anchors and place them on appropriate days. A trip to Florence that omits the Uffizi is a defective trip.
21. THEMED / NICHE REQUESTS — ANTI-HALLUCINATION: When the user's must-haves or additional notes mention a specific theme, film, book, video game, fandom, or niche cultural reference (e.g. "Angels & Demons locations", "Harry Potter spots in Edinburgh", "filming locations from a movie", "tracks from a documentary", "a specific historical figure's footsteps"), apply these rules:
  - Only include venues that are REAL, NAMED, and that you are HIGHLY CONFIDENT actually appear in the source work or are documented as connected to it. The bar is "I could point this out to a fan and they'd recognize it" — not "this seems plausible".
  - If you are not certain a specific location is genuinely tied to the theme, OMIT IT. It is far better to suggest fewer real spots than to invent or guess at thematic connections. A made-up "filming location" or "the chapel from chapter 7" that doesn't actually exist destroys traveler trust.
  - For each themed venue you include, briefly state the CONCRETE connection ("Santa Maria del Popolo — the 'Earth' altar in Angels & Demons; the Chigi Chapel is here", not "featured in the book"). If you can't articulate the specific connection, drop it.
  - If the theme has fewer real anchor locations than the user expects (e.g. the Angels & Demons "Path of Illumination" only has 4 real Roman churches), be honest — include those 4 and don't pad. Tell the user the theme has limited verified spots in the day's destinationTip or a practical note rather than inventing more.
  - This rule OVERRIDES any pressure to fill must-have count quotas. Empty is better than fabricated.
22. VENUE OPERATING STATUS — closed-business safeguard:
  - For restaurants, bars, cafés, smaller indie attractions, and themed/niche spots: when the REAL VENUES list above includes options, PREFER those over venues drawn from training-data memory. The Places list is freshness-filtered; your training data is not — restaurants close, change ownership, or rebrand often, and a venue you remember as great may be permanently shut.
  - If you must reach beyond the list (sparse data for a small town), only suggest establishments you are HIGHLY CONFIDENT are still operating today. When in doubt, fall back to a more durable option — a museum, market, public park, well-known neighborhood walk, or a long-established institution — rather than a specific small business you can't be sure is still open.
  - For very large or niche venues (single-location attractions, theme-park-specific restaurants, festival-only pop-ups), state in the activity description that travelers should verify current operating status on the official website before going, if there is any doubt.
  - This rule applies to attractions too: an attraction you remember as open may have closed permanently. If you are not confident a niche attraction is still operating, omit it.${dailyOutlinesText ? dailyOutlinesText : ''}
${getSeasonalContext(startDate, destination)}

Return ONLY the JSON array. No markdown. No explanation. Start with [ and end with ].`;

  return { user: userPrompt, cacheableGuidance };
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
  // the invite flow OR completed the standalone preferences mini-wizard, fetch
  // their saved preferences. These feed into the prompt as:
  //   - priorities → split-track suggestions when divergent
  //   - dietary tags → hard constraint on food venues
  //   - accessibility needs → hard constraint on every shared activity
  //   - budgetPerDay → most-restrictive wins for food venues only
  //   - pace → calibrates daily activity density per member
  let memberPersonas: Array<{
    name: string;
    priorities: string[];
    pace?: string;
    curiosity?: string;
    dietary?: { tags: string[]; notes?: string };
    accessibility?: { needs: string[]; notes?: string };
    budgetPerDay?: number;
  }> = [];
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
            // Pull the structured TripMemberPreferences fields when present.
            // Legacy guest-form rows only have priorities + curiosity — those
            // still work; the optional fields are simply absent.
            const dietaryRaw = prefs.dietary as { tags?: unknown; notes?: unknown } | undefined;
            const accessRaw  = prefs.accessibility as { needs?: unknown; notes?: unknown } | undefined;
            memberPersonas.push({
              name: m.name ?? 'A member',
              priorities: prefs.priorities as string[],
              pace: typeof prefs.pace === 'string' ? prefs.pace : undefined,
              curiosity: typeof prefs.curiosity === 'string' ? prefs.curiosity : undefined,
              dietary: dietaryRaw && Array.isArray(dietaryRaw.tags)
                ? { tags: dietaryRaw.tags as string[], notes: typeof dietaryRaw.notes === 'string' ? dietaryRaw.notes : undefined }
                : undefined,
              accessibility: accessRaw && Array.isArray(accessRaw.needs)
                ? { needs: accessRaw.needs as string[], notes: typeof accessRaw.notes === 'string' ? accessRaw.notes : undefined }
                : undefined,
              budgetPerDay: typeof prefs.budgetPerDay === 'number' ? prefs.budgetPerDay : undefined,
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

  // ── Role gate (when tripId present) ──────────────────────────────────────
  // AI builds are organizer/co-organizer only — Brandon's product call
  // (2026-05-16): we don't want plain members on a Trip Pass trip to be
  // able to burn through the 50-credit pass pool with rapid-fire builds.
  // When tripId is absent (rare, legacy/no-skeleton path) we fall through
  // to the personal credit gate as before.
  if (requestBodyTripId) {
    const adminClient = createAdminClient();
    const role = await getTripRole(adminClient, requestBodyTripId, auth.ctx.userId);
    if (role !== 'organizer' && role !== 'co_organizer') {
      return NextResponse.json(
        {
          error: 'AI_ROLE_REQUIRED',
          message: 'Only the trip organizer (or co-organizer) can trigger AI builds. Ask them to do it for you.',
        },
        { status: 403 },
      );
    }
  }

  // ── Credit gate ──────────────────────────────────────────────────────────
  // Charge 25 credits per generate-itinerary call (the AI_CREDIT_COSTS
  // entry, repriced 2026-05-16 to match real cost incl. post-gen Places
  // verification). Free tier (25 credits/mo) gets exactly one generation
  // per month. The increment happens just before the SSE 'done' event —
  // if the stream errors out mid-way, no charge.
  //
  // When tripId is supplied AND the trip has an active Trip Pass, the gate
  // charges the pass's 50-cr pool instead of the user's personal credits.
  // See lib/supabase/aiCredits.ts for the pass-pool branch.
  //
  // KNOWN LIMITATION: client-side chunking for long trips and multi-city
  // calls this route once per chunk, so a 3-city trip = 3 separate
  // generate-itinerary calls = 75 credits total. Free users with multi-
  // city would 402 on the second chunk. Multi-city is a paid feature
  // anyway (canSplitTracks gate runs upstream), so this is mostly
  // theoretical for free tier — but explorer (100/mo) and nomad (250/mo)
  // can absorb the per-chunk charge fine.
  const credits = await checkAiCredits(auth.ctx.userId, userTier, 'itinerary_generate', requestBodyTripId);
  if (!credits.ok) return credits.response;

  // ── City segment mode — generate one city's days at a time ─────────────────
  // When citySegment is provided, we focus this call on one chunk of the trip:
  //  - For multi-city trips, a chunk is a city's days (e.g. days 4–6 in Rome
  //    of an 8-day Paris → Rome trip).
  //  - For long single-city trips, a chunk is a 3-day slice of the same city
  //    (e.g. days 4–6 of a 10-day Tampa stay), with `sameCity: true`.
  //
  // Chunking is what keeps each call well under Vercel's 300s function cap.
  // The client orchestrates the sequence (see streamSegment in itinerary page);
  // each chunk is its own HTTP request with its own 300s budget, so the global
  // ceiling becomes effectively infinite.
  //
  // sameCity     — true when this chunk is a continuation of the same city
  //                (no arrival/check-in framing). Drives the continuity prompt.
  // totalTripDays — the FULL trip length, so the server can tell whether the
  //                final day of this chunk is also the final day of the trip
  //                (departure framing only when true).
  // excludeVenues — names of venues / restaurants / activities / photo spots /
  //                bars / shops that have ALREADY appeared on earlier chunks.
  //                Each Anthropic call only sees its own chunk's prompt — the
  //                model has no other knowledge of prior days, so without this
  //                list it freely re-suggests the same museum / bar / market
  //                across chunks. We inject a "DO NOT REUSE" section so the
  //                model picks fresh alternatives.
  const citySegment = body.citySegment as {
    cityName: string;
    dayStart: number;
    dayCount: number;
    prevContext?: string;
    sameCity?: boolean;
    totalTripDays?: number;
    excludeVenues?: string[];
    excludeRestaurants?: string[];
  } | undefined;

  // Resolve effective params — citySegment overrides some body fields
  const resolvedDestination = citySegment?.cityName ?? (body.destination as string);
  const resolvedTripLength  = citySegment ? citySegment.dayCount : requestedLength;
  const resolvedStartDate   = (() => {
    if (!citySegment || citySegment.dayStart <= 1) return body.startDate as string;
    const d = new Date((body.startDate as string) + 'T12:00:00');
    d.setDate(d.getDate() + citySegment.dayStart - 1);
    return d.toISOString().split('T')[0];
  })();
  const resolvedEndDate = (() => {
    if (!citySegment) return body.endDate as string;
    const d = new Date((body.startDate as string) + 'T12:00:00');
    d.setDate(d.getDate() + citySegment.dayStart - 1 + citySegment.dayCount - 1);
    return d.toISOString().split('T')[0];
  })();
  // dayOffset: how many days to add to AI-returned day numbers (0-indexed segment → full-trip numbering)
  const dayOffset = citySegment ? citySegment.dayStart - 1 : 0;

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
  // Rule 19 mandates per-day discovery arrays (foodieTips / nightlifeHighlights /
  // shoppingGuide) inline when those priorities are set. Each populated array
  // adds ~600-900 tokens per day. Without budget headroom the model hits
  // stop_reason=max_tokens mid-day-3 of a chunk, the parser drops the partial
  // day, and the user sees a 2-of-3 day output (Dublin truncation root cause).
  //
  // QA 5/10 update: Brandon flagged "days cut off pretty early in the day like
  // 12:30 PM" on longer itineraries. Suggests max_tokens hit MID-day, not just
  // mid-chunk — so even a 3-day chunk with budget for 3 days isn't enough when
  // each day has heavy discovery + split tracks + photo spots + transport.
  // Bumped tokensPerDay floor from 10K → 13K (single-city) and 11K → 14K
  // (multi-city). Per-chunk floor bumped 36K → 48K when 2+ discovery priorities,
  // 12K → 24K otherwise.
  const inboundPriorities = Array.isArray(body.priorities) ? (body.priorities as string[]) : [];
  const discoveryPriorityCount = ['food', 'nightlife', 'shopping'].filter(p => inboundPriorities.includes(p)).length;
  const tokensPerDay = isMultiCity
    ? 14000 + discoveryPriorityCount * 1000
    : 13000 + discoveryPriorityCount * 1000;
  // Per-chunk floor needs to clear the worst-case 3-day discovery chunk
  // (~16K × 3 = 48K) so even maxed-out priority days finish.
  const chunkFloor = citySegment
    ? (discoveryPriorityCount >= 2 ? 48000 : 24000)
    : 32000;
  const maxTokens = Math.min(64000, Math.max(chunkFloor, resolvedTripLength * tokensPerDay));

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

  // In city-segment mode, narrow places to only the segment's city and disable multi-city routing
  const resolvedRealPlaces = citySegment
    ? (multiCityPlaces?.[citySegment.cityName] ?? realPlaces)
    : realPlaces;
  const resolvedMultiCityPlaces = citySegment ? null : multiCityPlaces;

  // Mirror of the buildPrompt-internal tier cap so the stream-side
  // clampPriceLevels can enforce the same ceiling without a re-export.
  // budgetTierLevel defaults to 50 (MID-RANGE) when curiosityLevel is
  // missing — matches buildPrompt's `curiosityLevel ?? 50`.
  const streamBudgetTier = (body.curiosityLevel as number | undefined) ?? 50;
  const maxRestaurantPriceLevel = streamBudgetTier < 60 ? 2 : streamBudgetTier < 85 ? 3 : 4;

  // Featured Itinerary backbone: when the user comes from "Start planning
  // this trip" on /discover/[slug], Trip Builder sends featuredSlug. We
  // fetch the editorial picks here so they can be injected into the
  // prompt as the EDITORIAL BACKBONE section. Server-side fetch via
  // admin client (featured_itineraries is public-read but admin
  // bypasses any future restrictions). Failures are silent — a missing
  // featured itinerary just falls back to the normal AI build with no
  // backbone seeding.
  type FeaturedSeed = NonNullable<Parameters<typeof buildPrompt>[0]['featuredSeed']>;
  let featuredSeed: FeaturedSeed | null = null;
  const featuredSlug = typeof body.featuredSlug === 'string' ? body.featuredSlug : null;
  // Only seed on the first segment of a multi-city / chunked build so we
  // don't paste the entire editorial backbone into every chunk's prompt.
  // citySegment is set when the build is a chunk; first chunk has dayStart=1.
  const isFirstChunk = !citySegment || citySegment.dayStart === 1;
  if (featuredSlug && isFirstChunk) {
    try {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const admin = createAdminClient();
      const { data: featured } = await admin
        .from('featured_itineraries')
        .select('title, itinerary')
        .eq('slug', featuredSlug)
        .eq('published', true)
        .maybeSingle();
      const featuredDays = (featured?.itinerary as { days?: unknown[] } | null)?.days;
      if (featured?.title && Array.isArray(featuredDays) && featuredDays.length > 0) {
        // Coerce to the shape buildPrompt expects. Tolerate missing
        // fields on individual activities (the editorial format is
        // permissive).
        const seedDays = (featuredDays as Array<{
          day?: number;
          title?: string;
          activities?: Array<{ time?: string; title?: string; description?: string; affiliate_url?: string }>;
        }>)
          .filter(d => typeof d.day === 'number' && Array.isArray(d.activities))
          .map(d => ({
            day: d.day as number,
            title: d.title,
            activities: (d.activities ?? []).map(a => ({
              time: a.time,
              title: a.title,
              description: a.description,
              affiliate_url: a.affiliate_url,
            })),
          }));
        if (seedDays.length > 0) {
          featuredSeed = { title: featured.title as string, days: seedDays };
          console.log(`[generate-itinerary] Featured backbone: ${featuredSlug} (${seedDays.length} days)`);
        }
      }
    } catch (err) {
      console.warn('[generate-itinerary] Could not load featured seed:', err);
    }
  }

  const { user: prompt, cacheableGuidance } = buildPrompt({
    destination: resolvedDestination,
    startDate: resolvedStartDate,
    endDate: resolvedEndDate,
    tripLength: resolvedTripLength,
    groupType: body.groupType as string,
    priorities: body.priorities as string[],
    budget: body.budget as number,
    budgetBreakdown: body.budgetBreakdown as Record<string, number>,
    ageRanges: body.ageRanges as string[],
    accessibilityNeeds: body.accessibilityNeeds as string[],
    localMode: body.localMode as boolean,
    dateNight: body.dateNight as boolean,
    curiosityLevel: body.curiosityLevel as number,
    flexibleDates: body.flexibleDates as boolean,
    modality: body.modality as string,
    accommodationType: body.accommodationType as string,
    bookedFlight: body.bookedFlight as BookedFlight | null,
    bookedHotel: body.bookedHotel as BookedHotel | null,   // legacy
    bookedHotels: body.bookedHotels as BookedHotel[],      // preferred
    bookedCar: body.bookedCar as { company?: string; pickupLocation?: string; carClass?: string; confirmationRef?: string } | null,
    mustHaves: (body.mustHaves as string[] | undefined) ?? [],
    // In city-segment mode, suppress multi-city routing — each city is generated standalone
    destinations: citySegment ? [] : ((body.destinations as string[] | undefined) ?? []),
    daysPerDestination: citySegment ? {} : ((body.daysPerDestination as Record<string, number> | undefined) ?? {}),
    additionalContext: (body.additionalContext as string | undefined) ?? '',
    referenceContent: (body.referenceContent as string | undefined) ?? '',
    // For citySegment chunks: slice to just this segment's days so the prompt's
    // "Day 1: ..." labels line up with the chunk's relative day numbers. The
    // CRITICAL DAY NUMBERING block injected later remaps emission to absolute
    // day numbers. Without this slice, a Florence chunk (segment days 4-6 of
    // a Rome+Florence trip) would receive outlines labelled Day 1/2/3 that
    // actually mean Day 4/5/6.
    dailyOutlines: (() => {
      const raw = (body.dailyOutlines as string[] | undefined) ?? [];
      if (!citySegment) return raw;
      return raw.slice(citySegment.dayStart - 1, citySegment.dayStart - 1 + citySegment.dayCount);
    })(),
    realPlaces: resolvedRealPlaces,
    multiCityPlaces: resolvedMultiCityPlaces,
    organizerPersona,
    organizerPace: (body.organizerPace as 'relaxed' | 'balanced' | 'packed' | null | undefined) ?? null,
    memberPersonas,
    groupSize: Number(body.groupSize) || 2,
    homeCountry: body.homeCountry as string | undefined,
    featuredSeed,
  });

  // ── City-segment post-processing: inject day-numbering override + continuity ──
  // The prompt above generates days 1–N for the city (correct dates, correct city).
  // For segments that aren't the first city, we add a critical instruction to offset
  // the day numbers so they're correct in the full trip context (e.g. start at 4 not 1).
  let finalPrompt = prompt;
  if (citySegment) {
    const chunkLastDay = citySegment.dayStart + citySegment.dayCount - 1;
    const isFinalDayOfTrip = citySegment.totalTripDays
      ? chunkLastDay === citySegment.totalTripDays
      : !citySegment.sameCity; // multi-city default: assume city's last day = check-out
    const isFirstDayOfTrip = citySegment.dayStart === 1;

    if (dayOffset > 0) {
      finalPrompt += `\n\nCRITICAL DAY NUMBERING: This segment covers days ${citySegment.dayStart}–${chunkLastDay} of the full trip. Every "day" field MUST start at ${citySegment.dayStart}, not at 1. The first day object is {"day": ${citySegment.dayStart}, "date": "${resolvedStartDate}", ...} and the last is {"day": ${chunkLastDay}, ...}. Do NOT include "title", "practicalNotes", or "departureInfo" fields — those belong to the full trip's day 1 only.`;
    }

    // Tell the model where this chunk sits in the full trip so it doesn't add
    // arrival/departure logistics on the wrong days. The previous gate
    // (sameCity && totalTripDays) skipped this for chunk 1 of a long single-
    // city trip — that chunk has sameCity=false but resolvedTripLength=3
    // (the chunk size), so the model treated day 3 as "the final day" of
    // what it thought was a 3-day trip and emitted airport/departure
    // logistics on day 3 of an actual 10-day stay.
    //
    // The gate now fires whenever totalTripDays is set (i.e. this is part of
    // a chunked trip, single- or multi-city). The "not first day" framing is
    // STILL only applied to same-city continuations — for multi-city handoffs
    // (sameCity=false, dayStart>1) the CONTINUITY block handles the
    // "settling into the new city" arrival framing instead, and we must not
    // contradict it. The "not final day" framing applies regardless.
    if (citySegment.totalTripDays) {
      const tripPositionNotes: string[] = [];
      if (!isFirstDayOfTrip && citySegment.sameCity) {
        tripPositionNotes.push(`Day ${citySegment.dayStart} is NOT the first day of the trip — the traveler is already settled in ${citySegment.cityName}. Do NOT include arrival, check-in, or "settling in" logistics.`);
      }
      if (!isFinalDayOfTrip) {
        tripPositionNotes.push(`Day ${chunkLastDay} is NOT the final day of the trip — there are more days afterward. Do NOT include departure, airport, or end-of-trip logistics.`);
      }
      if (tripPositionNotes.length > 0) {
        finalPrompt += `\n\nTRIP POSITION (${citySegment.totalTripDays}-day trip): ${tripPositionNotes.join(' ')}`;
      }
    }

    if (citySegment.prevContext) {
      // Two phrasings: same-city chunk continuation vs multi-city handoff.
      // The multi-city phrasing ("just checked in, settling into the new city")
      // would be wrong for a single-city chunk where the traveler hasn't moved.
      if (citySegment.sameCity) {
        finalPrompt += `\n\nCONTINUITY — context from prior days in ${citySegment.cityName}: ${citySegment.prevContext}. Day ${citySegment.dayStart} continues the trip in the same city. Do NOT repeat any venues or activities already covered.`;
      } else {
        finalPrompt += `\n\nCONTINUITY — arriving from previous destination: ${citySegment.prevContext} Reference this naturally in Day ${citySegment.dayStart}'s morning (e.g. just checked in, settling into the new city). Do not repeat any venues or activities mentioned in the continuity context.`;
      }
    }

    // Inject the "already used" venue list when the client passes one.
    // Each chunk is its own Anthropic call with no memory of prior chunks
    // — without this, the model freely re-uses the same museum, restaurant,
    // photo spot, etc. on day 7 that was already on day 2. The list is
    // deduped + capped client-side; we just format it for the model.
    if (citySegment.excludeVenues && citySegment.excludeVenues.length > 0) {
      const venueLines = citySegment.excludeVenues.map(v => `- ${v}`).join('\n');
      finalPrompt += `\n\nALREADY USED — these venues, restaurants, activities, photo spots, bars, shops, and tips have ALREADY appeared on earlier days of this trip. The traveler does NOT want to revisit them. Do NOT include any of these in the new days you generate; pick fresh, different alternatives. Match by name even if spelling or capitalization differs.\n${venueLines}`;
    }

    // Restaurants get a stricter dedup block. Repeat restaurants on a
    // multi-day trip are the most jarring kind of repeat (the same lunch
    // venue twice in a week reads as lazy planning); museums or theme
    // parks repeating is more forgivable. Listed separately and labeled
    // "NEVER REUSE" so the model treats it as a hard constraint.
    if (citySegment.excludeRestaurants && citySegment.excludeRestaurants.length > 0) {
      const restLines = citySegment.excludeRestaurants.map(v => `- ${v}`).join('\n');
      finalPrompt += `\n\nNEVER REUSE THESE RESTAURANTS — these specific restaurants, cafes, bars-with-food, and food venues have ALREADY been suggested on earlier days. Every breakfast, lunch, dinner, and foodieTip on the new days MUST be a venue NOT in this list. Pick different neighborhoods if necessary to find fresh options. Match by name regardless of spelling/capitalization differences:\n${restLines}`;
    }

    // Within-chunk no-repeat rule — even without an exclude list (chunk 1
    // of a long trip), every restaurant on every day of THIS chunk must be
    // a different venue. Long-trip QA repeatedly showed the same lunch /
    // breakfast spot reappearing 2-3 days apart inside one segment.
    finalPrompt += `\n\nWITHIN-CHUNK RESTAURANT DIVERSITY — Across the ${citySegment.dayCount} day${citySegment.dayCount === 1 ? '' : 's'} you generate in THIS response, every restaurant, café, bar with food, bakery, and foodieTip must be a DIFFERENT venue. No venue may appear on two different days (or twice on the same day). If you've used "${citySegment.cityName}'s best ramen spot" on day ${citySegment.dayStart}, you MUST pick a different ramen spot — or a different cuisine entirely — for the next day. Treat this as a hard constraint equal in weight to the "ALREADY USED" list above.`;
  }

  // ── Open SSE stream ──────────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  // Tier 1 build-durability: deliberately do NOT use request.signal here.
  // A closed browser tab, refresh, or sleeping device used to abort the
  // Anthropic stream and lose the in-flight day. Now we keep generating
  // (within Vercel's maxDuration) and persist each day server-side via
  // persistGenerationDays so a returning tab can resume from where the
  // server got. The "don't burn credits on a closed tab" concern is
  // addressed instead by the credit charge happening only when daysEmitted
  // > 0 at stream end — partial waste is bounded by maxDuration.
  const serverAbort = new AbortController();
  const abortSignal = serverAbort.signal;

  // ── Anthropic prompt caching: send the priority guidance as a separate
  // cached system block. Multi-city segments, open-stream retries, and
  // continuation passes all share the same priority guidance for the user's
  // selected priorities — caching it means each subsequent Anthropic call
  // within the 5-minute TTL reads the prefix from cache (~90% cheaper, much
  // faster) instead of re-processing it. Cache requires a >=2K token prefix
  // on Sonnet 4.6; if the user picked few priorities and the guidance is
  // smaller, the cache_control is harmless (silently won't cache).
  const systemParam: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> =
    cacheableGuidance.length > 0
      ? [
          { type: 'text', text: SYSTEM_PROMPT },
          { type: 'text', text: cacheableGuidance, cache_control: { type: 'ephemeral' } },
        ]
      : SYSTEM_PROMPT;

  const readable = new ReadableStream({
    async start(controller) {
      /** Encode and enqueue one SSE event. */
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* controller already closed */ }
      };

      /** Server-side priceLevel clamp on restaurant activities. The AI
       *  occasionally writes priceLevel 4 ($$$$) on mid/comfort-tier
       *  trips despite the prompt cap; mid-range travelers should never
       *  see $$$$. Walk the day's three tracks and clip restaurant
       *  priceLevels to maxRestaurantPriceLevel (3 below LUXURY, 4 at
       *  LUXURY). Non-restaurant priceLevel is left untouched. */
      const clampPriceLevels = (dayObj: Record<string, unknown>) => {
        const tracks = dayObj.tracks as Record<string, unknown> | undefined;
        if (!tracks) return;
        for (const trackName of ['shared', 'track_a', 'track_b']) {
          const list = tracks[trackName];
          if (!Array.isArray(list)) continue;
          for (const act of list) {
            if (act && typeof act === 'object' && (act as Record<string, unknown>).isRestaurant === true) {
              const a = act as Record<string, unknown>;
              const lvl = typeof a.priceLevel === 'number' ? a.priceLevel : null;
              if (lvl !== null && lvl > maxRestaurantPriceLevel) {
                a.priceLevel = maxRestaurantPriceLevel;
              }
            }
          }
        }
      };

      try {
        // Open the first-pass stream with retry-with-backoff for connection-time
        // overloaded_error / 5xx. Without this, a single 529 from Anthropic kills
        // the whole generation before any days are emitted.
        let anthropicStream: Awaited<ReturnType<typeof client.messages.create>> | null = null;
        {
          const MAX_OPEN_ATTEMPTS = 3;
          let openErr: unknown;
          for (let attempt = 1; attempt <= MAX_OPEN_ATTEMPTS; attempt++) {
            try {
              anthropicStream = await client.messages.create({
                model: modelId,
                max_tokens: maxTokens,
                stream: true,
                system: systemParam,
                messages: [
                  { role: 'user', content: finalPrompt },
                ],
              }, { signal: abortSignal });
              break;
            } catch (err) {
              openErr = err;
              if (!isRetryableAnthropicError(err) || attempt === MAX_OPEN_ATTEMPTS) throw err;
              const delay = 2000 * Math.pow(3, attempt - 1); // 2s, 6s
              console.warn(`[generate-itinerary] first-pass open retry ${attempt}/${MAX_OPEN_ATTEMPTS} after ${delay}ms: ${err instanceof Error ? err.message : String(err)}`);
              send({ type: 'status', message: `Anthropic temporarily overloaded — retrying in ${Math.round(delay / 1000)}s...` });
              await sleep(delay, abortSignal);
            }
          }
          if (!anthropicStream) throw openErr ?? new Error('failed to open Anthropic stream');
        }

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
        let firstPassStopReason: string | null = null;

        try {
          for await (const event of anthropicStream) {
            // Surface prompt-cache stats from the message_start event so we can
            // verify caching is working in production. cache_read_input_tokens
            // > 0 means the priority guidance was served from cache (~90%
            // cheaper, much faster). On the first call it'll be 0 and
            // cache_creation_input_tokens will be the size of the cached block;
            // subsequent calls within 5min should flip it.
            if (event.type === 'message_start') {
              const u = event.message.usage as {
                input_tokens?: number;
                cache_creation_input_tokens?: number;
                cache_read_input_tokens?: number;
              };
              console.log(
                `[generate-itinerary] cache: read=${u.cache_read_input_tokens ?? 0}, write=${u.cache_creation_input_tokens ?? 0}, fresh=${u.input_tokens ?? 0}`,
              );
            }
            // Capture stop_reason so we can distinguish "model finished" from
            // "model was cut off at max_tokens" — the latter MUST trigger continuation
            // even if dayIndex happens to equal resolvedTripLength rounded down.
            if (event.type === 'message_delta' && event.delta.stop_reason) {
              firstPassStopReason = event.delta.stop_reason;
              continue;
            }
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

                    // Day 1 carries trip-level meta fields — extract and emit separately.
                    // nightlifeHighlights, shoppingGuide, priorityHighlights, foodieTips, and
                    // photoSpots are PER-DAY (kept on each day object). They are still emitted
                    // on the meta event for backward compat with old trips that stored them
                    // trip-wide; the UI prefers per-day data and falls back to meta when absent.
                    if (dayIndex === 0) {
                      send({
                        type: 'meta',
                        title: dayObj.title ?? null,
                        practicalNotes: dayObj.practicalNotes ?? null,
                        departureInfo: dayObj.departureInfo ?? null,
                        hotelSuggestions: dayObj.hotelSuggestions ?? null,
                        nightlifeHighlights: dayObj.nightlifeHighlights ?? null,
                        shoppingGuide: dayObj.shoppingGuide ?? null,
                        priorityHighlights: dayObj.priorityHighlights ?? null,
                      });
                      delete dayObj.title;
                      delete dayObj.practicalNotes;
                      delete dayObj.departureInfo;
                      delete dayObj.hotelSuggestions;
                      // nightlifeHighlights, shoppingGuide, priorityHighlights, foodieTips:
                      // intentionally NOT deleted — they stay on each day object so the
                      // sidebar can render per-day picks anchored to that day's plans.
                    }

                    clampPriceLevels(dayObj);
                    send({ type: 'day', index: dayIndex, data: dayObj });
                    collectedDays.push(dayObj);
                    dayIndex++;

                    // Tier 1 build-durability: persist the running snapshot
                    // server-side so a closed tab doesn't lose this day. Fire
                    // and forget — the SSE stream must not block on Supabase.
                    // Snapshot-write (full days array, not single-day upsert)
                    // makes concurrent fire-and-forget calls race-safe: every
                    // write is a complete superset of all prior writes.
                    if (requestBodyTripId) {
                      persistGenerationDays(requestBodyTripId, collectedDays as unknown as Json[])
                        .then(r => {
                          if (!r.ok) console.warn('[generate-itinerary] persistGenerationDays (first-pass):', r.error);
                        })
                        .catch(err => console.warn('[generate-itinerary] persistGenerationDays threw (first-pass):', err));
                    }

                    // Trim the buffer — the object has been consumed
                    buffer = '';
                    objStart = -1;
                  } catch {
                    // Malformed object — almost always means the response was
                    // truncated mid-day at max_tokens. Fully reset parser state so
                    // the rest of the stream isn't poisoned by stale buffer data.
                    // (Without this, every subsequent `}` at depth 0 silently
                    // discards content because objStart is -1 but buffer keeps growing.)
                    buffer = '';
                    braceDepth = 0;
                    inString = false;
                    escape = false;
                    objStart = -1;
                  }
                }
              }
            }
          }
        } catch (streamErr) {
          // If Anthropic returns an overloaded_error mid-stream, the SDK throws
          // out of the for-await. Without this catch, the throw propagates to
          // the outer handler and the entire generation aborts — even if we
          // already streamed several valid days. Instead: fall through to the
          // continuation loop, which will request the missing days using the
          // self-contained "continue from day N" prompt.
          if (isRetryableAnthropicError(streamErr)) {
            console.warn(`[generate-itinerary] First-pass stream interrupted by retryable error after ${dayIndex} days — falling through to continuation:`, streamErr instanceof Error ? streamErr.message : streamErr);
            send({ type: 'status', message: 'Anthropic temporarily overloaded — recovering remaining days...' });
            firstPassStopReason = 'overloaded'; // forces continuation loop to engage
          } else {
            throw streamErr;
          }
        }

        if (firstPassStopReason && firstPassStopReason !== 'end_turn') {
          // Surface enough state to diagnose Dublin-class truncations: how
          // many days completed, whether a partial day was buffered (parser
          // had started a `{` but never saw the matching `}`), and the
          // buffer size. With this in Vercel logs we can tell whether the
          // model genuinely cut off mid-day vs whether the parser dropped
          // a complete day.
          const partialDayBuffered = objStart >= 0 && braceDepth > 0;
          console.warn(
            `[generate-itinerary] First pass stop_reason=${firstPassStopReason} after ${dayIndex}/${resolvedTripLength} days` +
            ` (partialDayBuffered=${partialDayBuffered}, bufferLen=${buffer.length}, braceDepth=${braceDepth})`,
          );
          // If we have a non-trivial partial buffer, attempt salvage via
          // recoverTruncatedArray. The helper finds the last complete
          // top-level object in an array-shaped string; we wrap our
          // buffer in [] first so it parses as one. Any complete days
          // the streaming parser somehow missed (e.g. due to stray
          // string-escape state) get caught here as a safety net. Days
          // beyond what we already have via dayIndex get emitted.
          if (partialDayBuffered && buffer.length > 0) {
            try {
              const wrapped = `[${buffer}]`;
              const recovered = recoverTruncatedArray(wrapped);
              const parsed = JSON.parse(cleanJson(recovered)) as Record<string, unknown>[];
              for (const d of parsed) {
                const dn = typeof d.day === 'number' ? d.day : -1;
                if (dn > dayIndex) {
                  clampPriceLevels(d);
                  send({ type: 'day', index: dayIndex, data: d });
                  collectedDays.push(d);
                  dayIndex++;
                  if (requestBodyTripId) {
                    persistGenerationDays(requestBodyTripId, collectedDays as unknown as Json[])
                      .then(r => { if (!r.ok) console.warn('[generate-itinerary] persistGenerationDays (salvage):', r.error); })
                      .catch(err => console.warn('[generate-itinerary] persistGenerationDays threw (salvage):', err));
                  }
                }
              }
              if (parsed.length > 0) {
                console.warn(`[generate-itinerary] recoverTruncatedArray salvaged ${parsed.length} day(s) from partial buffer`);
              }
            } catch {
              // Salvage is best-effort — the partial buffer truly might
              // not contain a recoverable day. Move on; continuation
              // loop will request the missing days.
            }
          }
        }

        // ── Continuation loop for trips where a pass ran short ───────────────
        // Each pass may produce fewer days than requested (common for 7+ day trips
        // that exceed the 64K output token cap). We retry up to MAX_CONTINUATIONS
        // times using a self-contained compact prompt that avoids conflicting with
        // the original "generate N days from day 1" instruction.
        // Bumped from 4 → 6 to absorb retry passes spent on transient
        // overloaded_error / 5xx responses (each retryable failure burns a slot).
        const MAX_CONTINUATIONS = 6;
        let contAttempt = 0;

        // Backoff before kicking off the continuation loop when first-pass
        // tripped the overloaded path. Without this we hammered Anthropic
        // immediately after they signaled overloaded — exact wrong move.
        // 3s gives them a moment to recover and avoids a near-guaranteed
        // second 529 that would burn a continuation slot for nothing.
        if (firstPassStopReason === 'overloaded') {
          console.warn('[generate-itinerary] First pass overloaded — backing off 3s before continuation');
          await sleep(3000, abortSignal).catch(() => { /* abort is fine here */ });
        }
        // Track consecutive zero-day passes. The model occasionally restarts at
        // Day 1 (caught by dedup → 0 new days) — that's recoverable on the next
        // attempt. Two zero-day passes in a row means the model is genuinely
        // stuck and we should give up.
        let consecutiveZeros = 0;

        while (dayIndex < resolvedTripLength && contAttempt < MAX_CONTINUATIONS) {
          contAttempt++;
          const remaining = resolvedTripLength - dayIndex;
          const contFromDay = dayOffset + dayIndex + 1;
          const contToDay   = dayOffset + resolvedTripLength;
          console.log(`[generate-itinerary] Pass ${contAttempt}: have ${dayIndex}/${resolvedTripLength} days — requesting days ${contFromDay}–${contToDay}`);

          // Build a compact summary of already-generated days so the model
          // knows exactly what exists and won't regenerate any of it. Also
          // list each day's venues — without this, the continuation pass
          // sees only day themes ("Day 1: Riverwalk & Water Street") and
          // happily re-suggests the same restaurants, museums, and photo
          // spots on day 4 that it already used on day 1. Listing venues
          // explicitly is the dedup signal.
          const collectVenueNames = (d: Record<string, unknown>): string[] => {
            const names = new Set<string>();
            const tracks = (d.tracks as Record<string, unknown>) ?? {};
            for (const trackKey of ['shared', 'track_a', 'track_b']) {
              const arr = tracks[trackKey] as Array<Record<string, unknown>> | undefined;
              if (!Array.isArray(arr)) continue;
              for (const a of arr) {
                const n = (a.name as string) || (a.title as string);
                if (n) names.add(n);
              }
            }
            for (const key of ['photoSpots', 'foodieTips', 'nightlifeHighlights', 'shoppingGuide']) {
              const arr = d[key] as Array<Record<string, unknown>> | undefined;
              if (!Array.isArray(arr)) continue;
              for (const item of arr) {
                const n = (item.name as string) || (item.title as string);
                if (n) names.add(n);
              }
            }
            return Array.from(names);
          };
          const generatedSummary = collectedDays
            .map((d) => {
              const cityNote = d.city ? ` (${String(d.city)})` : '';
              const venues = collectVenueNames(d);
              const venuesNote = venues.length > 0 ? `\n    Venues: ${venues.join(', ')}` : '';
              return `Day ${String(d.day ?? '')}: ${String(d.theme ?? 'generated')}${cityNote}${venuesNote}`;
            })
            .join('\n');

          // In city-segment mode, contDestinations is empty (suppress multi-city routing)
          const contDestinations = citySegment ? [] : ((body.destinations as string[] | undefined) ?? []);
          const contDaysPerDest = citySegment ? {} : ((body.daysPerDestination as Record<string, number> | undefined) ?? {});
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
            return resolvedStartDate;
          })();

          // Brief top-10 venue hints so continuation days use real places too
          const placesHint = (() => {
            const src = isMultiCityCont && lastCity
              ? (multiCityPlaces?.[lastCity] ?? realPlaces)
              : (resolvedRealPlaces ?? realPlaces);
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
          // Per-priority discovery flags — recomputed here because the
          // buildPrompt closure isn't accessible. Used to conditionally
          // include the per-day discovery arrays (foodieTips,
          // nightlifeHighlights, shoppingGuide) in the continuation
          // schema.
          const contPriorities = body.priorities as string[];
          const contHasFood = contPriorities.includes('food');
          const contHasNightlife = contPriorities.includes('nightlife');
          const contHasShopping = contPriorities.includes('shopping');
          const compactContPrompt = [
            `You are an expert travel planner. Continue an in-progress itinerary.`,
            ``,
            `TRIP: ${resolvedDestination} | ${resolvedStartDate} to ${resolvedEndDate} | ${resolvedTripLength} days total`,
            `GROUP: ${body.groupType as string} | Priorities: ${(body.priorities as string[]).join(', ')}`,
            `Budget: $${body.budget as number} total`,
            multiCityNote ? multiCityNote.trim() : '',
            ``,
            `ALREADY COMPLETE — do NOT regenerate these ${dayIndex} days:`,
            generatedSummary,
            ``,
            lastCity ? `The group ended Day ${dayOffset + dayIndex} in ${lastCity}.` : '',
            placesHint,
            `YOUR TASK: Output ONLY day objects ${contFromDay} through ${contToDay} (${remaining} day${remaining === 1 ? '' : 's'}), starting from ${contStartDate}.`,
            `CRITICAL — DAY NUMBERING: The first day you emit MUST have "day": ${contFromDay}. Do NOT restart numbering at 1. Do NOT renumber. Days ${dayOffset + 1} through ${dayOffset + dayIndex} already exist and any day object with day < ${contFromDay} will be discarded as a duplicate.`,
            ``,
            `Day schema (use exact field names):`,
            `{"day":<N>,"date":"YYYY-MM-DD","city":"<city>","theme":"<3-5 word theme>","photoSpots":[{"name":"...","timeOfDay":"...","tip":"..."}],"destinationTip":"<one insider fact>","trackALabel":null,"trackBLabel":null,"dinnerMeetupLocation":null,"tracks":{"shared":[<activities>],"track_a":[],"track_b":[]},"meetupTime":"<HH:MM>","meetupLocation":"Hotel lobby"${contHasFood ? ',"foodieTips":[{"name":"...","type":"...","neighborhood":"...","why":"...","orderThis":"...","timeOfDay":"...","priceRange":"...","tip":"..."}]' : ''}${contHasNightlife ? ',"nightlifeHighlights":[{"name":"...","type":"...","neighborhood":"...","vibe":"...","bestNight":"...","openFrom":"...","tip":"..."}]' : ''}${contHasShopping ? ',"shoppingGuide":[{"name":"...","type":"...","neighborhood":"...","what":"...","bestFor":"...","openDays":"...","tip":"..."}]' : ''}}`,
            ``,
            `Activity schema:`,
            `{"id":"act_d<N>_<i>","dayNumber":<N>,"timeSlot":"HH:MM–HH:MM","name":"venue","title":"venue","address":"full address","website":"https://...","isRestaurant":<bool>,"mealType":<null|"breakfast"|"lunch"|"dinner">,"track":"shared","priceLevel":<0-4>,"description":"why visit","costEstimate":<USD>,"confidence":0.9,"verified":true,"packingTips":[],"transportToNext":{"mode":"walk|rideshare|metro|taxi|train","durationMins":<N>,"distanceMiles":<N>,"notes":"to next place"}|null}`,
            ``,
            `Rules:`,
            `- Every day: breakfast (07:30–09:00, mealType:"breakfast"), lunch (12:30–14:00, mealType:"lunch"), dinner (19:00–21:00, mealType:"dinner") + 2-3 non-meal activities`,
            `- All activities go in shared track; track_a and track_b stay as empty arrays []`,
            `- transportToNext is null on the LAST activity of each day only`,
            `- Use REAL venue names and full street addresses in ${resolvedDestination}`,
            `- photoSpots: EXACTLY 2 per day, anchored to that day's neighborhoods`,
            contHasFood ? `- foodieTips: EXACTLY 2 per day, anchored to that day's neighborhoods, different from daily track restaurants` : '',
            contHasNightlife ? `- nightlifeHighlights: EXACTLY 2 per day, evening venues anchored to that day's neighborhoods, no recycled picks` : '',
            contHasShopping ? `- shoppingGuide: EXACTLY 2 per day, shops anchored to that day's neighborhoods, no recycled picks` : '',
            citySegment
              ? `- Day ${contToDay} is the last day in ${citySegment.cityName} — full normal day, the group travels to the next city after checkout`
              : `- Day ${contToDay} is the final day — light schedule ending at airport/station`,
            `- "meetupTime" must equal the start time of the first activity that day`,
            ``,
            `Return ONLY a JSON array of day objects for days ${contFromDay}–${contToDay}. No markdown. No explanation. Output: [ then each day object separated by commas, then ]. The first object's "day" field MUST be ${contFromDay}.`,
          ].filter(Boolean).join('\n');

          try {
            const contStream = await client.messages.create({
              model: modelId,
              // Give at least 16K tokens even for 1 remaining day (descriptions are verbose)
              max_tokens: Math.min(64000, Math.max(remaining * tokensPerDay, 16000)),
              stream: true,
              // Continuation reuses the cached system prefix from the first pass.
              // Anthropic looks up the cache by hashing system+user up to each
              // breakpoint; the system bytes are identical across calls within
              // a trip generation, so the priority guidance hits the cache.
              system: systemParam,
              messages: [{ role: 'user', content: compactContPrompt }],
            }, { signal: abortSignal });

            let contBuf = '';
            let contDepth = 0;
            let contInStr = false;
            let contEsc = false;
            let contStart = -1;
            const daysBefore = dayIndex; // detect if this pass produces anything

            for await (const ev of contStream) {
              // Same cache-stat logging as the first pass — continuation
              // calls should see cache_read_input_tokens > 0 if the priority
              // guidance is in cache.
              if (ev.type === 'message_start') {
                const u = ev.message.usage as {
                  input_tokens?: number;
                  cache_creation_input_tokens?: number;
                  cache_read_input_tokens?: number;
                };
                console.log(
                  `[generate-itinerary] cache (cont ${contAttempt}): read=${u.cache_read_input_tokens ?? 0}, write=${u.cache_creation_input_tokens ?? 0}, fresh=${u.input_tokens ?? 0}`,
                );
              }
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
                        clampPriceLevels(dayObj);
                        send({ type: 'day', index: dayIndex, data: dayObj });
                        collectedDays.push(dayObj);
                        dayIndex++;

                        // Same Tier 1 server-side persist as the first pass —
                        // fire-and-forget snapshot write so the continuation
                        // loop's days survive client disconnect.
                        if (requestBodyTripId) {
                          persistGenerationDays(requestBodyTripId, collectedDays as unknown as Json[])
                            .then(r => {
                              if (!r.ok) console.warn('[generate-itinerary] persistGenerationDays (cont):', r.error);
                            })
                            .catch(err => console.warn('[generate-itinerary] persistGenerationDays threw (cont):', err));
                        }

                        contBuf = '';
                        contStart = -1;
                      }
                    } catch {
                      // Same parser-poisoning fix as the main loop — fully reset
                      // state so a truncated day doesn't corrupt the rest of the pass.
                      contBuf = '';
                      contDepth = 0;
                      contInStr = false;
                      contEsc = false;
                      contStart = -1;
                    }
                  }
                }
              }
            }

            // Track consecutive zero-day passes. Single zero is often a model
            // misbehavior (restarting at Day 1 → all dedup'd) that recovers on
            // the next attempt. Two in a row means the model is stuck.
            if (dayIndex === daysBefore) {
              consecutiveZeros++;
              console.warn(`[generate-itinerary] Continuation pass ${contAttempt} produced 0 new days (consecutive zeros: ${consecutiveZeros}/2)`);
              if (consecutiveZeros >= 2) {
                console.warn(`[generate-itinerary] Two consecutive zero-day passes — stopping retry loop`);
                break;
              }
            } else {
              consecutiveZeros = 0;
            }
          } catch (contErr) {
            // Retry on transient Anthropic failures (overloaded_error, 5xx, network).
            // Without this, a single 529 mid-trip strands the user with a partial itinerary.
            if (isRetryableAnthropicError(contErr) && contAttempt < MAX_CONTINUATIONS) {
              const delay = Math.min(30000, 3000 * Math.pow(2, Math.min(contAttempt - 1, 4))); // 3s, 6s, 12s, 24s, 30s, 30s
              console.warn(`[generate-itinerary] Continuation pass ${contAttempt} hit retryable error — backing off ${delay}ms: ${contErr instanceof Error ? contErr.message : String(contErr)}`);
              send({ type: 'status', message: `Anthropic overloaded — retrying in ${Math.round(delay / 1000)}s...` });
              try {
                await sleep(delay, abortSignal);
              } catch {
                console.warn('[generate-itinerary] client disconnected during retry backoff');
                break;
              }
              continue; // re-enter the while loop (contAttempt will tick on the next iteration)
            }
            console.warn(`[generate-itinerary] Continuation pass ${contAttempt} failed (non-retryable or exhausted):`, contErr);
            break;
          }
        }

        if (dayIndex < requestedLength) {
          console.warn(`[generate-itinerary] Trip ended with ${dayIndex}/${requestedLength} days after ${contAttempt} continuation attempt(s)`);
        }

        // Charge the credit only when at least one day made it through —
        // otherwise the user got nothing and shouldn't be charged. The
        // partial-generation case (got 3 of 7 days, then truncation) is
        // judgment-call territory; we charge in that case since the user
        // did get usable output and can resume from add-day.
        //
        // Wrap in its own try/catch: a Supabase outage at charge time
        // should NOT prevent us from telling the client the stream is
        // complete. Better to under-charge once and reconcile from logs
        // than to leave the client hanging waiting for the 'done' event
        // and lose the user's already-generated days. Loud-log so the
        // un-charged session shows up in error monitoring.
        if (dayIndex > 0) {
          try {
            await incrementAiCreditsUsed(auth.ctx.userId, credits.ctx);
          } catch (chargeErr) {
            console.error(
              '[generate-itinerary] credit charge failed (user got days but was not charged):',
              auth.ctx.userId,
              credits.ctx,
              chargeErr,
            );
          }
        }

        // Final synchronous snapshot write before stream end. Per-day
        // persistGenerationDays calls are fire-and-forget for performance
        // — but on the absolute last day, function termination on Vercel
        // can land before the in-flight HTTP write resolves, leaving the
        // canonical snapshot one day behind. Awaiting here guarantees
        // the user's final day is durable before we tell the client
        // we're done.
        if (dayIndex > 0 && requestBodyTripId) {
          try {
            const result = await persistGenerationDays(requestBodyTripId, collectedDays as unknown as Json[]);
            if (!result.ok) {
              console.warn('[generate-itinerary] final persistGenerationDays:', result.error);
            }
          } catch (err) {
            console.warn('[generate-itinerary] final persistGenerationDays threw:', err);
          }
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
