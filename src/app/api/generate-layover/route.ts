import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert layover travel advisor with deep knowledge of international airports worldwide.
Return ONLY valid JSON — no markdown, no explanation, no code fences.
Always include airside options for short layovers and city excursions only when there is enough time.
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

  return `Generate layover activity suggestions for airport code: ${airportCode.toUpperCase()}
Layover duration: ${layoverHours} hours
${context}

Rules:
- Only include activities that fit within the ${layoverHours}-hour layover (account for transit time back to gate)
- For layovers under 3 hours: airside only
- For layovers 3-5 hours: airside + landside terminal only
- For layovers over 5 hours: can include quick city excursions if no visa required for transit passengers
- Include lounge options if duration >= 2 hours
- Tailor suggestions to the group type and priorities

Return JSON with this exact shape:
{
  "airport": {
    "code": "LHR",
    "name": "London Heathrow Airport",
    "city": "London",
    "country": "United Kingdom",
    "transitVisaNote": "UK Transit Visa may be required depending on nationality — check before exiting airside"
  },
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
Generate 5-8 suggestions ordered from most to least recommended.`;
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
};

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
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
      return NextResponse.json({
        ...MOCK_RESPONSE,
        airport: {
          ...MOCK_RESPONSE.airport,
          code: airport.toUpperCase(),
          name: `${airport.toUpperCase()} International Airport`,
          city: airport.toUpperCase(),
          transitVisaNote: 'Check local transit visa requirements before planning a city visit.',
        },
      });
    }

    const userPrompt = buildUserPrompt(
      airport,
      layoverHours,
      groupType,
      priorities,
      ageRanges,
      accessibilityNeeds,
    );

    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: '{' },
      ],
    });

    const raw = '{' + (message.content[0] as { text: string }).text;

    // Robust JSON cleaning (same pattern as generate-itinerary)
    const cleaned = raw
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/,\s*([}\]])/g, '$1');

    const parsed = JSON.parse(cleaned);
    return NextResponse.json(parsed);

  } catch (err) {
    console.error('[generate-layover] Error:', err);
    return NextResponse.json(
      { error: 'GENERATION_FAILED', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
