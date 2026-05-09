import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';

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
