import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/trips/save
 * Persists a newly generated trip + itinerary to Supabase.
 * Returns the Supabase trip ID so the client can navigate to /trip/[id]/itinerary.
 *
 * Uses the admin (service role) client for DB writes to avoid RLS/cookie issues.
 * Uses the cookie-based client only to identify the current user.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tripMeta, itinerary } = body as {
      tripMeta: {
        destination: string;
        title: string;
        startDate: string;
        endDate: string;
        groupType: string;
        groupSize: number;
        budget: number;
        budgetBreakdown: Record<string, number>;
        bookedHotels: unknown[];
        bookedFlight: unknown | null;
        preferences: Record<string, unknown>;
        practicalNotes?: unknown;
        hotelSuggestions?: unknown;
        isCruise?: boolean;
        cruiseLine?: string;
      };
      itinerary: unknown[];
    };

    if (!tripMeta?.destination || !Array.isArray(itinerary)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Identify the current user (cookie-based auth) — optional, anon saves are allowed
    let userId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      // If auth check fails, proceed as anonymous
    }

    // All DB writes use the admin client (bypasses RLS, no cookie dependency)
    const supabase = createAdminClient();

    // ── 1. Insert the trip row ────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tripInsert: any = {
      organizer_id: userId,
      // title is NOT NULL — fall back to 'My Trip' if AI didn't return one
      title: tripMeta.title || 'My Trip',
      destination: tripMeta.destination,
      start_date: tripMeta.startDate || null,
      end_date: tripMeta.endDate || null,
      trip_length: itinerary.length,
      group_size: tripMeta.groupSize ?? 1,
      group_type: tripMeta.groupType ?? null,
      budget_total: tripMeta.budget ?? 0,
      budget_breakdown: tripMeta.budgetBreakdown ?? {},
      booked_hotels: tripMeta.bookedHotels ?? [],
      booked_flight: tripMeta.bookedFlight ?? null,
      preferences: tripMeta.preferences ?? {},
      status: 'planning',
    };

    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert(tripInsert)
      .select('id')
      .single();

    if (tripError || !trip) {
      console.error('Trip insert error:', JSON.stringify(tripError));
      return NextResponse.json({ error: 'Failed to save trip', detail: tripError?.message }, { status: 500 });
    }

    // ── 2. Insert the itinerary row ───────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itinInsert: any = {
      trip_id: trip.id,
      days: itinerary,
      meta: {
        destination: tripMeta.destination,
        title: tripMeta.title,
        startDate: tripMeta.startDate,
        endDate: tripMeta.endDate,
        budget: tripMeta.budget,
        budgetBreakdown: tripMeta.budgetBreakdown,
        bookedHotels: tripMeta.bookedHotels,
        bookedFlight: tripMeta.bookedFlight,
        groupType: tripMeta.groupType,
        groupSize: tripMeta.groupSize,
        practicalNotes: tripMeta.practicalNotes ?? null,
        hotelSuggestions: tripMeta.hotelSuggestions ?? null,
        isCruise: tripMeta.isCruise ?? false,
        cruiseLine: tripMeta.cruiseLine ?? '',
      },
      source: 'ai',
    };

    const { error: itinError } = await supabase
      .from('itineraries')
      .insert(itinInsert);

    if (itinError) {
      console.error('Itinerary insert error:', JSON.stringify(itinError));
      // Clean up the trip row if itinerary failed
      await supabase.from('trips').delete().eq('id', trip.id);
      return NextResponse.json({ error: 'Failed to save itinerary' }, { status: 500 });
    }

    return NextResponse.json({ tripId: trip.id });
  } catch (err) {
    console.error('Save trip error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
