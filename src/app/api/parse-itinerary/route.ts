import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/supabase/requireAuth';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert travel itinerary parser. Given raw itinerary text (from a PDF, email, travel agent doc, etc.), you extract and restructure it into a clean JSON format.

You preserve ALL activities, times, venues, addresses, and notes from the source. If certain info is missing (like exact times), make reasonable inferences based on context.

Return ONLY valid JSON — no markdown, no explanation, no code fences.`;

function buildParsePrompt(rawText: string) {
  const textSection = rawText.trim()
    ? `RAW ITINERARY TEXT:\n---\n${rawText.slice(0, 12000)}\n---\n\n`
    : '';
  return `Parse the ${rawText.trim() ? 'following itinerary text' : 'itinerary in the attached document'} into a structured JSON format.\n\n${textSection}Return a JSON array of day objects. Each day must follow this exact structure:
{
  "day": <number>,
  "date": "<YYYY-MM-DD or best guess>",
  "theme": "<one-line summary of the day, e.g. 'Arrival & City Exploration'>",
  "tracks": {
    "shared": [
      {
        "id": "<unique string like 'parsed_day1_act1'>",
        "title": "<activity name>",
        "name": "<same as title>",
        "timeSlot": "<e.g. '9:00 AM – 11:00 AM'>",
        "description": "<details from the itinerary>",
        "address": "<address if mentioned, else null>",
        "website": null,
        "isRestaurant": <true if dining/restaurant>,
        "track": "shared",
        "costEstimate": <number in USD, 0 if unknown>,
        "confidence": 0.9,
        "verified": false,
        "dayNumber": <same as day>
      }
    ],
    "track_a": [],
    "track_b": []
  },
  "meetupTime": null,
  "meetupLocation": null
}

Important rules:
- Extract the destination and trip dates from the text if present
- If no exact dates exist, use "2026-01-01", "2026-01-02", etc. as placeholders
- Every activity should go in "shared" tracks unless the itinerary specifically splits groups
- Keep original descriptions verbatim where possible
- Mark restaurants, cafes, bars, and dining experiences as isRestaurant: true
- Return the full array even if only 1 day is found

Also include a "meta" object AFTER the array, like this:
Return the response as:
{ "itinerary": [...days], "meta": { "destination": "<city, country>", "startDate": "<YYYY-MM-DD>", "endDate": "<YYYY-MM-DD>", "tripLength": <number> } }`;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await req.json();
  const { text, pdfBase64, fileName } = body;

  const isPdf = !!pdfBase64;

  if (!isPdf && (!text || text.trim().length < 50 || text === '__PDF__')) {
    return NextResponse.json({ error: 'TOO_SHORT', message: 'Not enough text to parse an itinerary.' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'NO_API_KEY' }, { status: 500 });
  }

  try {
    // Build message content — native PDF document for PDFs, text prompt for everything else
    type MessageParam = Parameters<typeof client.messages.create>[0]['messages'][number];
    const userMessage: MessageParam = isPdf
      ? {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            {
              type: 'text',
              text: `This is the itinerary PDF${fileName ? ` (${fileName})` : ''}. ${buildParsePrompt('')}`,
            },
          ],
        }
      : {
          role: 'user',
          content: buildParsePrompt(text),
        };

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        userMessage,
      ],
    });

    // Strip markdown fences and normalize quotes/trailing commas
    let rawText = (response.content[0] as { type: string; text: string }).text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/,\s*([}\]])/g, '$1')
      .trim();

    // Extract the outer JSON object
    const start = rawText.indexOf('{');
    const end = rawText.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No JSON object found');
    rawText = rawText.slice(start, end + 1);

    const parsed = JSON.parse(rawText);

    if (!parsed.itinerary || !Array.isArray(parsed.itinerary)) {
      throw new Error('Invalid structure — missing itinerary array');
    }

    return NextResponse.json({
      itinerary: parsed.itinerary,
      meta: parsed.meta || {},
    });
  } catch (err) {
    console.error('parse-itinerary error:', err);
    return NextResponse.json({
      error: 'PARSE_FAILED',
      message: err instanceof Error ? err.message : 'Failed to parse itinerary',
    }, { status: 500 });
  }
}
