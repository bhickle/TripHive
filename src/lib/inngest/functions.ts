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
import { finishBackgroundBuild } from '@/lib/coherence/finishBackgroundBuild';

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

/**
 * Finalize an itinerary build: run the coherence/dedup pass, mark the trip
 * ready, and notify the organizer. Event: `itinerary/build.completed` with
 * `{ data: { tripId } }`. This is the post-generation half of the background
 * build; Part 2 (the generation orchestrator) will emit this event as its last
 * step. Dormant until something fires the event — invoke manually to test.
 */
export const finalizeBuildFn = inngest.createFunction(
  {
    id: 'itinerary-finalize',
    name: 'Finalize itinerary build (coherence + ready + notify)',
    triggers: [{ event: 'itinerary/build.completed' }],
  },
  async ({ event, step }) => {
    const tripId = typeof event.data?.tripId === 'string' ? event.data.tripId : undefined;
    if (!tripId) {
      return { skipped: true, reason: 'no tripId in event data' };
    }

    const result = await step.run('finish-build', () => finishBackgroundBuild(tripId));

    return {
      tripId,
      found: result.found,
      appliedReplacements: result.coherence.appliedReplacements,
      qualityFindingsCount: result.coherence.qualityFindings.length,
      notified: result.notified,
    };
  },
);

/** Every function the serve endpoint registers. */
export const inngestFunctions = [coherencePassFn, finalizeBuildFn];
