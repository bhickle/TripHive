import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';

interface PlacesApiNewResult {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  types?: string[];
  regularOpeningHours?: { weekdayDescriptions?: string[] };
}

interface GooglePlace {
  name: string;
  address: string;
  placeId: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  types?: string[];
  openingHours?: string[];
}

async function fetchPlaces(destination: string, apiKey: string): Promise<{ restaurants: GooglePlace[]; attractions: GooglePlace[] }> {
  const search = async (query: string): Promise<GooglePlace[]> => {
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': [
            'places.id', 'places.displayName', 'places.formattedAddress',
            'places.rating', 'places.userRatingCount', 'places.priceLevel',
            'places.types', 'places.regularOpeningHours.weekdayDescriptions',
          ].join(','),
        },
        body: JSON.stringify({ textQuery: query, maxResultCount: 20 }),
      });
      const data = await res.json();
      if (!data.places?.length) return [];
      const raw: GooglePlace[] = (data.places as PlacesApiNewResult[]).map(p => ({
        name: p.displayName?.text ?? '',
        address: p.formattedAddress ?? '',
        placeId: p.id ?? '',
        rating: p.rating,
        reviewCount: p.userRatingCount,
        priceLevel: p.priceLevel,
        types: p.types ?? [],
        openingHours: p.regularOpeningHours?.weekdayDescriptions,
      })).filter(p => p.name);
      const high = raw.filter(p => (p.rating ?? 0) >= 4.0 && (p.reviewCount ?? 0) >= 20);
      const fallback = raw.filter(p => (p.rating ?? 0) >= 3.5 && (p.reviewCount ?? 0) >= 5);
      return high.length >= 5 ? high : fallback;
    } catch {
      return [];
    }
  };

  const [restaurants, attractions] = await Promise.all([
    search(`restaurants in ${destination}`),
    search(`things to do attractions in ${destination}`),
  ]);
  return { restaurants, attractions };
}

/**
 * POST /api/places/warm
 * Pre-fetches Google Places data for a destination (or list of cities for multi-city trips)
 * so the generate-itinerary route can skip its own fetch and start streaming immediately.
 *
 * Body: { destination: string, destinations?: string[] }
 * Response: { realPlaces, multiCityPlaces }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  if (!process.env.GOOGLE_MAPS_KEY) {
    // No Google key — return empty so the generate route falls back gracefully
    return NextResponse.json({ realPlaces: null, multiCityPlaces: null });
  }

  let body: { destination?: string; destinations?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const { destination, destinations = [] } = body;

  try {
    if (destinations.length >= 2) {
      const cities = destinations.slice(0, 4);
      const results = await Promise.allSettled(
        cities.map(city => fetchPlaces(city, process.env.GOOGLE_MAPS_KEY!))
      );
      const multiCityPlaces: Record<string, { restaurants: GooglePlace[]; attractions: GooglePlace[] }> = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') multiCityPlaces[cities[i]] = r.value;
      });
      const realPlaces = multiCityPlaces[cities[0]] ?? null;
      return NextResponse.json({ realPlaces, multiCityPlaces });
    } else {
      const query = destinations[0] || destination || '';
      if (!query) return NextResponse.json({ realPlaces: null, multiCityPlaces: null });
      const realPlaces = await fetchPlaces(query, process.env.GOOGLE_MAPS_KEY);
      return NextResponse.json({ realPlaces, multiCityPlaces: null });
    }
  } catch (err) {
    console.warn('[places/warm] fetch error:', err);
    return NextResponse.json({ realPlaces: null, multiCityPlaces: null });
  }
}
