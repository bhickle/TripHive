import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { checkAiCredits, incrementAiCreditsUsed } from '@/lib/supabase/aiCredits';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface PlacesApiNewResult {
  id?: string;
  displayName?: { text: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  types?: string[];
  regularOpeningHours?: { weekdayDescriptions?: string[] };
}

const PRICE_LEVEL_MAP: Record<string, string> = {
  PRICE_LEVEL_FREE: '$0',
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

async function fetchRealPlaces(destination: string, isRestaurant: boolean, apiKey: string): Promise<string> {
  try {
    const query = isRestaurant
      ? `restaurants in ${destination}`
      : `things to do attractions in ${destination}`;
    const res = await fetch(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.regularOpeningHours.weekdayDescriptions',
        },
        body: JSON.stringify({ textQuery: query, maxResultCount: 15 }),
      }
    );
    const data = await res.json();
    if (!data.places?.length) return '';

    const places = (data.places as PlacesApiNewResult[])
      .map(p => ({
        name: p.displayName?.text ?? '',
        address: p.formattedAddress ?? '',
        rating: p.rating,
        reviewCount: p.userRatingCount,
        priceLevel: p.priceLevel,
        hours: p.regularOpeningHours?.weekdayDescriptions,
      }))
      .filter(p => p.name && (p.rating ?? 0) >= 3.5 && (p.reviewCount ?? 0) >= 5);

    return places.map(p => {
      let line = `• ${p.name} — ${p.address}`;
      const meta: string[] = [];
      if (p.rating)      meta.push(`★${p.rating}`);
      if (p.reviewCount) meta.push(`${p.reviewCount} reviews`);
      if (p.priceLevel && PRICE_LEVEL_MAP[p.priceLevel]) meta.push(PRICE_LEVEL_MAP[p.priceLevel]);
      if (meta.length)   line += ` (${meta.join(', ')})`;
      if (p.hours?.length) line += `\n    Hours: ${p.hours.join(' | ')}`;
      return line;
    }).join('\n');
  } catch (err) {
    console.error('[fetchRealPlaces]', err);
    return '';
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'NO_API_KEY', message: 'API key not configured' }, { status: 503 });
  }

  // Credit gate (two-phase). Charged after the suggestion is parsed.
  const credits = await checkAiCredits(auth.ctx.userId, auth.ctx.tier, 'activity_suggest');
  if (!credits.ok) return credits.response;

  try {
    const body = await request.json();
    const {
      destination,
      dayNumber,
      date,
      mealType,
      isRestaurant,
      existingActivityName,
      timeSlot,
      track,
      budget,
      budgetBreakdown,
      isCruise,
      cruiseLine,
    } = body;

    // Names of every activity / restaurant already on the trip (all days, all
    // tracks). Without this, the model freely re-suggests venues from other
    // days — Brandon flagged "Suggest another just pulls a suggestion from
    // another day" in QA 5/10. Cap at 60 names so the prompt stays reasonable.
    const excludeNamesRaw = Array.isArray(body.excludeNames) ? (body.excludeNames as unknown[]) : [];
    const excludeNames = excludeNamesRaw
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      .map(n => n.trim())
      .slice(0, 60);

    // Pre-fetch real places from Google to prevent hallucinations
    let realPlacesBlock = '';
    if (process.env.GOOGLE_MAPS_KEY) {
      const placesList = await fetchRealPlaces(destination, isRestaurant, process.env.GOOGLE_MAPS_KEY);
      if (placesList) {
        // Compute the weekday for this day's date so the model can pair the
        // right weekday's hours to the actual day. Without this, the model
        // does internal date→weekday math and often picks venues closed on
        // the day the user is actually there.
        const weekdayLine = (() => {
          if (!date) return '';
          const d = new Date(date + 'T12:00:00');
          if (isNaN(d.getTime())) return '';
          const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
          const readable = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
          return `\nThis activity is on ${readable} — match each venue's "${weekday}" hours specifically. If a venue is closed on ${weekday}, do NOT suggest it.`;
        })();

        realPlacesBlock = `\n\nCRITICAL — USE ONLY REAL VERIFIED PLACES:
You MUST suggest a venue from this list only. Do NOT invent place names or addresses.
Each venue includes opening hours per weekday where available — only suggest a venue that is open during the timeSlot ${timeSlot} on the actual day-of-week of this trip day.
A venue closing before 4 PM cannot be dinner. A venue opening at 5 PM cannot be breakfast or lunch.${weekdayLine}
REAL ${isRestaurant ? 'RESTAURANTS' : 'ATTRACTIONS'} IN ${destination} (quality-filtered, ★3.5+ with reviews):
${placesList}`;
      }
    }

    // Build a focused prompt for a single replacement activity
    const mealContext = mealType
      ? `This is a ${mealType} restaurant slot (timeSlot: ${timeSlot}).`
      : isRestaurant
      ? `This is a restaurant slot (timeSlot: ${timeSlot}).`
      : `This is a general activity slot (timeSlot: ${timeSlot}).`;

    const budgetContext = budgetBreakdown
      ? `Daily food budget: $${Math.round((budgetBreakdown.food ?? 0) / 7)} per person. Daily experiences budget: $${Math.round((budgetBreakdown.experiences ?? 0) / 7)} per person.`
      : budget
      ? `Total trip budget: $${budget}.`
      : '';

    // Cruise port context: activities must be walkable from the terminal
    const cruiseContext = isCruise
      ? `\nCRUISE PORT STOP: This is a ${cruiseLine ? cruiseLine + ' ' : ''}cruise itinerary. The ship docks at the port in ${destination}. All suggested activities MUST be within easy walking distance of the cruise ship terminal (typically 0–1 mile / 0–1.5 km). Do NOT suggest activities that require a lengthy drive or taxi across the city — cruisers have limited time ashore and must return before all-aboard.`
      : '';

    // Exclude block — hard constraint preventing the model from re-using any
    // venue that's already on the trip on a different day.
    const excludeBlock = excludeNames.length > 0
      ? `\n\nHARD CONSTRAINT — DO NOT SUGGEST ANY OF THESE ${isRestaurant ? 'RESTAURANTS' : 'VENUES'} (they already appear on other days of this trip):\n${excludeNames.map(n => `- ${n}`).join('\n')}\nPick a genuinely different venue with a different name. If the realistic options in ${destination} are exhausted, prefer a less-obvious local pick over a duplicate.`
      : '';

    const prompt = `You are a travel planner suggesting a single replacement ${isRestaurant ? 'restaurant' : 'activity'} for a trip itinerary.

CONTEXT:
- Destination: ${destination}
- Day ${dayNumber}${date ? ` (${date})` : ''}
- The user didn't like: "${existingActivityName}"
- ${mealContext}
- Track: ${track}
- ${budgetContext}${cruiseContext}

Suggest ONE different ${isRestaurant ? 'restaurant' : 'activity'} that:
${isCruise
  ? isRestaurant
    ? `- Is a real, named restaurant or café within easy walking distance of the ${destination} cruise terminal
- Is the kind of place cruisers can enjoy and still make it back in time
- Is highly regarded — a waterfront favorite, local institution, or well-known spot near the port
- Fits the budget tier
- Is NOT "${existingActivityName}" or a very similar venue`
    : `- Is a real venue or experience within easy walking distance of the ${destination} cruise terminal
- Is something cruisers can enjoy with limited time ashore
- Is genuinely different from "${existingActivityName}"
- Is interesting and accessible from the port`
  : isRestaurant
    ? `- Is a real, named establishment in ${destination}
- Is geographically convenient for the ${mealType ?? 'meal'} time slot
- Is highly regarded — a local institution, award-winning, or a neighborhood favorite
- Fits the budget tier
- Is NOT "${existingActivityName}" or a very similar venue`
    : `- Is a real venue or experience in ${destination}
- Fits the time slot naturally
- Is genuinely different from "${existingActivityName}"
- Is interesting and worth including`}

Return ONLY a JSON object (no markdown, no explanation):
{
  "id": "act_d${dayNumber}_suggest",
  "dayNumber": ${dayNumber},
  "timeSlot": "${timeSlot}",
  "name": "Venue or activity name",
  "title": "Venue or activity name",
  "address": "Full street address, ${destination}",
  "website": null,
  "isRestaurant": ${isRestaurant ?? false},
  "mealType": ${mealType ? `"${mealType}"` : 'null'},
  "track": "${track ?? 'shared'}",
  "priceLevel": 2,
  "description": "One sentence on why this is recommended — cite its reputation or acclaim",
  "costEstimate": 25,
  "confidence": 0.85,
  "verified": false,
  "packingTips": []
}

IMPORTANT: Always set "website" to null. Do NOT invent or guess URLs — hallucinated links cause errors for users.${excludeBlock}${realPlacesBlock}`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: prompt },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Strip markdown fences and extract the JSON object
    let cleaned = responseText
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '')
      .replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'")
      .replace(/,(\s*[}\]])/g, '$1')
      .trim();
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    if (objStart === -1 || objEnd === -1) throw new Error('No JSON object in response');
    cleaned = cleaned.slice(objStart, objEnd + 1);

    const activity = JSON.parse(cleaned);

    // Charge after a successful suggestion. Failed suggestions (caught
    // below) don't consume credits.
    await incrementAiCreditsUsed(auth.ctx.userId, credits.ctx);

    return NextResponse.json({ activity });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[suggest-activity]', message);
    return NextResponse.json({ error: 'SUGGESTION_FAILED', message }, { status: 500 });
  }
}
