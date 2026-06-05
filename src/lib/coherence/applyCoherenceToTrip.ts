/**
 * Load a trip's assembled itinerary, run the whole-trip coherence + dedup pass,
 * and persist the result if anything was applied.
 *
 * Shared by BOTH the HTTP endpoint (POST /api/trips/[id]/coherence) and the
 * Inngest background function, so the load → run → save logic lives in one
 * place. Self-contained: creates its own admin + Anthropic clients from env, so
 * callers only pass a tripId.
 *
 * Fail-open: inherits runCoherencePass's behavior — on any AI/Places/parse
 * issue the itinerary is left unchanged.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { runCoherencePass, type CoherenceChange, type QualityFinding } from './coherencePass';
import type { ItineraryDay } from '@/lib/types';

export interface ApplyCoherenceResult {
  ok: boolean;
  /** False when the trip has no itinerary yet (nothing to process). */
  found: boolean;
  appliedReplacements: number;
  changes: CoherenceChange[];
  qualityFindings: QualityFinding[];
}

export async function applyCoherenceToTrip(tripId: string): Promise<ApplyCoherenceResult> {
  const admin = createAdminClient();

  const { data: itinerary } = await admin
    .from('itineraries')
    .select('days')
    .eq('trip_id', tripId)
    .maybeSingle();

  const days = (itinerary?.days ?? []) as unknown as ItineraryDay[];
  if (!Array.isArray(days) || days.length === 0) {
    return { ok: true, found: false, appliedReplacements: 0, changes: [], qualityFindings: [] };
  }

  const result = await runCoherencePass(days, {
    anthropic: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
    placesApiKey: process.env.GOOGLE_MAPS_KEY ?? '',
    supabase: admin,
  });

  const appliedReplacements = result.changes.filter(c => c.kind === 'dedupe_replaced').length;
  if (appliedReplacements > 0) {
    const { error } = await admin
      .from('itineraries')
      .update({ days: result.days as unknown as never })
      .eq('trip_id', tripId);
    if (error) {
      console.error('[applyCoherenceToTrip] save failed:', error.message);
      return { ok: false, found: true, appliedReplacements: 0, changes: result.changes, qualityFindings: result.qualityFindings };
    }
  }

  return { ok: result.ok, found: true, appliedReplacements, changes: result.changes, qualityFindings: result.qualityFindings };
}
