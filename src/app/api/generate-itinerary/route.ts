import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TIER_LIMITS, SubscriptionTier } from '@/lib/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert travel planner with deep local knowledge of destinations worldwide.
You create detailed, realistic, and genuinely useful day-by-day itineraries.
You always recommend REAL venues with accurate names and addresses.
You balance popular highlights with authentic off-the-beaten-path experiences.
You adapt itineraries based on group composition, budget, and interests.
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
  curiosityLevel?: number;
  modality?: string;
  accommodationType?: string;
  bookedFlight?: BookedFlight | null;
  bookedHotel?: BookedHotel | null;    // legacy single-hotel (kept for backward compat)
  bookedHotels?: BookedHotel[];        // preferred: array of hotels for multi-hotel trips
  mustHaves?: string[];                // user's non-negotiable places/experiences
  destinations?: string[];             // ordered city list for multi-city trips
  realPlaces?: { restaurants: GooglePlace[]; attractions: GooglePlace[] } | null;
}) {
  const {
    destination, startDate, endDate, tripLength,
    groupType, priorities, budget, budgetBreakdown,
    ageRanges, accessibilityNeeds,
    localMode, curiosityLevel, modality, accommodationType,
    bookedFlight, realPlaces,
  } = params;
  const mustHaves = params.mustHaves ?? [];
  const destinations = params.destinations ?? [];

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

  const modalityText = modality && modality !== 'mix'
    ? `\n- Primary transport: ${modality} — build routes and day plans around this mode`
    : '';

  const accommodationText = accommodationType
    ? `\n- Staying in: ${accommodationType} — factor this into meeting points and daily logistics`
    : '';

  // Sports-specific guidance
  const sportsText = priorities.includes('sports')
    ? `\n- SPORTS PRIORITY: Include visits to or near major stadiums, arenas, and sports venues in ${destination}. Check if any league matches, sporting events, or competitions are scheduled during ${startDate}–${endDate} and mention them in descriptions. Include sports bars and fan zones for game-day atmosphere.`
    : '';

  // Food priority — generate a separate foodieTips block of off-the-beaten-path spots on day 1
  const hasFoodPriority = priorities.includes('food');
  const foodText = hasFoodPriority
    ? `\n- FOOD PRIORITY: This group has food as a top priority. In addition to the standard meals in the itinerary, generate a "foodieTips" array on day 1 (see OUTPUT FORMAT) with 4-6 unique, off-the-beaten-path food experiences — food trucks, local markets, hole-in-the-wall joints, street food stalls, specialty shops, food halls, or unique culinary experiences that most tourists miss. These are NOT the standard breakfast/lunch/dinner spots in the itinerary tracks — they are bonus exploratory stops and ambient discoveries for adventurous eaters.`
    : '';

  // Photography guidance — iconic spots always included; extra depth when photography is a priority
  const photoText = priorities.includes('photography')
    ? `\n- PHOTOGRAPHY PRIORITY: In addition to the iconic must-photograph landmarks (always required — see Rule 11), each activity description should note photographic potential with golden hour timing, interesting angles, and any access restrictions. Add 1-2 extra photoSpots per day that go beyond the famous spots — local viewpoints, rooftop bars with skyline views, murals, reflections, etc. Include at least one spot that most tourists miss.`
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
    return `
MULTI-CITY TRIP — CRITICAL ROUTING RULES:
This trip visits multiple cities in this order: ${cities.join(' → ')}.
You MUST follow ALL of these rules:

1. VISIT ORDER: Travel through the cities exactly in the order listed above. Never skip ahead and double back.
2. REALISTIC TRAVEL TIMES — apply these minimums before scheduling any inter-city leg:
   - Same-country rail or bus: 1.5 hrs minimum; 200–400 km routes often take 3–5 hrs
   - International flights (even short-haul): minimum 4 hrs door-to-door (check-in + flight + immigration + ground transport)
   - Driving between cities: 300 km ≈ 3.5 hrs, 500 km ≈ 5.5 hrs at realistic road speeds
3. NO SAME-DAY IMPOSSIBLE HOPS: If travel between two cities takes more than 3 hours, that travel must occupy most of a day — do not schedule full activity blocks on both ends.
4. TRANSITION DAYS: On any day the group moves cities, plan: light morning activity near the departing city → inter-city transport leg → 1–2 arrival activities near the new city only.
5. CITY-NIGHT ALIGNMENT: Each day's activities must be in the city where the group sleeps that night. Never schedule activities in City B when the group's hotel that night is in City A.
6. LOGICAL DAY ASSIGNMENT: Use the hotel check-in/check-out dates (if provided) to determine which city covers which dates. If no hotels provided, divide the trip length proportionally across cities.`;
  })();

  // Must-haves: hard-requirement text injected if user specified any
  const mustHaveText = mustHaves.length > 0
    ? `\n- MUST-HAVES (non-negotiable — each item below MUST appear as a named activity somewhere in the itinerary. Do not omit or replace any of them):\n${mustHaves.map(m => `    • ${m}`).join('\n')}`
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
    - Breakfast should be near that night's hotel
    - Day activities should cluster around areas accessible from that hotel
    - Each day should end with the group able to return to the night's hotel
    - On transition days (checking out of one hotel and into another): plan a late-morning checkout, then route activities toward the new hotel's neighborhood; include a luggage-storage or direct transfer note
    - meetupLocation each day should reference the active hotel lobby or nearest landmark
  → All hotel costs are already paid; exclude hotel from budget recommendations.`;
    }
  }

  // Hotel recommendation context (only when no hotel is pre-booked)
  const needsHotelSuggestions = !hasPreBookedHotel;
  const hotelBudgetPerNight = Math.round((budgetBreakdown.hotel ?? 0) / tripLength);
  const hotelPriceTier = hotelBudgetPerNight < 80
    ? 'budget — hostels, guesthouses, or economy hotels ($)'
    : hotelBudgetPerNight < 180
    ? 'mid-range — comfortable 3-4 star hotels ($$)'
    : hotelBudgetPerNight < 350
    ? 'upscale — boutique or 4-star hotels ($$$)'
    : 'luxury — 5-star or premium boutique hotels ($$$$)';

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
- Travel style: ${travelStyleText}${localModeText}${modalityText}${accommodationText}${sportsText}${photoText}${foodText}${mustHaveText}${preBookingText}${multiCityText}

${(() => {
    if (!realPlaces || (realPlaces.restaurants.length === 0 && realPlaces.attractions.length === 0)) return '';
    const { restaurants, attractions } = realPlaces;

    let section = `\nCRITICAL — REAL PLACES ONLY (verified via Google Places):
You MUST use ONLY the venues listed below. Do NOT invent, guess, or hallucinate any place names, businesses, or addresses.
Every restaurant and activity in the itinerary must come from one of these two lists — no exceptions.

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
  "hotelSuggestions" — since no hotel has been pre-booked, include an array of exactly 3 recommended hotels matching the ${hotelPriceTier} tier (only on day 1, omit from all other days):
    [
      {
        "name": "Hotel name",
        "neighborhood": "Area/district name",
        "address": "Full address",
        "pricePerNight": 150,
        "priceLevel": 2,
        "whyRecommended": "One sentence on why this hotel is a great choice — location, reputation, amenities, or acclaim",
        "bookingUrl": "https://www.booking.com/searchresults.html?ss=HOTEL+NAME+CITY&checkin=${startDate}&checkout=${endDate}"
      }
    ]
    Choose hotels that are: (1) real and accurately named, (2) well-located for the day's activities — ideally central or near transport hubs, (3) highly regarded for their category. Vary the 3 suggestions slightly — e.g. one closer to the main sights, one in a quieter/hipper neighborhood, one that offers the best value. The bookingUrl should be a Booking.com search URL pre-filled with the hotel name and destination city and the trip dates.` : ''}${hasFoodPriority ? `
  "foodieTips" — since food is a top priority, include an array of 4-6 off-the-beaten-path food finds (day 1 only):
    [
      {
        "name": "Place or market name",
        "type": "food truck | street stall | market | local joint | specialty shop | food hall",
        "neighborhood": "District or area",
        "why": "One sentence on what makes it special and why locals love it — NOT a tourist attraction",
        "bestFor": "2-3 specific dishes, items, or experiences",
        "timeOfDay": "morning | afternoon | evening | any",
        "tip": "Practical insider tip (e.g. 'cash only', 'arrive before noon', 'skip the front stalls')"
      }
    ]
    Rules: (1) These must be DIFFERENT from the breakfast/lunch/dinner spots in the daily itinerary. (2) Prioritize places tourists rarely find — local markets, neighbourhood street food, food trucks, hole-in-the-wall joints. (3) Must be real, specific, and accurately named. (4) Vary the time of day and type so there's something for every mood.` : ''}
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
    "practicalNotes": { ... (day 1 only) },${hasFoodPriority ? `
    "foodieTips": [ ... (day 1 only, food priority trips) ],` : ''}
    "day": 1,
    "date": "${startDate}",
    "theme": "Evocative 3-5 word theme for the day",
    "photoSpots": [
      {
        "name": "Specific viewpoint or location name",
        "timeOfDay": "golden hour",
        "tip": "One-sentence tip on what to capture and how"
      }
    ],
    "trackALabel": null,
    "trackBLabel": null,
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
- trackALabel and trackBLabel: when splitting, replace null with short 2-4 word descriptive labels, e.g. "Active & Outdoors" / "Culture & Relaxation" or "Nightlife & Energy" / "Slow & Scenic". These display directly in the UI so make them friendly and specific to this trip.
- When NOT splitting: set trackALabel and trackBLabel to null and leave track_a and track_b as empty arrays.

MEAL REQUIREMENTS — every day must include exactly 3 restaurant activities:
1. Breakfast (isRestaurant: true, mealType: "breakfast"): timeSlot 07:30–09:00, priceLevel ${mealPriceLevels.breakfast}
   → Place near the hotel/accommodation or the first morning activity
2. Lunch (isRestaurant: true, mealType: "lunch"): timeSlot 12:30–14:00, priceLevel ${mealPriceLevels.lunch}
   → Place geographically near the midday activities — minimize detour from the day's flow
3. Dinner (isRestaurant: true, mealType: "dinner"): timeSlot 19:00–21:00, priceLevel ${mealPriceLevels.dinner}
   → Place near the evening meetup location
For EACH restaurant: recommend a real, named establishment. In the description, state WHY it is recommended — cite its reputation (local institution, award recognition, neighborhood favorite, featured in local food press, etc.). Do not fabricate Google star ratings; instead describe the source of the restaurant's acclaim. Choose spots that are close to surrounding activities to keep transit minimal.

TRANSPORT BETWEEN ACTIVITIES:
Every activity must include a "transportToNext" field:
- mode: walk | rideshare | taxi | metro | bus | train | ferry | water-taxi | tuk-tuk | cable-car | tram
- durationMins: estimated travel time in minutes
- distanceMiles: distance in miles (use 0 for rideshare/taxi where exact distance varies by route)
- notes: brief landmark-based direction or useful transit tip (can be null if self-evident)
Set transportToNext to null on the last activity of each day (no onward journey needed).
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
10. meetupTime and meetupLocation are the MORNING departure point — the place where the whole group gathers at the start of the day before heading out. meetupLocation must ALWAYS be the hotel lobby (e.g. "Hotel lobby" or "[Hotel Name] lobby") and meetupTime should be between 08:30 and 10:00. Do NOT use the evening reconvene point, a restaurant, or a landmark for meetupLocation — it is always the hotel lobby. For solo or couple trips (groupType "solo" or "couple"), set meetupTime and meetupLocation to null on every day — group meetup points are irrelevant for individual travelers.
11. photoSpots: REQUIRED on every itinerary, every day — include 1-3 per day regardless of whether photography is a selected priority. Always include the destination's iconic must-photograph landmarks (e.g. Trevi Fountain in Rome, Eiffel Tower in Paris, Hagia Sophia in Istanbul) as the primary spot on the relevant day. These are the shots every visitor wants and they must not be omitted. Pair each with a specific time of day (sunrise/golden hour/blue hour/midday) and one actionable shooting tip (best angle, where to stand, what to frame). Additional spots can be local or lesser-known but the famous landmark always anchors the list.
12. packingTips: for any outdoor, hiking, excursion, tour, or physical activity include 2-4 short packing tips (e.g. "Wear sturdy walking shoes", "Bring a water bottle", "Sunscreen essential"). Leave empty array [] for restaurants, museums, and low-key activities.
13. Respect the travel style: ${explorerPct >= 70 ? 'prioritize hidden gems and local spots over famous tourist sites' : explorerPct >= 40 ? 'balance iconic sights with local discoveries' : 'focus on well-reviewed and accessible attractions'}
14. Age ranges present: ${ageRanges.length > 0 ? ageRanges.join(', ') : '18-35'} — if children (Under 12 or 12-17) are in the group, ensure all shared-track activities are family-appropriate. Use split tracks to give adults-only options in the afternoon when children are present alongside adults.
15. "title" and "practicalNotes" fields appear ONLY on day 1. All other day objects must not include these fields.

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

  // Resolve subscription tier
  let userTier: SubscriptionTier = 'free';
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (user?.id) {
      const adminClient = createAdminClient();
      const { data: profile } = await adminClient
        .from('profiles')
        .select('subscription_tier')
        .eq('id', user.id)
        .single();
      if (profile?.subscription_tier) {
        userTier = profile.subscription_tier as SubscriptionTier;
      }
    }
  } catch { /* fall back to free */ }

  const tierLimits = TIER_LIMITS[userTier];
  const requestedLength = Number(body.tripLength) || 7;

  if (requestedLength > tierLimits.maxTripDays) {
    return NextResponse.json({
      error: 'TRIP_LENGTH_LIMIT',
      message: `Your ${userTier} plan supports itineraries up to ${tierLimits.maxTripDays} days. Upgrade to generate longer trips.`,
    }, { status: 403 });
  }

  // Model selection: Nomad trips >7 days use claude-sonnet-4-6 (higher token cap)
  const useHighCapModel = userTier === 'nomad' && requestedLength > 7;
  const modelId = useHighCapModel ? 'claude-sonnet-4-6' : 'claude-sonnet-4-5';
  const maxTokens = useHighCapModel ? 32000 : 16000;

  // Pre-fetch real places (before the stream opens — this is fast, ~1s)
  let realPlaces = null;
  if (process.env.GOOGLE_MAPS_KEY) {
    try {
      // For multi-city trips, fetch places for the first city as the primary context
      const placesQuery = ((body.destinations as string[] | undefined)?.[0]) || (body.destination as string);
      realPlaces = await fetchDestinationPlaces(placesQuery, process.env.GOOGLE_MAPS_KEY);
      console.log(`[generate-itinerary] Real places for "${body.destination}": ${(realPlaces as {restaurants: unknown[]}).restaurants.length} restaurants, ${(realPlaces as {attractions: unknown[]}).attractions.length} attractions`);
    } catch (err) {
      console.warn('[generate-itinerary] Could not fetch real places:', err);
    }
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
    curiosityLevel: body.curiosityLevel as number,
    modality: body.modality as string,
    accommodationType: body.accommodationType as string,
    bookedFlight: body.bookedFlight as BookedFlight | null,
    bookedHotel: body.bookedHotel as BookedHotel | null,   // legacy
    bookedHotels: body.bookedHotels as BookedHotel[],      // preferred
    mustHaves: (body.mustHaves as string[] | undefined) ?? [],
    destinations: (body.destinations as string[] | undefined) ?? [],
    realPlaces,
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
                      foodieTips: dayObj.foodieTips ?? null,
                    });
                    delete dayObj.title;
                    delete dayObj.practicalNotes;
                    delete dayObj.hotelSuggestions;
                    delete dayObj.foodieTips;
                  }

                  send({ type: 'day', index: dayIndex, data: dayObj });
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
