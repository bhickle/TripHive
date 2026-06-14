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
import { createAdminClient } from '@/lib/supabase/admin';
import { callGenerateChunk } from '@/lib/build/callGenerateChunk';
import {
  computeSegments,
  findResumeStartDay,
  narrowSegmentsForResume,
  collectDayVenues,
  collectDayRestaurants,
  buildPrevContext,
  type BuildSegment,
} from '@/lib/build/buildOrchestration';
import type { ItineraryDay } from '@/lib/types';

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

/**
 * Background itinerary build — the server-side chunk orchestrator (Option B).
 * Event: `itinerary/build.requested` with
 *   { data: { tripId, userId, freshRebuild?, payload } }
 * where `payload` is the full generation body the browser would POST (it carries
 * fields that only exist in Trip-Builder state, like destinations / dailyOutlines).
 *
 * It mirrors the browser's `?mode=generating` loop EXACTLY via the shared
 * `buildOrchestration` lib: plan the 3-day chunks, resume any partial build,
 * thread continuity + cross-chunk dedup, and call the SAME `/api/generate-itinerary`
 * endpoint per chunk (over the internal-auth path) — which persists each day to
 * the DB just like it does for the browser. Each chunk is its own Inngest step,
 * so a 7-day build runs as ~3 separate ≤300s invocations (staying under Vercel's
 * maxDuration) and a retry resumes from the last completed chunk.
 *
 * On completion it emits `itinerary/build.completed`, which hands off to
 * `finalizeBuildFn` (coherence/dedup → mark ready → notify the organizer).
 *
 * DORMANT until something emits `itinerary/build.requested` AND
 * INTERNAL_BUILD_SECRET is set. The browser build is unaffected.
 */
export const buildItineraryFn = inngest.createFunction(
  {
    id: 'itinerary-build',
    name: 'Background itinerary build (chunk orchestration)',
    triggers: [{ event: 'itinerary/build.requested' }],
    // One in-flight build per trip — prevents a duplicate trigger from racing.
    concurrency: { key: 'event.data.tripId', limit: 1 },
  },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as {
      tripId?: string;
      userId?: string;
      freshRebuild?: boolean;
      payload?: Record<string, unknown>;
    };
    const tripId = typeof data.tripId === 'string' ? data.tripId : undefined;
    const userId = typeof data.userId === 'string' ? data.userId : undefined;
    const payload = (data.payload && typeof data.payload === 'object') ? data.payload : {};
    if (!tripId || !userId) {
      return { skipped: true, reason: 'missing tripId/userId' };
    }

    const destination = String(payload.destination ?? '');
    const tripLength = Number(payload.tripLength) || 7;
    const destinations = Array.isArray(payload.destinations)
      ? (payload.destinations as string[])
      : null;
    const daysPerDestination =
      payload.daysPerDestination && typeof payload.daysPerDestination === 'object'
        ? (payload.daysPerDestination as Record<string, number>)
        : null;

    const admin = createAdminClient();
    const fresh = data.freshRebuild === true;

    // Regenerate: clear the build-credit claim ONCE so the first chunk re-claims
    // + charges exactly once. We deliberately do NOT send `freshRebuild` on the
    // chunks themselves — that would re-clear + re-charge on an Inngest retry.
    // Clearing is idempotent, and the step is memoized, so this runs once.
    if (fresh) {
      await step.run('reset-build-claim', async () => {
        await admin.from('trips').update({ build_credits_charged_at: null }).eq('id', tripId);
        // Clear the PRIOR build's ready marker so a watching browser waits for
        // THIS rebuild to finish rather than seeing the old itineraries.meta
        // buildReady flag and flipping to "done" immediately.
        const { data: itin } = await admin.from('itineraries').select('meta').eq('trip_id', tripId).maybeSingle();
        if (itin?.meta && typeof itin.meta === 'object') {
          const m = { ...(itin.meta as Record<string, unknown>) };
          delete m.buildReady;
          delete m.buildReadyAt;
          delete m.buildError;
          delete m.buildErrorAt;
          await admin.from('itineraries').update({ meta: m as never }).eq('trip_id', tripId);
        }
        return { cleared: true };
      });
    }

    // Seed from any already-persisted days (resume after an interruption /
    // re-trigger). For a fresh rebuild we ignore stale days and start clean.
    const persisted = (await step.run('read-persisted', async () => {
      const { data: itin } = await admin
        .from('itineraries')
        .select('days')
        .eq('trip_id', tripId)
        .maybeSingle();
      return (itin?.days ?? []) as unknown as ItineraryDay[];
    })) as ItineraryDay[];

    const allDays: ItineraryDay[] = fresh || !Array.isArray(persisted) ? [] : [...persisted];

    let segments = computeSegments({ destination, tripLength, destinations, daysPerDestination });
    if (!fresh) {
      const resumeStart = findResumeStartDay(allDays, tripLength);
      if (resumeStart > tripLength) {
        // Everything already built — just finalize.
        await step.sendEvent('build-completed', {
          name: 'itinerary/build.completed',
          data: { tripId },
        });
        return { tripId, alreadyComplete: true };
      }
      segments = narrowSegmentsForResume(segments, resumeStart, destination, tripLength);
    }

    // Single-city ≤3 days produces no segments → one full-trip call (citySegment
    // omitted), exactly like the browser.
    const chunkPlan: (BuildSegment | null)[] = segments.length > 0 ? segments : [null];

    let prevContext: string | null = null;
    let firstMeta: Record<string, unknown> | null = null;

    // Wrap generation + handoff: on a hard failure (a chunk that keeps erroring
    // past its retries) we write a failure marker to itineraries.meta — which is
    // in the Realtime publication — so the watching browser shows "build failed
    // — try again" instead of spinning on "Building…" forever.
    try {
    for (const seg of chunkPlan) {
      const body: Record<string, unknown> = { ...payload };
      if (seg) {
        const priorDays = allDays.filter(
          (d) => ((d.day as number | undefined) ?? 0) < seg.dayStart,
        );
        const excludeVenues = Array.from(new Set(priorDays.flatMap(collectDayVenues))).slice(0, 100);
        const excludeRestaurants = Array.from(
          new Set(priorDays.flatMap(collectDayRestaurants)),
        ).slice(0, 60);
        body.citySegment = {
          cityName: seg.cityName,
          dayStart: seg.dayStart,
          dayCount: seg.dayCount,
          sameCity: seg.sameCity,
          totalTripDays: tripLength,
          ...(prevContext ? { prevContext } : {}),
          ...(excludeVenues.length ? { excludeVenues } : {}),
          ...(excludeRestaurants.length ? { excludeRestaurants } : {}),
        };
      }

      const stepId = seg ? `chunk-d${seg.dayStart}-c${seg.dayCount}` : 'chunk-full';
      const chunk = (await step.run(stepId, () => callGenerateChunk(body, userId))) as {
        days: ItineraryDay[];
        meta: Record<string, unknown> | null;
      };

      if (!firstMeta && chunk.meta) firstMeta = chunk.meta;

      // Merge this chunk's days into the running set (by day number).
      for (const d of chunk.days ?? []) {
        const dn = (d.day as number | undefined) ?? 0;
        const idx = allDays.findIndex((x) => ((x.day as number | undefined) ?? 0) === dn);
        if (idx >= 0) allDays[idx] = d;
        else allDays.push(d);
      }
      allDays.sort(
        (a, b) => ((a.day as number | undefined) ?? 0) - ((b.day as number | undefined) ?? 0),
      );

      // Continuity hint for the next chunk = this segment's last day.
      if (seg) {
        const segDays = allDays.filter((d) => {
          const dn = (d.day as number | undefined) ?? 0;
          return dn >= seg.dayStart && dn < seg.dayStart + seg.dayCount;
        });
        const lastDay = segDays.length
          ? segDays[segDays.length - 1]
          : chunk.days?.[chunk.days.length - 1];
        prevContext = buildPrevContext(lastDay);
      }
    }

    // Persist the day-1 meta (title + sidebar lists) onto itineraries.meta — the
    // route persists DAYS but not META, so the browser does this in its final
    // PATCH; we mirror that here. The finalize worker stamps "ready" + notifies.
    if (firstMeta) {
      await step.run('persist-meta', async () => {
        const { data: itin } = await admin
          .from('itineraries')
          .select('meta')
          .eq('trip_id', tripId)
          .maybeSingle();
        const baseMeta =
          itin?.meta && typeof itin.meta === 'object' ? (itin.meta as Record<string, unknown>) : {};
        const fm = firstMeta as Record<string, unknown>;
        const keys = [
          'title', 'practicalNotes', 'departureInfo', 'hotelSuggestions',
          'foodieTips', 'nightlifeHighlights', 'shoppingGuide', 'priorityHighlights',
        ];
        const merged: Record<string, unknown> = { ...baseMeta };
        for (const k of keys) if (fm[k] != null) merged[k] = fm[k];
        await admin
          .from('itineraries')
          .update({ meta: merged as never, updated_at: new Date().toISOString() })
          .eq('trip_id', tripId);
        return { ok: true };
      });
    }

    // Hand off to finalizeBuildFn (coherence/dedup → mark ready → notify).
    await step.sendEvent('build-completed', {
      name: 'itinerary/build.completed',
      data: { tripId },
    });

    return { tripId, daysBuilt: allDays.length };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Build failed';
      try {
        const { data: itin } = await admin.from('itineraries').select('meta').eq('trip_id', tripId).maybeSingle();
        const m = (itin?.meta && typeof itin.meta === 'object') ? { ...(itin.meta as Record<string, unknown>) } : {};
        m.buildError = message.slice(0, 300);
        m.buildErrorAt = new Date().toISOString();
        await admin.from('itineraries').update({ meta: m as never }).eq('trip_id', tripId);
      } catch { /* marker write failed — non-fatal */ }
      throw err; // re-throw so the Inngest run is recorded as failed
    }
  },
);

/** Every function the serve endpoint registers. */
export const inngestFunctions = [coherencePassFn, finalizeBuildFn, buildItineraryFn];
