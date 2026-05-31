# tripcoord — Full-Site QA Audit (2026-05-30)

**Method:** 8 parallel read-only audit agents across themed areas (tier gates, security, credits/billing, persistence, AI/data-model, operational, a11y/resilience, brand consistency) + direct source verification of the top findings. **Nothing was modified — this is a find-and-document pass.**

**Headline:** The codebase is in strong shape — no live data-loss bug, no unauthenticated AI-spend route, consistent auth/IDOR helpers, signature-verified Stripe webhook, atomic credit claims. The findings below are the real gaps. Two stand out and are **source-verified**:

- 🔴 **SEC-1 — `GET /api/trips/[id]/members` leaks any trip's member names + emails** to any logged-in user (IDOR/PII). ✓VERIFIED
- 🔴 **MONEY-1 — Regenerate charges 25 credits, not the advertised 10**, making the Trip Pass "build + regen + 5 tweaks" pool mathematically impossible. ✓VERIFIED

> Severity scale: **P0** broken/exploitable/data-loss now · **P1** fix before launch · **P2** edge/should-fix · **P3** minor/polish. "✓VERIFIED" = confirmed by direct source read beyond the agent.

---

## Summary counts (deduplicated)

| Area | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| Security & access control | 0 | 3 | 4 | 4 |
| Credits / billing / money | 1 | 2 | 3 | 3 |
| Tier gates & entitlements | 0 | 0 | 2 | 3 |
| Data persistence & state | 0 | 3 | 3 | 5 |
| AI routes & data model | 1 | 3 | 4 | 2 |
| Operational (crons/mw/contracts) | 0 | 1 | 5 | 5 |
| Accessibility & resilience | 0 | 1 | 2 | 7 |
| Brand & UI consistency | 0 | 0 | ~12 | ~80 |

---

## ✅ Fixes applied (2026-05-30)

Nearly everything actionable was shipped across a series of batches. Grouped by area; commit in parens. The full-detail findings remain in §§1-13 below for reference.

**Verified P0s + headline P1s (first pass)**
- **GROUP-1/2** (P0) — settlement ledger (`expense_settlements` + `/settlements` API); "Mark Paid" records one payment, net = owed − payments (`c1b01fe`).
- **SHARE-1** (P0/P1) — `/public` requires an invite token for private trips (`91ca4a0`). **SEC-1/SHARE-2** (P1) — members GET requires membership; emails organizer-only (`91ca4a0`).
- **MONEY-1** (P0/P1) — regenerate charges 10, not 25; Trip Pass pool whole again (`70b8c16`).
- **GROUP-3/4** (P0/P1) — server-side expense validation (`91ca4a0`).
- **DB-1** (P1) — dropped `trip-photos: read all` storage policy (no more bucket enumeration) (migration).
- **COMP-2** (P1) — invite email/SMS rate-limited (`31a0c7e`).
- **OPS-1** (P1) — `maxDuration` on 8 AI routes; **DATA-1** (P1) — silent-empty GETs → 500 (`db0bccf`); **AI-1/3** (P1) — parse-itinerary `day.city` + no fabrication (`d104b7a`); **DB-4** (P3) — destination_events rate-limit (`6aa98b9`).
- **DB-2/DB-3** (P2) — notifications INSERT policy + function `search_path` (migration).

**Tier / co-org**
- **TIER-1** — trip length + multi-city gate on the **organizer's** tier; AI features + credits on the **caller's** own tier (`fc93225`).

**Brand**
- **A/B/C** — Track A/B, button pills, indigo→sky (`155adea`); **F** — warning banners rose/zinc, Treatment B (`403bf4f`); **trip/new amber-accents** (`06d6ab8`); **E** — purple surfaces → sky/zinc; **D** — 4 empty states → `<EmptyState>` (`014e333`). **G** skipped per Brandon (category maps are deliberate differentiation).

**Batch B — security & privacy** (`0dc43f5`)
- **SEC-4** destinations/search auth + rate-limit · **SEC-5** og-preview SSRF (DNS-resolve + manual redirects) · **SEC-6** verify-venues role-gate + rate-limit · **SHARE-3** fork allow-lists preferences + `is_private:false` · **SHARE-4** accepted token not reusable by a stranger on a private trip · **COMP-4** invite-email HTML escaping · **GROUP-5** member-removal `DELETE`.

**Batch C — AI routes** (`37819d9`)
- **AI-2** enrich drops wrong-city restaurants (verify-before-show) · **AI-4** priorityHighlights reshaped to keyed record · **AI-5** hotels JSON guard.

**Batch C/D — data & group** (`6753e9e`)
- **DATA-3** chat send rollback + id reconcile · **DATA-4** prep toggles check `res.ok` · **DATA-5** `/api/trips` surfaces membership errors · **GROUP-7** exact-cent split + guest name-dedup · **GROUP-9** receipt-edit won't zero an expense.

**Batch E — ops & a11y** (`baf2fbb`, `4718b53`)
- **OPS-2/3/4/5** `/auth/*` preview-exempt, cron/webhook informative status · **A11Y-1** keyboard Discover card · **A11Y-2** 4 modals get dialog role + Escape + icon labels · **A11Y-3** date off-by-one anchors.

**Batch G — housekeeping** (`21c8f28`)
- **MONEY-2** RPC bodies snapshotted to `db/functions.sql` · **MONEY-6** dropped dead `profiles.ai_credits_total` (migration + types).

## ⚠️ Still open — deferred with reason (NOT quick fixes / need a decision)
- **DATA-2** (P1) — itinerary realtime concurrent-edit clobber. Risky change to the 4,000-line core file; today it self-corrects on reload (stale view, not data loss). Wants dedicated concurrency design + runtime testing.
- **GROUP-6** (P1) — settle by stable id. The data model stores split participants by **name**; guests have no `user_id`. Needs a schema change (participant ids on expenses) — feature work, not a patch.
- **GROUP-7 (participant-selection + cap TOCTOU)** (P1) — the participant picker is a UI feature; the cap race needs a DB constraint/trigger.
- **SHARE-5** (P2) — world opt-in. Default-`false` would silently turn off everyone's **live** world-share + there's no opt-in toggle UI yet. Product call + UI.
- **DB-7** (perf) — the "32 unused indexes" are unused only because there's **no pre-launch traffic** (dropping FK/lookup indexes would hurt production). The 59-policy RLS `auth.uid()`→`(select auth.uid())` wrap is the real win but risky to automate without RLS runtime testing. **Post-traffic, dedicated pass** — doing it now would likely do harm.
- **SEC-2 / COMP-1** (P1) — `stripe/checkout` doesn't allow-list `priceId` / clamp `extraPeople`. Worth doing; not yet shipped.
- **SEC-3** (P1, launch-blocker, Brandon-owned) — remove the `?? 'tc2026'` middleware fallback + set a strong `PREVIEW_SECRET`.
- **MONEY-3** (P1) — credit-reset cadence disagrees across 3 writers (pick one).
- **A11Y form-label association (155 inputs) + zinc-300/400 contrast** — large mechanical sweep, lower value.
- Remaining lower-priority §§1-13 items (SEC-7, MONEY-4/5, AI-6 type drift, COMP-5 input caps + JSONB RMW races, OPS-6 misc, group wishlist swatch).

**Config toggles (Brandon-owned, on the CLAUDE.md go-live list):** DB-5 leaked-password protection; Maps Static API (fixes the Trip Story map).

---

## 1. Security & Access Control

### 🔴 SEC-1 (P1) — Member roster PII / IDOR leak ✓VERIFIED
`src/app/api/trips/[id]/members/route.ts:12-113`. GET only checks `if (!userId)` (any logged-in user passes), then uses `createAdminClient()` (bypasses RLS) and returns every member's `name`, `email`, `role`, `preferencesSubmittedAt` for the trip ID in the URL. **No membership check** (the imported `getTripRole` is used only in PATCH). Any authenticated user can harvest the full member list — including **email addresses** — of any trip by supplying/guessing a trip UUID (UUIDs appear in share links, invites, `/join`, community/public endpoints). It's the one route in the trip-scoped family missed when membership-gating rolled out (expenses, messages, votes, photos, packing, prep all use `requireTripAccess`).
**Fix:** `const access = await requireTripAccess(params.id); if (!access.ok) return access.response;` and use `access.ctx.supabase`. The group page is already members-only, so legitimate callers are unaffected.

### SEC-2 (P1) — `POST /api/stripe/checkout` doesn't allowlist `priceId`
`src/app/api/stripe/checkout/route.ts:28-32,114-116`. `priceId` from the request body goes straight into `checkout.sessions.create`. The webhook maps price→tier so an unknown price won't grant entitlements, but a user could still check out at any price object in your Stripe account (extra-person price, test/internal/discounted price) decoupled from the tier they receive. Unnecessary trust of client input on a payment path.
**Fix:** Validate `priceId` against the set derived from `STRIPE_PRICES`; 400 on mismatch; enforce price↔mode.

### SEC-3 (P1) — Middleware preview gate hardcodes `'tc2026'`
`src/middleware.ts:15` `process.env.PREVIEW_SECRET ?? 'tc2026'`. Documented in CLAUDE.md as a known speedbump. Not a data boundary (API routes are exempt), but must be removed + a strong `PREVIEW_SECRET` set before public launch. Re-confirmed present.

### SEC-4 (P2) — `GET /api/destinations/search` unauthenticated, proxies billed Google Places
`src/app/api/destinations/search/route.ts:35-87`. No `requireAuth`, no rate limit; every `q`≥2 fires a billed Autocomplete call on `GOOGLE_MAPS_KEY`. Sibling routes `places/search`/`places/details` ARE auth-gated for exactly this reason. Quota/cost-drain from anonymous traffic. The route powers the post-login Trip Builder, so requiring auth won't hurt UX. **Fix:** add `requireAuth` + IP rate limit.

### SEC-5 (P2) — `og-preview` SSRF weaker than `fetch-reference`
`src/app/api/og-preview/route.ts:53-96`. `fetch-reference` does a proper `dns.lookup` + private-range check; `og-preview` only string-checks the hostname (no DNS resolution) and follows redirects (`redirect:'follow'`, final URL not re-validated). Authenticated SSRF to internal/metadata endpoints (mitigated by auth + Vercel's network isolation + size caps, so real-world risk is low). **Fix:** bring `og-preview` up to `fetch-reference`'s DNS-resolution standard; `redirect:'manual'` + per-hop revalidation; widen the ULA block to `fd[0-9a-f]{2}:`.

### SEC-6 (P2) — `verify-venues` member-triggerable Places spend
`src/app/api/trips/[id]/verify-venues/route.ts:42-79`. Gated to any member (`requireTripAccess`), each call does a Places lookup per venue (~$0.03). A plain member can repeatedly trigger full-itinerary re-verification → Google spend. Other Places/AI spend uses `requireTripAiRole` (organizer/co-org). **Fix:** `requireTripAiRole` + short per-trip rate limit.

### SEC-7 (P2) — `cronAuth` length-comparison timing channel
`src/lib/cronAuth.ts:38-40` — `a.length === b.length && timingSafeEqual(...)` leaks secret *length* via timing (bytes are safe). Crons are Vercel-internal so the surface is minimal; acknowledged in-code. **Fix (optional):** hash both sides to fixed length before compare.

### SEC-8 (P3) — `og-preview`/`fetch-reference` redirect re-validation; `.or()` interpolation in members PATCH (UUID-guarded, safe today); dashboard 401 dead code (see OPS-4). Admin gating (`profiles.is_admin` server-side) and service-role scoping **verified correct** elsewhere.

---

## 2. Credits / Billing / Money

### 🔴 MONEY-1 (P0/P1) — Regenerate charges 25, sold as 10; Trip Pass pool impossible ✓VERIFIED
`src/app/api/generate-itinerary/route.ts:1697` always charges `'itinerary_generate'` (25). The regenerate path (`freshRebuild`, `:1662-1671`) only **clears the build claim to force a re-charge** — it never switches to `AI_CREDIT_COSTS.itinerary_regenerate` (10), which is **dead code** (defined `types.ts:96`, referenced nowhere). CLAUDE.md, the `AI_CREDIT_COSTS` comments, and `useEntitlements.ts:30,75` ("50 AI credits (1 build + 1 regen + 5 tweaks)") all assume regen = 10.
**Impact:** Trip Pass (50) = build 25 + regen 25 = **50, zero left** for the promised ~5 tweaks; the first add-day/suggest after a regen 402s. Free tier (25) can't regen at all. Subscriptions burn 25/regen instead of 10. Code and marketing contradict each other.
**Fix:** Decide intended cost. If 10: pass an action discriminator (`freshRebuild ? 'itinerary_regenerate' : 'itinerary_generate'`) into `checkAiCredits`. If 25: delete the dead constant and fix the Trip Pass pool sizing + all "+1 regen (10)" copy.

### MONEY-2 (P3) — Atomic-increment RPC bodies verified correct, but not in source control ✓VERIFIED (RESOLVED concern)
`aiCredits.ts:202,213` call `increment_user_ai_credits`/`increment_trip_pass_credits`. **Live-DB check (2026-05-30) confirms both are genuinely atomic** — each is a single `UPDATE … SET ai_credits_used = ai_credits_used + p_amount … RETURNING`, and `cast_single_pick_vote` uses a `FOR UPDATE` row lock. The race-safety guarantee holds. Remaining (downgraded to P3 housekeeping): the function bodies aren't committed to the repo (no `supabase/migrations/`), so a future regression would be invisible to review. **Fix:** commit `pg_get_functiondef` output as a snapshot SQL file. (See also DB-3: these functions have a mutable `search_path`.)

### MONEY-3 (P1) — Credit-reset cadence disagrees across 3 writers
Webhook sets `ai_credits_reset_at = now()+30d` (`webhooks/stripe/route.ts:105,321`); cron + reset-on-read use `nextCreditResetAt()` = 1st-of-next-month (`reset-ai-credits/route.ts:33`, `aiCredits.ts:10-13`). Same column, two semantics. Near a renewal boundary the cron can zero `ai_credits_used` then the cycle webhook zeros it again. Both only *zero* (capped at pool), so it's at worst an early refresh — but the advertised "30-day window" isn't the one enforced and dashboard "resets on X" copy can be off by ~30 days. **Fix:** pick one cadence (simplest: webhook also uses `nextCreditResetAt()`).

### MONEY-4 (P2) — `parse-transport` charges before JSON parse
`parse-transport/route.ts:117` increments right after `messages.create` resolves, before `JSON.parse` (`:139`). Documented anti-farming choice, but a hard JSON-syntax failure (server's fault) charges the user for a 500. **Fix:** move the increment to after `JSON.parse` succeeds (so syntax failures are free, incomplete-but-valid still charges) — reconciles with the "failed AI calls don't burn credits" principle.

### MONEY-5 (P2) — `enrich-itinerary` hand-rolled batch affordability re-check
`enrich-itinerary/route.ts:252-266` re-checks `used+cost>limit` inline after overriding `ctx.cost` for the batch. Correct today, but a second code path that can drift from `checkAiCredits`. **Fix (optional):** add a `units`/`cost` param to `checkAiCredits`.

### MONEY-6 (P3) — `profiles.ai_credits_total` dead column; Stripe `apiVersion` unpinned; `invoice.payment_succeeded` tier-cast falls through to 0 on unexpected legacy tier (operator-action comment present). `trip_passes.ai_credits_total` IS live — only the `profiles` one is dead. Drop in a focused cleanup + types regen.

**Verified correct:** charge-after-success ordering on all 13 AI routes; build-claim atomicity + both revert paths; Trip Pass `tripId` routing; webhook signature + idempotency + `subscription_cancel_at` ordering + `current_period_end` off `items.data[0]`; mid-cycle downgrade credit preservation.

---

## 3. Tier Gates & Entitlements

### TIER-1 (P2) — ✅ RESOLVED + SHIPPED 2026-05-30 (`fc93225`)
**Ruling (Brandon):** trip **length + multi-city** = the **organizer's** tier (the trip was built under their plan; never cut a co-org's days — they can add up to the organizer's max). **AI features + credits** = the co-org's **own** tier (Trip Pass → shared pool) — that part was already correct. Fix: `getOrganizerTier` helper in `tripAccess.ts`, applied to the length/multi-city gates in `generate-itinerary` + `add-day`. _Original finding below._

`add-day/route.ts:58` and `generate-itinerary` (`:1528,1595`) check `maxTripDays`/`MULTI_CITY_LOCKED` against the **caller's** tier; `parse-transport:54` and receipt/packing/phrases gate features on `auth.ctx.tier`. But traveler caps + co-org promotion correctly use the **organizer's** tier, and credits pool to the trip pass. So a free co-organizer on a paid trip is blocked from transport-parser/multi-city/higher day caps even though the trip qualifies — and a paid co-org on a free trip gets the higher cap. Contradicts the documented co-organizer-parity rule. **Note:** the `TIER_LIMITS` comment "co-organizer uses their own pool" partly contradicts the memory — needs a product decision. **Fix:** resolve `tierLimits` from the organizer when `tripId` is present, OR update the rule/docs to "own tier."

### TIER-2 (P3) — `maxBookedHotels` not enforced on the build prompt
`generate-itinerary/route.ts:1926` reads `body.bookedHotels` raw (no cap), while `trips/save` trims to the tier cap. Over-cap hotels enrich the prompt but won't persist. One-line `.slice(0, hotelCap)` for consistency.

### TIER-3 (P3) — Manual split-track PATCH not tier-checked
`trips/[id]/route.ts:201-207` saves `days` with only a role check; a free organizer could craft a payload populating `track_a/track_b`. No AI cost, no revenue leak — completeness only.

### TIER-4 (P3) — Fork can exceed free `maxTripDays` (no-AI edge, intentional); layover is credits-only on all tiers (reconcile the CLAUDE.md "Nomad-feature" wording). AI-credit coverage, multi-city server gate, Nomad feature gates, traveler caps all **verified enforced server-side**.

---

## 4. Data Persistence & State Consistency

### DATA-1 (P1) — Silent-empty-on-error in ~11 GET handlers
Routes return `{items|trips|votes|members|...: []}` with **HTTP 200** on DB error / auth-miss, indistinguishable from "no data": `wishlist:47,56,73`, `souvenirs:33,45,51`, `flights:50,63,68`, `members:21,111`, `discover-wishlist:24`, `group-votes:29,89`, `photos:27,71`, `photos/[photoId]/comments:29,61`, `layovers:59`, `messages:52` (outer catch), `prep:112,120`. The pattern was fixed for `expenses` + the inner `messages` case — this is an **incomplete migration**. `members` is worst (a DB blip empties the whole crew). **Fix:** distinguish `error`→500+log from 0-rows→`[]`, and `!userId`→401; clients surface retry on 500.

### DATA-2 (P1) — Itinerary realtime syncs votes only → concurrent edits clobber
`itinerary/Client.tsx:1691-1718` merges incoming vote counts into `votes` state but never updates `aiDays`/`aiDaysRef`. Every local mutation rebuilds the whole `days` array from the stale ref and PATCHes it (last-write-wins). Result: (a) concurrent votes regress embedded `days[].upVotes` (root of the "Activity Pulse lag" — but it's a persistence regression, not just UI); (b) a co-organizer's add/replace/reorder is invisible to another open client and gets clobbered by its next `persistDays`. **Fix:** reconcile `aiDays`/`aiDaysRef` from `payload.new.days` in the realtime handler, or stop persisting vote counts inside `days` and treat `activity_votes` as sole source; move to day-scoped patches.

### DATA-3 (P1) — Chat message send: no `res.ok` check, no rollback
`group/Client.tsx:1046-1071` appends optimistically then POSTs; the catch does nothing and `res.ok` is never checked. A 500/403/401 leaves the message on screen — the user thinks it sent; it vanishes on reload and never reached others. **Fix:** check `res.ok`, remove the optimistic row on failure with a retry affordance, and reconcile the optimistic id to the real `message.id`.

### DATA-4 (P2) — Prep/packing toggles roll back only on network reject + use stale snapshot
`prep/Client.tsx:363-389,549-554,618-623` use `fetch(...).catch(restore)` — a server 500 resolves (no `r.ok` check) so a failed toggle looks saved; rollback closes over a stale set. The add-item handlers already do it right. **Fix:** `.then(r=>{if(!r.ok)restore()})` + rebuild rollback from current state.

### DATA-5 (P2) — `/api/trips` swallows `memberRows` error
`trips/route.ts:44-52` checks `ownedRes.error` (500) but not `memberRowsRes.error` → a membership-query failure silently drops all "shared with me" trips. **Fix:** check + 500.

### DATA-6 (P3) — `vote_responses` realtime has no trip filter (cross-trip refetch fan-out); `layovers/[id]` PATCH/DELETE return success on 0 rows; wishlist delete fire-and-forget; chat optimistic id never reconciled (reactions on your just-sent message don't render live); two separate flight stores (`trips.booked_flight` vs `flight_bookings` — likely intentional, watch item). Dashboard 401 dead code (see OPS-4).

**Verified correct:** hotel dual-write + rollback; booked-flight single-source; multi-city destinations survive regenerate; `metaPatch` key-preserving merge; expense/vote/reaction/member/avatar optimistic rollbacks; all realtime channels unsubscribe; localStorage never treated as truth for authed users.

---

## 5. AI Routes & Data Model

### 🔴 AI-1 (P0/P1) — `parse-itinerary` emits a savable itinerary with NO verify gate
`parse-itinerary/route.ts:157-169`. Parses uploaded PDF/text into `ItineraryDay[]` with addresses and returns it; `UploadItineraryModal` saves it as the user's live itinerary. Nothing runs `validateAndCorrectDay`, and the prompt is told to "make reasonable inferences" (`:11`) — so it can fabricate addresses never in the source. Directly the "becomes an itinerary" surface Brandon's verify-before-show directive targets. **Fix:** wire each parsed day through the gate (needs `day.city` first — see AI-3), OR consciously exempt it with a comment + CLAUDE.md note ("user-asserted, not AI-asserted").

### AI-2 (P1) — `enrich-itinerary` injects unverified restaurant venues into tracks
`enrich-itinerary/route.ts:351-416`. `buildRestaurantActivity` pushes AI-emitted restaurant `name`/`address` into `tracks.shared`, persisted to `itineraries.days`, with no `addressContainsCity`/Places check (prompt says address is "best-effort"). Additive (existing days already passed the gate) but still an AI-emit-to-itinerary path bypassing the gate; `day.city` is available here. **Fix:** run non-null-address backfills through `addressContainsCity` + optional `lookupPlacesAddress`, drop/re-prompt failures.

### AI-3 (P1) — `parse-itinerary` never produces `day.city`; downstream features silently no-op
`parse-itinerary/route.ts:19-47` day schema omits `city`. Consequences: (a) no per-day weather/Maps localization on uploaded trips; (b) if wired through the verify gate, it no-ops (the gate returns ok immediately when `day.city` is absent); (c) **multi-city regenerate of an uploaded trip collapses to single-city** — the regen path counts `day.city` values, all empty → never >1. **Fix:** add `"city"` to the parse day schema; extract from source or default to the trip destination.

### AI-4 (P2) — `enrich-itinerary` `priorityHighlights` shape mismatch
Prompt emits a flat array with per-item `"priority"` (`:172-173`); `types.ts:431` defines `priorityHighlights?: Record<string, Array<…>>` (keyed). The merge writes the array straight onto the day; the sidebar reads `priorityHighlights[priorityId]` → an array won't index → enriched highlights likely don't render. Hidden because `days` is `Json`. **Fix:** reshape in the merge or change the prompt to the keyed-record shape `generate-itinerary` produces.

### AI-5 (P2) — `generate-hotels` unverified addresses + unchecked JSON slice; `parse-receipt` blind `'{'` prepend
`generate-hotels` returns hotels with addresses + Booking deep-links, no Places verification (hallucinated hotel → dead link/wrong-city card); `:66-68` slices without an `objStart===-1` guard → raw `SyntaxError` string leaked to client on bad output. `parse-receipt:95` prepends `'{'` assuming the model omits it — fragile. **Fix:** add the `lookupPlacesAddress` pass (cache infra exists now); add the index guard the sibling routes use.

### AI-6 (P2/P3) — Type drift: `aiMeta.preferences` is effectively `any` beyond `priorities` (multi-city/modality/bookedCar read via casts) — introduce a shared `TripPreferences` interface; `trips.destination` is singular in DB while CLAUDE.md's "use `tripRow?.destinations?.[0]`" points at a field that only exists inside `preferences` (correct the gotcha note); `itineraries.days/meta/original_days` are opaque `Json` with no runtime validation (reinforces why AI-1/AI-2 matter — no DB backstop).

**Verified:** `generate-itinerary` (3 sites), `add-day`, `suggest-activity` all go through the verify gate; AI JSON parsing is defensively written (fence-strip + normalize + slice + try/catch); declaration-order discipline holds (tsc clean).

---

## 6. Operational (crons, middleware, contracts)

### OPS-1 (P1) — 8 non-streaming AI routes lack `maxDuration` → 504 risk
Only `generate-itinerary` (300), `add-day` (60), `verify-venues` set it. These do a blocking `messages.create` with no `maxDuration`, inheriting Vercel's ~10-15s default: `generate-layover` (Sonnet/6000 — the route's own VIE-layover comment implies long output), `parse-itinerary` (Sonnet, full itinerary), `suggest-activity` (Sonnet + synchronous Places + up to 2 verify retries — the longest non-streaming path), `enrich-itinerary`, `generate-phrases`, `generate-discover`, `generate-packing`, `generate-hotels`. Large-token calls 504 mid-feature. **Fix:** `export const maxDuration = 60` (300 for parse-itinerary/suggest-activity).

### OPS-2 (P2) — `lifecycle-emails` hard-500s if `SENDGRID_API_KEY` unset
`cron/lifecycle-emails/route.ts:359-363`. Every daily run 500s in cron logs until set (noise + false alarms). **Fix:** log + return 200 `{skipped:'no SENDGRID_API_KEY'}`.

### OPS-3 (P2) — Middleware doesn't exempt `/auth/*` from the preview gate
`middleware.ts:65-68`. Exempts `/api/`,`/_next/`,assets,`/coming-soon`,`/join/`,`/auth/callback` — but NOT `/auth/login|signup|reset-password|update-password`. A tester following a password-reset email link without the preview cookie bounces to `/coming-soon`; the reset/confirm flows are on the go-live checklist. **Fix:** exempt `/auth/*`.

### OPS-4 (P2) — Stripe webhook returns misleading 400 if `STRIPE_WEBHOOK_SECRET` unset
`webhooks/stripe/route.ts:144` non-null-asserts the secret; if unset, `constructEvent` throws → 400 "Invalid signature." A misconfigured deploy silently drops every webhook (subs never activate) and looks like a Stripe problem. **Fix:** explicit `if(!secret) return 500 'not configured'` before `constructEvent`.

### OPS-5 (P2) — Hard-coded unverified SendGrid sender fallback
`cron/lifecycle-emails/route.ts:44` falls back to `hello@tripcoord.ai` (intended sender is `noreply@…`; env currently a Gmail). If unset, SendGrid rejects/spam-files. Share one source of truth with the invite routes.

### OPS-6 (P3) — `CRON_SECRET` unset → all 5 crons 500 daily (config, not code — known); `reset-ai-credits` skips zero-use rows so `ai_credits_reset_at` drifts stale for idle users; `expire-venue-cache` two-table delete non-atomic (idempotent, harmless); 200-on-failure across 6 list routes (status semantics); AI routes lack explicit `force-dynamic` (mitigated by cookie reads); dashboard 401 redirect dead code (`/api/trips` returns 200 `{trips:[]}` unauth — caller's 401 branch unreachable; contract change needed).

**Verified:** all crons timing-safe + idempotent + schedules match `vercel.json`; middleware matcher correctly exempts API/static, no redirect loop, Supabase refresh try/caught; error envelopes uniform `{error}`; admin/Stripe lazy-throw on missing config at call time.

---

## 7. Accessibility & Resilience

### A11Y-1 (P1) — Discover destination card keyboard-inaccessible
`discover/Client.tsx:596` — `<div onClick=…>` with no `role`/`tabIndex`/`onKeyDown`; the sibling `featuredSlug` branch uses `<Link>`, proving it's an oversight. A primary Discover interaction is mouse-only. **Fix:** render as `<button>` or add `role="button" tabIndex={0}` + Enter/Space handler.

### A11Y-2 (P2) — Modal a11y gaps + icon buttons missing `aria-label`
Two tiers: the good tier (`TagCitiesModal`, `TripStoryModal`, `ShareTripModal`, `ForkTripModal`, group modals) has `role="dialog"`/`aria-modal`/Escape; the deficient tier lacks them: `UpgradeModal` (revenue-critical), `ParseTransportModal`, `NotificationPanel` dropdown, trip-layout invite modal, itinerary confirm/date modals. **No modal implements a focus trap** (app-wide P3). Icon-only buttons missing `aria-label`: NotificationPanel bell + close, ParseTransport chevron. **Fix:** standardize on the existing `useEscapeKey` hook + `role="dialog" aria-modal` + `aria-label`s.

### A11Y-3 (P3) — Form labels unassociated (155 inputs, 9 `htmlFor`, 0 `aria-label` — auth forms are the exemplar to copy); low-contrast `zinc-300/400` body text on parchment fails WCAG AA (zinc-400 ~3.6:1); color-identical Trip Pass vs Explorer tier pills; fixed multi-col grids without mobile base (`dayof:457` grid-cols-5, `settings:1029` grid-cols-5, onboarding); sub-44px touch targets (NotificationPanel bell 36px/close 28px); raw `new Date()` off-by-one on `join/[id]:439` + `dashboard:439` (missing the `+ 'T12:00:00'` anchor used everywhere else); latent 0-day `currentDay` indexing on dayof; no per-segment `error.tsx`/`loading.tsx`.

**Verified strong:** root `error.tsx`/`global-error.tsx`/`not-found.tsx` present + branded; `ErrorBoundary` wraps root + the 4000-line itinerary; dashboard/trips/world have skeleton+error+empty; date noon-anchor consistent; `<EmptyState>` used for the zero-trip cases; `Math.max(1, …)` guards on member counts.

---

## 8. Brand & UI Consistency

Palette rules (CLAUDE.md): sky-800/900 primary; amber = Trip Pass + hero only; emerald = "Best value" only; Track A=sky-500/B=amber-500; violet = AI-Pick only; rose = errors only; no indigo/purple/teal/pink/fuchsia accents; buttons `rounded-full`, cards `rounded-2xl`; use `<EmptyState>`. Recommended fix groups (per the A/B/C grouping convention):

- **Group A (P2, 2 lines) — Track A/B color regression.** `itinerary/Client.tsx:5355-5356`: Add-Activity modal selectors use `violet-500`/`rose-500` (retired pre-2026-05-29 pair); should be `sky-500`/`amber-500` to match `trackConfig` (2944-2948) + legend (3831). Also flip the selector `rounded-xl`→`rounded-full` (5361). **Internal contradiction in one file.**
- **Group B (P2, biggest surface) — Sky primary-button shape sweep.** ~35 sky-800/900 CTAs use `rounded-lg`/`rounded-xl` instead of `rounded-full` across group (2107,2176,2420,2995,3046,3252,3369), itinerary (3028,4783,5069,5500,5619,5742,6091), prep (1058,1078,1929,1958), **settings save buttons (920,1289,1354 — explicitly spec'd)**, join (382,486,588), trip-builder (1704,2792), discover (686,1369), memories (1335,1392), wishlist (356 + WishlistLinksSection:176), layover (416,610), ForkTripModal:146, ErrorBoundary:67, TagCitiesModal:213, coming-soon:91. **Exclude** square `bg-sky-800 rounded-xl` icon *tiles* (logos) — those are correct.
- **Group C (P2, brand-facing) — Banned indigo on Discover.** `discover/Client.tsx:157,498,1359`, `discover/[slug]/Client.tsx:149,313`, `share/world/[userId]/Client.tsx:76` use `from-sky-600 to-indigo-700` / `sky-50 to-indigo-50`. Most visible banned-family use. → all-sky gradient.
- **Group D (P2, two-in-one) — NotificationPanel.** Uses slate neutrals (should be zinc) AND a hand-rolled empty state (`:393`); reconcile with `notifications/page.tsx` (which uses zinc) and migrate to `<EmptyState icon={Bell}>`. Then migrate the other hand-rolled empties (notifications page, trips:433, memories:1105, prep flights:1097, itinerary inline:3809).
- **Group E (P2) — Purple/teal/pink de-theming.** Fully-purple surfaces: layover lounge/day-pass + hotel cards (`:210-267,772,1152`), memories "Contributors" stat (`:616`); teal/pink in wishlist/layover/discover category maps. Re-theme the chrome surfaces; category maps are judgment calls (defer).
- **Group F (P2, needs a decision) — Amber "warning" ruling.** ~15 amber notice/warning banners have no sanctioned hue (UploadItineraryModal, trips:421, prep:2110/1243, trip-new:3365, generating:510). Same "couldn't load trips" banner is **rose on dashboard:545 but amber on trips:421/prep:2110** — inconsistent. Either bless amber-as-warning in CLAUDE.md or standardize on rose/zinc.
- **Group G (P3) — Violet sprawl beyond AI-Pick + zinc/slate neutral mixing.** ~25 off-role violet (layover hotel cards, prep "Custom"/"My Pack", print Photo Spots are the re-themeable ones; category maps deferred); NotificationPanel is the worst zinc/slate mixer.

---

## 9. Cross-cutting themes (what keeps recurring)

1. **"200 + empty on error"** is the single most repeated anti-pattern — security (info-hiding is fine, but), persistence (DATA-1, 11 routes), and operational (OPS-6) all hit it. Fixing the GET error contract once, with a shared helper, closes a whole class.
2. **Caller-tier vs organizer-tier** ambiguity (TIER-1, MONEY co-org) needs ONE product ruling, then apply everywhere.
3. **Verify-before-show has two uncovered AI-emit paths** (AI-1 parse-itinerary, AI-2 enrich) — the directive isn't fully enforced despite the helper existing.
4. **`day.city` absence** (AI-3) is a root cause that silently disables multiple features on uploaded trips.
5. **Brand drift** is broad but low-severity and mechanical — the `rounded-full` sweep (Group B) and the Track A/B regression (Group A) are the highest-value.

---

*Sections 1-9 generated by an 8-agent read-only audit + direct verification of SEC-1 and MONEY-1. Sections 10-13 below add Wave 3 (group/expenses, invites/sharing, completeness critic) + a live-database audit (Supabase advisors, RLS policies, RPC bodies). No source files were modified.*

---

# Wave 3 + Live-Database Addendum

## 10. Live Database Audit (Supabase advisors · RLS · RPC bodies)

Authoritative findings from querying the live DB — things code review alone can't see.

### 🔴 DB-1 (P1) — `trip-photos` storage bucket allows **listing all files across all trips/users**
Security advisor `public_bucket_allows_listing`: the public `trip-photos` bucket has a broad `SELECT` policy (`trip-photos: read all`) on `storage.objects`, so any client with the anon key can **enumerate every object** in the bucket. Photo paths are `${tripId}/${ts}-${filename}`, so an attacker can list all trips' photos and fetch them directly — **bypassing the app's `requireTripAccess` gate entirely** (the route-level check is moot when Storage is directly listable). Combined with the world-share-card pulling real trip photos (SHARE-5), private trip photos are broadly exposed. **Fix:** drop the broad listing SELECT policy — public buckets serve object URLs without needing list permission; scope reads to trip members or make the bucket non-public + signed URLs. [docs lint 0025]

### DB-2 (P2) — `notifications` INSERT policy is `WITH CHECK (true)` for all roles
Advisor `rls_policy_always_true`: `notifications: service insert` allows any role to insert. The app writes notifications via the admin client (service role), so the permissive policy is unnecessary — and it means an authenticated user hitting PostgREST directly could **forge a notification to any `user_id`** (spam/phishing "your trip is ready" links). **Fix:** restrict the INSERT policy to the service role, or `WITH CHECK (auth.uid() = actor)`.

### DB-3 (P2) — 5 `SECURITY DEFINER` / trigger functions have a mutable `search_path`
Advisor `function_search_path_mutable`: `increment_user_ai_credits`, `increment_trip_pass_credits`, `cast_single_pick_vote`, `consume_rate_limit`, `set_flight_bookings_updated_at`. A `SECURITY DEFINER` function without a pinned `search_path` is a privilege-escalation surface (a caller-controlled `search_path` can shadow `public`). **Fix:** `ALTER FUNCTION … SET search_path = public, pg_temp` (or `pg_catalog, public`) on each. [docs lint 0011]

### DB-4 (P3) — Public `WITH CHECK (true)` INSERT on `destination_events` + `waitlist`
Intentional (anonymous event logging + public waitlist signup) but both are unauthenticated unbounded-insert spam vectors with no rate limit (ties to COMP-2). Consider a rate limit or a minimal CHECK.

### DB-5 (P3) — Auth: leaked-password protection disabled
Advisor `auth_leaked_password_protection`: HaveIBeenPwned check is off. One toggle in Auth settings. [docs]

### DB-6 (INFO) — RLS-enabled-no-policy on `lifecycle_emails_sent`, `rate_limits`, `venue_location_cache`, `wishlist_items`
First three are server-only (admin client) — **correct and intentional** (incl. the `venue_location_cache` I shipped today). `wishlist_items` is also admin-client-scoped, so it's consistent — but, like the public/community routes, RLS provides **no defense-in-depth** there; correctness rests entirely on the route's own `user_id` scoping. Noted, not a bug.

### DB-7 (P3, performance) — RLS `auth.<fn>()` re-evaluated per row (58 policies)
Advisor `auth_rls_initplan` across ~30 tables: policies call `auth.uid()`/`current_setting()` per-row instead of `(select auth.uid())`, which scales poorly. Low urgency at launch traffic; a mechanical batch fix (wrap each in a scalar subquery) is worthwhile before scale. Also: **32 unused indexes** (cleanup), **2 unindexed FKs** on `support_tickets`, and **16 multiple-permissive-policy** overlaps (trips/itineraries/discover_wishlist/support_tickets) — all low-priority perf hygiene.

---

## 11. Group Collaboration — Expenses, Settlement, Voting

### 🔴 GROUP-1 (P0) — "Mark Paid" on one suggested payment settles the ENTIRE trip ledger ✓VERIFIED
`group/Client.tsx:1852-1884`. Each Suggested-Payment row (e.g. "Mallory → Luke $100") has a Mark Paid button, but the handler (`:1869`) does `localExpenses.filter(e => !e.settled)` and PATCHes `settled:true` on **all** of them — it never references the clicked `txn`. Clicking Mark Paid on one payment **zeroes every outstanding balance on the trip**. Repro: A→C $50 and B→C $30 outstanding; click Mark Paid on A→C → B's $30 debt is silently wiped though B never paid. Real money owed disappears. **Fix:** scope settlement to the expenses contributing to that `txn.from`/`txn.to`, or (better) move to a per-pair payment ledger (see GROUP-2).

### GROUP-2 (P0) — Expense-level `settled` boolean can't represent partial settlement
`group/Client.tsx:1138,1869`. Netting is computed across all unsettled expenses, but "settled" is stored per **expense row**, not per debtor→creditor pair. Settling an expense to clear B↔A also erases C's debt on that same expense. Any trip where debts settle at different times produces wrong balances. **Fix:** a settlement ledger (debtor, creditor, amount, ts); net = `Σ shares − Σ payments`. Fixes GROUP-1, GROUP-2, GROUP-6 together.

### GROUP-3 (P0) — Custom-split shares not validated server-side
`expenses/route.ts:88-110` stores `customAmounts` verbatim; the "shares must sum to total" check is client-only (`Client.tsx:2340`). A direct API call can persist shares that don't sum to `amount` → balances never net to zero. **Fix:** server-side `abs(Σ customAmounts − amount) < 0.01`, else 400.

### GROUP-4 (P1) — Negative / NaN expense amounts accepted server-side
`expenses/route.ts:91,100`. `if (!amount)` lets `-50` (truthy) and `"abc"`→`NaN` through `parseFloat`. Negative inverts who-owes-whom; NaN poisons every downstream `reduce`. **Fix:** `const n = parseFloat(amount); if (!Number.isFinite(n) || n <= 0) return 400;`

### GROUP-5 (P1) — No member-removal endpoint exists
`members/route.ts` has GET/POST/PATCH only — no DELETE. Organizers can't remove a no-show, a mistaken add, or a duplicate guest (GROUP-7). Combined with the cap, an accidentally-full trip can't be trimmed without DB access. **Fix:** organizer-gated `DELETE`, refusing to remove the organizer, with expense/vote cleanup.

### GROUP-6 (P1) — Settlement keys on display name, not user/member id
`group/Client.tsx:1104-1119,1142`. `canonicaliseName` merges name variants; two members named "Chris" collapse into one balance bucket → wrong individual settlements. The vote layer was hardened against same-name collisions (uses `user_id`) but the **expense layer still keys on name** (`paid_by_user_id` is stored but unused in the math). **Fix:** settle on stable IDs.

### GROUP-7 (P1) — Equal split ignores participant selection + rounding remainders lost; guest dup-joins; cap TOCTOU
- `splitAmong` is always set to the whole group (`Client.tsx:2373`) — no UI to exclude a non-participant; a member who skipped dinner still gets billed.
- `perPerson = amount/N` accumulated as float, never cent-rounded; $100/3 shows three $33.33 = $99.99, the penny is unassigned (no designated remainder-payer).
- Guest joins dedupe on **exact email only** (`members/route.ts:224`); same guest re-joining with no/different email creates duplicate traveler rows that burn the cap, unrecoverable (GROUP-5).
- Traveler-cap check is read-then-write (`:272-286`) — concurrent joins overshoot the cap.

### GROUP-8 (P1) — Line-item edit leaves stale parent `amount` in the client
`group/Client.tsx:2085-2096`. Server recomputes `amount = Σ lineItems` (correct), but the optimistic update patches only `lineItems`, not `amount`, and there's no refetch (PATCH returns just `{ok:true}`). All settlement math reads the **stale** total until reload. **Fix:** update `amount` optimistically and/or return the new amount from PATCH.

### GROUP-9 (P2) — Accepted invite tokens reusable by a different guest; receipt-edit can zero an expense; vote close is one-way; option deletion unhandled. (Details in agent output; GROUP-9a token reuse overlaps SHARE-4.)

**Verified correct:** multi-pick vote `UNIQUE` dedup + the `cast_single_pick_vote` RPC row-lock (confirmed in DB); cross-trip token IDOR blocked; expense add optimistic rollback.

---

## 12. Invites, Sharing & Privacy Boundaries

> Structural note: **every public/community route runs on the admin client (RLS bypassed)** — so correctness rests entirely on each route's explicit `is_private`/`is_public_template`/token checks. RLS is not a backstop here.

### 🔴 SHARE-1 (P0/P1) — `/api/trips/[id]/public` leaks private-trip metadata by UUID ✓VERIFIED
`trips/[id]/public/route.ts:23-41`. Returns `title, destination, start_date, end_date, group_size, cover_image` for **any** trip — including fully private ones — with **no auth, no token, no `is_private` check**, despite the docstring claiming "no personal data." Anyone who learns a trip UUID (they appear in `/join` links, referrers, logs) can read "X is in Cancún Mar 3-10 with 6 people." **Fix:** gate on `is_private === false` OR a valid invite token; 404 otherwise.

### SHARE-2 (P1) — Member-list exposes everyone's email to any member
`members/route.ts:35-108` (also SEC-1). Even for *legitimate* members, it returns the organizer's + every member's **email**. On an open-share-link trip, a stranger who joins (just needs the UUID + a name) harvests the whole roster's emails. **Fix:** return emails only to `organizer` role, or drop emails from the projection.

### SHARE-3 (P1) — Fork copies the raw `preferences` JSON blob
`fork/route.ts:80`. Forking a public template copies `preferences` verbatim (no allow-list). Low-sensitivity today (vibes/budget tier), but it's an open blob — any future sensitive pref (dietary, accessibility) would bleed into strangers' forks. Good news: member rows, emails, expenses, messages are NOT copied. **Fix:** allow-list copied pref keys; set `is_private:false` on forks.

### SHARE-4 (P1) — Private-trip invite tokens are effectively reusable
`members/route.ts:187-197,377-383`. Token consumption (`status='accepted'`) is best-effort, and an already-accepted token still passes the private-trip gate as an "idempotent re-join" — so a *different* guest (new name/email) can reuse one leaked link to enter a "private" trip, up to the cap. Only the 7-day expiry bounds it. **Fix:** bind tokens to the invited email/identity; reject accepted tokens for a new joiner.

### SHARE-5 (P2) — `/share/world/[userId]` enumerable; share-card PNG embeds real trip photos with no opt-in
`share/world/[userId]/page.tsx` + `world/share-card/[userId]/route.tsx:116-142`. Any user's first name, travel stats, and **up to 6 real uploaded trip photos** are public by `userId`, with no per-user opt-in flag. UUIDs aren't trivially enumerable, but there's zero opt-in and it surfaces private-trip photos (compounds DB-1). **Fix:** add `profiles.world_public` (default off); exclude private-trip photos from the card.

**Verified safe:** cross-trip token IDOR blocked; token expiry enforced; anonymous member-list read blocked; votes/likes/messages/notifications membership-scoped; featured-itinerary fork = published editorial only; no member-removal-leak vector (because removal isn't implemented — see GROUP-5).

---

## 13. Completeness — Validation, Rate-Limiting, Upload, Injection

### COMP-1 (P1) — `stripe/checkout`: `priceId` not allow-listed; `extraPeople` unbounded
`stripe/checkout/route.ts:28,114-124` (also SEC-2). `priceId` passed straight to Stripe; `extraPeople` has no integer/upper-bound (`999999` → a 999,999-qty line item). **Fix:** allow-list `priceId` against `STRIPE_PRICES`; clamp `extraPeople` to an int ≤ traveler cap.

### COMP-2 (P1) — Invite email/SMS routes have NO rate limit (real $ per call)
`invite/email`, `invite/sms`. An atomic rate-limit helper exists (`lib/supabase/rateLimit.ts` → `consume_rate_limit` RPC, confirmed in DB) but is applied in **exactly one route** (`auth/send-reset-email`). An organizer can loop `invite/sms` to burn Twilio balance / `invite/email` to torch SendGrid reputation. **Fix:** wrap both with `consumeRateLimit` (per-user + per-recipient), as send-reset-email already does. Also: the helper **fails open** on RPC error (`rateLimit.ts:30-34`) — a Supabase blip silently disables all throttling.

### COMP-3 (P1) — Trip-photo upload has no server-side size/type validation
`memories/Client.tsx:714-817`. Photos upload **browser→Storage directly**; only `accept="image/*"` (client hint). No size cap, no content-type check in code (contrast the avatar route which enforces 5MB + an allow-list server-side). Relies entirely on the bucket's `file_size_limit` config (not in repo — verify it's set). Path uses raw `file.name` → fragile. The singleton-client rule IS honored and orphan-cleanup IS present. **Fix:** route through a server endpoint mirroring the avatar checks, or confirm bucket limits + sanitize filename.

### COMP-4 (P2) — Invite-email injects unescaped `tripName`/`inviterName` into HTML
`invite/email/route.ts:122-125`. The `message` field is escaped, but `tripName` and `inviterName` are interpolated raw into the subject + `<strong>${tripName}</strong>` body. A trip named `<img src=x onerror=…>` injects HTML into the email. **Fix:** escape all interpolated user fields.

### COMP-5 (P2) — Input-validation gaps + non-atomic JSONB read-modify-write
- `group-votes` POST: no cap on `options.length` (10k-element bulk insert) or `title` length.
- `expenses`/`wishlist`/`trips/save`/`parse-receipt`: missing length/size caps (mirror `support/tickets` + `messages`, which are the good models).
- Reaction toggle (`messages/[msgId]/route.ts:34-70`) and wishlist `links` (`wishlist/route.ts:150-176`) are read-modify-write on JSONB → concurrent updates clobber (last-write-wins). **Fix:** atomic JSONB update / RPC.

### COMP-6 (P3) — PII in logs (phone in `invite/sms:94`, email in lifecycle/reset); no canonical URLs (SEO dup-content risk with `www`/apex + query params); avatar orphan accrual; 2 tracked launch TODOs (trip_pass user-scoped exemption; Stripe receipt email). **`og-image.png`, robots.txt, sitemap.ts all present** — confirm the og asset 200s live.

**Modalities still NOT covered (for a future pass):** storage-bucket `file_size_limit`/`allowed_mime_types` config (partly answered: bucket is public + listable — see DB-1); dependency/CVE scan (`npm audit`); client-bundle secret-leak grep; runtime load/concurrency test of the SSE build; i18n/RTL/multibyte rendering.

---

## 14. Dependencies & Client Bundle

### DEP-1 (P2) — 9 production-dependency CVEs (6 high, 3 moderate)
`npm audit --omit=dev`: **high** — `next` (Next.js 14 advisory; the `audit fix` wants a breaking bump to 16, so needs a careful manual upgrade), and the `d3-color`/`d3-interpolate`/`d3-transition`/`d3-zoom` chain (ReDoS) pulled transitively via **`react-simple-maps`** (the world map). **moderate** — `@anthropic-ai/sdk`, `postcss` (XSS in CSS stringify), `ws` (uninitialized memory disclosure). **Fix:** `npm audit fix` clears `ws` non-breaking; the d3 chain needs a `react-simple-maps` bump or replacement; Next.js needs a deliberate version plan (don't `--force` to 16 blindly on App Router 14). None are runtime-exploitable in an obvious way here, but they're real and worth a scheduled dependency pass.

### BUNDLE-1 (clean — positive finding)
Grep of all `'use client'` files for `process.env` shows **only `NEXT_PUBLIC_*`** references (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_KEY`). **No server secret is inlined into the client bundle.** The only client-exposed value of note remains the documented `tc2026` middleware fallback (SEC-3).

---

## Addendum severity tally (Wave 3 + DB)

| Area | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| Live DB (advisors/RLS/RPC) | 0 | 1 (DB-1 photo bucket) | 2 (DB-2 notif, DB-3 search_path) | 4 |
| Group / expenses / voting | 3 | 5 | 2 | — |
| Invites / sharing / privacy | 1 | 3 | 1 | 2 |
| Completeness | 0 | 3 | 2 | 2 |

**Revised top-priority list (whole audit, recommended fix order):**
1. 🔴 **GROUP-1** — one click settles the whole trip ledger (P0, real money-data destruction). ✓VERIFIED behavior in code.
2. 🔴 **SHARE-1** — `/api/trips/[id]/public` leaks private-trip metadata by UUID (P0/P1).
3. 🔴 **DB-1** — `trip-photos` bucket lists all users' photos (P1, storage-level, bypasses app).
4. 🔴 **SEC-1 / SHARE-2** — member roster + emails exposed (P1). ✓VERIFIED.
5. 🔴 **MONEY-1** — regenerate charges 25 not 10; Trip Pass math impossible (P1). ✓VERIFIED.
6. **COMP-2** — invite email/SMS unthrottled real-money abuse (P1); **COMP-1** — checkout priceId/extraPeople (P1).
7. **GROUP-3/4** — server-side expense validation (custom-split sum, negative/NaN) (P0/P1).
8. **AI-1** — parse-itinerary bypasses verify-before-show (P1); **OPS-1** — maxDuration 504s (P1); **DATA-1** — silent-empty GETs (P1).
9. The structural model fixes (GROUP-2 settlement ledger; caller-vs-organizer tier ruling) and the brand sweep (Groups A/B) when convenient.

*Full audit complete: 11 read-only agents across 3 waves + live-database verification + direct source confirmation of the headline findings. ~70 distinct findings documented. No source files modified during the audit (the only DB read operations were SELECTs + advisor lints).*
