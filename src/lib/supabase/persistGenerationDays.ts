import { createAdminClient } from './admin';
import type { Json } from './database.types';

/**
 * Server-side persistence of in-progress itinerary days.
 *
 * Tier 1 of the build-durability work: as the generation route emits each
 * day over SSE, it also calls this helper fire-and-forget so a closed tab,
 * sleeping device, or dead stream no longer means the day is lost. The
 * client's own end-of-build PATCH still runs in the success path and stays
 * authoritative — this is the safety net.
 *
 * Why a full-snapshot write instead of a single-day upsert:
 *   The route emits days serially but persistGenerationDays is fired without
 *   await, so multiple in-flight writes are normal. A read-modify-write that
 *   targets a single day would race — the second writer might read state that
 *   doesn't yet reflect the first writer's day, then clobber it. By having
 *   the caller pass the *full ordered list of known days* every time, every
 *   write is a complete superset of every prior write. Latest-write-wins is
 *   exactly what we want and there's no read-modify-write race.
 *
 * Errors are returned (not thrown) so the caller can log without unhandled
 * rejections — generation should never fail because a Supabase write hiccupped.
 */
export async function persistGenerationDays(
  tripId: string,
  days: Json[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!tripId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tripId)) {
    return { ok: false, error: 'invalid tripId' };
  }
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('itineraries')
      .update({ days, updated_at: new Date().toISOString() })
      .eq('trip_id', tripId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' };
  }
}
