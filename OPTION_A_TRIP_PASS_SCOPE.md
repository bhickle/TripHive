# Option A — Trip Pass as a per-trip overlay (scope)

**Goal:** stop modeling a Trip Pass purchase as an *account-tier swap*. Keep the buyer on their real account tier (Free or Travel Pro); let the existing `trip_passes` row be a **per-trip overlay** that unlocks that trip's coordination features + credit pool + traveler cap — for the buyer AND everyone they add. Closes the two bugs the current model causes for the *buyer* (lost On My Radar account-wide; paid trip-features leaking onto all their future trips).

**Why it's small:** the per-trip plumbing already exists (`hasTripFeatureAccess` checks the trip's pass; `checkAiCredits` pools to the pass; `useEntitlements.activeTripPass` resolves the trip's pass). Invited members ALREADY behave this way — only the *buyer's* account gets swapped. We're making the buyer consistent with the members.

**Migration: none.** DB currently has 0 `trip_pass` accounts and 0 passes. No backfill, no risk to existing data.

---

## 1. The one write to stop (core change)
- **`src/app/api/webhooks/stripe/route.ts:227-233`** — on a Trip Pass purchase, it sets `subscription_tier = 'trip_pass'` when the buyer's rank is below trip_pass (i.e. Free buyers). **Remove this** — leave `subscription_tier` untouched (Free stays Free, Pro stays Pro). The `trip_passes` upsert (239-245) **stays** — that's the per-trip pass. The travel_pro *subscription* path (line 104) is unrelated; leave it.
- `src/app/api/stripe/checkout/route.ts:77-78` — comment only; no write. Verify after edit.

## 2. Per-trip gating that currently keys on the BUYER's account tier (must re-point to the trip's pass)
These read the **organizer's account tier** and special-case `=== 'trip_pass'`. With the buyer staying Free, that branch won't fire, so the traveler cap would wrongly fall back to Free's 4. Re-gate on **"does this trip have an active pass?"** (both already query `trip_passes` right after — just gate on the pass row, not `orgTier`):
- **`src/lib/supabase/tripAccess.ts:323-334`** — `getTripTravelerCap`: `if (orgTier === 'trip_pass')` → `if (activePass for this trip)`.
- **`src/app/api/trips/[id]/members/route.ts:296-303`** — same pattern for the invite cap.

## 3. Credit/label DISPLAY that keys on account tier (make trip-aware)
These drive the credit counter + tier label off `tier === 'trip_pass'`. With the buyer Free, they'd show Free's 25 monthly instead of the pass's 50. Switch them to key off **`activeTripPass`** (already computed from `tripId` + `user.tripPasses` at `useEntitlements.ts:227-233`) — so on a passed trip the pass pool shows; off-trip, the account credits show:
- **`src/hooks/useEntitlements.ts`** — `60-70` (label/credits), `237-239` (`aiCreditsRemaining`), `252` (`aiCreditsTotal`), `264` (`canUseAI` gate). Replace the `tier === 'trip_pass'` branches with `activeTripPass ? <pass> : <account>`.

## 4. UI tier display — review (so a paying buyer never reads as "Free")
The buyer's account is Free, but on their passed trip the UI must show the pass. Review these:
- **`src/app/settings/Client.tsx:498,510`** — shows "Trip Pass" + 50 credits when `tier==='trip_pass'`. Account view will read "Free" (technically correct). **Add an "Active Trip Passes" section** so a buyer sees what they bought. (nice-to-have, not blocking)
- **`src/components/Sidebar.tsx:18`** — account badge; "Free" is correct account-level. Optional: a small "Trip Pass active" hint on a passed trip.
- **`src/app/trip/new/Client.tsx:1436, 2460, 3393`** — Trip-Builder hints keyed on `tier==='trip_pass'` (traveler-cap copy, hotel/group upsells). These assume the account-tier model; with Option A they won't fire for a Free buyer. **Rework as upsell prompts** ("add a Trip Pass for up to 12") rather than current-state. Review each.
- **`src/app/trip/[id]/itinerary/Client.tsx:3721`** — a gate on `(tier === 'trip_pass' || tier === 'travel_pro')`. Check what it gates; if it's a per-trip feature, repoint to the pass (`activeTripPass`/`isTripPassTrip`).

## 5. Already correct — NO change (the per-trip overlay)
- `useEntitlements.ts:217-218` (`tripPassUnlocked`), `227-233` (`activeTripPass`), `283-293` (group-size cap via `activeTripPass`), `389-395` (`hasSplitTracks/hasExpenses/...` via `tripPassUnlocked`).
- `tripAccess.ts:251` (`hasTripFeatureAccess` checks `trip_passes`).
- `aiCredits.ts:77-104` (pool routing when `tripId` has a pass). The `tier==='trip_pass'` fallback at `115` is for a user-scoped action with no `tripId`; moot once no account is `trip_pass` — review but low impact.
- `trips/[id]/route.ts:103` (`isTripPassTrip` check). `group/Client.tsx:124` (members already inherit via the pass).

## 6. Leave alone
- All `normalizeTier(subscription_tier)` reads (requireAuth, AuthContext, useCurrentUser, tripAccess, members, generate-itinerary) — they correctly read whatever the account tier is.
- The `SubscriptionTier` type and **`TIER_LIMITS.trip_pass` entry stay** — it becomes the "what a pass unlocks for a trip" definition that the overlay reads (`tripPassFeatures = TIER_LIMITS.trip_pass`). Its `canUseWishlist:false` then becomes irrelevant (wishlist isn't a per-trip-overlaid feature).
- Stripe `PRICE_TO_TIER`/legacy mapping; the travel_pro subscription webhook path.

---

## Risk + sequence
**Touch count:** ~1 write removal + 2 cap re-points + ~4 display lines (core) + ~5 UI-review spots. No DB migration. Server per-trip logic largely untouched (it's already pass-based).

**Main risk:** the credit DISPLAY change (#3) is in the billing-adjacent hook — a wrong edit could misreport credits (cosmetic, not a real charge, since the *server* `checkAiCredits` is the source of truth and already pass-based). Recommend:
1. **#1 + #2 first** (stop the write + re-point the cap) — backend-only, the substantive correctness fix.
2. **#3** (credit display) — test the counter on a passed trip vs off-trip.
3. **#4** (UI review) — last, polish, so buyers feel premium.

Each is independently shippable and `tsc`-verifiable. Because there are no passes/trip_pass accounts yet, every step can be validated with a single test pass purchase once `INTERNAL_BUILD_SECRET`/Stripe IDs are set — nothing live to break.
