import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getTripRole, verifyTripAccess, type TripRole } from '@/lib/supabase/tripAccess';
import type { Json } from '@/lib/supabase/database.types';

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

    // Verify the caller is the organizer or a trip member.
    // verifyTripAccess also claims any orphan trip_members rows (email match
    // but null user_id) — the open share-link join flow can create those
    // when a guest joins before signing up.
    const isOrganizer = trip.organizer_id === userId;
    if (!isOrganizer) {
      const hasAccess = await verifyTripAccess(supabase, params.id, userId);
      if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // viewerRole — used client-side to gate edit affordances on 3+ trips.
    // Lazy-resolved: getTripRole runs another query, but the access check
    // above already paid that cost for non-organizer callers. Resolve via
    // getTripRole so the value matches the route's own role-based checks.
    const viewerRole = await getTripRole(supabase, params.id, userId);

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

    // ── isTripPassTrip ────────────────────────────────────────────────────────
    // Drives the "Trip Pass overlay" in useEntitlements. The activation key is
    // strictly "does this trip have an active trip_passes purchase?" — NOT the
    // organizer's subscription tier. Trip Pass is a per-trip $30 purchase that
    // unlocks group-coordination for everyone on the trip; an Explorer or
    // Nomad organizer's personal subscription does NOT extend to invitees.
    // Free joinees on an Explorer/Nomad trip stay on their own free tier.
    const nowIso = new Date().toISOString();
    const { count: activePassCount } = await supabase
      .from('trip_passes')
      .select('*', { count: 'exact', head: true })
      .eq('trip_id', params.id)
      .gt('expires_at', nowIso);
    const isTripPassTrip = (activePassCount ?? 0) > 0;

    // hasOriginal: true iff this trip's itinerary has a non-null original_days
    // snapshot the user can revert to. Drives the visibility of the "Revert
    // to original" button in the UI.
    const hasOriginal = !!(itinerary?.original_days && Array.isArray(itinerary.original_days) && itinerary.original_days.length > 0);

    return NextResponse.json({ trip, itinerary: itinerary ?? null, newPrefsCount, pendingPrefsCount, isTripPassTrip, viewerRole, hasOriginal });
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
    const { days, metaPatch, tripPatch, revert } = body as {
      days?: Json[];
      metaPatch?: { [key: string]: Json | undefined };
      tripPatch?: {
        destination?: string;
        title?: string;
        start_date?: string;
        end_date?: string;
        trip_length?: number;
        itinerary_generated_at?: string;
        booked_hotels?: Json[];
        booked_flight?: Json;
        is_private?: boolean;
        is_public_template?: boolean;
        cover_image?: string | null;
        cover_image_meta?: Json | null;
        visited_cities?: string[];
      };
      /** Revert action: copy itineraries.original_days back over days.
       *  Mutually exclusive with other body fields; if revert is true the
       *  other fields are ignored. Restricted to organizer + co-organizer. */
      revert?: boolean;
    };

    if (!Array.isArray(days) && !metaPatch && !tripPatch && !revert) {
      return NextResponse.json({ error: 'days (array), metaPatch (object), tripPatch (object), or revert (true) required' }, { status: 400 });
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
    let updatedTrip: unknown = null;
    if (tripPatch && Object.keys(tripPatch).length > 0) {
      if (!canEditTrip) {
        return NextResponse.json({ error: 'Only organizers and co-organizers can edit trip details' }, { status: 403 });
      }
      // Allow-list the patchable columns. `tripPatch` is TS-typed, but types are
      // erased at runtime — spreading it straight into .update() would let a
      // crafted body write protected columns (organizer_id, is_founder_featured,
      // build_credits_charged_at, fork_source_id, …). Pick only the documented
      // fields. (QA #7 — mass-assignment via the admin client, which bypasses RLS.)
      const TRIP_PATCHABLE = [
        'destination', 'title', 'start_date', 'end_date', 'trip_length',
        'itinerary_generated_at', 'booked_hotels', 'booked_flight', 'is_private',
        'is_public_template', 'cover_image', 'cover_image_meta', 'visited_cities',
      ] as const;
      const src = tripPatch as Record<string, unknown>;
      const safeTripPatch: Record<string, unknown> = {};
      for (const k of TRIP_PATCHABLE) {
        if (src[k] !== undefined) safeTripPatch[k] = src[k];
      }
      if (Object.keys(safeTripPatch).length === 0) {
        return NextResponse.json({ error: 'No editable trip fields in request' }, { status: 400 });
      }
      // Return the updated row so the caller can reconcile against the
      // canonical server state — any future server-side normalization
      // (defaults, validation, triggers) won't drift the UI silently.
      const { data, error } = await supabase
        .from('trips')
        .update(safeTripPatch as NonNullable<typeof tripPatch>)
        .eq('id', params.id)
        .select()
        .single();

      if (error) {
        console.error('Trip fields update error:', JSON.stringify(error));
        return NextResponse.json({ error: 'Failed to update trip fields' }, { status: 500 });
      }
      updatedTrip = data;
    }

    // ── Revert to original AI itinerary ──────────────────────────────────────
    // Copy original_days → days. Restricted to organizer + co-organizer.
    // Returns the restored days so the client can refresh local state.
    if (revert) {
      if (!canEditTrip) {
        return NextResponse.json({ error: 'Only organizers and co-organizers can revert the itinerary' }, { status: 403 });
      }
      const { data: itin } = await supabase
        .from('itineraries')
        .select('original_days')
        .eq('trip_id', params.id)
        .single();
      if (!itin?.original_days) {
        return NextResponse.json({ error: 'No original itinerary to revert to' }, { status: 400 });
      }
      const { error } = await supabase
        .from('itineraries')
        .update({ days: itin.original_days, updated_at: new Date().toISOString() })
        .eq('trip_id', params.id);
      if (error) {
        console.error('Itinerary revert error:', JSON.stringify(error));
        return NextResponse.json({ error: 'Failed to revert itinerary' }, { status: 500 });
      }
      return NextResponse.json({ ok: true, days: itin.original_days });
    }

    // ── Update itinerary days ──────────────────────────────────────────────────
    if (Array.isArray(days)) {
      // Backfill original_days for trips whose snapshot is still NULL — this
      // happens for: (1) skeleton trips created before the AI ran (skeleton
      // save deliberately leaves original_days NULL), (2) older trips that
      // existed before this column. For path (1), the FIRST PATCH that
      // populates days is the AI's initial output, so capture it as the
      // original. For path (2), the first edit captures whatever-is-there
      // as the "original" — not ideal but better than nothing for users who
      // were mid-edit when the migration shipped.
      const { data: existingItin } = await supabase
        .from('itineraries')
        .select('original_days')
        .eq('trip_id', params.id)
        .maybeSingle();
      const updateFields: { days: Json[]; updated_at: string; original_days?: Json[] } = {
        days,
        updated_at: new Date().toISOString(),
      };
      if (!existingItin?.original_days && days.length > 0) {
        updateFields.original_days = days;
      }
      const { error } = await supabase
        .from('itineraries')
        .update(updateFields)
        .eq('trip_id', params.id);

      if (error) {
        console.error('Itinerary days update error:', JSON.stringify(error));
        return NextResponse.json({ error: 'Failed to update itinerary' }, { status: 500 });
      }

      // Keep trips.trip_length in sync with the itinerary's day count so any
      // surface that reads trip_length — notably the trip-card "Nd" cover badge
      // — reflects added/removed days. Without this, adding a day left the
      // cover count stale (QA — reported). Idempotent on a vote/edit that
      // doesn't change the count; best-effort so it can't fail the days save.
      if (days.length > 0) {
        const { error: lenErr } = await supabase
          .from('trips')
          .update({ trip_length: days.length })
          .eq('id', params.id);
        if (lenErr) console.warn('[trips PATCH] trip_length sync failed:', JSON.stringify(lenErr));
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

      const mergedMeta: { [key: string]: Json | undefined } = {
        ...((existing?.meta as { [key: string]: Json | undefined } | null) ?? {}),
        ...metaPatch,
      };

      const { error } = await supabase
        .from('itineraries')
        .update({ meta: mergedMeta, updated_at: new Date().toISOString() })
        .eq('trip_id', params.id);

      if (error) {
        console.error('Itinerary meta update error:', JSON.stringify(error));
        return NextResponse.json({ error: 'Failed to update itinerary meta' }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, trip: updatedTrip });
  } catch (err) {
    console.error('Update trip error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

/**
 * DELETE /api/trips/[id]
 * Permanently deletes a trip and its itinerary. Requires the caller to be the
 * organizer or a co-organizer (co-organizers have parity with organizers on
 * trip-shaping actions per Brandon's intent).
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

    // Verify role — organizer or co-organizer may delete.
    const role: TripRole | null = await getTripRole(supabase, params.id, userId);
    if (!role) {
      // Disambiguate: trip exists vs. caller-not-on-trip.
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
    if (role !== 'organizer' && role !== 'co_organizer') {
      return NextResponse.json({ error: 'Only organizers and co-organizers can delete a trip' }, { status: 403 });
    }

    // Delete itinerary first (FK), then the trip row. If the itinerary
    // delete fails, abort — otherwise we'd orphan the itinerary against
    // a now-deleted trip and the unique trip_id index would block any
    // future re-creation with the same id.
    const { error: itinDeleteErr } = await supabase.from('itineraries').delete().eq('trip_id', params.id);
    if (itinDeleteErr) {
      console.error('Itinerary delete error:', JSON.stringify(itinDeleteErr));
      return NextResponse.json({ error: 'Failed to delete itinerary' }, { status: 500 });
    }
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
