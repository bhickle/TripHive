# Pre-Launch QA — TripCoord

> Generated 2026-05-11 by automated audit (build + API routes + security/RLS + accessibility + performance + DB integrity).
> Out of scope: real browser click-through, payment-flow testing with live cards, multi-user realtime smoke, mobile/iOS Safari quirks, email/SMS delivery verification.

---

## Build status

- `npx tsc --noEmit` — **clean** ✅
- Local `next build` — fails only because `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` aren't set in the local shell. Vercel has them; this is an environment issue, not a code defect.

---

## P0 — Launch blockers

> Real exploits, data leaks, or money-leakage paths. Fix before public launch.

### Security / auth

- **[P0-1] `/api/trips/save` POST accepts anonymous writes via admin client.** `src/app/api/trips/save/route.ts:55-91`. If `getUser()` returns null, the route proceeds with `userId = null` and writes to `trips` + `itineraries` through `createAdminClient()` (RLS-bypassing). Anon bots can poison either table. Fix: `if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });` before any insert.

- **[P0-2] `/api/integration-vote` POST has no auth.** `src/app/api/integration-vote/route.ts:24-77`. Open Airtable spam vector — anyone can fill the integration-vote base with arbitrary text. Add `requireAuth()`.

- **[P0-3] `/api/og-preview` POST is unauthenticated and uncapped.** `src/app/api/og-preview/route.ts:25`. SSRF blocklist is in place, but anyone can use the endpoint as an HTTP-fetch proxy. Add `requireAuth()` + per-user rate cap.

- **[P0-4] `discover_wishlist` SELECT policy is `USING (true)`** — any authenticated caller can read every other user's wishlist votes across trips. Policy `Trip members can read wishlist`. Tighten to membership scope (`trip_id IN (SELECT trip_id FROM trip_members WHERE user_id = auth.uid())`).

- **[P0-5] `packing_items` SELECT policy is `USING (true)`** — same cross-trip leak. Note: `packing_items` is in the realtime publication so this also affects realtime subscriptions cross-tenant. Scope to trip membership.

- **[P0-6] `trip_invites` SELECT policy is `USING (true)`** — any authenticated caller can enumerate the whole `trip_invites` table, including unredeemed tokens. Acceptance only requires the token, so token disclosure = backdoor access. Tighten by exposing tokens only via the server-side admin lookup; clients should never read `trip_invites` directly.

### AI credit bypass

- **[P0-7] `/api/generate-packing` and `/api/generate-phrases` skip auth on the demo path.** `generate-packing/route.ts:23-39`, `generate-phrases/route.ts:165-184` — `try { auth... } catch { /* allow demo */ }`. Unauth callers can burn Anthropic spend. Tighten: require auth, then key on tier to allow demo content separately.

- **[P0-8] `parse-receipt`, `generate-hotels`, `generate-discover`, `generate-layover`, `generate-packing`, `generate-phrases` skip `checkAiCredits`.** Six AI routes outside the credit ledger. The five-route enforcement work from 2026-05-08 only covered the high-cost routes; these are still open. Wire all six into `checkAiCredits` + `incrementAiCreditsUsed`.

---

## P1 — Real bugs / pre-launch polish

### Database integrity

- **[P1-1] 24 FKs missing backing indexes** — slow joins + slow cascade deletes. Most impactful (high-traffic columns): `expenses.trip_id`, `group_messages.trip_id`, `trip_photos.trip_id`, `trip_members.user_id`, `packing_items.trip_id`, `notifications.trip_id`, `vote_options.vote_id`, `vote_responses.option_id`, `trip_invites.trip_id`, `trip_passes.trip_id`. Add `CREATE INDEX CONCURRENTLY idx_<table>_<col> ON <table>(<col>)` for each. Full list in the audit query output.

- **[P1-2] 3 SECURITY DEFINER functions with mutable search_path** — search_path injection risk. `set_initial_credits_reset_at`, `trip_cities`, `set_updated_at`. Fix: `ALTER FUNCTION <name> SET search_path = pg_catalog, public;`

- **[P1-3] `public.handle_new_user()` is SECURITY DEFINER and callable from anon/authenticated.** It's a trigger function but exposed via `/rest/v1/rpc/handle_new_user`. Revoke EXECUTE from anon + authenticated, or convert to SECURITY INVOKER.

- **[P1-4] Public buckets `avatars` + `trip-photos` allow listing.** SELECT on `storage.objects` is broader than needed for public-URL access. Tighten policy to `bucket_id = X AND owner = auth.uid()` for own-file ops, drop the broad listing policy.

- **[P1-5] `activity_likes` / `itinerary_likes` / `city_geocache` full-row SELECT exposed.** Likes are user-visible signals, but `user_id` exposure lets anyone enumerate any user's like history. Either drop `user_id` from the policy (return aggregate counts only) or scope to trip membership for the trip-scoped tables.

- **[P1-6] Supabase Auth leaked-password protection is OFF.** Free upgrade — enable HaveIBeenPwned check in dashboard.

### API routes

- **[P1-7] `/api/auth/me` DELETE has no re-auth step.** Any signed-in user can call `auth.admin.deleteUser` on their own account without password/email confirmation. Add a re-auth challenge (re-enter password) before the destructive call.

- **[P1-8] `/api/unsplash/photo` + `/api/unsplash/track` have no auth gate.** Quota-drainable from outside the app. Add `requireAuth()`.

- **[P1-9] `/api/community/[id]` GET activity_likes query is unbounded.** `route.ts:46` — `select('*').eq('trip_id', ...)` with no `.limit()`. A viral public template with 10k+ activity_likes turns into a perf cliff. Add `.limit(500)` or aggregate server-side.

- **[P1-10] `/api/trips/[id]/photos` GET is unbounded.** `photos/route.ts:16-20` — pulls every photo row + every like + every comment for the trip. Acceptable now; risky once trips routinely hit 200+ photos. Add `.limit(200)` + pagination.

- **[P1-11] `/api/trips/[id]/expenses` GET is unbounded.** Same shape — `.eq('trip_id', ...)` no limit. Lower risk (expense rows stay low-cardinality per trip), but worth a soft cap of 500.

- **[P1-12] `/api/trips/[id]/group-votes` POST trusts client-supplied `createdByName`.** `route.ts:114` — fall-back is server-resolved, but the field is honored when provided. Drop from request body; always use server-resolved name.

- **[P1-13] `/api/auth/send-reset-email` silently swallows SendGrid + generateLink errors.** Intentional to avoid disclosing email existence, but means failed sends look successful to ops with no alerting signal. Log to `error_log` table or external monitor on hard fails.

- **[P1-14] `/api/discover` POST has no length cap on `destination`.** Accepts 1KB+ free-text. Add `if (destination.length > 100) return 400;`.

- **[P1-15] `/api/trips/[id]/fork` has no rate limit.** A user can spam-fork to bloat their dashboard + the DB. Add per-user-per-hour cap (5–10 forks/hr).

### Performance

- **[P1-16] `memories/Client.tsx:325-417` Realtime channel churns on every photo like/comment.** `useEffect` deps include `selectedPhoto` (full object), and the effect's own setSelectedPhoto calls change object identity → tear down + resubscribe on every event. Fix: depend on `selectedPhoto?.id` only.

- **[P1-17] Hotel generation fan-out is N parallel Anthropic calls.** `itinerary/Client.tsx:1555` does `targetCities.map(async city => fetch('/api/generate-hotels'))` via `Promise.all`. For an 8-city trip = 8 simultaneous Anthropic calls + 8× token spend. Server-side single multi-city call would cut cost dramatically.

### Accessibility

- **[P1-18] 21 modals lack `role="dialog"`, `aria-modal="true"`, and Escape-key dismissal.** Sites: `itinerary/Client.tsx` (8 modals at 3013, 3041, 4381, 4663, 4758, 4876, 5006, 5149), `group/Client.tsx` (4 at 1872, 2517, 2650, 2820), `dashboard/Client.tsx` (512, 921), `memories/Client.tsx` (1171 — main photo lightbox), `pricing/Client.tsx:661`, `wishlist/Client.tsx:251`, `world/Client.tsx:506`, `trip/[id]/layout.tsx:158`. Fix: add a shared `useEscapeKey` hook + dialog attrs.

- **[P1-19] Clickable `<div onClick>` without keyboard handlers.** `dashboard/Client.tsx:587` (notification row), `wishlist/Client.tsx:893` (Plan this trip row), `discover/Client.tsx:318` (DestinationCard), `discover/Client.tsx:424` (BlankSlot). Add `role="button" tabIndex={0} onKeyDown={Enter/Space}` per the `SeasonalCard` pattern.

- **[P1-20] Icon-only buttons missing `aria-label` (title= alone doesn't satisfy WCAG 4.1.2 for AT).** `wishlist/Client.tsx:262`, `dashboard/Client.tsx:536/540`, `itinerary/Client.tsx:4393/4672/3600/3607/3680/3995`, `prep/Client.tsx:1050/1183`, `group/Client.tsx:2804`.

- **[P1-21] ~120+ form inputs without `<label htmlFor>` association.** Highest density: `trip/new/Client.tsx` (32 inputs, 1 htmlFor), `itinerary/Client.tsx` (25, 0), `group/Client.tsx` (12, 0), `prep/Client.tsx` (9, 0), `settings/Client.tsx` (7, 0), `memories/Client.tsx` (6, 0). Mechanical fix — add `id`/`htmlFor` pairs.

---

## P2 — Polish / nice-to-have

- **[P2-1] List `.map(...)` with `key={idx}` on non-static lists** — 30 sites. Most are static (skeletons, fixed strips) and fine. Real reorder identity issues in `itinerary/Client.tsx` (lines 3402, 3773, 3974, 4157, 4180, 4246, 4293), `group/Client.tsx` (1461, 1595, 1745, 1769, 2547), `wishlist/Client.tsx:841`, `discover/[slug]/Client.tsx:274`.

- **[P2-2] Color contrast — `text-zinc-400` on white as content text** (not placeholder/decorative). ~18 occurrences in `discover/Client.tsx`, several in `dashboard/Client.tsx:549/574/573`, multiple in `trips/Client.tsx`. zinc-400 on white ≈ 3.4:1, fails WCAG AA for normal text. Quick fix: bump to `text-zinc-500` (4.6:1).

- **[P2-3] Stripe checkout + portal routes use inline createServerClient instead of `requireAuth`.** `src/app/api/stripe/checkout/route.ts`, `src/app/api/stripe/portal/route.ts`. Functional but inconsistent — and the singleton-violation pattern is the same class that caused the photo-upload-vanish bug last session.

- **[P2-4] `/api/trips/[id]/souvenirs` PATCH/DELETE doesn't double-check `trip_id` matches URL.** Uses admin client + `.eq('user_id', userId)` only. Same-user, wrong-URL edits succeed. Low impact (user owns the row), but ownership-scoping should include `trip_id`.

- **[P2-5] `/api/trips/[id]/messages` POST has no length cap on `content`.** Could accept arbitrary-size chat content. Add `if (content.length > 4000) return 400;`.

- **[P2-6] `/api/trips/[id]/messages/[msgId]` PATCH has no length cap on emoji.** Reaction string could be 10KB before persisting to `reactions` JSONB. Cap to ~16 chars.

- **[P2-7] `/api/notifications` POST destructures body without try-wrap.** Non-JSON body bubbles as uncaught 500 instead of clean 400.

- **[P2-8] `/api/trips/[id]/group-votes` PATCH falls through to `'cast'` on unknown action.** `route.ts:172`. Add explicit enum check.

- **[P2-9] Long client components > 1500 LOC.** Informational only: `itinerary/Client.tsx` (5,330), `trip/new/Client.tsx` (3,124), `group/Client.tsx` (3,016), `prep/Client.tsx` (1,721). Future refactor candidates; not a launch issue.

- **[P2-10] `uniqueUploaders` IIFE recomputed each render** — `memories/Client.tsx:557-577`. Wrap in `useMemo([groupMembers, tripPhotos])`.

---

## Informational / not-bugs

- **30 console.log calls** — all server-side, all intentional (Vercel-log triage for build durability + Stripe webhook + invite SMS). Leave.
- **Zero `console.log` on client side.** Clean.
- **All 5 Realtime `.subscribe()` sites have `supabase.removeChannel` cleanup.** No leaks.
- **Zero dead component files.** All 16 files under `src/components/` are referenced.
- **Zero missing `alt` attributes.** Every `<Image>` and `<img>` has alt text.
- **All 30 public tables have RLS enabled.**
- **Three tables (`prep_tasks`, `vote_options`, `wishlist_items`) have RLS enabled with no policies.** Verified these are accessed exclusively through admin-client API routes — RLS-no-policy effectively locks them from anon/authenticated direct queries, which is intentional and secure.
- **Three INSERT policies with `WITH CHECK (true)`** — `destination_events`, `notifications`, `waitlist`. These are intentional public-write endpoints (anon analytics, system notifications, marketing waitlist) and are fine.
- **No orphan rows** in trip_members / group_messages / group_votes / expenses / packing_items / trip_photos / itineraries / photo_comments / photo_likes.
- **AI credit gates correctly enforce on the 5 high-cost routes** — `parse-itinerary`, `parse-transport`, `suggest-activity`, `generate-itinerary`, `add-day`. The 6 medium-cost routes flagged in P0-8 are the only gaps.
- **Stripe webhook + cron route auth gates verified clean.**
- **Server-only secrets** (`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY`, etc.) are nowhere in `'use client'` files.
- **No raw SQL concatenation.** Every query uses parameterized `.eq/.in/.match`.
- **Model IDs `claude-sonnet-4-6` and `claude-haiku-4-5-20251001`** flagged by the API audit are **NOT deprecated** — those are the current Sonnet 4.6 and Haiku 4.5 IDs, and the codebase intentionally uses cheaper models for lighter tasks. False positive; ignore.
- **`createBrowserClient` direct calls outside the singleton: none.** The lone match in `itinerary/Client.tsx:1473` is an import-time alias of the singleton.

---

## Recommended fix order

1. **Same-day (security):** P0-1, P0-2, P0-3, P0-4, P0-5, P0-6 — close the auth/RLS leaks. ~2 hours.
2. **Same-day (cost):** P0-7, P0-8 — wire credit gates on the 6 AI routes. ~1 hour.
3. **Next session (DB integrity):** P1-1 (FK indexes), P1-2/P1-3 (SECURITY DEFINER funcs), P1-4 (bucket policies), P1-5 (likes/geocache exposure), P1-6 (HaveIBeenPwned). ~1 hour total.
4. **Next session (API hardening):** P1-7 through P1-15.
5. **Pre-launch a11y batch:** P1-18 through P1-21 + P2-2. Bundled, ~3 hours.
6. **Polish:** P2s, can ship without.

Out of scope here (still requires a human or different tools): browser click-through, Stripe live-key swap test, Twilio A2P registration, SendGrid domain auth, full mobile responsive pass, multi-user realtime smoke under concurrency.
