/**
 * Build-finalize pipeline — the post-generation half of the background build.
 *
 * Runs AFTER every day of a trip has been generated. Three steps:
 *   1. Whole-trip coherence + dedup pass (the Phase 1 engine).
 *   2. Mark the trip's itinerary as ready (stamp itinerary_generated_at).
 *   3. Notify the organizer that their trip is ready to view (deduped).
 *
 * Reusable + self-contained (creates its own admin client). The Inngest
 * `itinerary-finalize` function calls this; eventually the background-build
 * orchestrator (Part 2) will call it as its last step.
 *
 * Fail-open on the coherence step (inherited); the ready-stamp + notification
 * still run even if the coherence pass changed nothing.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { insertNotificationDeduped } from '@/lib/supabase/notify';
import { applyCoherenceToTrip, type ApplyCoherenceResult } from './applyCoherenceToTrip';

export interface FinishBuildResult {
  ok: boolean;
  /** False when the trip row doesn't exist. */
  found: boolean;
  coherence: ApplyCoherenceResult;
  notified: boolean;
}

export async function finishBackgroundBuild(tripId: string): Promise<FinishBuildResult> {
  // 1. Quality/dedup pass over the assembled itinerary.
  const coherence = await applyCoherenceToTrip(tripId);

  const admin = createAdminClient();

  const { data: trip } = await admin
    .from('trips')
    .select('organizer_id, title, destination')
    .eq('id', tripId)
    .maybeSingle();

  if (!trip) {
    return { ok: false, found: false, coherence, notified: false };
  }

  // 2. Stamp "ready" — the itinerary has been generated + quality-checked.
  await admin
    .from('trips')
    .update({ itinerary_generated_at: new Date().toISOString() })
    .eq('id', tripId);

  // 2b. Realtime-visible "done" marker. `itineraries` is in the Realtime
  // publication (trips is NOT), so the building browser watches this flag to
  // flip the build screen to the finished view the instant the build lands —
  // no polling latency. Merge into existing meta so the day-1 title/sidebar
  // lists the orchestrator persisted aren't clobbered.
  {
    const { data: itinRow } = await admin
      .from('itineraries')
      .select('meta')
      .eq('trip_id', tripId)
      .maybeSingle();
    const baseMeta = (itinRow?.meta && typeof itinRow.meta === 'object')
      ? { ...(itinRow.meta as Record<string, unknown>) }
      : {};
    // Clear any stale failure marker from an earlier attempt — this build
    // reached finalize, so it succeeded.
    delete baseMeta.buildError;
    delete baseMeta.buildErrorAt;
    await admin
      .from('itineraries')
      .update({
        meta: { ...baseMeta, buildReady: true, buildReadyAt: new Date().toISOString() } as never,
        updated_at: new Date().toISOString(),
      })
      .eq('trip_id', tripId);
  }

  // 3. Notify the organizer (deduped per trip+type, so a re-run won't re-ping).
  let notified = false;
  if (trip.organizer_id) {
    await insertNotificationDeduped(admin, {
      user_id: trip.organizer_id,
      type: 'itinerary_ready',
      trip_id: tripId,
      trip_name: trip.title ?? trip.destination ?? null,
      inviter_name: 'tripcoord',
      message: `Your ${trip.destination ?? 'trip'} itinerary is ready to view.`,
    });
    notified = true;
  }

  return { ok: true, found: true, coherence, notified };
}
