import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/supabase/requireAuth';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a travel booking confirmation parser. Your job is to extract structured transport information from forwarded booking confirmation emails, SMS messages, or any text containing transport booking details.

You extract information for transport legs that a group of travelers will use — car rentals, buses, coaches, trains, excursions, or shuttle pickups.

Always return ONLY valid JSON — no markdown, no explanation, no code fences. If you cannot find a field, omit it from the JSON rather than guessing.`;

const USER_PROMPT = (emailText: string) => `Extract the transport booking details from the following confirmation text and return a JSON object matching this TypeScript interface exactly:

interface TransportLeg {
  type: 'car_rental' | 'bus' | 'train' | 'excursion';
  departureTime: string;       // "HH:MM" 24-hour format
  meetTime?: string;           // "HH:MM" — 15-30 min before departure if not stated
  meetingPoint: string;        // where to assemble or board
  destination: string;         // where this transport is going
  duration?: string;           // e.g. "45 min" or "2h 30m"
  operator?: string;           // company name
  confirmationRef?: string;    // booking / confirmation code
  notes?: string;              // any important instructions, pickup codes, warnings
  costPerPerson?: number;      // numeric, USD
  carClass?: string;           // for car_rental: vehicle description
  fromStation?: string;        // for train/bus: departure station
  toStation?: string;          // for train/bus: arrival station
  platform?: string;
  seatInfo?: string;
}

Type selection rules:
- car_rental: Hertz, Avis, Enterprise, Budget, Sixt, Europcar, etc.
- bus: Flixbus, Greyhound, Megabus, Strætó, National Express, local bus routes, airport shuttles
- train: Amtrak, Eurostar, Trainline, DB, SNCF, JR Pass, metro/rail tickets
- excursion: tour operator pickups, activity transport, guided tour buses (Viator, GetYourGuide, Reykjavik Excursions, etc.)

For meetTime: if not explicitly stated, set it to 15 minutes before departureTime.
For meetingPoint: use the pickup address, hotel lobby, terminal/bay, or station entrance as appropriate.

CONFIRMATION TEXT:
---
${emailText}
---

Return ONLY the JSON object. Start with { and end with }.`;

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { emailText } = body;

    if (!emailText || typeof emailText !== 'string' || emailText.trim().length < 20) {
      return NextResponse.json(
        { error: 'INVALID_INPUT', message: 'Please provide at least 20 characters of booking confirmation text.' },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'NO_API_KEY', message: 'ANTHROPIC_API_KEY not configured.' },
        { status: 503 }
      );
    }

    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: USER_PROMPT(emailText) },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const rawJson = '{' + responseText;

    // Find outermost JSON object
    const objStart = rawJson.indexOf('{');
    const objEnd = rawJson.lastIndexOf('}');
    if (objStart === -1 || objEnd === -1 || objEnd <= objStart) {
      throw new Error('Response did not contain a JSON object');
    }

    let cleaned = rawJson.slice(objStart, objEnd + 1);
    // Fix common quirks
    cleaned = cleaned
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,(\s*[}\]])/g, '$1');

    const parsed = JSON.parse(cleaned);

    // Validate required fields
    const requiredFields = ['type', 'departureTime', 'meetingPoint', 'destination'];
    const missing = requiredFields.filter(f => !parsed[f]);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: 'INCOMPLETE_PARSE',
          message: `Could not find all required fields: ${missing.join(', ')}. Try pasting more of the confirmation text.`,
        },
        { status: 422 }
      );
    }

    // Validate type
    const validTypes = ['car_rental', 'bus', 'train', 'excursion'];
    if (!validTypes.includes(parsed.type)) {
      parsed.type = 'bus'; // safe default
    }

    // Generate a unique id for the new leg
    parsed.id = `trn_parsed_${Date.now()}`;

    return NextResponse.json({ transportLeg: parsed });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[parse-transport]', message);
    return NextResponse.json({ error: 'PARSE_FAILED', message }, { status: 500 });
  }
}
