# Site QA Audit — 2026-06-09

Full-site audit (6 parallel deep reviews: recent-changes/regressions, auth/tier/security, build→itinerary core, collaboration, discover/wishlist/standalone, marketing/cross-cutting). Every item below was verified against the live code (offending line quoted by the auditor). Grouped for one-commit-per-group remediation.

**Headline:** the codebase is in strong shape — nearly every prior-audit item is genuinely remediated. There is **one P0** (verified, credit/durability), a handful of P1s (mostly the flexible-date/`"null"` and missing-field crash class on sibling surfaces), and polish P2s. The big known launch-blockers (middleware `tc2026`, world share-card opt-in, Stripe placeholder IDs) are already tracked and unchanged.

---

## ✅ Remediation status (2026-06-09) — all fixes deployed green

| Item | Status | Commit / reason |
|---|---|---|
| **A1** initial-build credit bypass (P0) | ✅ **Fixed** | `1962e6f` — `streamSegment` injects `body.tripId = tripPageId` |
| **B1** Day-Of timeSlot crash | ✅ **Fixed** | `d8106d2` — guarded `formatTimeRange`/`parseEndTime` |
| **B2** same-day trip stale length | ✅ **Fixed** | `d8106d2` — `<=` recompute → 1-day trip |
| **B3** OG `metadataBase` | ✅ **Fixed** | `d8106d2` — set to `https://www.tripcoord.ai` |
| **B4** `trip_length` clobber | ⏸ **Won't fix** | Working as intended — reflects real days; requested length safe in `preferences.tripLength`; changing it breaks intentional deletes |
| **C1** settlement-undo gate | ✅ **Fixed** | `5787655` — DELETE now requires `canUseExpenses` |
| **C2** duplicate-name custom split | ⏸ **Deferred** | Needs re-keying the name-based expense model to member id (storage+calc+display); rare edge case, risky |
| **C3** removed-member custom share | ⏸ **Deferred** | Same name-keyed expense-math area as C2 |
| **C4** orphan invite on send fail | ✅ **Fixed** | `5787655` — delete `trip_invites` row on SendGrid failure |
| **D1** print page literal `"null"` | ✅ **Fixed** | `73e9b91` — header + day dates coerce `"null"` → `''` |
| **D2** Day-Of `"null"` → wrong banner | ✅ **Fixed** | `d8106d2` — `dayDelta` guards `"null"`/empty |
| **D3** add-day `"null"` date label | ✅ **Fixed** | `73e9b91` — guard → "Day N" |
| **D4** Trip Story `getDayCount` NaN | ✅ **Fixed** | `73e9b91` — noon-pad + NaN guard |
| **E1** fork end-before-start | ✅ **Fixed** | `f6e41ed` — modal disable/warn + both routes reject/derive |
| **E2** featured fork `end_date` | ✅ **Fixed** | `f6e41ed` — derived from start + day count |
| **E3** layover over-budget amber | ✅ **Fixed** | `f6e41ed` — → rose |
| **E4** missing-`city` unverified emit | ✅ **Fixed** | `f6e41ed` — backfill `resolvedDestination` + verify |
| **E5** hero emoji vs Lucide | ⏸ **Won't fix** | Cosmetic only |
| **E6** trip-scoped discover route missing | ⏸ **Doc staleness** | No live link; CLAUDE.md reference only |
| **F1** non-build credit-spend race | ⏸ **Deferred** | Post-launch hardening (documented; build path is claim-protected) |
| **F2** AI endpoints rate-limited by credits only | ⏸ **Deferred** | Defensible; optional per-user limiter post-launch |
| **F3** fetch-reference SSRF DNS-rebind | ⏸ **Deferred** | Theoretical (6s timeout, 4KB cap, body not returned) |
| Known launch-blockers (middleware `tc2026`, share-card opt-in, Stripe placeholders) | ➖ **Unchanged** | Already tracked in GOLIVE / BRANDON_TODO |

**Net: 1 P0 + all P1s + the safe P2s fixed and deployed; expense-math edge cases (C2/C3) and security hardening (F1–F3) deferred with reason.**

---

## 🔴 Group A — P0 (fix first)

### A1 — Initial builds bypass the build-credit claim (charge 3×, free users 402 mid-build, no durability)
`src/app/trip/[id]/itinerary/Client.tsx:1315` (`streamSegment` sends `{...payload}`) + `src/app/trip/new/Client.tsx:1033` (writes `existingTripId`, not `tripId`) vs `src/app/api/generate-itinerary/route.ts:1592,1708,1752` (gates everything on `body.tripId`).
- A new 7-day build = 3 chunks, each with no `tripId` → each falls to the per-call charge branch → **75 credits** (3×25) instead of 25; a **free user 402s on chunk 2**; server `persistGenerationDays` (Tier-1 durability/resume), Trip Pass pooling, and the AI role gate are all skipped on initial builds.
- Hidden because `handleRegenerate` DOES send `tripId` (line 888) and all current accounts are `travel_pro` (no 402; overcharge is silent).
- **Fix:** in `streamSegment`, set `body.tripId = tripPageId` (canonical URL id) when it's a valid UUID. Verify a free-tier 7-day build charges 25 total and persists server-side.

---

## 🟠 Group B — P1 (real user-facing bugs / launch-relevant)

### B1 — Day-Of guide white-screens on an activity missing `timeSlot`
`src/app/trip/[id]/dayof/Client.tsx:227,422,549-550` — `formatTimeRange(slot)`/`parseEndTime` do `slot.split('–')` with no guard, and Day-Of never runs `normalizeDay`. The itinerary page backfills `timeSlot ?? ''` (Client.tsx:2935) and print uses `?.split`, proving stored AI days can omit `timeSlot`. Day-Of is the one surface that crashes. **Fix:** null-safe the time helpers (`if (!slot) return ''`) and/or run loaded days through `normalizeDay`.

### B2 — Same-day trip (start === end) advances with stale `tripLength`
`src/app/trip/new/Client.tsx:1178,3501` — `tripLength` recomputes only when `start < end` (strict) and Next blocks only when `end < start` (strict). With start === end the user advances with `tripLength` stuck at the default (7), building a 7-day plan on a 1-day range. **Fix:** recompute `tripLength` for `start <= end` (inclusive), or treat equal dates as a 1-day trip.

### B3 — OG/Twitter image URLs resolve to `localhost` (broken link previews)
`src/app/layout.tsx:22-44` — no `metadataBase` set, so relative `openGraph`/`twitter` image paths resolve against `http://localhost:3000`. Shared links (Slack/iMessage/X/FB) get a broken/localhost card, plus a build warning. The asset `public/og-image.png` exists. **Fix:** `metadataBase: new URL('https://www.tripcoord.ai')` on the metadata export.

### B4 — PATCH clobbers `trips.trip_length` to the partial day count
`src/app/api/trips/[id]/route.ts:307-313` — every `days` PATCH sets `trip_length = days.length`, so a cut-off build leaves it at the partial count (the "Nd" card badge then shows e.g. 4d for a 7-day trip). Regenerate compensates via `Math.max(preferences.tripLength, …)` and a banner prompts the user, so it's P1 not P0, but any reader of `trip_length` inherits the wrong value. **Fix:** never shrink `trip_length` below `preferences.tripLength` on a `days` PATCH (sync upward only).

> Known/deferred P1s (already tracked — not new): middleware `?? 'tc2026'` preview fallback (SEC-3, GOLIVE); world share-card exposes any user's stats+photos with no opt-in (SHARE-5, deferred); multi-city step-2 back-nav "nights exceed length" stuck Next (known deferred).

---

## 🟡 Group C — P2 (collaboration / expenses)

- **C1** `src/app/api/trips/[id]/settlements/route.ts:98-120` — DELETE has no `canUseExpenses` gate (POST does) and no author/role scoping; any member can undo any settle-up. Fix: add the feature gate + scope to `created_by`/organizer.
- **C2** `src/app/trip/[id]/group/Client.tsx:2386-2387,1192` — custom-split inputs + balance buckets keyed by member **name**, so duplicate display names (allowed for guests) share one input and merge debts. Fix: key by member `id`.
- **C3** `src/app/trip/[id]/group/Client.tsx:1190-1220` — a removed member's custom-split share is dropped from settlements but still counts in "Total Spent" → ledger doesn't net to zero. Fix: seed balances from all names in expense data, not just live members.
- **C4** `src/app/api/invite/email/route.ts:77-90` — failed SendGrid send leaves an orphan `pending` invite row that counts against the traveler cap for 7 days. Fix: delete the row on send failure.

---

## 🟡 Group D — P2 (flexible-date / `"null"` string class — sibling surfaces the session fix missed)

- **D1** `src/app/trip/[id]/print/page.tsx:195,94,133-135` — renders the literal string `"null"` as a day-date and in the trip header for flexible-date trips. Fix: `day.date !== 'null'` guard (mirror the itinerary page).
- **D2** `src/app/trip/[id]/dayof/Client.tsx:409-411,525` — `"null"`/empty date → `NaN` dayDelta → "This trip has wrapped" shown for a future trip. Fix: treat `'null'`/empty as no-date; guard banner on finite delta.
- **D3** `src/app/api/trips/[id]/add-day/route.ts:106-112` — `"null"` date string would label the day "Invalid Date" (latent; current client passes `''`). Fix: `body.date !== 'null'` guard.
- **D4** `src/components/TripStoryModal.tsx:154-156` — `getDayCount` is the only date helper with no noon-pad / NaN guard → "NaN days" on a date-less trip + off-by-one in west-of-UTC. Fix: noon-pad + `Number.isNaN` fallback (match sibling `formatDateRange`).

---

## 🟡 Group E — P2 (forks / generation / discover / polish)

- **E1** `src/components/ForkTripModal.tsx:140-144` + both fork routes — no `end >= start` validation (client or server); a fork can persist `end_date < start_date`. Fix: disable submit + reject server-side when end < start.
- **E2** `src/app/api/featured-itineraries/[slug]/fork/route.ts:113-133` — per-day dates derived from `startDate` but `end_date` stored verbatim from the body (can disagree with `trip_length`). Fix: derive `end_date = startDate + (days.length-1)`.
- **E3** `src/app/layover/Client.tsx:318` — over-budget caution uses `text-amber-600`; brand ruling reserves amber for paid moments, cautions = rose. Fix: `text-rose-600`.
- **E4** `src/app/api/generate-itinerary/route.ts:2191-2194` — a day with a falsy `city` is emitted WITHOUT the verify-before-show gate (defensive escape hatch, but contradicts "verify before it becomes an itinerary"). Fix: treat missing `city` as a verify failure, or backfill from the segment city.
- **E5** `src/app/page.tsx:36,126-133` — lone hero `✦` glyph + emoji chips vs the Lucide-standardized marketing chrome (cosmetic consistency only).
- **E6** `src/app/trip/[id]/discover/` — referenced by CLAUDE.md's structure map but **no file exists** (Glob). Confirm nothing links to `/trip/[id]/discover` (would 404); update CLAUDE.md.

---

## 🟢 Group F — P2 (security hardening — optional, post-launch)

- **F1** `src/lib/supabase/aiCredits.ts:142-175` — bounded check-then-increment over-spend race on **non-build** AI actions (build chunks are protected by the atomic claim). Documented in-code. Fix: make affordability check + increment atomic in the RPC (refund on AI failure).
- **F2** AI generation endpoints rely on the credit gate + role gate as the only rate limiter (no `consumeRateLimit`) — defensible, but a per-user limiter in front of the Anthropic call would cap concurrent abuse. Matches the pattern in `fetch-reference`/`og-preview`.
- **F3** `src/app/api/fetch-reference/route.ts:80-109` — SSRF guard has a theoretical DNS-rebind TOCTOU (lookup then re-resolve at fetch). Low risk (6s timeout, 4KB cap, body not returned). Fix: pin fetch to the validated IP.

---

## ✅ Verified solid (audited, no action)
- 4→3 tier collapse: `normalizeTier` applied at every server + client read site; no raw `TIER_LIMITS[rawTier]` crash; settings guarded; legacy price IDs map to `travel_pro`.
- Region routing, transport/sports prompt edits, AI-import gating (client + server 403), mobile overflow menu (JSX-balanced, outside-click wired), Unsplash shared cache (cache-first, download-ping on hits, attribution across all surfaces), regenerate length fix.
- Security: internal-auth path (`timingSafeEqual`, dormant, unspoofable), Stripe checkout allow-list + clamps (SEC-2/COMP-1 closed), webhook signature + `stripe_events` idempotency (MONEY-3), no `NEXT_PUBLIC_` secret leak, admin client never client-side, all crons `verifyCronSecret`, no IDOR (every mutating trip route role/ownership-gated; `trips/[id]` PATCH column allow-list).
- Collaboration API layer (members/votes/expenses/messages/photos/prep): auth-gated, validated, atomic vote RPCs, settlement math, orphan cleanup, supabase singleton, realtime teardown.
- Forks: auth + `is_public_template` + preference allow-list + rollback. Auth pages: `?redirect=` preserved + open-redirect-validated; update-password trusts only `PASSWORD_RECOVERY`. Pricing/brand copy accurate (Free/$36/$14.99·$149, lowercase, palette). Date handling on the previously-fixed surfaces correct via `lib/tripDates.ts`. `unsplash_cache` type matches the table.

## Background-build foundation (dormant)
Internal-auth path, orchestration lib, and `itinerary-build` worker reviewed — no security hole, logic mirrors the browser loop, `freshRebuild` claim-reset idempotent. Dormant until `INTERNAL_BUILD_SECRET` is set + an event fires. (Minor: `buildItineraryFn` meta-persist lists `foodieTips`, which the route's `meta` event never sends — harmless dead key in dormant code.)
