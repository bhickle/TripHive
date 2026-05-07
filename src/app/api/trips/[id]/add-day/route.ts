import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/supabase/requireAuth';

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert travel planner with deep local knowledge of destinations worldwide.
You create detailed, realistic, and genuinely useful single-day itineraries.
You always recommend REAL venues with accurate names and addresses.
You balance popular highlights with authentic off-the-beaten-path experiences.
Use American English spelling and phrasing throughout.
Photo spot tips must be ONE concise sentence only — no more than 20 words.
CRITICAL — NEVER INVENT EVENTS: Never assign a specific scheduled game, concert, show, or live event to a specific date.
Return ONLY valid JSON — no markdown, no explanation, no code fences.`;

// Same retry detector as src/app/api/generate-itinerary/route.ts. Anthropic 529s
// during peak load otherwise propagate as a hard failure to the user.
function isRetryableAnthropicError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { status?: number; error?: { error?: { type?: string }; type?: string }; message?: string };
  if (e.status === 429 || e.status === 500 || e.status === 502 || e.status === 503 || e.status === 504 || e.status === 529) return true;
  const innerType = e.error?.error?.type ?? e.error?.type;
  if (innerType === 'overloaded_error' || innerType === 'rate_limit_error' || innerType === 'api_error') return true;
  const msg = typeof e.message === 'string' ? e.message : '';
  if (msg.includes('overloaded_error') || msg.includes('rate_limit_error') || msg.includes('"Overloaded"')) return true;
  if (/ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|socket hang up/i.test(msg)) return true;
  return false;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'NO_API_KEY' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  }

  const destination = (body.destination as string) || 'the destination';
  const dayNumber = (body.dayNumber as number) || 1;
  const date = (body.date as string) || '';
  const existingThemes = (body.existingThemes as string[]) || [];
  const priorities = (body.priorities as string[]) || [];

  const dateLabel = date
    ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : `Day ${dayNumber}`;

  const priorityNote = priorities.length
    ? `\nTravel priorities for this trip: ${priorities.join(', ')}.`
    : '';

  const themeNote = existingThemes.length
    ? `\nAvoid repeating these themes already used on other days: ${existingThemes.slice(0, 8).join('; ')}.`
    : '';

  const prompt = `Generate a complete single day itinerary for Day ${dayNumber} (${dateLabel}) in ${destination}.${priorityNote}${themeNote}

Return EXACTLY this JSON object (no array wrapper, no markdown). Field names MUST match exactly — the rendering code keys off these specific names:
{
  "day": ${dayNumber},
  "date": "${date}",
  "city": "${destination}",
  "theme": "<3-5 word theme>",
  "tracks": {
    "shared": [
      {
        "id": "act_d${dayNumber}_1",
        "dayNumber": ${dayNumber},
        "timeSlot": "HH:MM–HH:MM",
        "name": "<venue name>",
        "title": "<venue name — same as name>",
        "address": "<full street address>",
        "website": "https://...",
        "isRestaurant": false,
        "mealType": null,
        "track": "shared",
        "priceLevel": 2,
        "description": "<why visit, 1-2 sentences>",
        "costEstimate": 25,
        "confidence": 0.9,
        "verified": true,
        "packingTips": [],
        "transportToNext": { "mode": "walk", "durationMins": 10, "distanceMiles": 0.5, "notes": "to next place" }
      }
    ],
    "track_a": [],
    "track_b": []
  },
  "meetupTime": "HH:MM",
  "meetupLocation": "Hotel lobby",
  "photoSpots": [
    { "name": "<spot>", "tip": "<one short sentence>", "bestTime": "<time of day>" }
  ],
  "destinationTip": "<insider fact about ${destination}>"
}

Rules:
- Use 24-hour time in "timeSlot" and "meetupTime" (e.g. "07:30–09:00", "19:00").
- Include 5-6 activities in "shared". Always include breakfast (07:30–09:00, isRestaurant:true, mealType:"breakfast"), lunch (12:30–14:00, mealType:"lunch"), dinner (19:00–21:00, mealType:"dinner") + 2-3 non-meal activities.
- "track_a" and "track_b" stay as empty arrays [].
- "transportToNext" is null on the LAST activity of the day only.
- "meetupTime" must equal the start of the first activity that day.
- Use REAL venue names and full street addresses in ${destination}.`;

  // Retry-with-backoff for transient Anthropic overload (529 / overloaded_error).
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const raw = response.content[0].type === 'text' ? response.content[0].text : '';
      const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

      let day: Record<string, unknown>;
      try {
        day = JSON.parse(cleaned);
      } catch {
        return NextResponse.json({ error: 'PARSE_ERROR', raw }, { status: 500 });
      }

      return NextResponse.json({ day });
    } catch (err) {
      lastErr = err;
      if (!isRetryableAnthropicError(err) || attempt === MAX_ATTEMPTS) break;
      const delay = 2000 * Math.pow(3, attempt - 1); // 2s, 6s
      console.warn(`[add-day] retry ${attempt}/${MAX_ATTEMPTS} after ${delay}ms: ${err instanceof Error ? err.message : String(err)}`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  const message = lastErr instanceof Error ? lastErr.message : 'Generation failed';
  return NextResponse.json({ error: 'GENERATION_FAILED', message }, { status: 500 });
}
