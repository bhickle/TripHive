import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/supabase/requireAuth';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { destination, startDate, endDate, budget, budgetBreakdown } = await request.json();

  const hotelBudget = budgetBreakdown?.hotel ?? 0;
  const nights = startDate && endDate
    ? Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000))
    : 3;
  const perNight = hotelBudget > 0 ? Math.round(hotelBudget / nights) : Math.round((budget ?? 500) * 0.3 / nights);

  const tier = perNight < 80 ? 'budget ($)' : perNight < 180 ? 'mid-range ($$)' : perNight < 350 ? 'upscale ($$$)' : 'luxury ($$$$)';

  const prompt = `You are a hotel expert. Suggest exactly 3 real, accurately-named hotels in ${destination} for a ${nights}-night stay (${startDate ?? 'upcoming'} to ${endDate ?? 'upcoming'}).

Budget: ~$${perNight}/night (${tier} tier).

Return ONLY a JSON object (no markdown):
{
  "hotelSuggestions": [
    {
      "name": "Real hotel name",
      "neighborhood": "District or area",
      "address": "Full address",
      "pricePerNight": 150,
      "priceLevel": 2,
      "whyRecommended": "One sentence on why this is a great pick — location, acclaim, or value",
      "bookingUrl": "https://www.booking.com/searchresults.html?ss=HOTEL+NAME+${encodeURIComponent(destination)}&checkin=${startDate ?? ''}&checkout=${endDate ?? ''}"
    }
  ]
}

Rules: (1) All hotels must be real and accurately named. (2) Vary the 3 picks — one near main sights, one in a quieter/hipper area, one best value. (3) bookingUrl must be a real Booking.com search URL pre-filled with hotel name and destination.`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const objStart = cleaned.indexOf('{');
    const objEnd = cleaned.lastIndexOf('}');
    const parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1));
    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
