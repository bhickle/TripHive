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
import { requireAuth } from '@/lib/supabase/requireAuth';
import { requireTripAiRole } from '@/lib/supabase/tripAccess';
import { applyCoherenceToTrip } from '@/lib/coherence/applyCoherenceToTrip';

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
    const result = await applyCoherenceToTrip(params.id);

    if (!result.found) {
      return NextResponse.json({ error: 'NO_ITINERARY', message: 'This trip has no itinerary to check yet.' }, { status: 400 });
    }
    if (!result.ok) {
      return NextResponse.json({ error: 'SAVE_FAILED', message: 'Coherence pass ran but the result could not be saved.' }, { status: 500 });
    }

    return NextResponse.json({
      ok: result.ok,
      appliedReplacements: result.appliedReplacements,
      changes: result.changes,
      qualityFindings: result.qualityFindings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[coherence]', message);
    return NextResponse.json({ error: 'COHERENCE_FAILED', message }, { status: 500 });
  }
}
