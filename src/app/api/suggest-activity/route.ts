import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    } = body;

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

    const prompt = `You are a travel planner suggesting a single replacement ${isRestaurant ? 'restaurant' : 'activity'} for a trip itinerary.

CONTEXT:
- Destination: ${destination}
- Day ${dayNumber}${date ? ` (${date})` : ''}
- The user didn't like: "${existingActivityName}"
- ${mealContext}
- Track: ${track}
- ${budgetContext}

Suggest ONE different ${isRestaurant ? 'restaurant' : 'activity'} that:
${isRestaurant ? `- Is a real, named establishment in ${destination}
- Is geographically convenient for the ${mealType ?? 'meal'} time slot
- Is highly regarded — a local institution, award-winning, or a neighborhood favorite
- Fits the budget tier
- Is NOT "${existingActivityName}" or a very similar venue` : `- Is a real venue or experience in ${destination}
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

IMPORTANT: Always set "website" to null. Do NOT invent or guess URLs — hallucinated links cause errors for users.`;

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
