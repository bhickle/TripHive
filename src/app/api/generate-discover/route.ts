import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * POST /api/generate-discover
 * Generates destination-specific discover items (experiences, dining, nature, etc.)
 * for the "What's Out There" tab.
 */
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'NO_API_KEY' }, { status: 500 });
  }

  const { destination } = await request.json();
  if (!destination) {
    return NextResponse.json({ error: 'destination required' }, { status: 400 });
  }

  const prompt = `You are a travel recommendations engine. Generate 10 highly specific, real-world activities and experiences for travelers visiting: ${destination}.

Return ONLY a valid JSON array (no markdown, no explanation) with exactly 10 items. Each item must follow this exact shape:

{
  "id": "gen_1",
  "name": "Real place or activity name",
  "category": one of: "experiences" | "dining" | "nature" | "sights" | "sports" | "events",
  "rating": number between 4.2 and 4.9,
  "priceRange": one of: "Free" | "$25–$50" | "$50–$100" | "$80–$150" | "$100–$200" | "$$" | "$$$",
  "description": "2-sentence description with specific local details",
  "duration": "X hours" or "X–Y hours" or "Half day" or "Full day",
  "difficulty": "Easy" | "Moderate" | "Challenging",
  "location": "Specific neighborhood, beach, or area name",
  "affiliatePartner": one of: "Viator" | "Ticketmaster" | "OpenTable" | "Recreation.gov" | "Booking.com",
  "affiliateCommission": 8,
  "bookable": true or false,
  "imageGradient": a Tailwind CSS gradient string like "from-sky-400 to-blue-600" that suits the vibe,
  "matchScore": number between 82 and 99
}

Rules:
- Mix categories: at least 4 experiences, 2 dining, 2 nature or sights, 1 sports or events
- Use real, named places that actually exist at ${destination}
- Dining entries get affiliatePartner "OpenTable", free nature activities get "Recreation.gov", experiences get "Viator"
- imageGradient should match the vibe (ocean = cyan/blue, jungle = green, desert = amber/orange, nightlife = purple/indigo, etc.)
- matchScore descending order (best match first)
- Return ONLY the JSON array, nothing else`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse — strip any accidental markdown fences
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const items = JSON.parse(cleaned);

    if (!Array.isArray(items)) throw new Error('Expected array');

    return NextResponse.json({ items });
  } catch (err) {
    console.error('generate-discover error:', err);
    return NextResponse.json({ error: 'Failed to generate recommendations' }, { status: 500 });
  }
}
