import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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
  realPlaces?: { restaurants: GooglePlace[]; attractions: GooglePlace[] } | null;
}) {
  const {
    destination, startDate, endDate, tripLength,
    groupType, priorities, budget, budgetBreakdown,
    ageRanges, accessibilityNeeds,
    localMode, curiosityLevel, modality, accommodationType,
    bookedFlight, realPlaces,
  } = params;

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

  // Photography guidance — iconic spots always included; extra depth when photography is a priority
  const photoText = priorities.includes('photography')
    ? `\n- PHOTOGRAPHY PRIORITY: In addition to the iconic must-photograph landmarks (always required — see Rule 11), each activity description should note photographic potential with golden hour timing, interesting angles, and any access restrictions. Add 1-2 extra photoSpots per day that go beyond the famous spots — local viewpoints, rooftop bars with skyline views, murals, reflections, etc. Include at least one spot that most tourists miss.`
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
    preBookingText += `\nPRE-BOOKED FLIGHTS (${bookedFlight.airline || ''} ${bookedFlight.flightNumber || ''}):
  ${outbound}
  ${returnFlight}
  → Day 1 must account for arrival time — no activities before the flight lands. Last day must end by departure time.
  → Flights are already paid; exclude flight cost from budget recommendations.`;
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
- Destination: ${destination}
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
- Travel style: ${travelStyleText}${localModeText}${modalityText}${accommodationText}${sportsText}${photoText}${preBookingText}

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
    Choose hotels that are: (1) real and accurately named, (2) well-located for the day's activities — ideally central or near transport hubs, (3) highly regarded for their category. Vary the 3 suggestions slightly — e.g. one closer to the main sights, one in a quieter/hipper neighborhood, one that offers the best value. The bookingUrl should be a Booking.com search URL pre-filled with the hotel name and destination city and the trip dates.` : ''}
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
    "practicalNotes": { ... (day 1 only) },
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
    "meetupTime": "19:00",
    "meetupLocation": "Hotel lobby or central landmark"
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
- mode: walk | rideshare | taxi | metro | bus | ferry | water-taxi | tuk-tuk | cable-car | tram
- durationMins: estimated travel time in minutes
- distanceMiles: distance in miles (use 0 for rideshare/taxi where exact distance varies by route)
- notes: brief landmark-based direction or useful transit tip (can be null if self-evident)
Set transportToNext to null on the last activity of each day (no onward journey needed).
${walkingRuleText}

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
10. meetupLocation should be a real landmark or the hotel area. For solo or couple trips (groupType "solo" or "couple"), set meetupTime and meetupLocation to null on every day — group meetup points are irrelevant for individual travelers.
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      // Return demo data if no key configured
      return NextResponse.json({
        error: 'NO_API_KEY',
        message: 'Add ANTHROPIC_API_KEY to .env.local to enable AI generation',
      }, { status: 503 });
    }

    // Pre-fetch real places from Google Places before running Claude.
    // This prevents the AI from hallucinating venue names and addresses.
    let realPlaces = null;
    if (process.env.GOOGLE_MAPS_KEY) {
      try {
        realPlaces = await fetchDestinationPlaces(body.destination, process.env.GOOGLE_MAPS_KEY);
        console.log(`[generate-itinerary] Real places for "${body.destination}": ${realPlaces.restaurants.length} restaurants, ${realPlaces.attractions.length} attractions`);
      } catch (err) {
        console.warn('[generate-itinerary] Could not fetch real places, proceeding without constraint:', err);
      }
    }

    const prompt = buildPrompt({
      destination: body.destination,
      startDate: body.startDate,
      endDate: body.endDate,
      tripLength: body.tripLength,
      groupType: body.groupType,
      priorities: body.priorities,
      budget: body.budget,
      budgetBreakdown: body.budgetBreakdown,
      ageRanges: body.ageRanges,
      accessibilityNeeds: body.accessibilityNeeds,
      localMode: body.localMode,
      curiosityLevel: body.curiosityLevel,
      modality: body.modality,
      accommodationType: body.accommodationType,
      bookedFlight: body.bookedFlight,
      bookedHotel: body.bookedHotel,   // legacy — still accepted
      bookedHotels: body.bookedHotels, // preferred array
      realPlaces,
    });

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: prompt },
        // Prefill forces Claude to start directly with the JSON array
        { role: 'assistant', content: '[' },
      ],
    });

    // Since we prefilled '[', prepend it back onto the response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    const rawText = '[' + responseText;

    // Robustly extract the JSON array by finding first [ and last ]
    // This handles markdown fences, preamble text, and trailing commentary
    const arrayStart = rawText.indexOf('[');
    const arrayEnd = rawText.lastIndexOf(']');

    if (arrayStart === -1 || arrayEnd === -1 || arrayEnd <= arrayStart) {
      throw new Error('Response did not contain a JSON array');
    }

    let cleaned = rawText.slice(arrayStart, arrayEnd === -1 ? rawText.length : arrayEnd + 1);

    // Fix common Claude JSON quirks:
    // 1. Smart/curly quotes → straight quotes
    cleaned = cleaned
      .replace(/[\u201C\u201D]/g, '"')  // " "
      .replace(/[\u2018\u2019]/g, "'"); // ' '

    // 2. Trailing commas before } or ] (invalid JSON)
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

    let itinerary;
    try {
      itinerary = JSON.parse(cleaned);
    } catch {
      // Response was likely truncated — recover by finding the last complete day object
      console.warn('[generate-itinerary] Initial parse failed, attempting truncation recovery...');
      const recovered = recoverTruncatedArray(cleaned);
      try {
        itinerary = JSON.parse(recovered);
        console.log('[generate-itinerary] Recovered', itinerary.length, 'days from truncated response');
      } catch (parseErr) {
        const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        throw new Error(`JSON parse failed: ${errMsg}`);
      }
    }

    if (!Array.isArray(itinerary)) {
      throw new Error('Response was not a JSON array');
    }

    // Extract trip-level metadata from day 1 (generated once, not repeated per day)
    // These fields are included on day 1 by the prompt and stripped here for clean storage.
    const title = (itinerary[0]?.title as string | undefined) || undefined;
    const practicalNotes = itinerary[0]?.practicalNotes || undefined;
    const hotelSuggestions = itinerary[0]?.hotelSuggestions || undefined;

    // Remove meta fields from day objects — they live in the trip meta, not per-day data
    if (itinerary[0]) {
      delete (itinerary[0] as Record<string, unknown>).title;
      delete (itinerary[0] as Record<string, unknown>).practicalNotes;
      delete (itinerary[0] as Record<string, unknown>).hotelSuggestions;
    }

    // TODO (Booking.com affiliate): Once registered at partners.booking.com, append
    // &aid=YOUR_AFFILIATE_ID to each hotelSuggestion.bookingUrl here before returning.
    // The URLs are already structured as Booking.com search links — just add the aid param.

    // TODO (Google Maps API): Once GOOGLE_MAPS_KEY is available, add a post-processing
    // step here to verify venue addresses, fetch live ratings, and enrich each activity
    // with real-time Google Places data (rating, hours, photo). This will replace the
    // "verified: true" placeholder values that Claude generates itself.
    // Example: await enrichWithGooglePlaces(itinerary, process.env.GOOGLE_MAPS_KEY);

    return NextResponse.json({ itinerary, title, practicalNotes, hotelSuggestions, model: 'claude-sonnet-4-5' });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[generate-itinerary]', message);
    return NextResponse.json({ error: 'GENERATION_FAILED', message }, { status: 500 });
  }
}
