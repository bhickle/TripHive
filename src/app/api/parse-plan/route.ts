import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/supabase/requireAuth';
import type { ParsedPlan, ParsedDayPlan } from '@/lib/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Why this is FREE (no credit charge) and not gated to paid tiers, unlike
// /api/parse-itinerary: this endpoint only PRE-FILLS the Trip Builder from the
// user's pasted notes — it does not produce an itinerary. The actual build runs
// through /api/generate-itinerary, which still enforces tier + credits. So
// nothing here bypasses the paywall; it's a convenience extractor (like the
// reference-link fetch). Auth + a length cap bound abuse; Haiku keeps it cheap.
const SYSTEM_PROMPT = `You are a travel-plan parser. The user pastes rough, free-text notes for a trip (often with dates, day headers, specific venues, times, and sometimes "Track A" / "Track B" sub-group plans). You extract their STRUCTURE so a Trip Builder can pre-fill its fields.

Extract only what the text actually says — never invent venues, cities, or dates that aren't present. Use American English. Return ONLY valid JSON — no markdown, no code fences, no explanation.`;

function buildPrompt(rawText: string): string {
  return `Parse the following trip notes into the JSON object below. Map each dated/numbered day header to a 1-based dayNumber in chronological order (the first day = 1).

NOTES:
---
${rawText.slice(0, 12000)}
---

Return EXACTLY this shape:
{
  "destination": "<primary city, country — best guess from the notes>",
  "destinations": ["<city1>", "<city2>"],   // ordered list ONLY if the trip clearly spans multiple cities; else omit or single-element
  "startDate": "<YYYY-MM-DD or empty string>",
  "endDate": "<YYYY-MM-DD or empty string>",
  "tripLength": <total number of days>,
  "groupType": "<solo|couple|friends|family|... if stated, else empty string>",
  "groupSize": <number if stated, else 0>,
  "priorities": ["<trip themes you can infer: food, history, art, nightlife, etc.>"],
  "days": [
    {
      "dayNumber": <1-based>,
      "date": "<YYYY-MM-DD or empty string>",
      "outline": "<that day's plan as a clean one-paragraph or bulleted summary, PRESERVING the specific venues and times the user named, and keeping any 'Track A:' / 'Track B:' labels verbatim>",
      "split": <true if the user gave this day a Track A AND a Track B (two sub-groups); else false>,
      "crossCity": <true ONLY if Track A and Track B are in DIFFERENT cities that day; else false>,
      "trackACity": "<city for Track A if split, else empty string>",
      "trackBCity": "<city for Track B if split, else empty string>"
    }
  ]
}

Rules:
- Keep the user's specific venues and times inside each day's "outline" verbatim — that's what the builder will honor.
- "split" is about TWO sub-groups doing different things the same day. A single shared plan is NOT a split.
- "crossCity" is true only when the two tracks are in genuinely different cities (e.g. Track A: Florence, Track B: Tivoli) — not two neighborhoods of one city.
- If dates aren't given, leave date fields as empty strings and still number the days in order.`;
}

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'NO_API_KEY' }, { status: 503 });
  }

  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (text.length < 30) {
    return NextResponse.json(
      { error: 'TOO_SHORT', message: 'Paste a bit more detail so we can pull out your plan.' },
      { status: 400 },
    );
  }
  if (text.length > 14_000) {
    return NextResponse.json(
      { error: 'TOO_LONG', message: 'That plan is very long — trim it to the essentials and try again.' },
      { status: 413 },
    );
  }

  try {
    const response = await client.messages.create({
      // Structured extraction — Haiku per the model-routing policy (cheap,
      // accurate enough for transcribe-and-structure; no creative generation).
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(text) }],
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) {
      return NextResponse.json({ error: 'PARSE_FAILED', message: 'Could not read a plan from that text.' }, { status: 500 });
    }

    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      destination?: string;
      destinations?: string[];
      startDate?: string;
      endDate?: string;
      tripLength?: number;
      groupType?: string;
      groupSize?: number;
      priorities?: string[];
      days?: Array<{
        dayNumber?: number;
        date?: string;
        outline?: string;
        split?: boolean;
        crossCity?: boolean;
        trackACity?: string;
        trackBCity?: string;
      }>;
    };

    const days = Array.isArray(parsed.days) ? parsed.days : [];
    // Day-indexed outline text (index = dayNumber - 1) — feeds the generator's
    // existing strong daily-outline honoring. Padded so a gap doesn't shift days.
    const maxDay = days.reduce((m, d) => Math.max(m, Number(d.dayNumber) || 0), 0);
    const tripLength = parsed.tripLength && parsed.tripLength > 0 ? parsed.tripLength : maxDay;
    const dailyOutlines: string[] = Array.from({ length: tripLength }, () => '');
    const dayPlans: ParsedDayPlan[] = [];
    for (const d of days) {
      const n = Number(d.dayNumber) || 0;
      if (n < 1) continue;
      if (n <= dailyOutlines.length) dailyOutlines[n - 1] = (d.outline ?? '').trim();
      dayPlans.push({
        dayNumber: n,
        split: !!d.split,
        crossCity: !!d.crossCity,
        trackACity: (d.trackACity ?? '').trim() || undefined,
        trackBCity: (d.trackBCity ?? '').trim() || undefined,
      });
    }

    const result: ParsedPlan = {
      destination: (parsed.destination ?? '').trim() || undefined,
      destinations: Array.isArray(parsed.destinations) && parsed.destinations.length > 1
        ? parsed.destinations.map(c => String(c).trim()).filter(Boolean)
        : undefined,
      startDate: (parsed.startDate ?? '').trim() || undefined,
      endDate: (parsed.endDate ?? '').trim() || undefined,
      tripLength: tripLength || undefined,
      groupType: (parsed.groupType ?? '').trim() || undefined,
      groupSize: parsed.groupSize && parsed.groupSize > 0 ? parsed.groupSize : undefined,
      priorities: Array.isArray(parsed.priorities) ? parsed.priorities.map(p => String(p).trim()).filter(Boolean) : undefined,
      dailyOutlines,
      dayPlans,
    };

    return NextResponse.json({ plan: result });
  } catch (err) {
    console.error('parse-plan error:', err);
    return NextResponse.json(
      { error: 'PARSE_FAILED', message: err instanceof Error ? err.message : 'Failed to parse plan' },
      { status: 500 },
    );
  }
}
