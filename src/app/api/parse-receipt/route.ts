import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/supabase/requireAuth';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a receipt parsing assistant. Extract structured data from receipt images.
Return ONLY valid JSON — no markdown, no explanation, no code fences.
Be generous in interpretation: if an item is partially cut off, make a reasonable guess.
Amounts are always in the currency shown on the receipt.`;

const USER_PROMPT = `Extract all information from this receipt and return JSON with this exact shape:

{
  "merchant": "Restaurant or store name",
  "total": 42.50,
  "subtotal": 38.00,
  "tax": 3.50,
  "tip": 1.00,
  "currency": "USD",
  "date": "2026-05-12",
  "category": "dining",
  "lineItems": [
    { "description": "Item name", "amount": 12.00, "quantity": 1 }
  ]
}

Category must be one of: "dining", "accommodation", "transport", "experiences", "other"
If date is not visible, use today's date.
If a field is not present on the receipt, omit it (except merchant, total, currency, category, and lineItems which are required).
lineItems should list every individual item/charge on the receipt.`;

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      // Return plausible mock data when no API key is configured
      return NextResponse.json({
        merchant: 'Café Reykjavik',
        total: 64.50,
        subtotal: 58.00,
        tax: 6.50,
        currency: 'USD',
        date: new Date().toISOString().split('T')[0],
        category: 'dining',
        lineItems: [
          { description: 'Skyr pancakes', amount: 14.00, quantity: 2 },
          { description: 'Lamb soup', amount: 16.00, quantity: 1 },
          { description: 'Cappuccino', amount: 6.00, quantity: 2 },
          { description: 'Arctic char', amount: 22.00, quantity: 1 },
        ],
        _mock: true,
      });
    }

    const body = await request.json();
    const { imageBase64, mediaType = 'image/jpeg' } = body;

    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 });
    }

    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: USER_PROMPT,
            },
          ],
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const raw = '{' + responseText;

    // Strip any trailing commentary after the JSON object
    const objEnd = raw.lastIndexOf('}');
    if (objEnd === -1) throw new Error('No JSON object found in response');
    const cleaned = raw.slice(0, objEnd + 1)
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,(\s*[}\]])/g, '$1');

    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (!parsed.merchant || parsed.total === undefined || !parsed.currency || !parsed.category) {
      throw new Error('Missing required fields in parsed receipt');
    }

    return NextResponse.json(parsed);

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[parse-receipt]', message);
    return NextResponse.json({ error: 'PARSE_FAILED', message }, { status: 500 });
  }
}
