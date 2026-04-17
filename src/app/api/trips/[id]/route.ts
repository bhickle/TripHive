import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/trips/[id]
 * Loads a trip + its itinerary from Supabase.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createAdminClient();

    // Load trip row
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('*')
      .eq('id', params.id)
      .single();

    if (tripError || !trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    // Load itinerary
    const { data: itinerary, error: itinError } = await supabase
      .from('itineraries')
      .select('*')
      .eq('trip_id', params.id)
      .single();

    if (itinError || !itinerary) {
      return NextResponse.json({ error: 'Itinerary not found' }, { status: 404 });
    }

    return NextResponse.json({ trip, itinerary });
  } catch (err) {
    console.error('Load trip error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

/**
 * PATCH /api/trips/[id]
 * Updates the itinerary days (e.g. after adding/editing an activity).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { days } = await request.json();
    if (!Array.isArray(days)) {
      return NextResponse.json({ error: 'days must be an array' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('itineraries')
      .update({ days, updated_at: new Date().toISOString() })
      .eq('trip_id', params.id);

    if (error) {
      console.error('Itinerary update error:', JSON.stringify(error));
      return NextResponse.json({ error: 'Failed to update itinerary' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Update trip error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
