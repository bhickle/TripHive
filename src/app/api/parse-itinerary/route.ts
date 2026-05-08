import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AI_CREDIT_COSTS, TIER_LIMITS } from '@/lib/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PARSE_COST = AI_CREDIT_COSTS.parse_itinerary;

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
{ "itinerary": [...days], "meta": { "destination": "<city, country>", "startDate": "<YYYY-MM-DD>", "endDate": "<YYYY-MM-DD>", "tripLength": <number>, "isCruise": <true|false>, "cruiseLine": "<cruise line name if applicable, else empty string>" } }

Cruise detection rules:
- isCruise = true ONLY when the source clearly references cruise terminology: "cruise", "ship", "port stop", "embarkation", "disembarkation", "all aboard time", "stateroom", "cabin", or a recognised cruise line.
- cruiseLine: extract from explicit mentions ("Royal Caribbean", "Carnival", "Norwegian", "MSC", "Disney", "Princess", "Holland America", "Celebrity", "Virgin Voyages", "Viking", etc.). Empty string if not stated.
- When uncertain, set isCruise = false. The user can correct from the itinerary page if needed.`;
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

  // ── Credit gate ──────────────────────────────────────────────────────────
  // Free tier gets ~10 parses/month before the server rejects with 402. Paid
  // tiers (trip_pass, explorer, nomad) and admin (no monthly cap configured)
  // pass through without enforcement — their cap is effectively the plan
  // limit but we don't enforce paid-tier ceilings here yet.
  //
  // TODO(launch): apply this same credit-gate pattern to generate-itinerary,
  // suggest-activity, and parse-transport. None of those routes currently
  // enforce credits server-side, so the credit counter on the settings page
  // is advisory only. Without server enforcement, a free user can't actually
  // be stopped from running unlimited generations. Tracked as a launch
  // blocker in CLAUDE.md.
  const admin = createAdminClient();
  let creditsUsedAtStart = 0;
  if (auth.ctx.tier === 'free') {
    const { data: profile } = await admin
      .from('profiles')
      .select('ai_credits_used')
      .eq('id', auth.ctx.userId)
      .single();
    creditsUsedAtStart = profile?.ai_credits_used ?? 0;
    const limit = TIER_LIMITS.free.aiCreditsPerMonth as number;
    if (creditsUsedAtStart + PARSE_COST > limit) {
      return NextResponse.json(
        {
          error: 'CREDITS_EXHAUSTED',
          message: `You've used your ${limit} AI credits for the month. Upgrade to a Trip Pass or higher tier for more.`,
          used: creditsUsedAtStart,
          limit,
        },
        { status: 402 },
      );
    }
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

    // Charge the credit AFTER a successful parse. Failed parses don't
    // consume credits — the user can retry without burning quota for an
    // error that wasn't their fault. Race condition: two simultaneous
    // parses both pass the cap check then both increment, allowing 1
    // over-charge. Acceptable on a 10-credit/mo free tier; tighten via
    // a Postgres RPC with atomic increment if it matters at scale.
    if (auth.ctx.tier === 'free') {
      await admin
        .from('profiles')
        .update({ ai_credits_used: creditsUsedAtStart + PARSE_COST })
        .eq('id', auth.ctx.userId);
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
