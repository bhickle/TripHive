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

Return EXACTLY this JSON structure (no arrays wrapping it, just the object):
{
  "day": ${dayNumber},
  "date": "${date}",
  "city": "${destination}",
  "theme": "A short punchy theme title for this day",
  "tracks": {
    "shared": [
      {
        "id": "act_new_1",
        "title": "Activity Name",
        "description": "Engaging 1-2 sentence description",
        "location": "Venue name, neighborhood",
        "address": "Full street address",
        "duration": "1.5 hours",
        "type": "sightseeing",
        "time": "9:00 AM–10:30 AM",
        "priority": "must-do",
        "category": "Cultural"
      }
    ],
    "track_a": [],
    "track_b": []
  },
  "meetupTime": "7:00 PM",
  "meetupLocation": "Hotel lobby",
  "photoSpots": [
    {
      "name": "Photo spot name",
      "tip": "One concise sentence about the best angle or time of day.",
      "bestTime": "Golden hour"
    }
  ],
  "destinationTip": "An interesting insider fact about ${destination} relevant to today's activities."
}

Include 4-6 activities in shared track. Make them realistic, well-paced, and varied (morning sight, lunch, afternoon activity, evening dinner). Use real venue names with real addresses.`;

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

    let day: Record<string, unknown>;
    try {
      day = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: 'PARSE_ERROR', raw }, { status: 500 });
    }

    return NextResponse.json({ day });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed';
    return NextResponse.json({ error: 'GENERATION_FAILED', message }, { status: 500 });
  }
}
