import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { requireTripAiRole } from '@/lib/supabase/tripAccess';
import { checkAiCredits, incrementAiCreditsUsed } from '@/lib/supabase/aiCredits';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert travel itinerary parser. Given raw itinerary text (from a PDF, email, travel agent doc, etc.), you extract and restructure it into a clean JSON format.

You preserve ALL activities, times, venues, addresses, and notes from the source. If certain info is missing (like exact times), make reasonable inferences based on context. EXCEPTION — never invent or infer venue names or street addresses: only include an "address" that explicitly appears in the source text, otherwise set it to null. This keeps the parsed itinerary faithful to what the user uploaded (so we don't need to "correct" their real venues later).

Return ONLY valid JSON — no markdown, no explanation, no code fences.`;

function buildParsePrompt(rawText: string) {
  const textSection = rawText.trim()
    ? `RAW ITINERARY TEXT:\n---\n${rawText.slice(0, 12000)}\n---\n\n`
    : '';
  return `Parse the ${rawText.trim() ? 'following itinerary text' : 'itinerary in the attached document'} into a structured JSON format.\n\n${textSection}Return a JSON array of day objects. Each day must follow this exact structure:
{
  "day": <number>,
  "date": "<YYYY-MM-DD or best guess>",
  "city": "<the city this day takes place in, read from the source; default to the trip's main city>",
  "theme": "<one-line summary of the day, e.g. 'Arrival & City Exploration'>",
  "tracks": {
    "shared": [
      {
        "id": "<unique string like 'parsed_day1_act1'>",
        "title": "<activity name>",
        "name": "<same as title>",
        "timeSlot": "<e.g. '9:00 AM – 11:00 AM'>",
        "description": "<details from the itinerary>",
        "address": "<address ONLY if it explicitly appears in the source, else null — never invent one>",
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
- Set each day's "city" to the city that day takes place in (itineraries can span multiple cities — read it from the source). If a day's city isn't clear, default to the main destination city. This powers per-day weather, maps, and correct multi-city handling on regenerate.
- If no exact dates exist, use "2026-01-01", "2026-01-02", etc. as placeholders
- Every activity should go in "shared" tracks unless the itinerary specifically splits groups
- Keep original descriptions verbatim where possible
- Mark restaurants, cafes, bars, and dining experiences as isRestaurant: true
- Return the full array even if only 1 day is found

Also include a "meta" object AFTER the array, like this:
Return the response as:
{ "itinerary": [...days], "meta": { "destination": "<city, country>", "startDate": "<YYYY-MM-DD>", "endDate": "<YYYY-MM-DD>", "tripLength": <number>, "isCruise": <true|false>, "cruiseLine": "<cruise line name if applicable, else empty string>" } }

Cruise detection rules:
- isCruise = true ONLY when the source clearly references cruise terminology: "cruise", "ship", "port stop", "embarkation", "disembarkation", "all aboard time", "stateroom", "cabin", or a recognised cruise line.
- cruiseLine: extract from explicit mentions ("Royal Caribbean", "Carnival", "Norwegian", "MSC", "Disney", "Princess", "Holland America", "Celebrity", "Virgin Voyages", "Viking", etc.). Empty string if not stated.
- When uncertain, set isCruise = false. The user can correct from the itinerary page if needed.`;
}

// Extend the serverless timeout — this route makes a blocking Sonnet call parsing a full pasted/uploaded itinerary
// that can exceed Vercel's ~15s default. (OPS-1)
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  // AI import is a paid feature — Free uses the manual "blank trip" path.
  // Buying a Trip Pass sets subscription_tier='trip_pass' (Stripe webhook), so
  // this single check lets BOTH paid tiers through and blocks only pure Free.
  // (The client gates this too; this is the can't-bypass server enforcement.)
  if (auth.ctx.tier === 'free') {
    return NextResponse.json({
      error: 'AI_IMPORT_LOCKED',
      message: 'AI import is on Trip Pass and Travel Pro. On Free, create the trip manually and add your days — your group can still collaborate.',
    }, { status: 403 });
  }

  const body = await req.json();
  const { text, pdfBase64, fileName } = body;
  const tripId = typeof body?.tripId === 'string' ? body.tripId : undefined;

  const isPdf = !!pdfBase64;

  // Cap the PDF payload (~10 MB decoded ≈ 14M base64 chars) to bound
  // document-token cost / function memory (QA #22).
  if (isPdf && (typeof pdfBase64 !== 'string' || pdfBase64.length > 14_000_000)) {
    return NextResponse.json({ error: 'PDF_TOO_LARGE', message: 'PDF is too large — please use one under ~10 MB.' }, { status: 413 });
  }

  if (!isPdf && (!text || text.trim().length < 50 || text === '__PDF__')) {
    return NextResponse.json({ error: 'TOO_SHORT', message: 'Not enough text to parse an itinerary.' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'NO_API_KEY' }, { status: 500 });
  }

  // Role gate (when overwriting an existing trip): only org/co-org can
  // parse-into a trip they're already on. New-trip uploads (no tripId)
  // skip the role gate — the user IS the future organizer.
  if (tripId) {
    const roleCheck = await requireTripAiRole(tripId);
    if (!roleCheck.ok) return roleCheck.response;
  }

  // ── Credit gate ──────────────────────────────────────────────────────────
  // Two-phase: check before the AI call, increment after success. Failed
  // parses don't consume credits — the user can retry without burning quota
  // for an error that wasn't their fault. tripId routes the charge to a
  // Trip Pass pool when overwriting an existing trip with one.
  const credits = await checkAiCredits(auth.ctx.userId, auth.ctx.tier, 'parse_itinerary', tripId);
  if (!credits.ok) return credits.response;

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
            },
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

    // Guard: ensure the response block is a text block before accessing .text
    if (!response.content[0] || response.content[0].type !== 'text') {
      throw new Error('Unexpected response type from AI — expected a text block');
    }

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

    // Charge the credit AFTER a successful parse.
    await incrementAiCreditsUsed(auth.ctx.userId, credits.ctx);

    // Note (verify-before-show): unlike the generator, we deliberately do NOT
    // run validateAndCorrectDay here. A parsed itinerary's venues are the
    // user's OWN uploaded plan (user-asserted, not AI-invented), so "correcting"
    // a real-but-Places-unfindable venue would corrupt their data. Instead the
    // prompt prevents fabrication at the source (addresses only when present in
    // the text) and now extracts day.city for weather/maps/multi-city. (AI-1/AI-3)
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
