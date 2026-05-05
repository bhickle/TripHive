import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';

export async function GET(request: NextRequest) {
  // Require auth — this endpoint proxies Google Places on the server's
  // billing key. Without auth, anyone with the URL can drain the quota.
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

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
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`,
        { headers: { Referer: 'https://www.tripcoord.ai' } }
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
    } catch (err) {
      console.error('[places/search] Google fetch failed:', err);
      return NextResponse.json(
        { error: 'Place search is temporarily unavailable.', results: [] },
        { status: 503 },
      );
    }
  }

  // No GOOGLE_MAPS_KEY configured — surface this rather than silently feeding
  // Iceland mock data to authenticated users (per CLAUDE.md mock policy).
  return NextResponse.json(
    { error: 'Place search is not configured on this environment.', results: [] },
    { status: 503 },
  );
}
