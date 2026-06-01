# Comprehensive QA Audit — tripcoord — 2026-05-31

Read-only, code + DB audit (9 parallel investigators + Supabase advisors). **Nothing was changed** — this is a tracking list to tackle later.

Severity: 🔴 high (correctness / money / security) · 🟠 medium (consistency / robustness) · 🟡 low (palette / docs / polish).
Status tags: **NEW** = surfaced by this audit · **KNOWN** = already tracked (SEC/MONEY/deferred items).

> **Headline (good):** nested-interactive HTML is clean app-wide (hydration #425 root closed); auth gating is consistent and solid; tier limits single-sourced from `TIER_LIMITS`; charge-after-success ordering correct on all 13 AI routes. The items below are what remains.

---

## 🔴 High — correctness / money / security

> **Update 2026-06-01:** #1, #2, #3, #5, #6 fixed (commit pending). #4 intentionally deferred to launch (preview-secret fallback is in active use for testing).

- [x] **1. Multi-city build truncation — ROOT CAUSE (NEW). — DONE 2026-06-01.** `src/app/trip/[id]/itinerary/Client.tsx:1056-1103`. Multi-city chunking only runs when `daysPerDestination` is populated and each city count > 0. If it's empty (builder default unless the Step-2 night allocator ran), the multi-city branch yields **zero segments** → falls to the single `streamSegment(null)` path → one giant non-chunked request for all days → truncates. This is the batch-5 #25 symptom ("one POST for a 7-day build"). **Fix:** when `destinations.length > 1` but allocation is missing/short, synthesize an even split (`ceil(tripLength/cities)`) and reconcile `tripLength` to the sum so segments always exist and total the trip length.

- [x] **2. Build-credit claim strands on a first-chunk crash (NEW). — DONE 2026-06-01.** `src/app/api/generate-itinerary/route.ts` (~2747). The `dayIndex===0` claim-revert lives in the `try`, not `finally`. If the claim-winning chunk throws mid-stream, `build_credits_charged_at` stays set with 0 days charged → later chunks see the claim and go `exempt` → **a build can complete for 0 credits**, or a retry never rebuilds day 1. **Fix:** move the zero-day claim-revert into `finally` (~2804).

- [x] **3. Checkout doesn't allow-list `priceId` or clamp `extraPeople` (KNOWN — SEC-2/COMP-1). — DONE 2026-06-01** (allow-list by mode + clamp 0–6; webhook still TODO for defense-in-depth, see #8 area). `src/app/api/stripe/checkout/route.ts:28-31,114-122`. Client-supplied `priceId` goes straight to Stripe line items; `extraPeople` is an unbounded quantity. Confirmed still open by 3 investigators. **Fix:** allow-list against flattened `STRIPE_PRICES` (and require `mode` to match the price type); clamp `extraPeople` to `[0, 6]` integer. Also clamp in the webhook (`:182`) for defense-in-depth.

- [ ] **4. Middleware `?? 'tc2026'` preview fallback (KNOWN — SEC-3, launch-blocker). — DEFERRED to launch (in use for testing; remove last).** `src/middleware.ts:15` (CLAUDE.md mis-states "line 11"). Set a strong `PREVIEW_SECRET` in Vercel **and** delete the literal fallback — both, since the literal ships in client JS.

- [x] **5. `fetch-reference` SSRF — follows redirects without re-validating (NEW). — DONE 2026-06-01** (manual-redirect `safeFetch`, re-validates each hop). `src/app/api/fetch-reference/route.ts:152,165`. Default `redirect:'follow'`, so an allow-listed URL can 30x-redirect to `169.254.169.254`/internal hosts; the SSRF guard only checks the original URL. Sibling `og-preview` already uses `redirect:'manual'` + per-hop re-check. **Fix:** mirror og-preview on both the Reddit `.json` fetch and the HTML fetch (cap hops).

- [x] **6. Creating a poll can wipe it from the UI on a transient 500 (NEW). — DONE 2026-06-01.** `src/app/trip/[id]/group/Client.tsx:3062`. After creating a vote, the refresh `fetch` has no `res.ok` check; the group-votes GET returns `500 {votes:[]}` on DB error, and `if (fresh.votes) setVotes(fresh.votes)` (empty array is truthy) erases the just-created poll. **Fix:** guard `r.ok` and only replace on a non-empty payload (or merge).

---

## 🟠 Medium — consistency / robustness

- [ ] **7. `tripPatch`/`metaPatch` mass-assignment (NEW).** `src/app/api/trips/[id]/route.ts:126-318`. The admin client writes whatever keys the client puts in `tripPatch`; TS types are erased at runtime, so a crafted body could set `organizer_id`, `is_founder_featured`, `build_credits_charged_at`, etc. **Fix:** server-side allow-list (the `flights` route does this with `PATCHABLE_FIELDS`).

- [ ] **8. MONEY-3 — credit-reset boundary disagreement (NEW detail, KNOWN item).** Three writers zero `ai_credits_used` with **two boundaries**: cron (`reset-ai-credits/route.ts:39-44`) + reset-on-read (`aiCredits.ts:144-149`) use *calendar-month* (`nextCreditResetAt()`); the Stripe webhook (`webhooks/stripe/route.ts:104,328`) uses *rolling +30 days*. They disagree for paid users → cron can re-zero what the webhook already reset → **paid users get extra credit pools**. **Fix:** single-source all three on `nextCreditResetAt()`.

- [ ] **9. Stripe webhook has no event-level idempotency (NEW).** `src/app/api/webhooks/stripe/route.ts`. No `stripe_events(event_id)` replay guard; reset-skip relies on a derived `now+30d > periodEnd` check. A replayed `invoice.payment_succeeded` could re-zero credits mid-cycle. **Fix:** insert-or-skip on `event.id` at the top of POST.

- [ ] **10. `freshRebuild` clear-then-claim isn't atomic (NEW).** `src/app/api/generate-itinerary/route.ts:1671-1692`. Regen unconditionally clears `build_credits_charged_at` then re-claims; two interleaved regens can both pass → **double 10-credit charge** on a double-click. **Fix:** fold the clear into one conditional UPDATE.

- [ ] **11. Partial build charges full price, then regen double-charges (NEW).** `generate-itinerary/route.ts:2736-2746`. A 3-of-7 build charges 25 credits; the only recovery (Regenerate) charges again. **Fix:** don't charge on a short build, or make regenerate-after-partial free.

- [ ] **12. `add-day` forces `day.city` to the base city → excursion days fail the gate (NEW).** `src/app/api/trips/[id]/add-day/route.ts:198`. A Versailles day-trip gets `city="Paris"`, so verify-before-show rejects the correct Versailles venues. **Fix:** let the model set `city`, fall back to base only when absent.

- [ ] **13. Continuation prompt drops per-day city + weekday map (NEW).** `generate-itinerary/route.ts:2492-2557`. A truncated multi-city tail can get the wrong city assigned to remaining days (then the gate rejects them, burning slots) and loses the closed-on-Monday safeguard. **Fix:** pass the explicit remaining day→city range + weekday slice into the continuation prompt.

- [ ] **14. `/api/trips` returns `200 {trips:[]}` for no-session (KNOWN deferred).** `src/app/api/trips/route.ts:27`. Inconsistent with every other trip route (which 401); the dashboard's "bounce to login on 401" (`dashboard/Client.tsx:95`) is dead code → an expired session shows an empty dashboard.

- [ ] **15. Sidebar mobile drawer still uses `h-screen` (NEW — last 100vh leftover).** `src/components/Sidebar.tsx:259`. The off-canvas nav drawer is `h-screen` (the dvh sweep missed it), so its footer sits behind the device nav bar on mobile. **Fix:** `h-screen` → `h-dvh`.

- [ ] **16. `tripRow` typed as `Record<string, any>` (NEW).** `src/app/trip/[id]/itinerary/Client.tsx:496`. Every `tripRow?.start_date` / `group_size` / `budget_total` is unchecked — a DB column rename reads `undefined` with zero compile error. **Fix:** type it `Database['public']['Tables']['trips']['Row'] | null`.

- [ ] **17. Three independent raw `ItineraryDay`-from-Json read paths (NEW, latent).** itinerary `syncAiDays` (normalizes `tracks`), group `itineraryDaysData` (`group/Client.tsx:448`, not normalized), print `setDays` (`print/page.tsx:55`). All currently safe via `?.`, but a future `day.tracks.shared.map` without `?.` in group/print will crash. **Fix:** one shared `normalizeDay()` used by all three.

- [ ] **18. Triplicated `relativeTime`/`timeAgo` with drift (NEW).** `NotificationPanel.tsx:72` + `admin/support/Client.tsx:54` (Math.round) vs `notifications/page.tsx:45` (Math.floor + seconds "just now" bucket) → same notification reads "1m ago" in the panel and "just now" on the page. **Fix:** one shared helper in `src/lib/`.

- [ ] **19. Day-count math duplicated, ceil vs round (NEW).** `TripCard.tsx:184` + `dashboard/Client.tsx:310` use `Math.ceil`; `dashboard:370` uses noon-anchored `Math.round` (the batch-2 fix). `computeStatus` is copy-pasted in `dashboard:52`, `trips/Client.tsx:32`, `TripCard.tsx`. Same "N-day trip shows N+1d" class. **Fix:** centralize `daysUntil()`/`tripDayCount()`/`computeStatus()` in `src/lib/tripDates.ts`.

- [ ] **20. `Math.random()` in a render-path state initializer (NEW).** `src/components/ParseTransportModal.tsx:193` → server/client hydration mismatch on the example placeholder. **Fix:** pick after mount in `useEffect`.

- [ ] **21. No rate-limit on server fetch proxies (NEW).** `og-preview`, `fetch-reference`, `google/resolve`, `unsplash/photo` make outbound fetches with auth-only (no `consumeRateLimit`) → one logged-in account can drain quota / the Unsplash demo key. **Fix:** add the existing `consumeRateLimit` helper per-user/IP.

- [ ] **22. No size cap on base64 uploads (NEW).** `parse-receipt/route.ts:59` (`imageBase64`), `parse-itinerary/route.ts:78` (`pdfBase64`) — no byte cap → cost amplification / OOM risk. **Fix:** reject blobs over ~5–10 MB (mirror the avatar `MAX_BYTES`).

- [ ] **23. `[day-swap]` `console.log` ships to production (NEW).** `src/app/trip/[id]/itinerary/Client.tsx:3648` fires on every drag/reorder. **Fix:** delete.

- [ ] **24. Vote-cast errors are generic (NEW).** `src/app/trip/[id]/group/Client.tsx:885-908` throws a generic "try again" and discards the server's specific 400s ("This poll is closed", max-picks). **Fix:** read `data.error` and surface it (like the add-day caller does).

---

## 🟡 Low — palette, docs, polish

### 25. Brand-color cleanup (NEW, themed batch)
Off-palette usages vs the CLAUDE.md "Brand color discipline" ruling. Concentrated spots:
- **NotificationPanel.tsx + notifications/page.tsx** — per-type color maps use violet/amber/indigo/orange/teal (chat=violet, vote=amber, transport=indigo, reminder=orange, trip_invite=teal, badge=indigo). → sky/zinc/emerald per role.
- **layover/Client.tsx:770-774** — category map (orange food, pink shopping, purple lounge, green relax, blue sightseeing) + `:609` violet "Long layover" + `:318` amber over-budget warning (should be rose).
- **Global green→emerald sweep** (~15 files): online dots (`Avatar.tsx:28`, `group:1745`), wizard step-complete (`trip/new` multiple), day-of NOW pills (`dayof:130-131,230,545`), settings "saved" states, coming-soon success, memories active button.
- **Global red→rose sweep** on warning/error banners: `ErrorBoundary.tsx:48-50`, `trip/generating/Client.tsx:533-555`, `prep:1859-1902`, `dayof:592-596`, `layover:513-520`, `settings:1391-1427` (delete danger-zone), `wishlist:338,363`, `itinerary:5342-5347`, `group:2948`.
- **violet-outside-AI-Pick:** `MapView.tsx:63,72`, `dayof:46-49,622-625`, `world:81`, `itinerary:135,165` (Photo category / Cable Car), `discover` season/time pills, `TripStoryModal` slide rotation.
- **Other off-palette:** `Sidebar.tsx:33` Nomad badge orange (inconsistent with sky trip_pass/explorer), `Sidebar.tsx:128,136` green active nav, `ParseTransportModal:29-32` indigo + `:154` amber warning icon, `prep:1831-1836` blue SIM-card info (→ zinc FYI), `world:781` purple-50 gradient, `page.tsx:41-512` blue-50/100 on hero.
- Correctly sanctioned (no change): Track B = amber, AI-Pick = violet, paid/upsell amber, emerald "Best value".

### 26. CLAUDE.md staleness (NEW)
- (a) "Project Structure" + "Key File Reference" point at `*/page.tsx`, but real code lives in sibling `Client.tsx` (page files are thin shells — e.g. `itinerary/page.tsx` is ~15 lines, the 4000-line core is `itinerary/Client.tsx`).
- (b) Middleware "line 11" → actually **line 15**.
- (c) Empty-state "three surfaces (chat/expenses/packing)" → now 8 files / 12 usages.
- (d) Go-Live "drop three brand icon assets" bullet is **done** (per memory, commit 4fec0d7 — `src/app/icon.png`, `apple-icon.png`, og-image present).
- (e) `AI_CREDIT_COSTS` doc comment (`types.ts:73-80`) still says "Nomad 250 cr → 10 builds" → it's 200 / ~8.
- (f) `members/route.ts:285-288` comment says "explorer→8 / nomad→15" (code is correct via `TIER_LIMITS`).
- (g) "TypeScript Property Access" note references `trips.itinerary_data` / `destinations[]` columns that don't exist (days live in `itineraries.days`; `trips.destination` is singular; multi-city comes from `preferences.destinations`).

### 27. Stale magic literals (NEW)
- `members/route.ts:308,311` — literal `6` (trip-pass base) and `4` (free) instead of `PRICING.trip_pass.baseGroupSize` / `TIER_LIMITS.free.travelersPerTrip`.
- `pricing/Client.tsx:387,526` + FAQ `:66` — `+$4/person … up to 12` hardcoded instead of interpolating `PRICING` (drift risk under the MONETIZATION repricing plan).

### 28. Stale `trip_cities` rpc cast (NEW)
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
