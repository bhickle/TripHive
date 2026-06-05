/**
 * POST /api/trips/[id]/coherence
 *
 * Runs the whole-trip coherence + dedup pass over a trip's COMPLETE itinerary:
 * detects cross-day duplicate venues, swaps in verified replacements, and
 * returns advisory quality findings (pacing/variety/budget/continuity).
 *
 * This is the integration point for Phase 1 of the background-build work. It's
 * usable now (invoke after a build completes, or manually), and the future
 * Inngest worker will call the same `runCoherencePass` library function as the
 * final step before marking a trip "ready" — so the engine is shared, not
 * duplicated.
 *
 * Org/co-org only. Fail-open: if the pass can't run, the itinerary is returned
 * untouched. Not credit-charged in v1 — it's a quality step tripcoord absorbs,
 * the same way verify-before-show correction retries are absorbed.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { requireTripAiRole } from '@/lib/supabase/tripAccess';
import { createAdminClient } from '@/lib/supabase/admin';
import { runCoherencePass } from '@/lib/coherence/coherencePass';
import type { ItineraryDay } from '@/lib/types';

// Makes AI calls (replacement generation) + Places verification + a Haiku
// quality pass — can exceed Vercel's default. Pin to the build-class ceiling.
export const maxDuration = 300;

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  // AI mutations on a trip's itinerary are organizer / co-organizer only.
  const roleCheck = await requireTripAiRole(params.id);
  if (!roleCheck.ok) return roleCheck.response;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'NO_API_KEY', message: 'API key not configured' }, { status: 503 });
  }

  try {
    const admin = createAdminClient();

    // Load the assembled itinerary.
    const { data: itinerary } = await admin
      .from('itineraries')
      .select('days')
      .eq('trip_id', params.id)
      .maybeSingle();

    const days = (itinerary?.days ?? []) as unknown as ItineraryDay[];
    if (!Array.isArray(days) || days.length === 0) {
      return NextResponse.json({ error: 'NO_ITINERARY', message: 'This trip has no itinerary to check yet.' }, { status: 400 });
    }

    const result = await runCoherencePass(days, {
      anthropic: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
      placesApiKey: process.env.GOOGLE_MAPS_KEY ?? '',
      supabase: admin,
    });

    // Persist only if the dedupe pass actually changed something.
    const applied = result.changes.filter(c => c.kind === 'dedupe_replaced').length;
    if (applied > 0) {
      const { error: saveErr } = await admin
        .from('itineraries')
        .update({ days: result.days as unknown as never })
        .eq('trip_id', params.id);
      if (saveErr) {
        console.error('[coherence] save failed:', saveErr.message);
        return NextResponse.json({ error: 'SAVE_FAILED', message: 'Coherence pass ran but the result could not be saved.' }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: result.ok,
      appliedReplacements: applied,
      changes: result.changes,
      qualityFindings: result.qualityFindings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[coherence]', message);
    return NextResponse.json({ error: 'COHERENCE_FAILED', message }, { status: 500 });
  }
}
