import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/trips/[id]/fork
 *
 * Copies a public template trip into a new trip owned by the caller.
 * The new trip:
 *   - Has its own id (generated)
 *   - organizer_id = caller
 *   - fork_source_id = source trip
 *   - Carries over the itinerary days + meta (so user can immediately
 *     start editing), destination, trip_length, group_size, and the
 *     cover photo + attribution metadata.
 *   - Resets dates to null (new trip = pick your own travel dates),
 *     resets is_public_template to false, fresh trip_members row for
 *     the caller as organizer.
 *
 * Returns the new trip's id so the client can redirect to /trip/[id]/itinerary.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createAdminClient();

    // Source trip must exist + be a public template
    const { data: source, error: srcErr } = await supabase
      .from('trips')
      .select('*')
      .eq('id', params.id)
      .single();

    if (srcErr || !source) {
      return NextResponse.json({ error: 'Source trip not found' }, { status: 404 });
    }
    if (!source.is_public_template) {
      return NextResponse.json({ error: 'Trip is not a public template' }, { status: 403 });
    }

    // Create the new trip row (organizer_id = caller, fork_source_id = source)
    const { data: newTrip, error: insertErr } = await supabase
      .from('trips')
      .insert({
        organizer_id: user.id,
        fork_source_id: source.id,
        title: source.title || `${source.destination} trip`,
        destination: source.destination,
        start_date: null,
        end_date: null,
        trip_length: source.trip_length,
        group_size: source.group_size,
        group_type: source.group_type,
        budget_total: source.budget_total,
        budget_breakdown: source.budget_breakdown,
        preferences: source.preferences,
        cover_image: source.cover_image,
        cover_image_meta: source.cover_image_meta,
        is_public_template: false, // forked trips start private
        is_private: source.is_private,
        status: 'planning',
      })
      .select()
      .single();

    if (insertErr || !newTrip) {
      console.error('fork insert trip error:', insertErr);
      return NextResponse.json({ error: 'Failed to fork trip' }, { status: 500 });
    }

    // Copy the itinerary (days + meta) so the user can immediately edit
    const { data: srcItinerary } = await supabase
      .from('itineraries')
      .select('days, meta, source')
      .eq('trip_id', source.id)
      .maybeSingle();

    if (srcItinerary) {
      const { error: itinErr } = await supabase
        .from('itineraries')
        .insert({
          trip_id: newTrip.id,
          days: srcItinerary.days,
          meta: srcItinerary.meta,
          source: 'forked',
        });
      if (itinErr) {
        // Trip was created but itinerary copy failed — log and continue.
        // User can regenerate from inside the trip if needed.
        console.warn('fork itinerary copy failed:', itinErr);
      }
    }

    // Add the caller as an organizer in trip_members so the existing
    // member-based access checks work consistently.
    await supabase
      .from('trip_members')
      .insert({
        trip_id: newTrip.id,
        user_id: user.id,
        role: 'organizer',
      })
      .select();

    return NextResponse.json({ tripId: newTrip.id });
  } catch (err) {
    console.error('fork POST error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
