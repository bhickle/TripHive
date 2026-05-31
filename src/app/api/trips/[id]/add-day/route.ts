import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { requireTripAiRole, getOrganizerTier } from '@/lib/supabase/tripAccess';
import { checkAiCredits, incrementAiCreditsUsed } from '@/lib/supabase/aiCredits';
import { createAdminClient } from '@/lib/supabase/admin';
import { TIER_LIMITS } from '@/lib/types';
import type { ItineraryDay } from '@/lib/types';
import { validateAndCorrectDay } from '@/lib/places/verifyDayLocations';

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

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'NO_API_KEY' }, { status: 503 });
  }

  // Role gate: AI changes are organizer/co-organizer only.
  const roleCheck = await requireTripAiRole(params.id);
  if (!roleCheck.ok) return roleCheck.response;

  // Tier cap: don't let add-day push the trip beyond its plan's maxTripDays.
  // The cap follows the ORGANIZER's tier, not the caller's — the trip was built
  // under the organizer's plan, so a lower-tier co-organizer must not have its
  // days cut and can extend up to the organizer's max. (AI feature gates +
  // credits below stay on the caller's own tier.)
  try {
    const admin = createAdminClient();
    const organizerTier = await getOrganizerTier(admin, params.id);
    const tierLimit = TIER_LIMITS[organizerTier].maxTripDays;
    // Count the ACTUAL itinerary days, not trips.trip_length — the latter is
    // never bumped when a day is added, so reading it let repeated add-day
    // calls bypass the cap. The live day count reflects every prior add.
    const { data: itinRow } = await admin
      .from('itineraries')
      .select('days')
      .eq('trip_id', params.id)
      .maybeSingle();
    const days = itinRow?.days;
    const currentLen = Array.isArray(days) ? days.length : 0;
    if (currentLen >= tierLimit) {
      return NextResponse.json(
        {
          error: 'TRIP_LENGTH_LIMIT',
          message: `This trip's plan supports trips up to ${tierLimit} days. Upgrade to add more.`,
        },
        { status: 403 },
      );
    }
  } catch (err) {
    // Lookup failure shouldn't block — log and proceed; the AI call is
    // the real cost and the credit gate will still apply.
    console.warn('[add-day] trip_length lookup failed, skipping cap check:', err);
  }

  // Credit gate (two-phase). Pass tripId so the gate routes the charge to
  // the trip's pass pool if one is active; falls through to the user's
  // personal credits otherwise. Charged after the day is successfully parsed.
  const credits = await checkAiCredits(auth.ctx.userId, auth.ctx.tier, 'add_day', params.id);
  if (!credits.ok) return credits.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  }

  const destination = (body.destination as string) || 'the destination';
  // The day's stored `city` must match the main build's format ("Lisbon"),
  // not the full "Lisbon, Portugal" destination string — otherwise the day
  // eyebrow on an added day reads differently from the build's days (QA #23).
  // Keep the full `destination` in venue-guidance text below for the country
  // context the model needs to disambiguate.
  const cityForDay = destination.split(',')[0].trim();
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
  "city": "${cityForDay}",
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
        // Single-day generation is the same complexity surface as one
        // chunk of /generate-itinerary, which uses Sonnet 4.6. Opus 4.7
        // was overkill here — Sonnet matches quality at ~5x lower cost.
        model: 'claude-sonnet-4-6',
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
        // Parse error doesn't charge — the user got nothing usable.
        return NextResponse.json({ error: 'PARSE_ERROR', raw }, { status: 500 });
      }

      // Force the stored city to the normalized core regardless of what the
      // model echoed, so an added day's eyebrow matches the build's days.
      if (day && typeof day === 'object') day.city = cityForDay;

      // Verify-before-return. Same Tier 1 + Tier 2 gate as
      // /generate-itinerary uses on every streamed day. Hard fail
      // returns a 500 WITHOUT charging credits — the user got nothing
      // they can use, so they shouldn't pay for it. The correction
      // calls inside validateAndCorrectDay use AI tokens but those are
      // absorbed by tripcoord (one add-day charge buys the right to
      // get a verified day, not a raw model emission).
      const verifyResult = await validateAndCorrectDay(day as unknown as ItineraryDay, {
        anthropic: client,
        modelId: 'claude-sonnet-4-6',
        systemPrompt: SYSTEM_PROMPT,
        placesApiKey: process.env.GOOGLE_MAPS_KEY ?? '',
        maxRetries: 2,
        supabase: createAdminClient(),
      });
      if (!verifyResult.ok) {
        const failedNames = (verifyResult.finalFailures ?? [])
          .slice(0, 3)
          .map(f => f.name)
          .join(', ');
        console.warn(`[add-day] day ${dayNumber} (${destination}) failed location verification after ${verifyResult.retries} retries:`, verifyResult.finalFailures);
        return NextResponse.json({
          error: 'VERIFICATION_FAILED',
          message: `Couldn't reliably plan this day — venues kept resolving outside ${destination}${failedNames ? ` (${failedNames})` : ''}. Please try again.`,
        }, { status: 500 });
      }

      // Charge after verification passes — the user is getting a day
      // we stand behind.
      await incrementAiCreditsUsed(auth.ctx.userId, credits.ctx);

      return NextResponse.json({ day: verifyResult.day });
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
