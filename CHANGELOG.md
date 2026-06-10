# TripCoord — Session Changelog

> Older "Recently Shipped" notes moved here on 2026-05-19 to keep `CLAUDE.md` under the 40K-char auto-load threshold.
> Most recent session stays in `CLAUDE.md`. Anything older lives here.
> May 9 session moved here on 2026-05-29 when the May 29 QA-pass session took its slot.
> May 29 QA-pass session moved here on 2026-05-29 later the same day when the product-polish + landing-port session took the slot.
> May 29 product-polish + landing-port session moved here later the same day when the multi-admin + design-consistency-sweep session took the slot (third rotation in 24h — heavy day).
> May 29 multi-admin + design-consistency-sweep session moved here on 2026-05-30 when the night-marathon + verify-before-show session took the slot.
> May 29 night → May 30 morning marathon (QA pass + landing reposition + verify-before-show) moved here on 2026-05-30 in a CLAUDE.md slim-down — no newer session took its slot; rotated to keep the always-on file under the 40K-char threshold. CLAUDE.md now carries only the "Older sessions" pointer.
> May 30 full-site QA audit + remediation marathon logged here directly (CLAUDE.md keeps only the pointer; full findings live in SITE_QA_AUDIT_2026-05-30.md).

---

## Recently Shipped (2026-06-09 — Trip Pass overlay (Option A) + Builder/lodging audit + polish)

Session focused on completing the Trip Pass per-trip-overlay model, a data-grounded audit of what the Trip Builder inputs actually do, and a round of UX polish. All commits tsc-clean.

**Trip Pass = per-trip overlay (Option A) — the headline work.** A Trip Pass purchase no longer swaps `subscription_tier`; the buyer stays Free and the `trip_passes` row is the overlay. Three steps: ① stop the webhook tier-swap + re-point traveler cap (`5373e7d`); ② credit display keys on the active pass (`df83468`); ③ read-side + closed **3 server-gate regressions** a `=== 'trip_pass'` sweep found — multi-city, co-organizer, AI import all gated on the buyer's *account* tier, so a Free pass-buyer was locked out of features they paid for (`1559325`). New shared helper `tripHasActivePass(tripId)` in `tripAccess.ts`. Surfaced as an amber **"Trip Pass" badge** on trip cards + **"Trip Pass active" chip** on the itinerary; Settings stays "Free plan" (`e420e58`). Multi-city now shows a specific upsell to Free users instead of a generic lock (`6d540d3`). Full map: `OPTION_A_TRIP_PASS_SCOPE.md`. **Lesson:** an overlay model breaks any gate keyed on account tier for a per-trip feature — grep ALL such gates, not just a scope-doc list.

**Builder input audit (data-grounded).** Verified against prod what each Builder input actually does: **budget IS load-bearing** (dollar breakdown → hotel price tier + per-day food/experience budgets + restaurant price-level ceilings; the slider — confusingly named `curiosityLevel` — drives meal tiers + Michelin). **Lodging type was cosmetic:** picking Airbnb/Hostel still returned hotels with Booking.com links every time (a "hostel" pick once surfaced the Ritz-Carlton). Fixed (`ac1b6af`): the `hotelSuggestions` prompt now honors the selected type, treats Airbnb as neighborhood + search link (not invented names), adds a `lodgingType` field driving type-matched booking hosts (Booking/Hostelworld/Airbnb). Scope kept to suggestions only — **itinerary stays driven by budget + Top Priorities** (Brandon's ruling). Confirmed the **start/end-near-hotel anchoring** is correct (pre-booked home-base rules, lines 968–977) and left untouched. "No lodging suggestions when a hotel is pre-booked" is by design (verified).

**Build-credit charging — diagnostic.** Traced a real build end-to-end: charging works correctly now (Copenhagen: claim → 3 days → 25 credits). But the earliest charge in the entire DB is 2026-06-09 00:02 — **builds were silently free before then** (the claim `UPDATE` errored on a not-yet-migrated column → swallowed → treated as exempt). Pre-launch, no revenue lost. Latent risk flagged: the claim-error path (route ~line 1747) fails *open to free* — harden before launch.

**Polish + ops.** Trip Story empty-photos slide now shows an "add your photos" CTA → Memories page instead of silently dropping (`0551d22`); onboarding step counter fixed "of 2" → "of 3". GOLIVE_CHECKLIST: explicit 3-placeholder Stripe price-ID step (`7c561bc`). Reset Mallory's maxed Travel-Pro credits (founder testing); flagged her duplicate account. Confirmed per-trip recap already uses real photos (the mock-photo issue is Year-in-Review only).

**New memories:** `project_trip_pass_overlay_model` (updated through badge), `project_builder_inputs_audit`, `project_build_credit_charging_live`.

---

## Recently Shipped (2026-05-30 — full-site QA audit + remediation marathon)

A multi-day marathon: an 11-agent read-only QA audit across the whole app + a live-database audit (Supabase advisors, RLS, RPC bodies), then remediation of ~30 findings. **~31 commits, 5 production migrations, all tsc-clean.** Full findings + status: `SITE_QA_AUDIT_2026-05-30.md`.

**The audit** — 11 agents across 3 waves (tier gates, security/IDOR, credits/Stripe, persistence, AI/data-model, ops/crons, a11y, brand, group/expenses, invites/sharing, completeness) + live-DB checks. ~70 findings. Verified P0s: GROUP-1 (Mark Paid settled the whole ledger), SHARE-1 (`/public` leaked private-trip metadata), SEC-1 (members roster email IDOR), MONEY-1 (regenerate charged 25 not 10).

**Cost-leak fix that kicked it off** — Places location-verification (verify-before-show Tier 2) was uncached → new global `venue_location_cache` (commit `696bd1b`), the single biggest per-build variable cost.

**P0s + headline P1s** — settlement ledger (`expense_settlements` table; "Mark Paid" records one payment); `/public` privacy gate; members membership-gate + organizer-only emails; regenerate charges `itinerary_regenerate` (10); server-side expense validation; `trip-photos` bucket listing dropped; invite email/SMS rate-limited; `maxDuration` on 8 AI routes; 11 GET routes surface DB errors (not silent empty); parse-itinerary `day.city` + no fabrication; notifications INSERT policy + function `search_path` (DB-2/3).

**Co-organizer rule (TIER-1)** — settled with Brandon: trip **length + multi-city** gate on the **organizer's** tier (never cut a co-org's days); **AI features + credits** on the **caller's own** tier (Trip Pass → shared pool). New `getOrganizerTier` helper applied in generate-itinerary + add-day.

**Batch B–G** — SEC-4/5/6 (auth + rate-limit + SSRF), SHARE-3/4 (fork allow-list, token reuse), COMP-4 (email escaping), GROUP-5 (member DELETE), AI-2/4/5 (enrich verify + shape, hotels guard), DATA-3/4/5 (chat rollback, prep toggles, trips errors), GROUP-7/9 (cent-split + guest dedup, receipt guard), OPS-2/3/4/5 (/auth exempt, informative cron/webhook status), A11Y-1/2/3 (keyboard card, modal dialogs + escape, date anchors), MONEY-2/6 (RPC snapshot `db/functions.sql`, dropped dead `profiles.ai_credits_total`).

**Brand** — Track A/B regression, ~28 button pills → `rounded-full`, indigo→sky, warning banners → rose/zinc ("Treatment B" ruling), trip/new amber-accents, purple surfaces → sky/zinc (E), 4 empty states → `<EmptyState>` (D). Skipped G (category maps — deliberate differentiation) per Brandon.

**Four UX fixes (from Brandon's review)** — trip-card day badge anchored right (no float); Trip Story cover pulls from real photos + map fails gracefully; Discover "What's Out There" tiles cleaned (Lucide icons + soft placeholder, no rainbow gradients/giant emoji).

**Deferred (documented with reasons in the audit doc)** — DATA-2 (realtime clobber — needs concurrency design), GROUP-6 (settle-by-id — needs schema change), SHARE-5 (world opt-in — product call + toggle UI), DB-7 (RLS perf + indexes — post-traffic pass; "unused" indexes are a no-traffic artifact), SEC-2/COMP-1 (checkout priceId allow-list), SEC-3 (`tc2026` launch-blocker). New go-live toggles added to CLAUDE.md: Maps Static API (fixes Trip Story map), leaked-password protection.

---

## Recently Shipped (May 29 night → May 30 morning — QA pass + landing reposition + verify-before-show)

Two-day marathon. Started with a 5-agent QA pass on the full site, became a strategic landing reposition (group-OS pitch, demote AI itinerary), became cost-cutting AI model routing, became a brutal-honesty product audit, ended with a real correctness bug fix that grew into a multi-route verify-before-show architecture. **17 commits.**

**QA pass — 5 themed fix groups (commits `503be26` → `aa96791`)**
- Group A — Day-Of + Print palette reconciliation: ~30 slate→zinc swaps on dayof; `rounded-xl` → `rounded-2xl` on hero + tile cards; End-of-day button `slate-900 rounded-xl` → `sky-800 rounded-full`; Print page amber → zinc on Tonight's Stay + prep notes (was overusing amber for non-Trip-Pass copy).
- Group B — Brand color violations: Bus/Coach `indigo-*` → `sky-700`; HIGHLIGHT_CATEGORY_META nightlife `fuchsia-*` → `amber-*`; Date Night `pink-*` → `rose-*`; `/trips` share filter `amber-500` → `sky-800`.
- Group C — Button shape normalization: prep Generate AI List + Pack tabs `rounded-xl` → `rounded-full`; group pending member row `rounded-xl` → `rounded-2xl`; community/[id] like+fork+activity-like `rounded-lg` → `rounded-full`.
- Group D — Hand-rolled empty states → shared `<EmptyState>`: dashboard "Tumbleweeds", itinerary "No itinerary yet", Discover community-empty (3 → 6 adopters).
- Group E — API + prompt hardening: EDITORIAL BACKBONE MAY → MUST swap on dietary/accessibility clash; CommunityTripCard day-preview responsive grid (`grid-cols-2` → `grid-cols-1 sm:grid-cols-2`).

**Landing + pricing visual unification (commits `a70084c` → `4785b67`)**
- New shared `<MarketingNav>` component at `src/components/MarketingNav.tsx`; mounted on `/` AND `/pricing` (was a stripped Back+logo shell). Anchor links use `/#all-in-one` and `/#how` so they navigate-and-scroll from /pricing AND hash-scroll from /.
- Hero copy rewritten: "✦ The group trip's planning OS — solo welcome too" + h1 "Plan it together. Pull it off as a group." Toolkit grid 8 emojis → Lucide icons in sky-50 chips with sky-800 strokes. Pillar 1-4 reordered: Group → Split Tracks → Day-Of → AI (was AI first). Cruise mode tile DROPPED (overselling what shipped); Group voting tile added. "split tracks" prose unbolded. "Everything inside" nav link → "All In One Place" with parity in the section eyebrow.

**Anonymous-app-access gating (commit `d0868ab`)**
- Brandon's directive: "no ways to get into the app without registering for the free version." Audit found two unguarded surfaces: `/trip/[id]/*` (the layout) and `/onboarding`. Both now redirect unauth users to login/signup with `?redirect=` preservation. Marketing/Discover stays public — funnel content, not app.

**Onboarding terminal fork screen (commit `95e294c`)**
- After signup + profile + persona, the wizard used to auto-route to /trip/new. Now lands on a new step 2 fork screen asking "What do you want to do first?" with three CTA cards: Build a trip (sky-700 primary) → /trip/new?firsttrip=true · Browse Discover → /discover · Look around → /dashboard. Profile saves on step 1→2 transition so the fork CTAs are pure navigation.

**AI model routing (commit `cbfe2e1`)** — cost-cutting per Brandon's brutal-honesty session
- `parse-receipt` Opus 4.7 → Haiku 4.5 (vision OCR; ~15x cheaper)
- `add-day` Opus 4.7 → Sonnet 4.6 (single day = one /generate-itinerary chunk; Opus was overkill)
- `generate-phrases` Sonnet 4.6 → Haiku 4.5 (translation, Haiku's sweet spot)
- `parse-transport` Sonnet 4.6 → Haiku 4.5 (structured extract)
- Untouched: generate-itinerary, suggest-activity, generate-layover, parse-itinerary (quality-critical).

**QA-pass P0 + quick wins (commits `388e11f`, `3c1f59c`)**
- Trip layout auth flash: was render-then-redirect (unauth users briefly saw shell); now renders centered "Loading…" until auth resolves.
- Auth cross-link `?redirect=` preservation: "Already have an account? Log in" + "Don't have an account? Sign up" + "Already confirmed? Log in" links now carry the redirect param forward (was dropping it, breaking the onboarding cold-start chain).
- Discover guest header `border-slate-200` → `border-zinc-200`; pricing billing toggle inactive contrast `zinc-500` → `zinc-600`; onboarding step-1 hint copy tweak; documented `?firsttrip=true` param semantics.

**The Versailles bug + verify-before-show (commits `49266ae`, `e1f1233`, `08b5db1`, `4e71b68`) — the biggest architectural shift**

Brandon caught a real correctness failure: a Paris trip's Versailles excursion-day listed La Jacobine ("59-61 Rue Saint-André des Arts, 75006 Paris") as the lunch venue, 17 km from the Palace of Versailles, with a fabricated "5 min walk, 0.2 mi" transport leg. Four stacked gaps:

1. `day.city` was set to the BASE city for day-trips (per the prompt rule), so the model lost the "we're in Versailles all day" anchor.
2. No prompt rule said "every activity's address must be in the day's city."
3. Transport-leg distance/duration was unchecked AI free text.
4. `verifyVenues` only checks open/closed status, not location.

**Layer 1 — prompt fix (49266ae):** Three edits to `generate-itinerary/route.ts`. `day.city` rule rewritten ("set to the EXCURSION city, not the base city"). DAY-TRIP EXCURSION RULE extended with three sub-rules: (a) set city correctly, (b) every venue MUST be in excursion city with explicit category-fallback if uncertain, (c) return leg unchanged. New Rule 23 — ADDRESS-CITY CONSISTENCY anti-hallucination guard — applies universally with "STOP and pick a different venue" instruction.

**Layer 2 — verify-before-show (e1f1233 + 08b5db1 + 4e71b68):** Brandon vetoed the UI warning badge approach ("verify before becoming an itinerary"). New helper `src/lib/places/verifyDayLocations.ts` exports `validateAndCorrectDay` + the smaller-grain `addressContainsCity` + `lookupPlacesAddress`. Pipeline: every emitted day/activity passes through Tier 1 (string check `address ⊃ day.city` with diacritic strip + St./Mt. expansion) + Tier 2 (Places API lookup, concurrency-capped at 6). On failure, the failing day/activity is re-prompted with explicit correction guidance, retried up to 2x. Status events stream to the client ("Fixing location issues on day 3…"). Hard fail emits a 500/SSE error with a clear human-readable message naming the venues; credits NOT charged on hard fail. Wrapped routes: `/api/generate-itinerary` (all 3 SSE emit sites — main, salvage, continuation), `/api/trips/[id]/add-day`, `/api/suggest-activity`. Group hub's "Suggest another" also fixed to pass `day.city` instead of `tripDestination`.

**Side product/strategy work (no code)**
- Strategic brutal-honesty session: positioning ("group OS" not "all-in-one"), surface-area cut suggestion (defer Cruise/Memories/Travel Map marketing), pricing simplification analysis (partner-discussion outline in `PRICING_TIER_COLLAPSE_OUTLINE.md`).
- Pricing tier collapse outline saved to repo root as `PRICING_TIER_COLLAPSE_OUTLINE.md` (decision: keep all four tiers for now per Brandon; document captures the case for $30→$35 Trip Pass, adds Travel Agent tier as a future B2B offering with separate landing page, confirms annual discounts already at 20%).

**New code artifacts**
- `src/components/MarketingNav.tsx` — shared landing+pricing header
- `src/lib/places/verifyDayLocations.ts` — verify-before-show helpers
- `src/lib/itinerary-preview.ts` — extracts day preview shape for community/founder endpoints (from earlier in the marathon)
- `PRICING_TIER_COLLAPSE_OUTLINE.md` — partner-discussion outline

**Verify next on live**
- Anonymous user → /trip/some-id/itinerary should briefly show "Loading…" then bounce to /auth/login?redirect=… (no shell flash).
- Onboarding cold start: register → profile → style → fork screen with three cards.
- Landing reads as group-OS (group voting tile, "Plan it together. Pull it off as a group.").
- Pricing page has the full landing header.
- AI quality spot-checks on the Haiku routes: receipt scan, phrasebook, transport parse, add-day.
- The big one: re-trigger a Paris+Versailles trip. Versailles day's lunch should be a real Versailles-area venue (palace café, La Flottille, Au Bonheur de Stéphanie, etc.) — NEVER a Paris venue. Watch for status events ("Fixing location issues on day N…") in the live build banner if the AI tried something wrong-city.

---

## Recently Shipped (May 29 evening — multi-admin + design consistency sweep + naming)

Third wave of the May 29 marathon. Brandon submitted a test support ticket and asked how multi-admin coordination would work — that question kicked off the rest of the session: 4 admins granted, ticket assignment + audit trail shipped, a full design-consistency audit + 3 rounds of fixes, and three naming/voice decisions. **9 commits.**

**Multi-admin support coordination**
- **3 new admins granted via SQL**: Abby Stark, Mallory Hixon, Luke. All four (incl. Brandon) are `is_admin = true` — `/admin/support` is reachable and ticket fan-outs hit everyone.
- **Schema:** `support_tickets.assigned_to` + `support_tickets.last_updated_by` (both uuid FK → profiles ON DELETE SET NULL). Indexed on `assigned_to`.
- **API:** GET returns `{ tickets, admins, callerId }` for N+1-free name rendering. PATCH accepts `assigned_to`, validates admin, stamps `last_updated_by = caller`, fires in-app notification to a new assignee when it's someone OTHER than the caller.
- **UI:** assignment badge per ticket ("Unclaimed" / "You" sky / first-name violet), "Assigned to me" filter chip, Claim/Reassign/Unassign buttons + an "Assign to…" select, "Last touched by X · Yh ago" footer, sky-tinted card border when assigned to caller. Sort: unassigned-first → priority → newest.
- **Bug caught during the multi-admin test (commit `ffb2db4`):** `ORDER BY priority DESC` was putting 'normal' BEFORE 'high' because Postgres sorts text columns lexicographically (`'h' < 'n'`). Flipped to ASC, captured in memory `text-enum-sort-gotcha` so it's not repeated for 3+-value text enums.

**Dashboard notification bell unified with itinerary (commit `577c008`)** — dashboard's custom 250-line bell ripped out + shared `<NotificationBell />` mounted; moved LEFT of "Add Someone" to match TopBar order.

**Design consistency audit + sweep — 3 rounds, ~20 items.** `.btn-primary` and `.input-field` (in `globals.css`) flipped amber → sky; Track A/B colors moved from violet/rose → sky/amber; itinerary activity card `rounded-xl` → `rounded-2xl`; dashboard hero `text-5xl` → `text-4xl`; eyebrow color standardized to `text-zinc-500`; TripCard padding `p-4` → `p-5`; Day-Of palette reconciled (slate-50 → parchment, rounded-xl → rounded-2xl, slate borders → zinc); auth Eye/EyeOff toggles added; Layover CTAs `rounded-lg` → `rounded-full`; Trip Builder Step 1 selected border green-700 → sky-700; pricing tier badges aligned to landing (Trip Pass "Most popular" amber, Explorer "Best value" emerald); new shared `<EmptyState>` component at `src/components/EmptyState.tsx` (adopted in Group chat / Group expenses / Prep My Pack).

**Naming + voice (commit `37893ae`)** — "Trips" wins over "Adventures" (dashboard stat, metadata, sidebar). Trip Builder wizard step labels normalized to short noun phrases (Who's In / Where To / When / Head Start / Vibe / Pace / Budget / Build Trip). Prep hub tabs pushed voicey ("Important Stuff" → "Heads Up", "Phrases" → "Speak Local"). "On My Radar" + Group hub "Wishlist" kept as intentionally different concepts.

**Mobile (1 fix)** — Trip Builder Step 1 group-type cards `grid-cols-1 md:grid-cols-2` → `grid-cols-2 md:grid-cols-4` (was eating ~480px stacked on iPhone SE).

**Schema this session** — `support_tickets.assigned_to`, `support_tickets.last_updated_by`, `idx_support_tickets_assigned_to`, `profiles.is_admin = true` for Abby/Mallory/Luke.

Commits this session: `85d1179` → `37893ae` (9 in order).

---

## Recently Shipped (May 29 — product polish + landing port)

Second wave after the May 29 QA pass. Brandon's site-review punch list: tier numbers shrunk, Help & Support flow built end-to-end, mobile audit + 6 high-confidence fixes, and the approved landing-page mockup ported to live. **4 commits.**

**Tier numbers + pricing copy alignment**
- Nomad travelers: 15 → 12 ("extended family/friends" range, not artificially small). Explorer travelers: 8 → 6 (most casual group trips ≤6). Nomad AI credits: 250 → 200 (8 builds; tighter margin, still very generous, ~2× Explorer for less than 2× the price).
- Single source of truth holds: `TIER_LIMITS` (src/lib/types.ts), `PRICING` (src/hooks/useEntitlements.ts), webhook `tierCredits()` helper all sync to the new caps automatically.
- Landing + pricing pages reconciled with each other and with reality:
  - Removed "Community support" from Free (not built; no community channel exists).
  - Removed "Flight price alerts" from Explorer + "Unlimited flight alerts" from Nomad (not built, not on near-term roadmap).
  - Surfaced Nomad's AI features (receipt scan, AI packing, AI phrasebook) on the landing card — they were already on /pricing but the landing card was a stripped older version.
  - Day-limit lines added to Explorer (10) + Nomad (14).
- `getTierFeatures()` (the single-source-of-truth that drives Settings + UpgradeModal) now skips the support line entirely when `supportLevel === 'community'` so the absence is consistent across surfaces.
- Upgrade prompt copy ("Nomad for 10 builds") updated to 8.
- Comparison row + FAQ on /pricing updated to "200/8 builds" math.

**"Days Abroad" → "Travel Days"** — Brandon's call: keep the total-days math (don't filter home-country trips), rename the label so it's not misleading when home-country trips are counted. Updated across `/world` stats card, share-card OG image, `/share/world` summary line, and the TripStoryModal stats slide. Internal `daysAbroad` variable kept (too many ripple sites; the user-facing string was the actual bug).

**Dashboard hero photo for trips outside the static map** — `destinationPhotos` only knows iceland/tokyo/barcelona/default. Strasbourg fell through to default = beach photo. Fix: prefer `nextTrip.coverImage` (already populated by TripCard's Unsplash flow + persisted in `trip_photos`) before the static map. Static map stays as fallback for trips whose cover hasn't loaded.

**Help & Support flow (medium-weight, full end-to-end)** — Single-admin (Brandon) initial version. Multi-admin coordination was added later the same day (see the May 29 evening session in CLAUDE.md).
- **Schema:** new `profiles.is_admin` boolean (default false; Brandon's account flipped true in the migration). New `public.support_tickets` table — id, user_id, email, name, subject, body, category (general|bug|billing|feature|account), status (open|in_progress|resolved|closed), priority (normal|high), user_tier, trip_id (FK trips), admin_notes, created_at/updated_at/resolved_at. CHECK constraints on enum columns. RLS: users SELECT/INSERT own; admins SELECT + UPDATE all via sub-select on `profiles.is_admin`. Indexes on `(status, created_at DESC)` and `(user_id, created_at DESC)`.
- **API:**
  - `POST /api/support/tickets` — user-facing. Auto-tags Nomad users `priority='high'` (the pricing-page promise). Fan-outs an in-app notification to every admin via the existing `notifications` table.
  - `GET /api/support/tickets[?status=…]` — admin-only, sorted priority desc then created_at desc, capped at 200.
  - `PATCH /api/support/tickets/[id]` — admin-only, status/priority/admin_notes. Stamps `resolved_at` on transition to 'resolved'; clears on re-open.
- **UI:**
  - Settings → new **Help & Support** tab (HelpCircle icon). Category select + 200-char subject + 5K-char body (with counter), Nomad users see a "your ticket is flagged priority" hint.
  - `/admin/support` — server-side gated on `profiles.is_admin` (redirects non-admins to `/dashboard`). Status-filter chips with counts. Tickets expand inline.
  - `NotificationPanel` wired to the new `support_ticket` notification type → routes to `/admin/support`.
- **Pattern to reuse:** future admin routes follow the same gate (`server-side getUser → SELECT is_admin → redirect non-admins`). Add new admins via `UPDATE profiles SET is_admin = true WHERE email = '…'`.

**Mobile responsiveness — 6 high-confidence fixes**
- Discover horizontal-rail scroll arrows (`-translate-x-1/2` pushed them off-screen on mobile) → `hidden md:flex`. Founder + Community rails both affected.
- Hotel + Flight modal grids in the itinerary: `grid-cols-2 gap-4` (6 instances) → `grid-cols-1 sm:grid-cols-2 gap-4`. iOS date pickers stop overlapping their labels.
- Activity Pulse (Yay/Nay table) tightened on phone: `gap-3 px-4` → `gap-2 sm:gap-3 px-3 sm:px-4`.
- Chat bubbles `max-w-xs` → `max-w-[75%] sm:max-w-xs`. Long messages scale with viewport on phone, lock to 320px on tablet+.
- Sidebar mobile hamburger `top-4 left-4` → `top-4 right-4` so it stops overlapping universally-left-aligned `<h1>`s.
- Discover 4-day preview cards `grid-cols-2 md:grid-cols-4` → `grid-cols-1 sm:grid-cols-2 md:grid-cols-4`.

**Landing page port (mockups/landing-page.html → src/app/page.tsx)**
- The live `src/app/page.tsx` was a stripped-down older version that had drifted from the mockup. Ported the richer approved design faithfully, preserving Next.js patterns (`next/link`, `next/image`, `useCallback` scrollTo) and the `PRICING` constants so price edits flow through automatically.
- **New sections live:** Problem statement → "All-in-one toolkit" (8 emoji-tagged tools + trip-type chip row) → 3-step How It Works → 4 feature pillars → simplified pricing strip → Objection handler → 5-row FAQ → Final amber CTA → simplified footer.
- **Pricing strip is intentionally minimal** — 4 short-blurb cards funneling to /pricing for the detailed comparison. **DO NOT** add detailed feature lists back to the landing card.
- All paid CTAs route to `/pricing` (where Stripe checkout lives); free CTAs route to `/auth/signup`. No Stripe wiring changed.

**Schema this session**
- `profiles.is_admin boolean NOT NULL DEFAULT false`. Brandon's account flipped true in the same migration.
- `public.support_tickets` table with full enum CHECK + RLS + indexes.

**Commits**
- `57665ae` Tier numbers + landing+pricing copy + Strasbourg photo + Days Abroad→Travel Days rename
- `e37c705` Support flow (schema + API + Settings form + admin inbox + notifications wiring)
- `411c865` 6 mobile high-confidence fixes
- `f8ab215` Landing page port

---

## Recently Shipped (May 29 QA pass)

Big QA-driven session — multi-agent code audit across 6 surfaces (auth, Trip Builder, itinerary, group hub, prep/layover/discover, billing) followed by **10 commits** clearing the resulting punch list: **3 P0s + 11 P1s + 7 P2s + 3 follow-ups**. No live-site verification possible (no local `.env.local`, no browser automation), so everything is code-level + `tsc` clean. See the "Verify * (live site)" items in `CLAUDE.md` Polish & UX for what still needs eyeballs.

**Build credit accounting refactor — 1 build = 1 charge regardless of chunks**
- Prior behavior: every `generate-itinerary` chunk charged 25 credits, so a 4-7 day free single-city trip 402'd on chunk 2 and left a partial 3-day skeleton. The Trip Pass pool (50 cr) was also under-built for 6-7 day trips.
- New `trips.build_credits_charged_at` column. First chunk wins an atomic claim (`UPDATE … WHERE … IS NULL RETURNING`); subsequent chunks see the claim set and skip `checkAiCredits` + `incrementAiCreditsUsed` entirely (`source: 'exempt'`). Multi-city now also charges once total, regardless of city count.
- Regenerate (`?fresh=1`) sends `freshRebuild: true` on its first chunk only (one-shot `sentFreshRebuild` in the build effect); server clears the prior claim before re-claiming.
- Failure modes revert the claim so the user can retry: `checkAiCredits` 402-denied and AI-produced-no-days (`dayIndex === 0`).
- Trip Pass pooling unaffected — pooling lives inside `checkAiCredits`, still runs once for the claim winner. Durable contract documented in `CLAUDE.md` → Code Conventions → "Build credit claim semantics".

**Stripe webhook hardening (4 P1s in one commit)**
- **Cancel-at-period-end visible:** `customer.subscription.updated` with `cancel_at_period_end=true` persists `profiles.subscription_cancel_at`. `setTier` and `subscription.deleted` clear it. Powers future UX + defensive cron if the deletion event ever fails to fire.
- **Transient `unpaid` no longer downgrades:** the prior `unpaid` branch zeroed `ai_credits_used` to the free limit via setTier's downgrade-cap; when Stripe's smart-retry recovered, the user had a full fresh paid pool to spend twice. Only `canceled` downgrades now; `subscription.deleted` is the trust signal for final cancellation.
- **`TIER_CREDITS` synced to `TIER_LIMITS`:** local webhook constant drifted (Nomad 300 vs 250, Free 10 vs 25). Replaced with `tierCredits()` helper reading `TIER_LIMITS` — one source of truth.
- **Atomic AI credit increment:** new `increment_user_ai_credits` / `increment_trip_pass_credits` SECURITY DEFINER RPCs replace the read-baseline-then-write pattern. Parallel calls now serialize on a row lock instead of clobbering each other to net +cost.

**Auth + abuse mitigation**
- **Reset-link wrong-account guard:** `update-password` page trusts ONLY the `PASSWORD_RECOVERY` auth event, not `getSession()`. Previously a reset link clicked in a browser logged into a different account would rewrite that account's password via `supabase.auth.updateUser`.
- **`/api/auth/send-reset-email` rate limited:** new generic `public.rate_limits` table + atomic `consume_rate_limit` RPC. Dual gates (5/hr per IP, 3/hr per recipient) before touching Supabase / SendGrid. Recipient-limit failures still return 200 success so attackers can't probe per-inbox state. Basic email-format validation rejects junk pre-DB.
- Helper at `lib/supabase/rateLimit.ts` wraps the RPC + `x-forwarded-for` parsing for reuse on future unauth endpoints. Fail-open on Supabase outage.

**Trip Builder gates**
- **Multi-city paid-tier gate (real this time):** client renders `LockBadge` + `UpgradeModal` on the "Add another destination" button for free tier; server rejects `destinations.length > 1` from `userTier === 'free'` with 403 `MULTI_CITY_LOCKED` so DevTools can't bypass.
- **Build-button re-entrancy guard:** `handleGenerateItinerary` sets `isBuilding` — rapid clicks (the skeleton POST + router.push window is ~500ms async) can no longer fire twice and create orphan skeleton trips. Spinner copy + reset on the sessionStorage failure path.
- **fetch-reference SSRF hardening:** literal denylist expanded (cloud-metadata hostnames, CGNAT, IPv6 link-local, IPv4-mapped IPv6). New `resolvedHostIsSafe` does `dns.lookup` and rejects any A/AAAA in a blocked range — attacker-DNS pointing at RFC1918 is caught pre-fetch.

**Itinerary persistence**
- **Durable delete:** the 5s undo timer no longer holds the PATCH; deletion fires immediately on click. Closing the tab during the undo window can't lose the deletion anymore. Undo re-inserts AND re-persists.
- **Vote rollback targeted:** both `.catch` paths in `handleVote` now revert only THIS activity's counts, not a blanket replay of day-state-at-click-time. A parallel vote on a different activity isn't wiped out by another vote's failure. `priorState` documented as per-invocation closure.
- **Print + Day-Of localStorage scoping:** stopped falling back to the global `generatedItinerary` key on empty Supabase reads for UUID tripIds — a user with multiple trips no longer sees Trip B's days inside Trip A's print/day-of view. Demo path (non-UUID id) still uses localStorage.
- **MapView removed:** the pseudo-grid pins were never real geocoded coordinates, and with `NEXT_PUBLIC_GOOGLE_MAPS_KEY` set the disclosure badge was suppressed — users were seeing a mock that looked real. The Route button at the day header already opens a real Google Maps multi-stop route from the day's actual activity addresses (10 waypoints), which is strictly better. Component file retained for future re-introduction once activities are server-geocoded.

**Group hub — invite/vote race + UX**
- **`vote_responses` constraint reshuffled:** dropped `UNIQUE (vote_id, voter_name)` (two members with the same display name silently lost one vote; renamed user could double-vote). Added `UNIQUE (vote_id, user_id, option_id)` which serves both single- and multi-pick. Routes treat `23505` as benign no-op success on rapid-double-click races.
- **Single-pick race fix:** new `cast_single_pick_vote` RPC takes `FOR UPDATE` on the parent `group_votes` row and runs DELETE+INSERT inside the lock. Concurrent pick-switches from the same user serialize instead of leaving two rows.
- **Invite-send traveler-cap pre-check:** new `getTripTravelerCap` helper in `tripAccess`. Email + SMS invite routes refuse to issue a token when `currentMembers + pendingInvites >= cap`. Recipients no longer hit a 403 dead-end on join after a SendGrid/Twilio send is already paid for.
- **`invite/sms` validates phone BEFORE DB write** — previously inserted a `trip_invites` row with an empty phone, then returned 400, leaving orphan tokens.

**Domestic-trip detection for non-US homes**
- `isHomeCountryTrip` was doing `destination.toLowerCase().includes(homeCountry.toLowerCase())`, but `home_country` is stored as the canonical display name ("United Kingdom") while destinations are short forms ("London") — substring never matched. Every non-US user got an international "Don't Forget" seed + a visa card for their own country.
- New: `canonicalizeCountry` normalizes input through `COUNTRY_ALIASES`; first try matches via `destinationToCountry` (comma-separated dests); falls back to alias-substring match for bare cities. UK home correctly recognizes "London" / "England" / "Scotland" / etc.

**Other P2 polish**
- **Trip Pass purchase membership check:** `stripe/checkout` admin-checks buyer is organizer or trip_member; UUID-validates `tripId` before Stripe metadata. Closes the "buy a pass for someone else's trip" path.
- **parse-transport billing:** credit charge moved to right after the Anthropic call resolves so the 422 INCOMPLETE_PARSE path no longer bypasses billing (free Sonnet calls via garbage text).
- **Expense PATCH `amount` recompute:** patching `lineItems` now recomputes `amount = sum(lineItems)`. Who-Owes-Who math reads `amount`; prior drift silently under-billed splits.
- Settings "Cancel" restores `name` from `authProfile` (full DB name) instead of first-name-only. Onboarding profile-save: 3 retries + `tripcoord_pending_profile_save` flag. `activityBookingUrl` returns null without a city. Discover "Personalize with AI" link carries vibes + first season tag. Demo wishlist un-heart skips `allItems` removal so re-hearting from /discover later in-session repopulates.

**Schema (all applied via MCP, types regenerated)**
- `vote_responses` constraint swap.
- `trips.build_credits_charged_at` timestamptz.
- `profiles.subscription_cancel_at` timestamptz.
- `public.rate_limits` table + RLS + `consume_rate_limit(text, integer, integer)` RPC.
- `increment_user_ai_credits(uuid, integer)` + `increment_trip_pass_credits(uuid, integer)` RPCs.
- `cast_single_pick_vote(uuid, uuid, text, uuid)` RPC.
- All RPCs `SECURITY DEFINER`, EXECUTE restricted to `service_role`.
- Fixed a pre-existing CLAUDE.md instruction that pointed types writes to `src/lib/database.types.ts` — every import actually resolves to `src/lib/supabase/database.types.ts`. Updated all references.

**Audit items deliberately not addressed (with rationale)**
- `tierResolved` follow-up — bug class closed (`memory/project_tier_resolved_followup.md`); audit re-flagged but the raw `tier` return is paired with `tierResolved` at every consumer.
- MapView mock-vs-real coordinates — chose option C (hide rather than fix). The "Route" button gives users a real geocoded multi-stop Google Maps view, making the in-app mock strictly redundant.

Commits this session: `43ae9b3` → `2314849` (10 in order). See `git log --grep="^QA pass"` for the full set with messages.

---

## Recently Shipped (May 9 session)

Big session — fork-recovery, Tier 1 build durability, photo likes/comments full backend, two QA passes, polish + dead-code sweep. Roughly 30 commits on master.

**Build durability (Tier 1)**
- Server-owned `AbortController` replaces `request.signal` in `generate-itinerary/route.ts` so a closed tab no longer aborts the Anthropic stream — the function runs to its natural end (or `maxDuration`).
- New `lib/supabase/persistGenerationDays.ts` snapshot-writes the full `days` array on every emitted day. Fire-and-forget; race-safe because every write is a complete superset. Final write is awaited synchronously before sending `done`.
- `recoverTruncatedArray` (was dead code) now wired as a safety net on `stop_reason=max_tokens`. Salvages partial-buffer days that the streaming parser would otherwise drop.
- Diagnostic log line for first-pass stop now includes `partialDayBuffered` / `bufferLen` / `braceDepth` for fast Vercel-log triage.
- Token floor scales with discovery priority count — Rule 19 + food/nightlife/shopping no longer truncates mid-day-3. Per-chunk floor: 36000 when 2+ discovery priorities selected.
- Continuation prompt explicitly forbids day-1 restart; dropped `[…]` wrapper directive that was confusing the model.
- Gap-fill `prevContext` refreshed at the start of every retry from `aiDaysRef`, not just after non-zero retries.
- 3s overloaded backoff before first continuation pass when first-pass tripped overloaded.
- Resume detection added to itinerary page's live-build effect: fetches `/api/trips/[id]` before generating, narrows segments to the missing tail, short-circuits if everything's already persisted.

**Photo likes + comments (full backend)**
- New tables: `photo_likes`, `photo_comments` (RLS open-SELECT, owner-only INSERT/DELETE; both in `supabase_realtime`, REPLICA IDENTITY FULL). `photo_comments` got `updated_at` for "(edited)" indicator.
- Routes: `POST/DELETE /photos/[photoId]/like`, `GET/POST /photos/[photoId]/comments`, `PATCH/DELETE /comments/[commentId]`, `GET /photos/[photoId]/stats` (surgical refetch endpoint for cross-user like changes).
- `/photos` GET augmented to return `likeCount` / `commentCount` / `viewerLiked` per photo via two batched aggregate reads.
- UI: real Like toggle (filled rose heart, optimistic with rollback), inline comment thread with edit/delete on own comments, custom in-app delete confirmation modal (no `window.confirm`), Realtime subscription on the open photo for cross-user sync, 500-char counter on inputs.
- Comments GET joins `profiles` to return live commenter names (renaming in Settings flows through to old comments). `author_name` snapshot kept as fallback.

**Default travel partner (#9)**
- `profiles.default_partner_id` column + Settings UI (email lookup, validates against self-pair + unknown emails). New trips auto-add the partner as a member at create time in `/api/trips/save` POST. New trips only.

**Editable expense line items (#14)**
- Inline expand on expense rows reveals line items. Edit mode with description + amount inputs, add/remove rows, optimistic save via extended PATCH `/expenses` (with server-side validation stripping empty/invalid rows).

**Discover + community polish**
- Seasonal-collection match bug fix (first-segment matching for "Santorini, Greece" vs "Santorini") + empty-state chips for catalog-missing destinations.
- Privacy: community grid + community detail render organizer first-name only.
- Auth gate fix: `requireAuth` now waits for `currentUser.isLoading` so logged-in users no longer get bounced to login during the auth-resolve window. Login flow honors `?redirect=` with same-origin whitelist.
- On My Radar source icons: globe (has links) / pencil (manual entry) on each wishlist card.
- Wishlist persistence: both halves (`/discover` heart + `/wishlist` re-save toggle) now POST/DELETE to `/api/wishlist` instead of being local-only.

**Truncation root-cause fixes from PDF testing pass**
- 11 critical-launch items shipped from the 5/9 testing PDF including: sidebar text-wrap defensive fix, restaurant dedup (separate `excludeRestaurants` field with stronger prompt rule), regenerate error fallback nav (`?redirect=` honoring), Paid By dropdown regression, custom-split UX clarity (live total preview), reaction realtime null-handling fix, group pack realtime (added `packing_items` to publication + RLS SELECT policy), photo upload reorder + mandatory day/location, photo upload progress 88% stuck (timeout race on image preload), photo Like/Comment fully wired (was disabled "coming soon"), Trip Builder organizer pace question, theme park prompt rules (1 park/day max, opening-time start, kids midday rest), Rule 19 making per-day discovery arrays mandatory on first emission.

**`'You'` API fallback purge**
- `messages`, `auth/me`, `group-votes` routes no longer persist literal `'You'` / `'Unknown'` when profile resolution hiccups — fall through to email-local-part → "A traveler". Group + Day-Of pages default `currentUserName` to `''` (auth-still-loading) instead of `'You'`. Backfilled existing `trip_photos.uploader_name = 'You'` rows from current profile names. Photo filter switched to `user_id`-based (with display name resolved from group members) so "Mallory" and "You" no longer show as two filter entries for the same person.

**Day-Of crew renders real members**
- `dayof/page.tsx` now fetches `/api/trips/[id]/members`. Previously the non-mock branch hardcoded just the current user.

**Polish + a11y**
- 6 primary CTA color-drift instances normalized to `sky-800 / hover:sky-900`.
- Date formatting: 7 call sites replaced bare `.toLocaleDateString()` with explicit `'en-US', { month: 'short', day: 'numeric' }`.
- Modal close buttons (UpgradeModal, ParseTransportModal) get `aria-label="Close"`.
- View-mode toggles on Trips page: `aria-label` + `aria-pressed`.
- `currentDayData` fallback hardened: `EMPTY_DAY` constant with empty arrays instead of `{} as ItineraryDay`.
- Error copy normalized: "Could not save…" → "Couldn't save…", "Vote didn't save" → "Couldn't save your vote. Please try again.", em-dash variants of "Something went wrong" replaced with periods.

**Schema (all applied via MCP)**
- `photo_likes`, `photo_comments` tables (with `updated_at` on comments).
- `profiles.default_partner_id` uuid column + index.
- `packing_items` added to `supabase_realtime` publication + REPLICA IDENTITY FULL + permissive SELECT policy (had RLS enabled with no policies, silently breaking the Realtime sub).
- Backfill of `trip_photos.uploader_name` from current profile names where the literal `'You'` fallback was saved.
- `database.types.ts` regenerated.

**Dead-code sweep (2026-05-09)**
- Deleted 4 unused component files: `ActivityCard.tsx`, `ChatBubble.tsx`, `VoteCard.tsx`, `ExpenseRow.tsx` (~700 LOC). Each was imported in `group/page.tsx` but never referenced.
- Removed `AvatarStack` export from Avatar.tsx (also unused).
- Stripped `MOCK_DETAILS` constant from `/api/places/details/route.ts` (~200 LOC; never referenced).
- Cleaned out trip/new old loading-overlay leftovers (`mockDestinations`, `handleSurpriseMe`, `progressPercent`, `destinationPhotos`, `getLoadingPhoto`, `daysReceived`, `isGenerating`).
- Cleaned out prep page solo-pack remnants (`addPackItem`, `generatePackingList`, `newPackItem`, `newPackCategory`, `packingGenerating`/`Error`/`Loaded` state).
- Removed `clearAiItinerary` (defined but never called) and `hasSplitTracks` (computed but never read) from itinerary/page.tsx.
- Total: ~970 LOC removed, no behavior change.

**Memory updates** — `project_build_durability.md`, `project_tier2_prep.md`, `feedback_launch_philosophy.md` added to track Tier 2 prep + Brandon's "clean over fast" launch philosophy.

---

## Recently Shipped (May 8 session)

- **Server-side AI credit enforcement** — was a launch-blocker; resolved. Shared helpers `checkAiCredits` / `incrementAiCreditsUsed` in `lib/supabase/aiCredits.ts`. Two-phase: gate before, charge after success — failed AI calls don't burn credits. Wired into all five AI routes: `parse-itinerary`, `parse-transport`, `suggest-activity`, `add-day`, `generate-itinerary` (charges in the SSE `start()` callback right before `done` event, only when `daysEmitted > 0`). Free / explorer / nomad enforced; `trip_pass` exempt with a `TODO(launch)` to wire into per-pass billing on `trip_passes.ai_credits_used`. Race acceptance: two simultaneous calls allow one over-charge — acceptable on numeric caps of 10–350. Added `add_day: 2` to AI_CREDIT_COSTS (commit `7eafaf5`).
- **`parse_itinerary` cost bump 1 → 3 credits + large-PDF warning** — at 1 credit, parse_itinerary was 5–10× underpriced relative to other actions because PDFs ship as document blocks (~10–20K input tokens before output, ~$0.10–0.15 per parse). 3 credits brings cost-per-credit (~$0.04) in line with `add_day`. Free tier (10/mo) gets ~3 parses; explorer ~33; nomad ~116. Soft warning when any loaded PDF exceeds 2 MB — doesn't block, explains truncation/cost risk and offers paste-text alternative (commit `4497cec`).
- **Upload modal overhaul ("Bring a Trip In")** — three-part rework so free / group users can use the collaboration features without running the AI parser. (1) Blank-trip path: a "skip — create a blank trip and invite your group" link goes to a form (destination, optional title, optional dates, traveler count) that saves N empty days (one per calendar day, or a placeholder when dates are missing). No AI cost. (2) Preview-before-save: the AI parse no longer commits — user sees day count / activity count / sources, can edit destination / dates / group size, and is warned about destructive overwrite when uploading INTO an existing trip. (3) Group-invite CTA on the done step: "Copy invite link" (writes /join/[id] with feedback) + "Open the group page" buttons; visible for both blank and parsed trips. Modal title reframed: "Upload Itinerary" → "Bring a Trip In". Hardcoded `budget: 5000` and `groupSize: 1` defaults removed — user is asked, defaults are 0 budget / 2 travelers (commits `f2d6a1f`, `c0623f5`).
- **Upload modal cleanup** — cruise auto-detect: AI returns `isCruise` + `cruiseLine` in meta and the modal skips the manual cruise-check step when AI is confident. Multi-PDF warning: only the first PDF gets sent as a document block; the rest were silently dropped, now there's an inline amber banner. Deleted dead `/trip/[id]/upload` redirect (commit `c0623f5`).
- **Layover Planner day-pass shortcuts** — two new strips on the layover results page. (1) Lounge day-pass strip at the top of the suggestions list, always visible: links to Priority Pass + LoungeBuddy (LoungeBuddy uses its public per-airport URL pattern `/airports/<code>`). (2) Hotel day-room strip: ResortPass + DayUse + DayBreakHotels. For 6+ hr layovers it sits inside the existing "Rest & Recharge" section above the AI's hotel picks; for 3–6 hr layovers it gets its own "Hotel Day Rooms" section since the AI doesn't generate hotelSuggestions at that tier; hidden under 3 hr. AI prompt also nudges medium / long tier suggestions to mention "often bookable via …" inside `bookingTip` — hedged because day-pass coverage is patchy outside major markets. All links plain (`utm_source=tripcoord` only); affiliate IDs swap in via env vars later (commit `00e6851`).
- **Loading skeletons + real-trip photo bug fix** — Group page's existing `dataLoading` state was wired but no UI consumed it; now header + tab content render skeletons during the initial parallel fetch instead of "0 people on this trip" + an empty tab. Memories page got a skeleton grid + empty-state card. **More importantly**, real-trip photos previously never rendered: `itineraryDays` was hardcoded to `[]` for non-mock trips, so `photosByDay` was always empty and there was no fallback path. Now `itineraryDays` loads from `/api/trips/[id]`, members load from `/members`, and a fallback "All Photos" / "More Photos" section catches photos that don't bucket under a known day (commit `ee477f2`).
- **`as any` audit (5 commits)** — 56 occurrences down to 3 (all idiomatic Lucide icon-component types). Latent bugs surfaced and fixed: (1) Group page's `localExpenses.lineItems` was typed as `string[]` but the data is `{ description, amount }[]` — the optimistic add-expense flow was shoving `ScannedReceipt.items` straight into the typed array. (2) Two for-of loops over `['shared', 'track_a', 'track_b']` inferred `track: string`, then indexed `day.tracks[track]` — implicit-any subscript. Tightened to `as const`. (3) New "add to itinerary from vote" flow built an Activity literal with `track: 'shared'` (inferred string, not the union). Also fixed: print page's `meta?.title ?? days[0]?.title` (ItineraryDay has no title field — dead fallback); discover-wishlist API's `select('vote, saved')` then reading `existing?.item_data` (item_data was never selected); discover-wishlist DB schema mismatch where `vote` column is non-nullable but the code could push null. Commits `87f1a27`, `45b3324`, `c5871d8`, `e05cbae`, `7f03618`.
- **Trip Story real-data implementation** — `TripStoryModal` now fetches `trip_members` / `trip_photos` / `group_messages` on mount for real trips and threads them into Cover, Numbers, Crew, Laughs, and Photos slides. NumbersSlide swapped the expense-driven "Per Person $" stat for "Photos Taken" so it works without an expense feed. LaughsSlide picks the top 3 most-reacted messages and falls back to an empty-state card when chat has no reactions. Empty slides drop out of the deck. Yearly mode still gated. Also fixed a pre-existing dead-code mismatch where `TopPicksSlide` rendered as `id: 'toppicks'` but the editor def was still `id: 'budget'` so the slide never appeared in real decks (commit `3d4ebc0`).

### Open strategic decisions (deferred this session)

- **Tier pricing review** — Brandon's call (2026-05-08): defer pricing changes for now; revisit after launch-cohort usage data. Analysis from this session: at current prices (Trip Pass $30, Explorer $7.99/mo, Nomad $14.99/mo), worst-case per-tier AI cost (post-bump) is ~$1.20 / ~$4 / ~$14. Trip Pass margin ~92% (great); Explorer ~56% realistic; Nomad ~42% realistic / 2% worst case (dangerous on power users). Recommended later: Explorer $9.99 / Nomad $19.99 (annual rates would absorb the existing prices as the "discount"), or alternately drop credit caps. Current parse_itinerary at 3 credits already rescued Nomad worst case from $42/mo of AI cost. Don't revisit without real usage data.

## Recently Shipped (May 7 session)

- **Sidebar redesign — unified Day Highlights** — collapsed five separate sidebar sections (Photo Spots / Foodie Finds / Nightlife Guide / Shopping Guide / per-priority Highlights) into one mixed-category section with icon-coded items. Activity-shaping priorities (nature/culture/beach/history/sports/etc.) no longer appear as sidebar lists — they're woven into the daily activities themselves (commit `0088024`).
- **Client-side chunking for long trips** — escapes the Vercel 5-min function ceiling. Long single-city trips and long-city legs of multi-city trips are now chunked into 3-day pieces, each its own HTTP request with its own 300s budget. The infrastructure already existed for multi-city via `streamSegment()` — extended to within-city. `sameCity` + `totalTripDays` flags drive prompt phrasing for arrival/departure logistics on chunk boundaries (commit `306d2e6`).
- **TRIP POSITION fix for chunk 1** — chunk 1 of long single-city trips previously skipped the "not the trip's final day" framing because the gate required `sameCity`. Widened to fire whenever `totalTripDays` is set; "not first day" framing still gated on `sameCity` to avoid contradicting the multi-city CONTINUITY block (commit `1c1355b`).
- **Anthropic prompt caching** — extracts the 14 priority guidance blocks (food/nightlife/photo/etc.) into a separate cacheable system block. After the first call seeds the cache, every subsequent call within the 5-min TTL reads the prefix from cache (~90% cheaper, much faster). Cache hit/miss surfaced in `[generate-itinerary] cache:` log lines (commit `9244b82`).
- **Photo upload silent-failure fix** — Memories page was creating its own Supabase browser client, fighting the singleton's auth lock, losing the session, and silently failing RLS on `trip_photos` insert. Switched to the singleton in 4 files (memories, settings, onboarding, group). Photos that genuinely fail to upload now surface a banner instead of vanishing on refresh (commit `1c7b032` + earlier batch).
- **Per-day sidebar conversion** — `nightlifeHighlights` / `shoppingGuide` / `priorityHighlights` moved from trip-wide 5-7 to per-day 2 anchored to that day's neighborhoods. `foodieTips` 3-4/day → 2/day. `photoSpots` capped at 2/day. Server stops stripping these to trip meta; itinerary page reads from `currentDayData` with `aiMeta` fallback for old trips.
- **Bundles 1–7 error handling sweep** — realtime subscription cleanup leak, hotel delete rollback, trip edit error surfacing, Stripe checkout/portal `res.ok` checks, role change feedback, emoji reaction rollback, mark-paid partial-failure detection, expense add rollback, receipt scan error context, replace-Nay rollback, multi-city per-segment save toast, defensive null guards. `voteError` and `suggestError` consolidated to `actionError`.
- **API auth + model fixes** — souvenirs POST now uses `requireTripAccess`; parse-receipt model bumped from retired `claude-opus-4-5` → `claude-opus-4-7`; SMS invite surfaces Twilio error code; SendGrid retry handles non-JSON 5xx; members POST documented as intentionally open share-link (invite-token system tracked above as future work).
- **Trip Builder wires** — `groupSize` added to API payload (was collected but never sent); `flexibleDates` toggle wired into a new `flexibleDatesText` prompt branch; orphan `difficultyPrefs` state removed; "Local insider mode" → "I've been here before — focus on hidden gems" with reframed prompt that overrides Rule 11's iconic-landmarks requirement.
- **Demo Iceland banner removed** — hardcoded "Demo itinerary · Iceland · Personalized just for you" was leaking onto real trips; deleted entirely.
- **TripStoryModal mock-data gate** — real trips and Year-in-Review mode now show a "Coming soon" placeholder instead of leaking hardcoded "Marcus tried to pronounce Þingvellir" content. Mock trips still get the full demo experience (commit after `1c1355b`). **Updated 2026-05-08:** trip-mode gate fully removed — real trips fetch members/photos/messages from the API and render the slide deck with their own data; yearly mode still gated.
- **Schema trim** — `priorityHighlights` items dropped per-item `type` (redundant with parent priority key) and `description` tightened to one sentence. Continuation prompt schema cleaned up — inline `(EXACTLY 2 per day)` parentheticals moved into the Rules block where they belong (commit `2cd0c7d`).

## Recently Shipped (Earlier sessions)

- **Generation reliability hardening** — Anthropic `overloaded_error` / 5xx retry on first-pass open + mid-stream fallthrough into continuation loop; `MAX_CONTINUATIONS` 4→6; two-zero-pass guard (commit `cab5bab`)
- **Role-based trip writes** — `getTripRole` helper; any member can save vote/day edits, only organizer + co-organizer can edit destination/dates/meta (commit `cab5bab`)
- **Live-build SSE itinerary generation** — trips generate live into the itinerary page; skeleton mode prevents old data bleed
- **Multi-city itinerary with day-5 fix** — city headers, per-city segments, Day 5 continuation bug fixed
- **Add Day feature** — modal to insert AI-generated or blank day at any position; renumbers all subsequent days
- **Pack This tab rebuilt** — Group Pack / My Pack / Gifts sub-tabs with Supabase-backed souvenir items
- **Expense tracking + group chat** — Who Owes Who tab, Realtime chat, emoji reactions
- **Stripe integration** — checkout, portal, webhook, tier update pipeline all working (test mode)
- **Realtime + notifications wired end-to-end** — chat + vote notifications, notification bell deep-links to chat/votes/join, SELECT RLS published on collab tables (commits `1f8ee5d`, `773576f`, `da7fbd0`, `fe810a5`)
- **Avatar uploads persisted to Supabase Storage** — survives navigation, propagates across trips (commit `8953a0a`)
- **4–5 day cutoff fix in generation** — segment-aware final-day prompt + client gap-fill retry resolves the truncation bug (commits `88b248d`, `d6081bf`)
