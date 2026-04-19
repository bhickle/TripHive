import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/supabase/requireAuth';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * POST /api/generate-discover
 * Generates destination-specific discover items (experiences, dining, nature, etc.)
 * for the "What's Out There" tab.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

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
  "category": "experiences",
  "rating": 4.7,
  "priceRange": "$50-$100",
  "description": "2-sentence description with specific local details",
  "duration": "2-3 hours",
  "difficulty": "Easy",
  "location": "Specific neighborhood, beach, or area name",
  "affiliatePartner": "Viator",
  "affiliateCommission": 8,
  "bookable": true,
  "imageGradient": "from-sky-400 to-blue-600",
  "matchScore": 95
}

Rules:
- category must be exactly one of: "experiences", "dining", "nature", "sights", "sports", "events"
- rating: number between 4.2 and 4.9
- priceRange: one of: "Free", "$25-$50", "$50-$100", "$80-$150", "$100-$200", "$$", "$$$"
- difficulty: one of: "Easy", "Moderate", "Challenging"
- affiliatePartner: dining entries get "OpenTable", free nature activities get "Recreation.gov", experiences get "Viator"
- imageGradient: Tailwind gradient matching the vibe (ocean=cyan/blue, jungle=green, desert=amber/orange, nightlife=purple/indigo)
- matchScore: number between 82 and 99, descending order (best match first)
- Mix categories: at least 4 experiences, 2 dining, 2 nature or sights, 1 sports or events
- Use real, named places that actually exist at ${destination}
- Return ONLY the JSON array, nothing else`;

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [
        { role: 'user', content: prompt },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Strip markdown fences, fix smart quotes and trailing commas
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,(\s*[}\]])/g, '$1')
      .trim();

    // Ensure the response is wrapped in an array — add brackets only if the model omitted them
    const raw = cleaned.startsWith('[') ? cleaned : '[' + cleaned + ']';

    // Find the outermost JSON array
    const arrStart = raw.indexOf('[');
    const arrEnd = raw.lastIndexOf(']');
    if (arrStart === -1 || arrEnd === -1) throw new Error('No JSON array in response');

    const items = JSON.parse(raw.slice(arrStart, arrEnd + 1));
    if (!Array.isArray(items)) throw new Error('Expected array');

    return NextResponse.json({ items });
  } catch (err) {
    // Log full error details — Anthropic SDK errors carry .status and .name
    const message = err instanceof Error ? err.message : String(err);
    const errName = (err as Record<string, unknown>)?.constructor?.name ?? 'UnknownError';
    const errStatus = (err as Record<string, unknown>)?.status;
    const hasKey = !!process.env.ANTHROPIC_API_KEY;
    console.error('[generate-discover] FULL_ERROR:', JSON.stringify({ type: errName, status: errStatus, message, hasKey }));
    return NextResponse.json({
      error: 'Failed to generate recommendations',
      detail: `${errName}: ${message}`,
      hasKey,
    }, { status: 500 });
  }
}
