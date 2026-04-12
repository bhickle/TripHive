import { NextRequest, NextResponse } from 'next/server';

// Iceland mock data for demo mode (no API key required)
const ICELAND_PLACES = [
  { placeId: 'mock_blue_lagoon', name: 'Blue Lagoon', address: 'Norðurljósavegur 11, 240 Grindavík, Iceland', types: ['spa', 'tourist_attraction'] },
  { placeId: 'mock_hallgrimskirkja', name: 'Hallgrímskirkja', address: 'Hallgrímstorg 1, 101 Reykjavík, Iceland', types: ['church', 'tourist_attraction'] },
  { placeId: 'mock_old_harbour', name: 'Reykjavik Old Harbour', address: 'Geirsgata, 101 Reykjavík, Iceland', types: ['tourist_attraction', 'point_of_interest'] },
  { placeId: 'mock_gullfoss', name: 'Gullfoss Waterfall', address: 'Hvítá, Iceland', types: ['natural_feature', 'tourist_attraction'] },
  { placeId: 'mock_geysir', name: 'Geysir Geothermal Area', address: 'Haukadalsvegur, Iceland', types: ['natural_feature', 'tourist_attraction'] },
  { placeId: 'mock_thingvellir', name: 'Þingvellir National Park', address: 'Þingvellir, Iceland', types: ['park', 'tourist_attraction'] },
  { placeId: 'mock_sky_lagoon', name: 'Sky Lagoon', address: 'Vesturvör 44-48, 200 Kópavogur, Iceland', types: ['spa', 'tourist_attraction'] },
  { placeId: 'mock_aurora', name: 'Northern Lights Reykjavik Tour', address: 'Reykjavík, Iceland', types: ['travel_agency', 'tourist_attraction'] },
  { placeId: 'mock_whale', name: 'Whale Watching Reykjavik', address: 'Ægisgarður 5, 101 Reykjavík, Iceland', types: ['travel_agency', 'tourist_attraction'] },
  { placeId: 'mock_perlan', name: 'Perlan Museum', address: 'Varmahlíð 1, 105 Reykjavík, Iceland', types: ['museum', 'tourist_attraction'] },
  { placeId: 'mock_nautholl', name: 'Nauthólsvík Geothermal Beach', address: 'Nauthólsvegur 106, 101 Reykjavík, Iceland', types: ['beach', 'tourist_attraction'] },
  { placeId: 'mock_laugardalslaug', name: 'Laugardalslaug Swimming Pool', address: 'Sundlaugarvegur 105, 104 Reykjavík, Iceland', types: ['swimming_pool', 'point_of_interest'] },
  { placeId: 'mock_harpa', name: 'Harpa Concert Hall', address: 'Austurbakki 2, 101 Reykjavík, Iceland', types: ['concert_hall', 'tourist_attraction'] },
  { placeId: 'mock_flyover', name: 'FlyOver Iceland', address: 'Grandagarður 2, 101 Reykjavík, Iceland', types: ['tourist_attraction', 'amusement_park'] },
  { placeId: 'mock_laugavegur', name: 'Laugavegur Shopping Street', address: 'Laugavegur, 101 Reykjavík, Iceland', types: ['shopping_mall', 'point_of_interest'] },
  // Restaurants
  { placeId: 'mock_dill', name: 'Dill Restaurant', address: 'Laugavegur 59, 101 Reykjavík, Iceland', types: ['restaurant', 'food'] },
  { placeId: 'mock_nostra', name: 'Nostra Restaurant', address: 'Laugavegur 59, 101 Reykjavík, Iceland', types: ['restaurant', 'food'] },
  { placeId: 'mock_sea_baron', name: 'The Sea Baron (Sægreifinn)', address: 'Geirsgata 8, 101 Reykjavík, Iceland', types: ['restaurant', 'food'] },
  { placeId: 'mock_baejarins', name: 'Bæjarins Beztu Pylsur (Hot Dog Stand)', address: 'Tryggvagata 1, 101 Reykjavík, Iceland', types: ['restaurant', 'food'] },
  { placeId: 'mock_matur', name: 'Matur og Drykkur', address: 'Grandagarður 2, 101 Reykjavík, Iceland', types: ['restaurant', 'food'] },
  { placeId: 'mock_grillid', name: 'Grillið Restaurant', address: 'Ráðhústorg 1, 101 Reykjavík, Iceland', types: ['restaurant', 'food'] },
  { placeId: 'mock_cafe_paris', name: 'Café Paris', address: 'Austurstræti 14, 101 Reykjavík, Iceland', types: ['cafe', 'food'] },
  { placeId: 'mock_reykjavik_roasters', name: 'Reykjavik Roasters', address: 'Kárastígur 1, 101 Reykjavík, Iceland', types: ['cafe', 'food'] },
  // South Iceland
  { placeId: 'mock_skogafoss', name: 'Skógafoss Waterfall', address: 'Skógafoss, Iceland', types: ['natural_feature', 'tourist_attraction'] },
  { placeId: 'mock_seljalandsfoss', name: 'Seljalandsfoss Waterfall', address: 'Seljalandsfoss, Iceland', types: ['natural_feature', 'tourist_attraction'] },
  { placeId: 'mock_black_beach', name: 'Reynisfjara Black Sand Beach', address: 'Reynisfjara, Iceland', types: ['natural_feature', 'beach'] },
  { placeId: 'mock_jokulsarlon', name: 'Jökulsárlón Glacier Lagoon', address: 'Jökulsárlón, Iceland', types: ['natural_feature', 'tourist_attraction'] },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const location = searchParams.get('location') || '';

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const apiKey = process.env.GOOGLE_MAPS_KEY;

  // Real Google Places API call
  if (apiKey) {
    try {
      const params = new URLSearchParams({
        input: query,
        key: apiKey,
        types: 'establishment',
        ...(location ? { locationbias: `circle:20000@${location}` } : {}),
      });

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`
      );
      const data = await response.json();

      const results = (data.predictions || []).map((p: {
        place_id: string;
        structured_formatting: { main_text: string; secondary_text: string };
        types: string[];
      }) => ({
        placeId: p.place_id,
        name: p.structured_formatting.main_text,
        address: p.structured_formatting.secondary_text,
        types: p.types || [],
      }));

      return NextResponse.json({ results, source: 'google' });
    } catch {
      // Fall through to mock on error
    }
  }

  // Demo mode — fuzzy match against Iceland places
  const q = query.toLowerCase();
  const results = ICELAND_PLACES
    .filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.address.toLowerCase().includes(q) ||
      p.types.some(t => t.includes(q))
    )
    .slice(0, 6);

  return NextResponse.json({ results, source: 'demo' });
}
