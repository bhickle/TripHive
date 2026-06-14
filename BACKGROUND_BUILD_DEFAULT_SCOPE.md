# Phase 2b — background build by default (scope)

**Goal:** make the Inngest background build the DEFAULT path for every build, so itineraries finish server-side regardless of the browser — retiring the client-SSE-loop's failure modes (browser-closed, chunk timeout, partial builds). Decided 2026-06-13 (Brandon: default-for-everyone, clean over band-aids).

**Two ratified decisions:**
1. **Auto-fallback kept.** If the Inngest event can't be sent (no event key / send throws), the build falls back to today's client-side SSE loop. Background is the default path; SSE is the resilience net. Don't delete the SSE path.
2. **Ready-marker on `itineraries`** (already in the Realtime publication; `trips` is not). The finalize step stamps a ready flag onto `itineraries.meta`; the browser watches Realtime on `itineraries` and treats that flag as "done." No DDL.

---

## Flow
1. Builder creates the skeleton trip (unchanged), then **POST `/api/trips/[id]/build`** with the generation `payload`. The route `inngest.send({ name: 'itinerary/build.requested', data: { tripId, userId, freshRebuild, payload } })`. Then redirect to the itinerary page in **`?mode=building`**.
   - On a non-OK / thrown response (Inngest unavailable) → fall back to the existing **`?mode=generating`** SSE path (sessionStorage payload is still set, so the fallback just works).
2. `buildItineraryFn` (exists) orchestrates the chunks server-side, persisting each day to `itineraries.days`; emits `itinerary/build.completed` → `finalizeBuildFn` → `finishBackgroundBuild` (coherence → ready stamp → notify).
3. Browser in `?mode=building`: seed any already-persisted days from the DB, render the build progress screen, and **subscribe to Supabase Realtime on `itineraries`** (filter `trip_id`). Each UPDATE → re-render days; when the ready flag appears → finish (strip the mode param, full reload). A **poll backstop** (every ~5s on `/api/trips/[id]`) covers a Realtime miss so the screen never hangs.

## Touch points
- `src/app/api/trips/[id]/build/route.ts` — NEW. requireTripAiRole(tripId); send the event; return `{ ok }` or `{ ok:false, fallback:true }` (missing key / send error).
- `src/lib/coherence/finishBackgroundBuild.ts` — also stamp `itineraries.meta.buildReady` (Realtime-visible "done").
- `src/app/trip/new/Client.tsx` (`handleGenerateItinerary`) — after skeleton, POST build route → `?mode=building`; fall back to `?mode=generating` on failure.
- `src/app/trip/[id]/itinerary/Client.tsx` — `handleRegenerate` routes through the build route (freshRebuild) with the same fallback; load-effect `building` branch (seed DB days, don't run SSE); NEW Realtime-watcher effect (+ poll backstop) for `?mode=building`; building progress UI reuses the existing loading screen.

## Safety / rollout
- SSE path stays fully intact as the automatic fallback — a bad Inngest deploy degrades to today's behavior, never a hard break.
- Poll backstop inside the watcher guards the Realtime dependency.
- Credits unaffected: chunks still go through `/api/generate-itinerary`'s atomic `build_credits_charged_at` claim (1 charge/build).
- Can't be runtime-tested locally (needs Inngest + Realtime + deploy) — verify on a live build before declaring solid.
