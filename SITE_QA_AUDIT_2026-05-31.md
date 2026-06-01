# Comprehensive QA Audit — tripcoord — 2026-05-31

Read-only, code + DB audit (9 parallel investigators + Supabase advisors). **Nothing was changed** — this is a tracking list to tackle later.

Severity: 🔴 high (correctness / money / security) · 🟠 medium (consistency / robustness) · 🟡 low (palette / docs / polish).
Status tags: **NEW** = surfaced by this audit · **KNOWN** = already tracked (SEC/MONEY/deferred items).

> **Headline (good):** nested-interactive HTML is clean app-wide (hydration #425 root closed); auth gating is consistent and solid; tier limits single-sourced from `TIER_LIMITS`; charge-after-success ordering correct on all 13 AI routes. The items below are what remains.

---

## 📌 Reported directly (2026-06-01)

- [x] **R1. Marketing nav logo broken. — DONE 2026-06-01.** The batch-6 MarketingNav rewrite pointed the logo at `/tripcoord-wordmark.svg`, which doesn't exist; reverted to `/tripcoord_logo.png` (the file the Sidebar uses). _(Regression I introduced — apologies.)_
- [x] **R2. Adding a day didn't update the day count on the itinerary cover. — DONE 2026-06-01.** `add-day` saved the day but never synced `trips.trip_length`, so the trip-card "Nd" cover badge stayed stale. Fixed server-side: the trips PATCH now sets `trip_length = days.length` whenever the `days` array is saved (covers add/remove/reorder, self-heals drift).

## 🔴 High — correctness / money / security

> **Update 2026-06-01:** #1, #2, #3, #5, #6 fixed (commit pending). #4 intentionally deferred to launch (preview-secret fallback is in active use for testing).

- [x] **1. Multi-city build truncation — ROOT CAUSE (NEW). — DONE 2026-06-01.** `src/app/trip/[id]/itinerary/Client.tsx:1056-1103`. Multi-city chunking only runs when `daysPerDestination` is populated and each city count > 0. If it's empty (builder default unless the Step-2 night allocator ran), the multi-city branch yields **zero segments** → falls to the single `streamSegment(null)` path → one giant non-chunked request for all days → truncates. This is the batch-5 #25 symptom ("one POST for a 7-day build"). **Fix:** when `destinations.length > 1` but allocation is missing/short, synthesize an even split (`ceil(tripLength/cities)`) and reconcile `tripLength` to the sum so segments always exist and total the trip length.

- [x] **2. Build-credit claim strands on a first-chunk crash (NEW). — DONE 2026-06-01.** `src/app/api/generate-itinerary/route.ts` (~2747). The `dayIndex===0` claim-revert lives in the `try`, not `finally`. If the claim-winning chunk throws mid-stream, `build_credits_charged_at` stays set with 0 days charged → later chunks see the claim and go `exempt` → **a build can complete for 0 credits**, or a retry never rebuilds day 1. **Fix:** move the zero-day claim-revert into `finally` (~2804).

- [x] **3. Checkout doesn't allow-list `priceId` or clamp `extraPeople` (KNOWN — SEC-2/COMP-1). — DONE 2026-06-01** (allow-list by mode + clamp 0–6 in checkout; `extra_people` also clamped in the Stripe webhook for defense-in-depth). `src/app/api/stripe/checkout/route.ts:28-31,114-122`. Client-supplied `priceId` goes straight to Stripe line items; `extraPeople` is an unbounded quantity. Confirmed still open by 3 investigators. **Fix:** allow-list against flattened `STRIPE_PRICES` (and require `mode` to match the price type); clamp `extraPeople` to `[0, 6]` integer. Also clamp in the webhook (`:182`) for defense-in-depth.

- [ ] **4. Middleware `?? 'tc2026'` preview fallback (KNOWN — SEC-3, launch-blocker). — DEFERRED to launch (in use for testing; remove last).** `src/middleware.ts:15` (CLAUDE.md mis-states "line 11"). Set a strong `PREVIEW_SECRET` in Vercel **and** delete the literal fallback — both, since the literal ships in client JS.

- [x] **5. `fetch-reference` SSRF — follows redirects without re-validating (NEW). — DONE 2026-06-01** (manual-redirect `safeFetch`, re-validates each hop). `src/app/api/fetch-reference/route.ts:152,165`. Default `redirect:'follow'`, so an allow-listed URL can 30x-redirect to `169.254.169.254`/internal hosts; the SSRF guard only checks the original URL. Sibling `og-preview` already uses `redirect:'manual'` + per-hop re-check. **Fix:** mirror og-preview on both the Reddit `.json` fetch and the HTML fetch (cap hops).

- [x] **6. Creating a poll can wipe it from the UI on a transient 500 (NEW). — DONE 2026-06-01.** `src/app/trip/[id]/group/Client.tsx:3062`. After creating a vote, the refresh `fetch` has no `res.ok` check; the group-votes GET returns `500 {votes:[]}` on DB error, and `if (fresh.votes) setVotes(fresh.votes)` (empty array is truthy) erases the just-created poll. **Fix:** guard `r.ok` and only replace on a non-empty payload (or merge).

---

## 🟠 Medium — consistency / robustness

- [x] **7. `tripPatch`/`metaPatch` mass-assignment (NEW). — DONE 2026-06-01** (`tripPatch` now server-side allow-listed to the 13 documented columns; `metaPatch` left as the intended free-form meta JSON blob, lower impact). `src/app/api/trips/[id]/route.ts:126-318`. The admin client writes whatever keys the client puts in `tripPatch`; TS types are erased at runtime, so a crafted body could set `organizer_id`, `is_founder_featured`, `build_credits_charged_at`, etc. **Fix:** server-side allow-list (the `flights` route does this with `PATCHABLE_FIELDS`).

- [x] **8. MONEY-3 — credit-reset boundary disagreement (NEW detail, KNOWN item). — DONE 2026-06-01** (webhook now uses `nextCreditResetAt()` for both `ai_credits_reset_at` writes; all three writers single-sourced on the calendar-month boundary). Three writers zero `ai_credits_used` with **two boundaries**: cron (`reset-ai-credits/route.ts:39-44`) + reset-on-read (`aiCredits.ts:144-149`) use *calendar-month* (`nextCreditResetAt()`); the Stripe webhook (`webhooks/stripe/route.ts:104,328`) uses *rolling +30 days*. They disagree for paid users → cron can re-zero what the webhook already reset → **paid users get extra credit pools**. **Fix:** single-source all three on `nextCreditResetAt()`.

- [x] **9. Stripe webhook has no event-level idempotency (NEW). — DONE 2026-06-01** (new `stripe_events` table; webhook inserts `event.id` on receipt and acks+skips on a 23505 unique-violation — so retries/replays never re-run handlers). `src/app/api/webhooks/stripe/route.ts`. No `stripe_events(event_id)` replay guard; reset-skip relies on a derived `now+30d > periodEnd` check. A replayed `invoice.payment_succeeded` could re-zero credits mid-cycle. **Fix:** insert-or-skip on `event.id` at the top of POST.

- [x] **10. `freshRebuild` clear-then-claim isn't atomic (NEW). — DONE 2026-06-01** (replaced the unconditional clear-then-claim with a compare-and-swap against the read value; Postgres re-checks the WHERE post-lock so exactly one concurrent regen wins). `src/app/api/generate-itinerary/route.ts:1671-1692`. Regen unconditionally clears `build_credits_charged_at` then re-claims; two interleaved regens can both pass → **double 10-credit charge** on a double-click. **Fix:** fold the clear into one conditional UPDATE.

- [ ] **11. Partial build charges full price, then regen double-charges (NEW). — TODO (needs product decision):** should a truncated/partial build charge at all, and should the regen-to-finish be free? Holding for Brandon's call on refund/charge policy before implementing. `generate-itinerary/route.ts:2736-2746`. A 3-of-7 build charges 25 credits; the only recovery (Regenerate) charges again. **Fix:** don't charge on a short build, or make regenerate-after-partial free.

- [x] **12. `add-day` forces `day.city` to the base city → excursion days fail the gate (NEW). — DONE 2026-06-01** (normalize the model's city to its core but keep a genuine excursion city; fall back to base only when absent). `src/app/api/trips/[id]/add-day/route.ts:198`. A Versailles day-trip gets `city="Paris"`, so verify-before-show rejects the correct Versailles venues. **Fix:** let the model set `city`, fall back to base only when absent.

- [x] **13. Continuation prompt drops per-day city + weekday map (NEW). — DONE 2026-06-01** (continuation pass now includes a weekday-calendar slice for the remaining days — restoring the closed-hours safeguard — and, for multi-city, an explicit day→city map so tail days get the right city and pass the verify gate). `generate-itinerary/route.ts:2492-2557`. A truncated multi-city tail can get the wrong city assigned to remaining days (then the gate rejects them, burning slots) and loses the closed-on-Monday safeguard. **Fix:** pass the explicit remaining day→city range + weekday slice into the continuation prompt.

- [ ] **14. `/api/trips` returns `200 {trips:[]}` for no-session (KNOWN deferred).** `src/app/api/trips/route.ts:27`. Inconsistent with every other trip route (which 401); the dashboard's "bounce to login on 401" (`dashboard/Client.tsx:95`) is dead code → an expired session shows an empty dashboard.

- [ ] **15. Sidebar mobile drawer still uses `h-screen` (NEW — last 100vh leftover).** `src/components/Sidebar.tsx:259`. The off-canvas nav drawer is `h-screen` (the dvh sweep missed it), so its footer sits behind the device nav bar on mobile. **Fix:** `h-screen` → `h-dvh`.

- [ ] **16. `tripRow` typed as `Record<string, any>` (NEW).** `src/app/trip/[id]/itinerary/Client.tsx:496`. Every `tripRow?.start_date` / `group_size` / `budget_total` is unchecked — a DB column rename reads `undefined` with zero compile error. **Fix:** type it `Database['public']['Tables']['trips']['Row'] | null`.

- [ ] **17. Three independent raw `ItineraryDay`-from-Json read paths (NEW, latent).** itinerary `syncAiDays` (normalizes `tracks`), group `itineraryDaysData` (`group/Client.tsx:448`, not normalized), print `setDays` (`print/page.tsx:55`). All currently safe via `?.`, but a future `day.tracks.shared.map` without `?.` in group/print will crash. **Fix:** one shared `normalizeDay()` used by all three.

- [ ] **18. Triplicated `relativeTime`/`timeAgo` with drift (NEW).** `NotificationPanel.tsx:72` + `admin/support/Client.tsx:54` (Math.round) vs `notifications/page.tsx:45` (Math.floor + seconds "just now" bucket) → same notification reads "1m ago" in the panel and "just now" on the page. **Fix:** one shared helper in `src/lib/`.

- [ ] **19. Day-count math duplicated, ceil vs round (NEW).** `TripCard.tsx:184` + `dashboard/Client.tsx:310` use `Math.ceil`; `dashboard:370` uses noon-anchored `Math.round` (the batch-2 fix). `computeStatus` is copy-pasted in `dashboard:52`, `trips/Client.tsx:32`, `TripCard.tsx`. Same "N-day trip shows N+1d" class. **Fix:** centralize `daysUntil()`/`tripDayCount()`/`computeStatus()` in `src/lib/tripDates.ts`.

- [x] **20. `Math.random()` in a render-path state initializer (NEW). — DONE 2026-06-01** (ParseTransportModal picks the example in a `useEffect` after mount). `src/components/ParseTransportModal.tsx:193` → server/client hydration mismatch on the example placeholder. **Fix:** pick after mount in `useEffect`.

- [ ] **21. No rate-limit on server fetch proxies (NEW).** `og-preview`, `fetch-reference`, `google/resolve`, `unsplash/photo` make outbound fetches with auth-only (no `consumeRateLimit`) → one logged-in account can drain quota / the Unsplash demo key. **Fix:** add the existing `consumeRateLimit` helper per-user/IP.

- [ ] **22. No size cap on base64 uploads (NEW).** `parse-receipt/route.ts:59` (`imageBase64`), `parse-itinerary/route.ts:78` (`pdfBase64`) — no byte cap → cost amplification / OOM risk. **Fix:** reject blobs over ~5–10 MB (mirror the avatar `MAX_BYTES`).

- [x] **23. `[day-swap]` `console.log` ships to production (NEW). — DONE 2026-06-01** (removed). `src/app/trip/[id]/itinerary/Client.tsx:3648` fires on every drag/reorder. **Fix:** delete.

- [ ] **24. Vote-cast errors are generic (NEW).** `src/app/trip/[id]/group/Client.tsx:885-908` throws a generic "try again" and discards the server's specific 400s ("This poll is closed", max-picks). **Fix:** read `data.error` and surface it (like the add-day caller does).

---

## 🟡 Low — palette, docs, polish

### 25. Brand-color cleanup (NEW, themed batch) — DONE 2026-06-01 (with deliberate exceptions)
**DONE:**
- Global **green→emerald** (all success/online/step states) and **red→rose** (all error/warning/destructive banners) across 24 files (word-boundary anchored).
- NotificationPanel + notifications/page per-type color maps → sanctioned (sky informational / emerald money+achievement / rose member+billing / zinc reminder). _Several types collapse to `sky` — icon shape differentiates; flag if you want more variety._
- Layover category map → neutral zinc (matches the wishlist decision).
- Sidebar Nomad tier badge orange → sky (matches the other tier badges).
- Trip-scoped Discover mock-card gradients → brand `ocean→earth` gradient.
- Prep "SIM Card & Data Plan" info cards (blue) → zinc neutral FYI.
- Landing hero subtitle text (blue-50/100) → sky.

**Deliberately LEFT (functional legends / per your calls) — not bugs:**
- **Trip Story modal** colorful slide rotation — per your decision, stays colorful.
- **Functional color legends** where multi-color aids differentiation (same rationale as Trip Story): `MapView` price/transport pin colors, `ParseTransportModal` transport-mode colors, world passport-stamp colors, Discover season/time-of-day pills, itinerary Photo/Cable-Car category accents. Forcing these to 2–3 sanctioned colors would make legend entries indistinguishable. The genuine **AI-Pick violet** badge is correctly kept.
- Minor secondary-surface accents (trip-scoped layover blue/yellow cards, admin-support internal category/status colors) — low-visibility, left for a later pass if desired.
Off-palette usages vs the CLAUDE.md "Brand color discipline" ruling. Concentrated spots:
- **NotificationPanel.tsx + notifications/page.tsx** — per-type color maps use violet/amber/indigo/orange/teal (chat=violet, vote=amber, transport=indigo, reminder=orange, trip_invite=teal, badge=indigo). → sky/zinc/emerald per role.
- **layover/Client.tsx:770-774** — category map (orange food, pink shopping, purple lounge, green relax, blue sightseeing) + `:609` violet "Long layover" + `:318` amber over-budget warning (should be rose).
- **Global green→emerald sweep** (~15 files): online dots (`Avatar.tsx:28`, `group:1745`), wizard step-complete (`trip/new` multiple), day-of NOW pills (`dayof:130-131,230,545`), settings "saved" states, coming-soon success, memories active button.
- **Global red→rose sweep** on warning/error banners: `ErrorBoundary.tsx:48-50`, `trip/generating/Client.tsx:533-555`, `prep:1859-1902`, `dayof:592-596`, `layover:513-520`, `settings:1391-1427` (delete danger-zone), `wishlist:338,363`, `itinerary:5342-5347`, `group:2948`.
- **violet-outside-AI-Pick:** `MapView.tsx:63,72`, `dayof:46-49,622-625`, `world:81`, `itinerary:135,165` (Photo category / Cable Car), `discover` season/time pills, `TripStoryModal` slide rotation.
- **Other off-palette:** `Sidebar.tsx:33` Nomad badge orange (inconsistent with sky trip_pass/explorer), `Sidebar.tsx:128,136` green active nav, `ParseTransportModal:29-32` indigo + `:154` amber warning icon, `prep:1831-1836` blue SIM-card info (→ zinc FYI), `world:781` purple-50 gradient, `page.tsx:41-512` blue-50/100 on hero.
- Correctly sanctioned (no change): Track B = amber, AI-Pick = violet, paid/upsell amber, emerald "Best value".

### 26. CLAUDE.md staleness (NEW) — MOSTLY DONE 2026-06-01
_Fixed: middleware line 11→15, empty-state count, property-access note (no `trips.destinations[]`), `AI_CREDIT_COSTS` comment (250→200), members-route tier-cap comment (8/15→6/12). Still open: (a) page.tsx-vs-Client.tsx Project-Structure/Key-File pointers, (d) icon-assets go-live bullet (mark done)._
- (a) "Project Structure" + "Key File Reference" point at `*/page.tsx`, but real code lives in sibling `Client.tsx` (page files are thin shells — e.g. `itinerary/page.tsx` is ~15 lines, the 4000-line core is `itinerary/Client.tsx`).
- (b) Middleware "line 11" → actually **line 15**.
- (c) Empty-state "three surfaces (chat/expenses/packing)" → now 8 files / 12 usages.
- (d) Go-Live "drop three brand icon assets" bullet is **done** (per memory, commit 4fec0d7 — `src/app/icon.png`, `apple-icon.png`, og-image present).
- (e) `AI_CREDIT_COSTS` doc comment (`types.ts:73-80`) still says "Nomad 250 cr → 10 builds" → it's 200 / ~8.
- (f) `members/route.ts:285-288` comment says "explorer→8 / nomad→15" (code is correct via `TIER_LIMITS`).
- (g) "TypeScript Property Access" note references `trips.itinerary_data` / `destinations[]` columns that don't exist (days live in `itineraries.days`; `trips.destination` is singular; multi-city comes from `preferences.destinations`).

### 27. Stale magic literals (NEW) — PARTLY DONE 2026-06-01
_members route trip-pass base `6` → `PRICING.trip_pass.baseGroupSize`. Still open: the `+$4/person … up to 12` hardcoded strings on the pricing page (interpolate `PRICING`); the `: 4` free-cap fallback left as-is (dead safety net)._
- `members/route.ts:308,311` — literal `6` (trip-pass base) and `4` (free) instead of `PRICING.trip_pass.baseGroupSize` / `TIER_LIMITS.free.travelersPerTrip`.
- `pricing/Client.tsx:387,526` + FAQ `:66` — `+$4/person … up to 12` hardcoded instead of interpolating `PRICING` (drift risk under the MONETIZATION repricing plan).

### 28. Stale `trip_cities` rpc cast (NEW) — DONE 2026-06-01
_Dropped the `as unknown` cast; calling `supabase.rpc('trip_cities', …)` directly now that the RPC is in the generated types._
`api/trips/route.ts:111` casts through `unknown` "because the typed client doesn't know the RPC" — it does now (present in `database.types.ts`). Drop the cast.

### 29. `generate-hotels` / `generate-discover` emit AI venues with no Tier-1 check (NEW)
`generate-hotels/route.ts:40-59` (full address), `generate-discover/route.ts:44-75` (neighborhood location). Softer surface (hotels are search-URLs, discover has no scheduling) but technically outside verify-before-show. **Fix:** run `addressContainsCity` on the hotel address / discover location, or consciously document them exempt.

### 30. Settlement DELETE is any-member (NEW, verify)
`settlements/route.ts:98-113` lets any trip member delete any settlement (looser than the expenses gate). Likely intentional for group settle-up — confirm.

---

## 🗄️ Database advisors (Supabase linter)

- [ ] **31. 5 tables: RLS enabled, no policy (INFO).** `expense_settlements`, `lifecycle_emails_sent`, `rate_limits`, `venue_location_cache`, `wishlist_items`. This is *deny-all* to the anon/authed client (admin client bypasses) — "locked by default." **Confirm each is only accessed server-side via the admin client**, or add explicit policies. `wishlist_items` is the one to double-check (user-owned data).
- [ ] **32. Leaked-password protection OFF (KNOWN — DB-5).** Enable HaveIBeenPwned check in Supabase Auth → Providers → Password.
- **33. 2 always-true INSERT policies (WARN).** `destination_events` + `waitlist` public insert — both intentional (event logging / waitlist signup). No action, noted.
- **34. Performance (109 lints, post-traffic / DB-7 class):** 59 "Auth RLS Initialization Plan" warns (wrap `auth.uid()` in `(select auth.uid())` to evaluate once per query, not per row), 16 "Multiple Permissive Policies", 31 unused indexes, 2 unindexed FKs (`support_tickets`). Not launch-blocking; revisit when real traffic justifies.

---

## Suggested order to tackle
1. **#1** multi-city truncation (correctness — the batch-5 #25 root cause).
2. **#2 / #10 / #11** build-credit edge cases (money).
3. **#3 / #4 / #5** security launch items (checkout allow-list, middleware secret, SSRF redirect).
4. **#6 / #24** group-votes data/UX.
5. **#7 / #8 / #9** mass-assignment + credit-reset boundary + webhook idempotency.
6. **#15 / #20 / #23** quick mobile/hydration/console wins.
7. The 🟡 batch (palette, CLAUDE.md, dedup helpers) as a cleanup sweep.

_Method: 9 parallel read-only investigators (tiers, palette, API contracts, security, types, mobile/a11y, credits/billing, AI pipeline, docs/dead-code) + Supabase security/performance advisors. No files modified._
