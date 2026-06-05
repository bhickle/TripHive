/**
 * Inngest functions registered with the serve endpoint (/api/inngest).
 *
 * Phase 2a — foundation: a single real, self-contained function (the whole-trip
 * coherence pass) that proves the integration end-to-end without touching the
 * live build pipeline. Trigger it manually from the Inngest dashboard with a
 * `{ "tripId": "<uuid>" }` payload, or by sending the `itinerary/coherence.requested`
 * event.
 *
 * Phase 2b will add the background-build orchestration function here.
 */

import { inngest } from './client';
import { applyCoherenceToTrip } from '@/lib/coherence/applyCoherenceToTrip';

/**
 * Run the whole-trip coherence + dedup pass on a trip's assembled itinerary.
 * Event: `itinerary/coherence.requested` with `{ data: { tripId } }`.
 */
export const coherencePassFn = inngest.createFunction(
  {
    id: 'coherence-pass',
    name: 'Whole-trip coherence + dedup pass',
    triggers: [{ event: 'itinerary/coherence.requested' }],
  },
  async ({ event, step }) => {
    const tripId = typeof event.data?.tripId === 'string' ? event.data.tripId : undefined;
    if (!tripId) {
      return { skipped: true, reason: 'no tripId in event data' };
    }

    // One memoized step — Inngest records the result, so a retry of a later step
    // (when we add more) won't re-run the coherence work.
    const result = await step.run('apply-coherence', () => applyCoherenceToTrip(tripId));

    return {
      tripId,
      found: result.found,
      appliedReplacements: result.appliedReplacements,
      qualityFindingsCount: result.qualityFindings.length,
    };
  },
);

/** Every function the serve endpoint registers. */
export const inngestFunctions = [coherencePassFn];
