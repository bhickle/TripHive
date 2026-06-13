# Paste-to-Plan — Layer 1 scope (parse + honor user's typed plan)

**Problem (from Brandon's Italy trip, 2026-06-13):** A user typed a detailed, dated, Track-labeled day-by-day plan into the Trip Builder notes and the build ignored it — both the specific venues/times AND the Track A/B intent. Root cause is not the AI "deciding against" the user; the user's *structure* (days, tracks, cities, venues, times) is lost before the model ever sees it as structure.

**Goal of Layer 1:** Let the user paste their plan once; parse it into structured per-day intent; honor it as hard constraints in the build; and detect explicit cross-city track requests as the opt-in signal for Layer 2. Same-city splits work immediately. Cross-city *rendering* is Layer 2 (separate, fast-follow).

---

## Why it's ignored today (grounded)

Two honoring mechanisms exist, with very different strength:

- **Per-day outline boxes** — `state.dailyOutlines[i]`, Step 5, gated behind the `knowsDailyPlans` toggle (`src/app/trip/new/Client.tsx:2914-2942`). Sent only when `knowsDailyPlans` is true (`Client.tsx:933-935`). Honored STRONGLY: prompt says *"the outline is the SKELETON… where an outline names a specific venue, USE THAT VENUE"* (`generate-itinerary/route.ts:467-471, 1478`), mapped Day N → Day N.
- **"Anything else?"** — `state.additionalContext`, one global box (`Client.tsx:2857-2867`), framed MEDIUM as *"high-priority preferences that should shape the itinerary"* (`route.ts:1165`). No per-day mapping, no venue-level "verbatim."

Failure modes:
1. **No date/day parsing.** A pasted multi-day block ("Saturday 6/20… Wednesday 6/24") is never split into day indices. In `additionalContext` it's a global blob; in one outline box it all lands on Day 1.
2. **No `Track A:` / `Track B:` parsing.** Markers are plain prose. The split-track decision is purely heuristic — `groupSize >= 4 && (personaOnly.length > 0 || hasMemberDivergence)` (`route.ts:579-599`) — and **ignores user text entirely.** So even a fully-supportable *same-city* split (Tue 6/23: Vatican / Villa Borghese, reconvene at Castel Sant'Angelo) never fires.
3. **Cross-city blocked.** `ItineraryDay.city` is a single value; the verify gate (`validateAndCorrectDay`) rejects any venue outside `day.city`. Wed 6/24 (Track A → Florence, Track B → Tivoli) can't be represented.

**Pre-build verification step:** confirm with Brandon which box he pasted into; read that exact field's send + prompt path to nail the precise drop point before coding.

---

## Layer 1 deliverables (same-city; cross-city detected + flagged, not rendered)

### 1. `POST /api/parse-plan` (new, Haiku)
Extraction-of-INTENT only — mirror parse-itinerary's "NEVER invent venues/addresses" rule (`parse-itinerary/route.ts:11`). Returns:

```ts
{
  destination?: string; startDate?: string; endDate?: string; tripLength?: number;
  groupType?: string; groupSize?: number; priorities?: string[];
  days: Array<{
    dayNumber: number;           // mapped from date headers or order
    date?: string;
    outline: string;             // free-text fallback for that day
    split: boolean;              // user named Track A AND Track B that day
    crossCity: boolean;          // track A and track B name DIFFERENT cities
    trackACity?: string; trackBCity?: string;
    activities: Array<{ name: string; timeSlot?: string; track: 'shared'|'a'|'b'; city?: string }>;
  }>;
}
```

Key parsing: read date headers → day numbers; recognize `Track A:` / `Track B:`; set `crossCity` when the two tracks name different cities. No venue invention; only what the user wrote.

### 2. Builder entry: "Paste my plan"
**DECISION A (placement)** — see below. Parse result pre-fills builder state: `destination`, dates, group, `priorities`, `dailyOutlines[]`, plus a NEW structured `dailyPlans[]` carrying per-day `split` / `crossCity` / per-track activities + cities. User reviews/edits in the normal steps, then Builds.

### 3. Carry structure into the build payload
Add `dailyPlans: DayPlan[]` alongside the existing `dailyOutlines` (keep outlines as the text skeleton; `dailyPlans` carries track/city structure). Thread it through the sessionStorage payload + the live-build effect like `dailyOutlines` already is (`Client.tsx:933-935, 1035`; `route.ts:2022-2026`).

### 4. Generator changes (the high-value, surgical bit)
- **Honor explicit splits.** Change the split trigger from heuristic-only to `heuristic || userRequestedSplit` (where `userRequestedSplit` = any parsed day with `split: true`). `route.ts:579-599`. For those days, build the split around the user's named Track A / Track B activities, **same city**, reconvene for dinner — the model already supports this shape.
- **Honor named venues/times** per day (already strong via the outline path; ensure `dailyPlans` activities reinforce it).
- **Cross-city days (Layer 1 = detect + degrade, NOT render).** For any parsed `crossCity: true` day, do NOT silently flatten. **DECISION B** below.

### 5. Quick win — marker parsing fallback
Independently of the paste flow, detect `Track A:` / `Track B:` in existing `dailyOutlines` (and optionally `additionalContext`) to set `userRequestedSplit`. Makes the Tuesday-style same-city split honor user text even for users who type by hand.

### 6. Review step (UI — mockup-gated)
A confirmation screen: "Here's what we understood." Per the design rule, **build an HTML mockup for Brandon before coding this surface.**

---

## Scope boundary
**In Layer 1:** parse-plan endpoint, paste-to-prefill, `dailyPlans` payload, explicit-split honoring (same-city), named-venue/time honoring, cross-city DETECTION (flag + warn), marker-parse fallback.
**Layer 2 (fast-follow):** cross-city RENDERING — per-track `city`, verify each track against its own city, per-track weather/map, reconvene transport leg. Gated to parser-flagged days only, so most days are untouched.

---

## Open decisions
- **A — Paste entry placement:** (A1) a "Paste my plan" front door at the start of the Builder that pre-fills all steps [recommended — directly solves the paste-in goal], vs (A2) a "paste a block, we'll split it across days" button on the Step 5 daily-outlines screen [smaller, but less of a front-door].
- **B — Cross-city day behavior in Layer 1:** (B1) build it single-city using Track A's city as the day's city + a visible "cross-city tracks coming soon" note on that day [keeps the build usable], vs (B2) hold/blank that day with a clear "needs Layer 2" flag so nothing misleading is generated.
- **C — Marker-parse fallback (#5):** ship it independently as an immediate quick win, or fold it into the paste flow only?

---

## Build sequence (recommended)
1. Verify the exact drop point (which box Brandon used) + confirm field paths.
2. `parse-plan` endpoint + schema.
3. Generator split-trigger change + `dailyPlans` honoring (delivers Tuesday-style splits immediately; testable without UI via a crafted payload).
4. Marker-parse fallback (quick win).
5. Paste-to-prefill wiring (Decision A).
6. Review-step UI — mockup first, then build.
7. Layer 2 (cross-city rendering) as a separate scoped effort.
