import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a multilingual travel assistant who creates practical phrasebooks for travelers.
Return ONLY valid JSON — no markdown, no explanation, no code fences.
Focus on phrases that are genuinely useful and phonetically accurate for a first-time visitor.`;

function buildUserPrompt(destination: string, language?: string, destinations?: string[]): string {
  // Multi-city: generate phrasebook per country, grouped clearly
  const isMultiCountry = destinations && destinations.length > 1;
  const destLine = isMultiCountry
    ? `This is a multi-country trip visiting: ${destinations.join(', ')}.`
    : `Generate a practical travel phrasebook for a trip to ${destination}.`;

  return `${destLine}
${language ? `The local language is ${language}.` : isMultiCountry ? `For each destination, detect the primary local language automatically and generate a separate phrasebook section.` : 'Detect the primary local language automatically.'}

${isMultiCountry ? `Return JSON with this exact shape — one entry in the top-level array per country/language:
[
  {
    "language": "German",
    "languageCode": "de",
    "destination": "Austria",
    "categories": [ ... same 6 categories as below ... ]
  },
  {
    "language": "Hungarian",
    "languageCode": "hu",
    "destination": "Hungary",
    "categories": [ ... ]
  }
]` : `Return JSON with this exact shape:
{
  "language": "Icelandic",
  "languageCode": "is",
  "destination": "${destination}",
  "categories": [ ... ]
}`}

For EACH language section, include exactly these 6 categories in order:
1. id: "greetings", label: "Greetings & Basics", icon: "👋" — hello, goodbye, please, thank you, sorry, yes, no, you're welcome
2. id: "dining", label: "Dining & Food", icon: "🍽️" — ordering food, dietary restrictions, the check, recommendations, allergies
3. id: "transport", label: "Transport & Directions", icon: "🗺️" — taxi, bus, train, directions, left/right/straight, how far, where is
4. id: "shopping", label: "Shopping & Money", icon: "💳" — prices, bargaining, ATM, credit card, receipt, how much, too expensive
5. id: "hotel", label: "Hotel & Accommodation", icon: "🏨" — check in/out, room issues, wifi, wake up call, luggage
6. id: "emergency", label: "Emergency & Health", icon: "🆘" — help, doctor, hospital, police, I'm lost, I need assistance, call ambulance

Each phrase object: { "id": "g1", "english": "Hello", "local": "...", "phonetic": "...", "tip": "optional" }
Each category must have 6-8 phrases.
Phonetics should be simple, readable English approximations that a tourist can pronounce without training.
Tips should be brief and practical (1 sentence max). Include a tip only when genuinely useful.
${isMultiCountry ? 'IMPORTANT: When multiple countries share a language (e.g. Austria and Switzerland both use German), generate ONE entry per distinct language, not per country. Label the destination as the primary country for that language.' : ''}`;
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

const MOCK_PHRASES = {
  language: 'Icelandic',
  languageCode: 'is',
  destination: 'Iceland',
  categories: [
    {
      id: 'greetings',
      label: 'Greetings & Basics',
      icon: '👋',
      phrases: [
        { id: 'g1', english: 'Hello', local: 'Halló', phonetic: 'hah-loh' },
        { id: 'g2', english: 'Good morning', local: 'Góðan daginn', phonetic: 'goh-than die-in' },
        { id: 'g3', english: 'Goodbye', local: 'Bless', phonetic: 'bless', tip: 'Much more common than "Bless bless"' },
        { id: 'g4', english: 'Please', local: 'Vinsamlegast', phonetic: 'vin-sam-leh-gast' },
        { id: 'g5', english: 'Thank you', local: 'Takk', phonetic: 'tahk', tip: 'Short and sweet — most Icelanders appreciate the effort' },
        { id: 'g6', english: 'Yes / No', local: 'Já / Nei', phonetic: 'yow / nay' },
        { id: 'g7', english: "You're welcome", local: 'Gjörðu svo vel', phonetic: 'gyur-thoo svoh vel' },
        { id: 'g8', english: 'Do you speak English?', local: 'Talar þú ensku?', phonetic: 'tah-lar thoo en-skoo', tip: 'Almost all Icelanders speak excellent English' },
      ],
    },
    {
      id: 'dining',
      label: 'Dining & Food',
      icon: '🍽️',
      phrases: [
        { id: 'd1', english: 'A table for two, please', local: 'Borð fyrir tvo, takk', phonetic: 'borth fir-eer tvoh tahk' },
        { id: 'd2', english: 'The menu, please', local: 'Matseðilinn, takk', phonetic: 'mat-seth-il-in tahk' },
        { id: 'd3', english: 'I am vegetarian', local: 'Ég er grænmetisæta', phonetic: 'yeg er grain-met-is-eye-ta' },
        { id: 'd4', english: 'I am allergic to...', local: 'Ég er með ofnæmi fyrir...', phonetic: 'yeg er meth ohf-nai-me fir-eer' },
        { id: 'd5', english: 'The check, please', local: 'Reikninginn, takk', phonetic: 'rake-ning-in tahk' },
        { id: 'd6', english: 'It was delicious', local: 'Þetta var ljúffengt', phonetic: 'theh-ta var lyoof-fengt' },
        { id: 'd7', english: 'Water, please', local: 'Vatn, takk', phonetic: 'vaht-n tahk', tip: 'Tap water in Iceland is some of the purest in the world' },
      ],
    },
    {
      id: 'transport',
      label: 'Transport & Directions',
      icon: '🗺️',
      phrases: [
        { id: 't1', english: 'Where is...?', local: 'Hvar er...?', phonetic: 'kvahr er' },
        { id: 't2', english: 'Turn left / right', local: 'Beygt til vinstri / hægri', phonetic: 'baygt til vin-stree / haig-ree' },
        { id: 't3', english: 'Straight ahead', local: 'Beint áfram', phonetic: 'baynt ow-fram' },
        { id: 't4', english: 'How far is it?', local: 'Hversu langt er það?', phonetic: 'kver-soo langt er thath' },
        { id: 't5', english: 'I need a taxi', local: 'Ég þarf leigubíl', phonetic: 'yeg tharf lay-goo-beel' },
        { id: 't6', english: 'Bus stop', local: 'Strætóstöð', phonetic: 'strai-toh-stuth' },
        { id: 't7', english: 'Airport', local: 'Flugvöllur', phonetic: 'floog-vut-loor' },
      ],
    },
    {
      id: 'shopping',
      label: 'Shopping & Money',
      icon: '💳',
      phrases: [
        { id: 's1', english: 'How much does this cost?', local: 'Hvað kostar þetta?', phonetic: 'kvath kos-tar theh-ta' },
        { id: 's2', english: 'Do you accept cards?', local: 'Takið þið kort?', phonetic: 'tak-ith thith kort', tip: 'Cards are accepted almost everywhere in Iceland' },
        { id: 's3', english: 'Where is an ATM?', local: 'Hvar er hraðbanki?', phonetic: 'kvahr er hrathb-an-kee' },
        { id: 's4', english: 'Can I get a receipt?', local: 'Get ég fengið kvittun?', phonetic: 'get yeg feng-ith kvi-toon' },
        { id: 's5', english: 'Too expensive', local: 'Of dýrt', phonetic: 'ohf deert' },
        { id: 's6', english: 'I am just looking', local: 'Ég er bara að skoða', phonetic: 'yeg er bar-a ath skoh-tha' },
      ],
    },
    {
      id: 'hotel',
      label: 'Hotel & Accommodation',
      icon: '🏨',
      phrases: [
        { id: 'h1', english: 'I have a reservation', local: 'Ég er með bókun', phonetic: 'yeg er meth boh-koon' },
        { id: 'h2', english: 'Check-in / Check-out', local: 'Innritun / Útritun', phonetic: 'in-ree-toon / oot-ree-toon' },
        { id: 'h3', english: 'What is the WiFi password?', local: 'Hvað er WiFi lykilorðið?', phonetic: 'kvath er why-fy lik-il-or-thith' },
        { id: 'h4', english: 'My room needs cleaning', local: 'Herbergið mitt þarf þrif', phonetic: 'her-ber-gith mit tharf threef' },
        { id: 'h5', english: 'Can I store my luggage?', local: 'Get ég geymt farangurinn?', phonetic: 'get yeg gaym-t far-ang-oor-in' },
        { id: 'h6', english: 'Is breakfast included?', local: 'Er morgunmatur innifalinn?', phonetic: 'er mor-goon-mat-oor in-ih-fah-lin' },
      ],
    },
    {
      id: 'emergency',
      label: 'Emergency & Health',
      icon: '🆘',
      phrases: [
        { id: 'e1', english: 'Help!', local: 'Hjálp!', phonetic: 'hyowlp', tip: 'Emergency number in Iceland is 112' },
        { id: 'e2', english: 'Call an ambulance', local: 'Hringdu í sjúkrabíl', phonetic: 'hring-doo ee syook-ra-beel' },
        { id: 'e3', english: 'Call the police', local: 'Hringdu í lögreglu', phonetic: 'hring-doo ee luh-reg-loo' },
        { id: 'e4', english: 'I need a doctor', local: 'Ég þarf lækni', phonetic: 'yeg tharf lake-nee' },
        { id: 'e5', english: 'I am lost', local: 'Ég er týndur', phonetic: 'yeg er teen-door' },
        { id: 'e6', english: 'I am injured', local: 'Ég er slasaður', phonetic: 'yeg er sla-sa-thoor' },
        { id: 'e7', english: 'Where is the hospital?', local: 'Hvar er sjúkrahúsið?', phonetic: 'kvahr er syook-ra-hoo-sith' },
      ],
    },
  ],
};

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Tier check — Nomad only
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      if (user) {
        const admin = createAdminClient();
        const { data: profile } = await admin
          .from('profiles')
          .select('subscription_tier')
          .eq('id', user.id)
          .single();
        const tier = profile?.subscription_tier ?? 'free';
        if (tier !== 'nomad') {
          return NextResponse.json({ error: 'NOMAD_REQUIRED', message: 'AI phrasebook is a Nomad feature' }, { status: 403 });
        }
      }
      // No session (demo/guest) — allow through so the demo experience still works
    } catch { /* ignore auth errors — don't block demo users */ }

    const body = await request.json();
    const { destination = 'Iceland', language, destinations } = body as {
      destination?: string;
      language?: string;
      destinations?: string[];
    };

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        ...MOCK_PHRASES,
        destination,
      });
    }

    const userPrompt = buildUserPrompt(destination, language, destinations);

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    let raw = (message.content[0] as { text: string }).text
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '')
      .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
      .replace(/,\s*([}\]])/g, '$1')
      .trim();

    // Multi-language response is a JSON array; single-language is an object
    const isArray = raw.trimStart().startsWith('[');
    const start = raw.indexOf(isArray ? '[' : '{');
    const end = raw.lastIndexOf(isArray ? ']' : '}');
    if (start === -1 || end === -1) throw new Error('No JSON found in response');
    raw = raw.slice(start, end + 1);

    const parsed = JSON.parse(raw);

    // Normalise: always return { language, languageCode, destination, categories }
    // For multi-language, wrap in { languages: [...] } so the frontend can handle it
    if (Array.isArray(parsed)) {
      return NextResponse.json({ languages: parsed, destination });
    }
    return NextResponse.json(parsed);

  } catch (err) {
    console.error('[generate-phrases] Error:', err);
    return NextResponse.json(
      { error: 'GENERATION_FAILED', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
