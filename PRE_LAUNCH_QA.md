# Pre-Launch QA — TripCoord

> Generated 2026-05-11 by automated audit (build + API routes + security/RLS + accessibility + performance + DB integrity).
> Out of scope: real browser click-through, payment-flow testing with live cards, multi-user realtime smoke, mobile/iOS Safari quirks, email/SMS delivery verification.

## Status snapshot (2026-05-11, end of day)

| Severity | Found | Shipped | Deferred | Notes |
|---|---|---|---|---|
| **P0** | 8 | **8 ✅** | 0 | All launch-blockers closed |
| **P1** | 21 | 15 ✅ | 6 | Deferred items are UX flows / refactors / dashboard toggles |
| **P2** | 10 | 9 ✅ | 1 | The 1 deferred item is informational only (long components) |

**Launch-blocker status: clear.** All P0 findings are fixed and shipped to master.

Commits: `26b74c6` (P0 batch) · `cd6611d` (P1 DB+API+perf+a11y) · `01237a4` (P2 polish)

---

## Build status

- `npx tsc --noEmit` — **clean** ✅
- Local `next build` — fails only because `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` aren't set in the local shell. Vercel has them; this is an environment issue, not a code defect.

---

## P0 — Launch blockers — ✅ ALL SHIPPED

> Real exploits, data leaks, or money-leakage paths. Fix before public launch.

### Security / auth

- **[P0-1] ✅ SHIPPED** (`26b74c6`) — `/api/trips/save` now 401s without auth. Anonymous trip writes via admin client are blocked.

- **[P0-2] ✅ SHIPPED** (`26b74c6`) — `/api/integration-vote` requires auth + has 200/2000-char length caps on the Airtable fields.

- **[P0-3] ✅ SHIPPED** (`26b74c6`) — `/api/og-preview` requires auth. SSRF blocklist already in place; auth closes the unauthenticated-proxy abuse path.

- **[P0-4] ✅ SHIPPED** (migration `tighten_rls_p0_batch`) — `discover_wishlist` SELECT now scoped to trip membership + organizer. The `USING(true)` policy is gone.

- **[P0-5] ✅ SHIPPED** (migration `tighten_rls_p0_batch`) — `packing_items` SELECT scoped to trip membership. Explicit member-scoped INSERT/UPDATE/DELETE policies added (previously implicit via the open SELECT).

- **[P0-6] ✅ SHIPPED** (migration `tighten_rls_p0_batch`) — `trip_invites` "Anyone can read an invite by token" SELECT dropped. All code paths that read this table use admin client server-side; the broad policy was a token-enumeration backdoor.

### AI credit bypass

- **[P0-7] ✅ SHIPPED** (`26b74c6`) — `/api/generate-packing` + `/api/generate-phrases` now require auth + Nomad tier explicitly. The `try { auth } catch { /* demo */ }` passthrough is gone.

- **[P0-8] ✅ SHIPPED** (`26b74c6`) — All 6 previously-uncharged AI routes are now in the credit ledger:
  - `parse_receipt: 1 cr`, `generate_hotels: 1 cr`, `generate_discover: 1 cr`
  - `generate_layover: 2 cr`, `generate_packing: 1 cr`, `generate_phrases: 2 cr`
  - Layover's mock-fallback path stays uncharged.

---

## P1 — Real bugs / pre-launch polish

### Database integrity — ✅ ALL SHIPPED

- **[P1-1] ✅ SHIPPED** (`p1_db_integrity_batch`) — 24 FK backing indexes added.

- **[P1-2] ✅ SHIPPED** (`p1_db_integrity_batch`) — `search_path` pinned on `set_initial_credits_reset_at`, `trip_cities`, `set_updated_at`.

- **[P1-3] ✅ SHIPPED** (`p1_db_integrity_batch`) — `REVOKE EXECUTE` on `handle_new_user()` from anon/authenticated/public; `search_path` pinned too.

- **[P1-4] ✅ SHIPPED** (`p1_db_integrity_batch`) — Dropped broad `storage.objects` SELECT policies for `avatars` + `trip-photos`. Public-URL access continues to work; `.list()` from the client SDK is now blocked.

- **[P1-5] ✅ SHIPPED** (`p1_db_integrity_batch`) — `activity_likes` + `itinerary_likes` SELECT scoped to own rows. Aggregate counts continue to surface via admin-client server routes. `city_geocache` left as `USING(true)` — false positive (no user data).

- **[P1-6] ⏭️ DEFERRED — Brandon-owned dashboard toggle** — Supabase Auth → enable Leaked Password Protection (HaveIBeenPwned check). Free upgrade, not toggleable via SQL/API.

### API routes — 6 of 9 shipped

- **[P1-7] ⏭️ DEFERRED — needs UX design** — `/api/auth/me` DELETE has no re-auth step. A signed-in user can self-delete without password confirmation. Fix needs a re-auth challenge modal (re-enter password) on the Settings page, not just a server change.

- **[P1-8] ✅ SHIPPED** (`cd6611d`) — `/api/unsplash/photo` + `/api/unsplash/track` are now auth-gated.

- **[P1-9] ✅ SHIPPED** (`cd6611d`) — `/api/community/[id]` activity_likes capped at 5000 rows.

- **[P1-10] ✅ SHIPPED** (`cd6611d`) — `/api/trips/[id]/photos` capped at 500 rows.

- **[P1-11] ✅ SHIPPED** (`cd6611d`) — `/api/trips/[id]/expenses` capped at 500 rows.

- **[P1-12] ✅ SHIPPED** (`cd6611d`) — `/api/trips/[id]/group-votes` POST drops client-supplied `createdByName` from the body so callers can't spoof vote attribution.

- **[P1-13] ⏭️ DEFERRED — needs error sink** — `/api/auth/send-reset-email` silently swallows SendGrid + generateLink errors. Intentional to avoid disclosing email existence, but means failed sends look successful to ops. Fix needs a log/error_log table or external monitor.

- **[P1-14] ✅ SHIPPED** (`cd6611d`) — `/api/discover` POST caps `destination` at 100 chars.

- **[P1-15] ⏭️ DEFERRED — needs rate-limit utility** — `/api/trips/[id]/fork` has no per-user rate limit. Fix needs either a rate-limit table or Vercel KV / Upstash integration; not a single-line change. Low real-world risk pre-launch (no traffic).

### Performance — 1 of 2 shipped

- **[P1-16] ✅ SHIPPED** (`cd6611d`) — `memories/Client.tsx` photo Realtime channel: `useEffect` dep is now `selectedPhoto?.id` so the channel no longer churns on every like/comment.

- **[P1-17] ⏭️ DEFERRED — refactor** — Hotel generation fan-out is N parallel Anthropic calls (8 cities = 8 simultaneous calls + 8× token spend). Fix needs a server-side single multi-city endpoint. Big refactor; works fine for the current call volume. Revisit when usage grows.

### Accessibility — partially shipped

- **[P1-18] ✅ PARTIALLY SHIPPED** (`cd6611d`) — `role="dialog"` + `aria-modal="true"` + Escape dismissal on **12 highest-traffic modals**: dashboard notifications + invite, wishlist add-destination, world photo lightbox, pricing trip-picker, memories photo lightbox, itinerary edit-trip + add-activity, group add-expense + vote + invite + add-to-itinerary. New `useEscapeKey` hook at `src/hooks/useEscapeKey.ts`. **⏭️ Remaining ~9 dialogs** (less-trafficked: revert, parse-transport, upgrade prompts, add-hotel/flight, trip/layout, send-reset) follow the same pattern — mechanical follow-up.

- **[P1-19] ✅ PARTIALLY SHIPPED** (`cd6611d`) — Keyboard handlers added on dashboard notification row + wishlist Plan-this-trip card. **⏭️ Remaining**: discover `DestinationCard` outer (partially mitigated since inner buttons handle the real actions) and discover `BlankSlot` — neither is high-traffic.

- **[P1-20] ✅ SHIPPED** (`cd6611d`) — `aria-label` added on dashboard notifications close, itinerary add-activity close, itinerary add-hotel close, prep add-item + add-gift, group send-message.

- **[P1-21] ⏭️ DEFERRED — big mechanical sweep** — ~120 form inputs across the app lack `<label htmlFor>` associations (highest density in `trip/new/Client.tsx` with 32 inputs and 1 htmlFor). Fix needs a coordinated pass adding `id`/`htmlFor` pairs to every input. Out of scope for the QA-fix arc; tracked for a dedicated batch.

---

## P2 — Polish — 9 of 10 shipped

- **[P2-1] ✅ SHIPPED** (`01237a4`) — Stable composite `key={...}` on 12 read-only `.map()` sites in itinerary, group, wishlist, and `discover/[slug]` clients. Editable-input lists (line items, vote options) intentionally left at `key={idx}` — position is stable during edit sessions.

- **[P2-2] ✅ SHIPPED** (`01237a4`) — `text-zinc-400` → `text-zinc-500` across dashboard, discover, trips (~33 occurrences). zinc-400 on white ~3.4:1 (fails WCAG AA); zinc-500 ~4.6:1 (passes AA).

- **[P2-3] ✅ SHIPPED** (`01237a4`) — Stripe checkout + portal routes switched from inline `createServerClient` boilerplate to the `@/lib/supabase/server` singleton.

- **[P2-4] ✅ SHIPPED** (`01237a4`) — `/api/trips/[id]/souvenirs` PATCH + DELETE now scope by `trip_id` in addition to `user_id`.

- **[P2-5] ✅ SHIPPED** (`01237a4`) — `/api/trips/[id]/messages` POST caps `content` at 4000 chars.

- **[P2-6] ✅ SHIPPED** (`01237a4`) — `/api/trips/[id]/messages/[msgId]` PATCH caps `emoji` at 16 chars.

- **[P2-7] ✅ SHIPPED** (`01237a4`) — `/api/notifications` POST wraps `req.json()` so malformed bodies return 400 instead of 500.

- **[P2-8] ✅ SHIPPED** (`01237a4`) — `/api/trips/[id]/group-votes` PATCH explicitly validates the `action` enum.

- **[P2-9] 🔵 INFORMATIONAL ONLY** — Long client components (`itinerary` 5,330 LOC, `trip/new` 3,124, `group` 3,016, `prep` 1,721) are refactor candidates but not bugs. No action.

- **[P2-10] ✅ SHIPPED** (`01237a4`) — `uniqueUploaders` IIFE in memories wrapped in `useMemo([groupMembers, tripPhotos])`.

---

## Informational / not-bugs (audit notes preserved for context)

- **30 console.log calls** — all server-side, all intentional (Vercel-log triage for build durability + Stripe webhook + invite SMS). Leave.
- **Zero `console.log` on client side.** Clean.
- **All 5 Realtime `.subscribe()` sites have `supabase.removeChannel` cleanup.** No leaks.
- **Zero dead component files.** All 16 files under `src/components/` are referenced.
- **Zero missing `alt` attributes.** Every `<Image>` and `<img>` has alt text.
- **All 30 public tables have RLS enabled.**
- **Three tables (`prep_tasks`, `vote_options`, `wishlist_items`) have RLS enabled with no policies** — verified these are accessed exclusively through admin-client API routes. Intentional and secure.
- **Three INSERT policies with `WITH CHECK (true)`** — `destination_events`, `notifications`, `waitlist`. Intentional public-write endpoints.
- **No orphan rows** in trip_members / group_messages / group_votes / expenses / packing_items / trip_photos / itineraries / photo_comments / photo_likes.
- **Server-only secrets** are nowhere in `'use client'` files.
- **No raw SQL concatenation.** All queries use parameterized `.eq/.in/.match`.
- **Model IDs `claude-sonnet-4-6` and `claude-haiku-4-5-20251001`** are NOT deprecated — those are the current Sonnet 4.6 and Haiku 4.5 IDs. The codebase intentionally uses cheaper models for lighter tasks. False positive from the API audit.
- **`createBrowserClient` direct calls outside the singleton: none.**

---

## Remaining deferred items — single source of truth

Six P1 + 1 P2 still open. None are launch-blocking.

| ID | Item | Why deferred | Effort |
|---|---|---|---|
| P1-6 | Enable Supabase Auth Leaked-Password Protection | Brandon-only dashboard toggle | 1 min |
| P1-7 | `/api/auth/me` DELETE re-auth challenge | Needs Settings-page UX (re-enter password modal) | 1–2 hr |
| P1-13 | `/api/auth/send-reset-email` hard-fail alerting | Needs error_log table or external monitor | 1–2 hr |
| P1-15 | `/api/trips/[id]/fork` per-user rate limit | Needs rate-limit utility (KV / Upstash / Postgres) | 2–3 hr |
| P1-17 | Hotel generation: N parallel calls → 1 multi-city call | Server refactor + prompt redesign | 4–6 hr |
| P1-18b | Remaining ~9 dialogs need role/aria/Escape | Mechanical, follows the 12-shipped pattern | 1–2 hr |
| P1-21 | ~120 form inputs missing `<label htmlFor>` | Mechanical mass-edit | 2–3 hr |
| P2-9 | Long client components | Informational only — no action | — |

Out of scope for this QA arc (still requires a human or different tools): browser click-through, Stripe live-key swap test, Twilio A2P registration, SendGrid domain auth, full mobile responsive pass, multi-user realtime smoke under concurrency.
