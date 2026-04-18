import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * POST /api/generate-packing
 * Generates an AI packing list for a trip and saves it to Supabase.
 * Body: { tripId, destination, startDate?, endDate? }
 *
 * Returns { items } on success.
 * Non-blocking — caller should fire-and-forget.
 */
export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'NO_API_KEY' }, { status: 500 });
    }

    const { tripId, destination, startDate, endDate } = await req.json();
    if (!tripId || !destination) {
      return NextResponse.json({ error: 'tripId and destination required' }, { status: 400 });
    }

    // Derive trip length from dates if available
    let tripLength = 7; // default
    if (startDate && endDate) {
      const ms = new Date(endDate).getTime() - new Date(startDate).getTime();
      const days = Math.round(ms / (1000 * 60 * 60 * 24));
      if (days > 0) tripLength = days;
    }

    const prompt = `You are a travel packing expert. Generate a smart, destination-specific packing list for a trip to "${destination}" lasting ${tripLength} days.

Consider: climate, culture, typical activities, whether the destination requires formal attire or special gear.

Return ONLY valid JSON — no markdown, no explanation:

{
  "items": [
    { "name": "<item name>", "category": "<Clothing|Accessories|Documents|Electronics|Toiletries|Medications|Gear>" },
    ...
  ]
}

Rules:
- 25–40 items total
- Cover all 7 categories proportionally
- Be specific to the destination (e.g. sunscreen for beach trips, thermal layers for cold climates, adapter plugs for overseas)
- Avoid vague items like "clothes" — be specific ("lightweight linen shirts", "waterproof hiking boots")
- Documents category: passport, travel insurance, booking confirmations, etc.
- Medications: include general travel health essentials`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '{' },
      ],
    });

    let raw = '{' + (response.content[0] as { type: string; text: string }).text;
    raw = raw.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/,\s*([}\]])/g, '$1');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON found');
    raw = raw.slice(start, end + 1);

    const parsed = JSON.parse(raw);
    const items: Array<{ name: string; category: string }> = parsed.items ?? [];

    if (items.length === 0) throw new Error('Empty packing list');

    // Save items to Supabase
    const supabase = createAdminClient();
    const rows = items.map((item, idx) => ({
      trip_id: tripId,
      user_id: null,
      name: item.name,
      category: item.category,
      packed: false,
      display_order: idx + 1,
    }));

    const { error } = await supabase.from('packing_items').insert(rows);
    if (error) {
      console.error('generate-packing insert error:', JSON.stringify(error));
      return NextResponse.json({ error: 'Failed to save packing items' }, { status: 500 });
    }

    return NextResponse.json({ items });
  } catch (err) {
    console.error('generate-packing error:', err);
    return NextResponse.json({
      error: 'GENERATION_FAILED',
      message: err instanceof Error ? err.message : 'Failed to generate packing list',
    }, { status: 500 });
  }
}
