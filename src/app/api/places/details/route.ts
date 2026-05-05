import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';

// Mock place details for demo mode
const MOCK_DETAILS: Record<string, object> = {
  mock_blue_lagoon: {
    placeId: 'mock_blue_lagoon',
    name: 'Blue Lagoon',
    address: 'Norðurljósavegur 11, 240 Grindavík, Iceland',
    website: 'https://www.bluelagoon.com',
    phone: '+354 420 8800',
    rating: 4.6,
    reviewCount: 42381,
    priceLevel: 3,
    lat: 63.8804,
    lng: -22.4495,
    hours: ['Monday: 7:00 AM – 11:00 PM', 'Tuesday: 7:00 AM – 11:00 PM'],
    isOpen: true,
    types: ['spa', 'tourist_attraction'],
  },
  mock_hallgrimskirkja: {
    placeId: 'mock_hallgrimskirkja',
    name: 'Hallgrímskirkja',
    address: 'Hallgrímstorg 1, 101 Reykjavík, Iceland',
    website: 'https://www.hallgrimskirkja.is',
    phone: '+354 510 1000',
    rating: 4.8,
    reviewCount: 31247,
    priceLevel: 1,
    lat: 64.1418,
    lng: -21.9264,
    hours: ['Monday: 9:00 AM – 5:00 PM'],
    isOpen: true,
    types: ['church', 'tourist_attraction'],
  },
  mock_old_harbour: {
    placeId: 'mock_old_harbour',
    name: 'Reykjavik Old Harbour',
    address: 'Geirsgata, 101 Reykjavík, Iceland',
    website: 'https://www.visitreykjavik.is',
    rating: 4.5,
    reviewCount: 8932,
    priceLevel: 0,
    lat: 64.1522,
    lng: -21.9406,
    isOpen: true,
    types: ['tourist_attraction', 'point_of_interest'],
  },
  mock_gullfoss: {
    placeId: 'mock_gullfoss',
    name: 'Gullfoss Waterfall',
    address: 'Hvítá, Iceland',
    website: 'https://www.gullfoss.is',
    rating: 4.9,
    reviewCount: 19843,
    priceLevel: 0,
    lat: 64.3271,
    lng: -20.1199,
    isOpen: true,
    types: ['natural_feature', 'tourist_attraction'],
  },
  mock_geysir: {
    placeId: 'mock_geysir',
    name: 'Geysir Geothermal Area',
    address: 'Haukadalsvegur, Iceland',
    rating: 4.8,
    reviewCount: 23561,
    priceLevel: 0,
    lat: 64.3104,
    lng: -20.3021,
    isOpen: true,
    types: ['natural_feature', 'tourist_attraction'],
  },
  mock_thingvellir: {
    placeId: 'mock_thingvellir',
    name: 'Þingvellir National Park',
    address: 'Þingvellir, Iceland',
    website: 'https://www.thingvellir.is',
    rating: 4.8,
    reviewCount: 17204,
    priceLevel: 0,
    lat: 64.2558,
    lng: -21.1302,
    isOpen: true,
    types: ['park', 'tourist_attraction'],
  },
  mock_sky_lagoon: {
    placeId: 'mock_sky_lagoon',
    name: 'Sky Lagoon',
    address: 'Vesturvör 44-48, 200 Kópavogur, Iceland',
    website: 'https://www.skylagoon.com',
    phone: '+354 527 6700',
    rating: 4.7,
    reviewCount: 11382,
    priceLevel: 3,
    lat: 64.0942,
    lng: -21.9661,
    isOpen: true,
    types: ['spa', 'tourist_attraction'],
  },
  mock_dill: {
    placeId: 'mock_dill',
    name: 'Dill Restaurant',
    address: 'Laugavegur 59, 101 Reykjavík, Iceland',
    website: 'https://dillrestaurant.is',
    phone: '+354 552 1522',
    rating: 4.7,
    reviewCount: 2841,
    priceLevel: 4,
    lat: 64.1441,
    lng: -21.9185,
    isOpen: true,
    types: ['restaurant', 'food'],
  },
  mock_sea_baron: {
    placeId: 'mock_sea_baron',
    name: 'The Sea Baron (Sægreifinn)',
    address: 'Geirsgata 8, 101 Reykjavík, Iceland',
    phone: '+354 553 1500',
    rating: 4.5,
    reviewCount: 6712,
    priceLevel: 2,
    lat: 64.1517,
    lng: -21.9388,
    isOpen: true,
    types: ['restaurant', 'food'],
  },
  mock_baejarins: {
    placeId: 'mock_baejarins',
    name: 'Bæjarins Beztu Pylsur',
    address: 'Tryggvagata 1, 101 Reykjavík, Iceland',
    rating: 4.6,
    reviewCount: 9234,
    priceLevel: 1,
    lat: 64.1497,
    lng: -21.9382,
    isOpen: true,
    types: ['restaurant', 'food'],
  },
  mock_harpa: {
    placeId: 'mock_harpa',
    name: 'Harpa Concert Hall',
    address: 'Austurbakki 2, 101 Reykjavík, Iceland',
    website: 'https://www.harpa.is',
    phone: '+354 528 5050',
    rating: 4.7,
    reviewCount: 14902,
    priceLevel: 2,
    lat: 64.1503,
    lng: -21.9320,
    isOpen: true,
    types: ['concert_hall', 'tourist_attraction'],
  },
  mock_skogafoss: {
    placeId: 'mock_skogafoss',
    name: 'Skógafoss Waterfall',
    address: 'Skógafoss, Iceland',
    rating: 4.9,
    reviewCount: 28741,
    priceLevel: 0,
    lat: 63.5320,
    lng: -19.5117,
    isOpen: true,
    types: ['natural_feature', 'tourist_attraction'],
  },
  mock_black_beach: {
    placeId: 'mock_black_beach',
    name: 'Reynisfjara Black Sand Beach',
    address: 'Reynisfjara, Iceland',
    rating: 4.8,
    reviewCount: 22109,
    priceLevel: 0,
    lat: 63.4056,
    lng: -19.0448,
    isOpen: true,
    types: ['natural_feature', 'beach'],
  },
  mock_jokulsarlon: {
    placeId: 'mock_jokulsarlon',
    name: 'Jökulsárlón Glacier Lagoon',
    address: 'Jökulsárlón, Iceland',
    rating: 4.9,
    reviewCount: 31047,
    priceLevel: 0,
    lat: 64.0784,
    lng: -16.2306,
    isOpen: true,
    types: ['natural_feature', 'tourist_attraction'],
  },
  mock_perlan: {
    placeId: 'mock_perlan',
    name: 'Perlan Museum',
    address: 'Varmahlíð 1, 105 Reykjavík, Iceland',
    website: 'https://www.perlan.is',
    phone: '+354 562 0200',
    rating: 4.6,
    reviewCount: 8374,
    priceLevel: 2,
    lat: 64.1265,
    lng: -21.9097,
    isOpen: true,
    types: ['museum', 'tourist_attraction'],
  },
};

export async function GET(request: NextRequest) {
  // Require auth — this endpoint proxies Google Places on the server's
  // billing key. Without auth, anyone with the URL can drain the quota.
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get('place_id') || '';

  if (!placeId) {
    return NextResponse.json({ error: 'Missing place_id' }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_KEY;

  // Real Google Places Details call
  if (apiKey && !placeId.startsWith('mock_')) {
    try {
      const fields = [
        'name', 'formatted_address', 'website', 'formatted_phone_number',
        'rating', 'user_ratings_total', 'price_level', 'geometry',
        'opening_hours', 'types',
      ].join(',');

      const params = new URLSearchParams({ place_id: placeId, fields, key: apiKey });
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?${params}`,
        { headers: { Referer: 'https://www.tripcoord.ai' } }
      );
      const data = await response.json();
      const r = data.result || {};

      return NextResponse.json({
        placeId,
        name: r.name,
        address: r.formatted_address,
        website: r.website,
        phone: r.formatted_phone_number,
        rating: r.rating,
        reviewCount: r.user_ratings_total,
        priceLevel: r.price_level,
        lat: r.geometry?.location?.lat,
        lng: r.geometry?.location?.lng,
        isOpen: r.opening_hours?.open_now,
        hours: r.opening_hours?.weekday_text,
        types: r.types || [],
        source: 'google',
      });
    } catch (err) {
      console.error('[places/details] Google fetch failed:', err);
      return NextResponse.json(
        { error: 'Place details temporarily unavailable.' },
        { status: 503 },
      );
    }
  }

  // No GOOGLE_MAPS_KEY OR caller passed a mock_* placeId — surface this rather
  // than silently feeding mock data to authenticated users.
  return NextResponse.json(
    { error: 'Place details not available for this place.' },
    { status: 404 },
  );
}
