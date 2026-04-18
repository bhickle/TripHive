import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'NO_API_KEY', message: 'API key not configured' }, { status: 503 });
  }

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

    // Pre-fetch real places from Google to prevent hallucinations
    let realPlacesBlock = '';
    if (process.env.GOOGLE_MAPS_KEY) {
      const placesList = await fetchRealPlaces(destination, isRestaurant, process.env.GOOGLE_MAPS_KEY);
      if (placesList) {
        realPlacesBlock = `\n\nCRITICAL — USE ONLY REAL VERIFIED PLACES:
You MUST suggest a venue from this list only. Do NOT invent place names or addresses.
Each venue includes opening hours where available — only suggest a venue that is open during the timeSlot ${timeSlot}.
A venue closing before 4 PM cannot be dinner. A venue opening at 5 PM cannot be breakfast or lunch.
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

IMPORTANT: Always set "website" to null. Do NOT invent or guess URLs — hallucinated links cause errors for users.${realPlacesBlock}`;

    const message = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '{' },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const raw = '{' + responseText;

    // Extract the JSON object
    const objStart = raw.indexOf('{');
    const objEnd = raw.lastIndexOf('}');
    if (objStart === -1 || objEnd === -1) throw new Error('No JSON object in response');

    let cleaned = raw.slice(objStart, objEnd + 1);
    // Fix smart quotes and trailing commas
    cleaned = cleaned
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,(\s*[}\]])/g, '$1');

    const activity = JSON.parse(cleaned);

    return NextResponse.json({ activity });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[suggest-activity]', message);
    return NextResponse.json({ error: 'SUGGESTION_FAILED', message }, { status: 500 });
  }
}
