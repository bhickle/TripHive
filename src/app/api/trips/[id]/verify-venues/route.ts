/**
 * POST /api/trips/[id]/verify-venues
 *
 * Post-generation venue verification pass. Loads the trip's saved
 * itinerary, walks each day for named venues (restaurants, activities,
 * foodieTips, nightlife, shopping, photoSpots, plus the trip-level
 * hotelSuggestions), queries Google Places `business_status` for each,
 * and writes the result map to `itineraries.meta.venueVerification`.
 *
 * Why a separate endpoint instead of inline in /generate-itinerary:
 *   - Vercel serverless functions terminate when their response ends, so
 *     true fire-and-forget background work from generate-itinerary would
 *     get cut off mid-flight. A dedicated endpoint gets its own function
 *     invocation with its own 5-minute budget.
 *   - Verification runs in 5-30s for a typical trip; doing it inline
 *     would delay the SSE 'done' event without benefit (the user already
 *     has the days; verification badges can appear seconds later).
 *   - On-demand re-verification (e.g. user clicks "Refresh venue checks")
 *     reuses the same endpoint.
 *
 * Auth: requireTripAccess — any trip member can trigger.
 * Idempotent: re-runs overwrite the prior verification map.
 *
 * Cost: ~1 Google Places `searchText` call per named venue. A typical
 * 7-day trip generates ~40-60 named venues. At Google's $32/1k pricing
 * for Text Search, that's ~$1.50 per trip. Caller (TripCoord) absorbs.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { requireTripAccess } from '@/lib/supabase/tripAccess';
import type { Json } from '@/lib/supabase/database.types';
import type { ItineraryDay } from '@/lib/types';
import {
  extractNamedVenues,
  collectHotelSuggestions,
  runVerificationPass,
  type HotelSuggestionInput,
} from '@/lib/places/verifyVenues';

export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const access = await requireTripAccess(params.id);
  if (!access.ok) return access.response;
  const { supabase } = access.ctx;

  const apiKey = process.env.GOOGLE_MAPS_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Places API not configured' }, { status: 503 });
  }

  // Load the itinerary
  const { data: itinerary, error: itinErr } = await supabase
    .from('itineraries')
    .select('id, days, meta')
    .eq('trip_id', params.id)
    .maybeSingle();
  if (itinErr || !itinerary) {
    return NextResponse.json({ error: 'Itinerary not found for this trip' }, { status: 404 });
  }

  // Load trip destination for the Places city hint
  const { data: trip } = await supabase
    .from('trips')
    .select('destination')
    .eq('id', params.id)
    .single();
  const cityHint = trip?.destination ?? '';

  // Days are stored as Json; we narrow to ItineraryDay[] for the extractor.
  // The shape is owner-controlled (only our own generator writes it) so the
  // unchecked narrowing is fine — bad shapes just produce no venues.
  const days = (itinerary.days ?? []) as unknown as ItineraryDay[];
  const meta = (itinerary.meta ?? {}) as Record<string, unknown>;
  const hotelSuggestions = (meta.hotelSuggestions ?? null) as HotelSuggestionInput[] | null;

  const dayVenues = extractNamedVenues(days);
  const hotelVenues = collectHotelSuggestions(hotelSuggestions);
  const allVenues = [...dayVenues, ...hotelVenues];

  if (allVenues.length === 0) {
    return NextResponse.json({
      ok: true,
      message: 'No named venues to verify',
      counts: { total: 0, operational: 0, closedPermanently: 0, closedTemporarily: 0, unknown: 0 },
    });
  }

  const verificationMap = await runVerificationPass(allVenues, cityHint, apiKey);

  // Persist into itinerary.meta.venueVerification, preserving any other
  // meta keys (title, hotelSuggestions, departureInfo, practicalNotes,
  // etc. are all stored on the same JSON blob).
  const nextMeta = { ...meta, venueVerification: verificationMap };
  const { error: updateErr } = await supabase
    .from('itineraries')
    .update({ meta: nextMeta as unknown as Json })
    .eq('id', itinerary.id);
  if (updateErr) {
    console.error('[verify-venues] meta update failed:', updateErr);
    return NextResponse.json({ error: 'Failed to save verification results' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    counts: verificationMap.counts,
    flaggedVenues: Object.entries(verificationMap.entries)
      .filter(([, e]) => e.status === 'closed_permanently' || e.status === 'closed_temporarily')
      .map(([key, e]) => ({ key, ...e })),
  });
}
