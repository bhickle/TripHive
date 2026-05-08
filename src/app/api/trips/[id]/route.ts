import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getTripRole } from '@/lib/supabase/tripAccess';

/**
 * GET /api/trips/[id]
 * Loads a trip + its itinerary from Supabase.
 * Requires the caller to be the trip organizer or a member.
 */
export async function GET(
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

    // Load trip row
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('*')
      .eq('id', params.id)
      .single();

    if (tripError || !trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    // Verify the caller is the organizer or a trip member
    const isOrganizer = trip.organizer_id === userId;
    if (!isOrganizer) {
      const { data: membership } = await supabase
        .from('trip_members')
        .select('id')
        .eq('trip_id', params.id)
        .eq('user_id', userId)
        .maybeSingle();

      if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Load itinerary (may be null for draft trips)
    const { data: itinerary } = await supabase
      .from('itineraries')
      .select('*')
      .eq('trip_id', params.id)
      .maybeSingle();

    // ── newPrefsCount: members whose preferences arrived after the last itinerary build ──
    // Compare on `preferences.submittedAt` (when the member actually answered)
    // rather than `joined_at`, because Trip Pass members typically join first
    // and fill the mini-wizard later. Surfaces the regenerate banner correctly
    // when a member submits or updates preferences post-generation.
    //
    // pendingPrefsCount: members who joined but haven't submitted preferences
    // at all. Used by the regenerate confirm dialog to warn the buyer that
    // those members will be treated as "no preferences" if they generate now.
    let newPrefsCount = 0;
    let pendingPrefsCount = 0;
    {
      const { data: memberRows } = await supabase
        .from('trip_members')
        .select('preferences')
        .eq('trip_id', params.id);
      const generatedAt = trip.itinerary_generated_at;
      for (const row of memberRows ?? []) {
        const p = row.preferences as { submittedAt?: string } | null;
        if (!p?.submittedAt) {
          pendingPrefsCount++;
        } else if (generatedAt && p.submittedAt > generatedAt) {
          newPrefsCount++;
        }
      }
    }

    return NextResponse.json({ trip, itinerary: itinerary ?? null, newPrefsCount, pendingPrefsCount });
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tripPatch?: { destination?: string; title?: string; start_date?: string; end_date?: string; itinerary_generated_at?: string; booked_hotels?: any[]; booked_flight?: any };
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

    // ── Role-based authorization ─────────────────────────────────────────────
    // Previously this route hard-blocked every non-organizer with a 403, which
    // meant trip members couldn't even save vote tallies (those round-trip
    // through this endpoint as a `days` patch). Now:
    //   • days       → any trip member (organizer + co-org + member)
    //                  — needed so members can vote on activities
    //   • tripPatch  → organizer + co-organizer only
    //                  — destination/title/dates are trip-shaping decisions
    //   • metaPatch  → organizer + co-organizer only
    //                  — itinerary meta affects everyone's view
    const role = await getTripRole(supabase, params.id, userId);
    if (!role) {
      // Either the trip doesn't exist or the caller isn't a member.
      // Disambiguate so the client shows the right error.
      const { data: tripExists } = await supabase
        .from('trips')
        .select('id')
        .eq('id', params.id)
        .maybeSingle();
      return NextResponse.json(
        { error: tripExists ? 'Forbidden' : 'Trip not found' },
        { status: tripExists ? 403 : 404 },
      );
    }

    const canEditTrip = role === 'organizer' || role === 'co_organizer';

    // ── Update trips table fields (destination, title, dates) ─────────────────
    if (tripPatch && Object.keys(tripPatch).length > 0) {
      if (!canEditTrip) {
        return NextResponse.json({ error: 'Only organizers and co-organizers can edit trip details' }, { status: 403 });
      }
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
      if (!canEditTrip) {
        return NextResponse.json({ error: 'Only organizers and co-organizers can edit itinerary metadata' }, { status: 403 });
      }
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
