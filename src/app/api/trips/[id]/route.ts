import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

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
 * Requires the caller to be the trip organizer.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { days, metaPatch, tripPatch } = body as {
      days?: any[];
      metaPatch?: Record<string, any>;
      tripPatch?: { destination?: string; title?: string; start_date?: string; end_date?: string };
    };

    if (!Array.isArray(days) && !metaPatch && !tripPatch) {
      return NextResponse.json({ error: 'days (array), metaPatch (object), or tripPatch (object) required' }, { status: 400 });
    }

    // ── Auth check: verify caller owns this trip ───────────────────────────────
    let userId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      // Auth check failed
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Verify the user owns this trip (organizer_id check)
    const { data: tripRow, error: tripLookupError } = await supabase
      .from('trips')
      .select('organizer_id')
      .eq('id', params.id)
      .single();

    if (tripLookupError || !tripRow) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    if (tripRow.organizer_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── Update trips table fields (destination, title, dates) ─────────────────
    if (tripPatch && Object.keys(tripPatch).length > 0) {
      const { error } = await supabase
        .from('trips')
        .update(tripPatch)
        .eq('id', params.id);

      if (error) {
        console.error('Trip fields update error:', JSON.stringify(error));
        return NextResponse.json({ error: 'Failed to update trip fields' }, { status: 500 });
      }
    }

    // ── Update itinerary days ──────────────────────────────────────────────────
    if (Array.isArray(days)) {
      const { error } = await supabase
        .from('itineraries')
        .update({ days, updated_at: new Date().toISOString() })
        .eq('trip_id', params.id);

      if (error) {
        console.error('Itinerary days update error:', JSON.stringify(error));
        return NextResponse.json({ error: 'Failed to update itinerary' }, { status: 500 });
      }
    }

    // ── Merge-patch itinerary meta (e.g. add isCruise/cruiseLine after upload) ─
    if (metaPatch) {
      // Fetch existing meta first so we can merge
      const { data: existing } = await supabase
        .from('itineraries')
        .select('meta')
        .eq('trip_id', params.id)
        .single();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mergedMeta = { ...((existing?.meta as Record<string, any>) ?? {}), ...metaPatch };

      const { error } = await supabase
        .from('itineraries')
        .update({ meta: mergedMeta, updated_at: new Date().toISOString() })
        .eq('trip_id', params.id);

      if (error) {
        console.error('Itinerary meta update error:', JSON.stringify(error));
        return NextResponse.json({ error: 'Failed to update itinerary meta' }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Update trip error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

/**
 * DELETE /api/trips/[id]
 * Permanently deletes a trip and its itinerary. Requires the caller to be the organizer.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Auth check
    let userId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id ?? null;
    } catch { /* auth failed */ }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Verify ownership
    const { data: tripRow, error: lookupErr } = await supabase
      .from('trips')
      .select('organizer_id')
      .eq('id', params.id)
      .single();

    if (lookupErr || !tripRow) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }
    if (tripRow.organizer_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete itinerary first (FK), then the trip row
    await supabase.from('itineraries').delete().eq('trip_id', params.id);
    const { error: tripDeleteErr } = await supabase.from('trips').delete().eq('id', params.id);

    if (tripDeleteErr) {
      console.error('Trip delete error:', JSON.stringify(tripDeleteErr));
      return NextResponse.json({ error: 'Failed to delete trip' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Delete trip error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
