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
  bookedHotel?: BookedHotel | null;
}) {
  const {
    destination, startDate, endDate, tripLength,
    groupType, priorities, budget, budgetBreakdown,
    ageRanges, accessibilityNeeds,
    localMode, curiosityLevel, modality, accommodationType,
    bookedFlight, bookedHotel,
  } = params;

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

  // Photography-specific guidance
  const photoText = priorities.includes('photography')
    ? `\n- PHOTOGRAPHY PRIORITY: Each activity description should note photographic potential. Mention golden hour timing, interesting angles, and any restrictions. Include at least one purely photography-focused location per day.`
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

  if (bookedHotel) {
    preBookingText += `\nPRE-BOOKED HOTEL:
  - Name: ${bookedHotel.name || 'pre-booked hotel'}${bookedHotel.address ? `, ${bookedHotel.address}` : ''}
  - Check-in: ${bookedHotel.checkIn || startDate}, Check-out: ${bookedHotel.checkOut || endDate}
  → Use this as the home base. Day 1 meetup location and daily routes should reference this hotel.
  → Hotel cost is already paid; exclude hotel from budget recommendations.`;
  }

  return `Generate a ${tripLength}-day travel itinerary for the following trip:

TRIP DETAILS:
- Destination: ${destination}
- Dates: ${startDate} to ${endDate} (${tripLength} days)
- Group type: ${groupType || 'friends'}
- Budget: $${budget.toLocaleString()} total
  - Flights: $${budgetBreakdown.flights}
  - Hotel: $${budgetBreakdown.hotel}
  - Food: $${budgetBreakdown.food}
  - Experiences: $${budgetBreakdown.experiences}
  - Transport: $${budgetBreakdown.transport}
- Priorities: ${priorityText}
- Age ranges in group: ${ageRanges.length > 0 ? ageRanges.join(', ') : '18-35'}
- Accessibility needs: ${accessibilityText}
- Travel style: ${travelStyleText}${localModeText}${modalityText}${accommodationText}${sportsText}${photoText}${preBookingText}

OUTPUT FORMAT — return a JSON array of exactly ${tripLength} day objects:

[
  {
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
          "timeSlot": "09:00–11:30",
          "name": "Venue Name",
          "title": "Venue Name",
          "address": "Full street address, City, Country",
          "website": "https://venue-website.com",
          "isRestaurant": false,
          "track": "shared",
          "priceLevel": 1,
          "description": "One sentence description of why this is worth visiting",
          "costEstimate": 25,
          "confidence": 0.9,
          "verified": true,
          "packingTips": []
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

RULES:
1. Use REAL venue names and real addresses for ${destination}
2. Include 4-6 activities per day, spread naturally across the day (morning, midday, afternoon, evening)
3. Include at least 1 restaurant/cafe per day (isRestaurant: true)
4. timeSlot format must be "HH:MM–HH:MM" using an en-dash (–)
5. priceLevel: 0=free, 1=$, 2=$$, 3=$$$, 4=$$$$
6. costEstimate is per-person in USD
7. id format: "act_d{dayNumber}_{index}" (e.g. act_d1_1, act_d1_2)
8. Day themes should be evocative and specific: "Golden Circle & Geysers" not "Sightseeing Day"
9. Vary the pace — not every day should be packed. Include slower, wandering time.
10. Budget the activities realistically against the food/experiences budget provided
11. The first and last days should account for travel/arrival/departure logistics
12. meetupLocation should be a real landmark or the hotel area
13. photoSpots: include 1-3 per day — real named viewpoints or spots, specific time of day (sunrise/golden hour/blue hour/midday), and one actionable shooting tip. Every day must have at least one photo spot.
14. packingTips: for any outdoor, hiking, excursion, tour, or physical activity include 2-4 short packing tips (e.g. "Wear sturdy walking shoes", "Bring a water bottle", "Sunscreen essential"). Leave empty array [] for restaurants, museums, and low-key activities.
15. Respect the travel style: ${explorerPct >= 70 ? 'prioritize hidden gems and local spots over famous tourist sites' : explorerPct >= 40 ? 'balance iconic sights with local discoveries' : 'focus on well-reviewed and accessible attractions'}
16. Age ranges present: ${ageRanges.length > 0 ? ageRanges.join(', ') : '18-35'} — if children (Under 12 or 12-17) are in the group, ensure all shared-track activities are family-appropriate. Use split tracks to give adults-only options in the afternoon when children are present alongside adults.

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
      bookedHotel: body.bookedHotel,
    });

    const message = await client.messages.create({
      model: 'claude-opus-4-5',
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

    return NextResponse.json({ itinerary, model: 'claude-opus-4-5' });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[generate-itinerary]', message);
    return NextResponse.json({ error: 'GENERATION_FAILED', message }, { status: 500 });
  }
}
