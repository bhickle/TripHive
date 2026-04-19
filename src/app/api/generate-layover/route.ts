import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/supabase/requireAuth';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert layover travel advisor with deep knowledge of international airports worldwide.
Return ONLY valid JSON — no markdown, no explanation, no code fences.
Always tailor suggestions to the layover duration tier: short layovers stay airside, medium layovers stay in the airport, long layovers can include city excursions and hotel rest options.
Consider visa-on-arrival rules and transit without visa (TWOV) policies when suggesting city excursions.`;

function buildUserPrompt(
  airportCode: string,
  layoverHours: number,
  groupType: string,
  priorities: string[],
  ageRanges: string[],
  accessibilityNeeds: string[],
): string {
  const context = [
    groupType && `Group type: ${groupType}`,
    priorities.length && `Priorities: ${priorities.join(', ')}`,
    ageRanges.length && `Age ranges in group: ${ageRanges.join(', ')}`,
    accessibilityNeeds.length && `Accessibility needs: ${accessibilityNeeds.join(', ')}`,
  ].filter(Boolean).join('\n');

  // ── Tier-specific instructions ───────────────────────────────────────────────
  let tierInstructions: string;
  let suggestionCount: string;

  if (layoverHours < 3) {
    tierInstructions = `TIER: SHORT LAYOVER (under 3 hours)
- ALL suggestions must be airside (no immigration / passport control needed)
- Focus on: airport lounges, quick bites at terminal restaurants, duty-free shopping, express spa/massage, quiet seating & charging zones
- Do NOT suggest anything that requires exiting security or transiting through immigration
- Keep every activity fast and low-stress — the traveler needs buffer time to reach their gate
- Prioritise convenience and speed over depth`;
    suggestionCount = '6-8';
  } else if (layoverHours < 6) {
    tierInstructions = `TIER: MEDIUM LAYOVER (3–6 hours)
- Primarily airside suggestions (at least 70% of results)
- Airside: lounges, terminal restaurants, shopping, spa, observation decks, airport museums/art
- Landside (within airport campus only): airport-connected transit hotels for a day-use nap room, airport mall areas reachable without a city trip
- City excursions are NOT recommended for this duration — realistic transit time makes missing the flight too risky
- Flag any suggestion that requires passing through passport control with requiresExitAirside: true`;
    suggestionCount = '6-8';
  } else {
    tierInstructions = `TIER: LONG LAYOVER (6+ hours)
- Mix of airside amenities AND genuine city excursions (where visa/transit rules allow)
- Account for realistic round-trip transit time to/from the city centre in every city suggestion
- Include airport-connected or nearby transit hotel options for travellers who want to sleep (captured in hotelSuggestions — see schema)
- Flag all city excursions with requiresExitAirside: true and a clear transit visa warning when applicable
- Still include some airside options for travellers who prefer not to exit the terminal`;
    suggestionCount = '8-10';
  }

  // ── Hotel schema block (only injected for 6 + hr layovers) ──────────────────
  const hotelSchemaExample = layoverHours >= 6 ? `
  "hotelSuggestions": [
    {
      "name": "Novotel London Heathrow",
      "stars": 4,
      "distanceFromAirport": "Connected via covered walkway to T1/T2/T3",
      "priceRange": "$120–180 overnight / day-use from $60",
      "why": "Noise-dampened rooms, pool, gym, and 24-hr check-in make it ideal for a mid-journey rest.",
      "checkInNote": "Day-use rooms available 8 am–6 pm; book via the hotel website at least 24 hrs ahead."
    }
  ],` : '';

  const hotelInstruction = layoverHours >= 6
    ? `\nInclude 3–4 hotelSuggestions — prioritise airport-connected or transit hotels that offer day-use / hour-rate rooms.\n`
    : '';

  return `Generate layover activity suggestions for airport code: ${airportCode.toUpperCase()}
Layover duration: ${layoverHours} hours
${context}

${tierInstructions}
${hotelInstruction}
Return JSON with this exact shape:
{
  "airport": {
    "code": "LHR",
    "name": "London Heathrow Airport",
    "city": "London",
    "country": "United Kingdom",
    "transitVisaNote": "UK Transit Visa may be required depending on nationality — check before exiting airside"
  },${hotelSchemaExample}
  "suggestions": [
    {
      "id": "unique_id",
      "title": "Activity name",
      "category": "lounge",
      "duration": "2-3 hrs",
      "location": "Terminal 2, Level 5",
      "description": "Compelling 1-2 sentence description with specific details.",
      "distance": "Airside",
      "cost": "$45 per person",
      "rating": 4.4,
      "icon": "🛋️",
      "requiresExitAirside": false,
      "bookingTip": "Optional: brief note on how to access or book"
    }
  ]
}

category must be one of: food, shopping, lounge, sightseeing, relax
rating must be between 3.5 and 5.0
Generate ${suggestionCount} suggestions ordered from most to least recommended.`;
}

// ─── Mock fallback (used when ANTHROPIC_API_KEY is not set) ──────────────────

const MOCK_RESPONSE = {
  airport: {
    code: 'LHR',
    name: 'London Heathrow Airport',
    city: 'London',
    country: 'United Kingdom',
    transitVisaNote: 'UK Transit Visa may be required for some nationalities — check gov.uk before planning a city visit.',
  },
  suggestions: [
    { id: 'l1', title: 'Plaza Premium Lounge', category: 'lounge', duration: '2-4 hrs', location: 'Terminal 2, Level 5', description: 'Hot shower, buffet dining, premium open bar, and comfortable recliners. Perfect for recharging between long-haul flights.', distance: 'Airside', cost: '$45 per person', rating: 4.3, icon: '🛋️', requiresExitAirside: false, bookingTip: 'Book online in advance for a 10% discount.' },
    { id: 'l2', title: 'Gordon Ramsay Plane Food', category: 'food', duration: '1-1.5 hrs', location: 'Terminal 5', description: "Celebrity chef restaurant with elevated British classics and a full bar. Worth the splurge if you're in T5.", distance: 'Airside (T5)', cost: '$$–$$$', rating: 4.1, icon: '🍽️', requiresExitAirside: false },
    { id: 'l3', title: 'Heathrow Express + Hyde Park', category: 'sightseeing', duration: '3-5 hrs', location: 'Central London', description: '15-min express train to Paddington. Stroll Hyde Park, catch a Thames view, grab fish & chips — then sprint back.', distance: '15 min train', cost: '$30 roundtrip + spending', rating: 4.7, icon: '🏛️', requiresExitAirside: true, bookingTip: 'Allow 90 min buffer before boarding. Check UK transit visa requirements.' },
    { id: 'l4', title: 'World Duty Free', category: 'shopping', duration: '30-60 min', location: 'All Terminals', description: 'Massive duty-free spanning whisky, luxury cosmetics, British chocolates, and designer brands. Great for gifts.', distance: 'Airside', cost: 'Varies', rating: 4.0, icon: '🛍️', requiresExitAirside: false },
    { id: 'l5', title: 'Be Relax Spa', category: 'relax', duration: '30-90 min', location: 'Terminal 2 & 5', description: 'Express massages, facials, and a quiet nap room. Walk-in friendly or book ahead for busy periods.', distance: 'Airside', cost: '$40–$120', rating: 4.4, icon: '💆', requiresExitAirside: false },
  ],
  hotelSuggestions: [
    { name: 'Novotel London Heathrow', stars: 4, distanceFromAirport: 'Connected via covered walkway to T1/T2/T3', priceRange: '$120–180 overnight / day-use from $60', why: 'Noise-dampened rooms, pool, and 24-hr check-in make it ideal for a mid-journey rest.', checkInNote: 'Day-use rooms available 8 am–6 pm — book via the hotel website.' },
    { name: 'Sofitel London Heathrow', stars: 5, distanceFromAirport: 'Terminal 5 — directly connected airside', priceRange: '$200–320 overnight / day-use from $90', why: 'Chic 5-star hotel with a spa, indoor pool, and two restaurants — all steps from your gate.', checkInNote: 'Day-use rooms book quickly on busy travel days; reserve at least 24 hrs in advance.' },
  ],
};

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const {
      airport = 'LHR',
      layoverHours = 4,
      groupType = '',
      priorities = [],
      ageRanges = [],
      accessibilityNeeds = [],
    } = body;

    if (!process.env.ANTHROPIC_API_KEY) {
      // Return mock data — swap airport name so it feels responsive
      const hoursNum = parseFloat(layoverHours) || 4;
      const mock = { ...MOCK_RESPONSE };
      mock.airport = {
        ...MOCK_RESPONSE.airport,
        code: airport.toUpperCase(),
        name: `${airport.toUpperCase()} International Airport`,
        city: airport.toUpperCase(),
        transitVisaNote: 'Check local transit visa requirements before planning a city visit.',
      };
      // Only include hotel suggestions for 6+ hour layovers in mock
      if (hoursNum < 6) {
        const { hotelSuggestions: _omit, ...rest } = mock;
        void _omit;
        return NextResponse.json(rest);
      }
      return NextResponse.json(mock);
    }

    const hoursNum = parseFloat(layoverHours) || 4;
    const userPrompt = buildUserPrompt(
      airport,
      hoursNum,
      groupType,
      priorities,
      ageRanges,
      accessibilityNeeds,
    );

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    const raw = (message.content[0] as { text: string }).text;

    // Robust JSON cleaning
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/,\s*([}\]])/g, '$1')
      .trim();

    const parsed = JSON.parse(cleaned.startsWith('{') ? cleaned : '{' + cleaned);
    return NextResponse.json(parsed);

  } catch (err) {
    console.error('[generate-layover] Error:', err);
    return NextResponse.json(
      { error: 'GENERATION_FAILED', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
