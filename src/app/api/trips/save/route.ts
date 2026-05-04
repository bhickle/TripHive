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
    const { tripMeta, itinerary, skeleton } = body as {
      tripMeta: {
        destination: string;
        title: string;
        startDate: string;
        endDate: string;
        groupType: string;
        groupSize: number;
        tripLength?: number;
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
      itinerary: unknown[] | null;
      /** skeleton=true: create trip + empty itinerary row immediately, before generation starts.
       *  Used by the live-build flow so the itinerary page has a real trip ID to work with. */
      skeleton?: boolean;
    };

    // itinerary may be null for draft saves (Option B: invite-first flow)
    if (!tripMeta?.destination) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const isSkeleton = skeleton === true;
    const isDraft = !isSkeleton && (!itinerary || itinerary.length === 0);

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
      trip_length: isDraft ? (tripMeta.tripLength ?? 0) : (itinerary as unknown[]).length,
      group_size: tripMeta.groupSize ?? 1,
      group_type: tripMeta.groupType ?? null,
      budget_total: tripMeta.budget ?? 0,
      budget_breakdown: tripMeta.budgetBreakdown ?? {},
      booked_hotels: tripMeta.bookedHotels ?? [],
      booked_flight: tripMeta.bookedFlight ?? null,
      preferences: tripMeta.preferences ?? {},
      status: isDraft ? 'draft' : (isSkeleton ? 'planning' : 'planning'),
      // Stamp the generation time when an itinerary is included (not for skeleton or draft)
      itinerary_generated_at: (!isDraft && !isSkeleton) ? new Date().toISOString() : null,
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
    // For full saves: insert complete days. For skeleton saves: insert empty days
    // so the PATCH route can update them incrementally during live-build generation.
    // For draft saves (invite-first flow): skip the itinerary row entirely.
    if (!isDraft) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itinInsert: any = {
        trip_id: trip.id,
        days: isSkeleton ? [] : itinerary,
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
          preferences: tripMeta.preferences ?? {},
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
    }

    return NextResponse.json({ tripId: trip.id, isDraft });
  } catch (err) {
    console.error('Save trip error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
