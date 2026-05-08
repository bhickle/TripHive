# TripCoord — Claude Code Context

> **App name:** TripCoord (brand) / **Repo:** TripHive / **Domain:** tripcoord.ai  
> **Stack:** Next.js 14 App Router · TypeScript · Tailwind CSS · Supabase · Anthropic Claude API · Stripe  
> **Last updated:** 2026-05-07

---

## What This App Does

TripCoord is an AI-powered travel planning app. Users describe a trip (destination, dates, group, budget, priorities) and Claude generates a complete day-by-day itinerary with activity tracks, food spots, photo spots, and practical notes. The app also handles group collaboration (invite members, vote on activities, split expenses), packing lists, prep checklists, and a "Discover" feed of curated experiences.

---

## Repository & Deploy Workflow

**Repo:** `https://github.com/bhickle/TripHive.git`  
**Branch:** `master` (auto-deploys to Vercel on every push)  
**Vercel project ID:** `prj_CXOmPJ4ffTCbxR4lurg3jho7pEsW`  
**Team ID:** `team_aXNtbEj1uZq70pRXyemRnhx5`

### Dev Environment
Working directly on the Windows-native filesystem (`C:\Users\brand\OneDrive\Documents\Claude\Projects\Travel App\wayfare`) via Claude Code. Default shell is **PowerShell**; Bash is also available via the Bash tool. Git operations run directly against the local repo — no temp clone needed.

### ⚠️ Stale Git Lock Files (OneDrive issue)
OneDrive sync occasionally leaves stale `.git/index.lock`, `.git/HEAD.lock`, or `.git/index2.lock` files when a git process is interrupted. Symptom: `fatal: Unable to create '.../.git/index.lock': File exists`.

**Fix:** verify no git process is actually running, then delete the stale locks:
```powershell
Remove-Item .git/index.lock, .git/HEAD.lock, .git/index2.lock -ErrorAction SilentlyContinue
```
Or via Bash: `rm -f .git/index.lock .git/HEAD.lock .git/index2.lock`

### TypeScript Check
Always run before committing (working directory is already the repo root):
```
npx tsc --noEmit
```

---

## Project Structure

```
src/
  app/
    page.tsx                    # Homepage / landing
    pricing/page.tsx            # Pricing page (3 tiers)
    dashboard/page.tsx          # Home Base — logged-in dashboard
    trips/page.tsx              # My Trips / Adventures list
    wishlist/page.tsx           # Dream Destinations wishlist
    discover/page.tsx           # Discover feed (global)
    onboarding/page.tsx         # First-time user persona setup
    settings/page.tsx           # User settings + persona + integrations voting
    layover/page.tsx            # Airport layover planner
    join/page.tsx               # Group invite accept page
    auth/
      login/page.tsx
      signup/page.tsx
      reset-password/page.tsx
      update-password/page.tsx
    trip/
      new/page.tsx              # Trip Builder (8-step wizard)
      generating/page.tsx       # Live build loading screen (legacy path)
      [id]/
        itinerary/page.tsx      # Main itinerary page (3900+ lines — the core)
        group/page.tsx          # Group collaboration hub
        prep/page.tsx           # Prep Hub (packing, Don't Forget, What's Out There, Phrases)
        print/page.tsx          # PDF export / print view
        dayof/page.tsx          # Day-of guide
        discover/page.tsx       # Trip-scoped Discover tab
    discover/
      [slug]/page.tsx           # Public read-only featured itinerary preview
    legal/
      terms/page.tsx
      privacy/page.tsx
    api/
      generate-itinerary/route.ts   # Main AI generation (SSE streaming, city-by-city)
      trips/
        save/route.ts               # Save full itinerary + skeleton mode
        [id]/route.ts               # GET/PATCH trip row
        [id]/add-day/route.ts       # Single-day AI generation (new)
        [id]/members/route.ts
        [id]/expenses/route.ts
        [id]/souvenirs/route.ts
        [id]/messages/[msgId]/route.ts
      votes/[id]/route.ts
      invite/
        email/route.ts
        sms/route.ts
      suggest-activity/route.ts
      generate-packing/route.ts
      parse-transport/route.ts
      featured-itineraries/route.ts
      webhooks/stripe/route.ts
      ... (many more)
  components/
    ErrorBoundary.tsx
    MapView.tsx
    ParseTransportModal.tsx
    TripStoryModal.tsx
    UpgradeModal.tsx            # LockBadge + tier-gate modal
    NotificationPanel.tsx
  hooks/
    useCurrentUser.ts           # Auth state — primary user hook
    useEntitlements.ts          # Tier-based feature gates
    usePlacesSearch.ts
  lib/
    types.ts                    # Shared types (ItineraryDay, Activity, etc.)
    supabase/
      client.ts                 # Browser client
      server.ts                 # Server client
      admin.ts                  # Admin client (bypass RLS)
      requireAuth.ts            # Auth guard helper
    stripe.ts
    stripe-prices.ts            # Price IDs (currently test mode)
    database.types.ts           # Auto-generated from Supabase (regenerate after migrations)
  data/
    mock.ts                     # Mock data for demo mode only
```

---

## Key Data Flows

### Trip Generation (SSE Streaming)
1. User completes Trip Builder (`trip/new/page.tsx`) → Step 8 → "Build My Trip"
2. A skeleton trip row is created via `POST /api/trips/save` with `mode: 'skeleton'` (empty `itinerary_data`)
3. User is redirected to `/trip/[id]/itinerary?mode=generating`
4. Itinerary page detects `?mode=generating`, clears localStorage, starts SSE stream via `GET /api/generate-itinerary`
5. SSE streams `day` events → client merges into live view via `syncAiDays()`
6. On complete, saves to Supabase via `PATCH /api/trips/[id]`

### Multi-City Generation
- `segments = [{cityName, dayStart, dayCount}]` — each city is a separate `streamSegment()` call
- City header in the day tabs uses `aiMeta.destinations + daysPerDestination` to map day → city

### Itinerary Data Model
```ts
ItineraryDay {
  day: number;           // 1-based
  date: string;          // ISO date (YYYY-MM-DD)
  city?: string;         // Per-day city (for weather, Maps, etc.)
  theme: string;
  tracks: { shared: Activity[]; track_a: Activity[]; track_b: Activity[] };
  trackALabel?: string; trackBLabel?: string;
  transportLegs?: TransportLeg[];
  meetupTime?: string; meetupLocation?: string;
  photoSpots?: PhotoSpot[];
  foodieTips?: FoodieTip[];
  destinationTip?: string;
  dinnerMeetupLocation?: string | null;
}
```

### Persistence Order
`syncAiDays()` → `localStorage` → `PATCH /api/trips/[id]` (fire-and-forget). Supabase is source of truth on reload; localStorage is fallback.

---

## Subscription Tiers

| Tier | Key Feature Limits |
|------|--------------------|
| `free` | 10 AI credits/mo, 5 travelers, solo/couple trips only |
| `trip_pass` | 30 credits, up to 12 travelers, single trip |
| `explorer` | 100 credits, up to 12 travelers, split tracks |
| `nomad` | 350 credits, unlimited travelers, all features |

Gates live in `useEntitlements` hook → checked against `profile.subscription_tier` from Supabase.  
`UpgradeModal` + `LockBadge` components handle the UI gating.

---

## Supabase

- **Project ref:** `pqizuvmtertpxhhxyemj`
- **URL:** `https://pqizuvmtertpxhhxyemj.supabase.co`
- Admin client bypasses RLS — use for server-side operations that need to see all rows
- Browser client respects RLS — use in API routes that should scope to the authenticated user
- **After any schema migration:** run `generate_typescript_types` MCP tool and write `src/lib/database.types.ts` in the same commit. Missing this breaks Vercel builds.

Key tables: `profiles`, `trips`, `itineraries`, `trip_members`, `trip_invites`, `trip_photos`, `group_messages`, `group_votes`, `vote_options`, `vote_responses`, `expenses`, `packing_items`, `souvenir_items`, `prep_tasks`, `wishlist_items`, `discover_destinations`, `featured_itineraries`, `seasonal_collections`, `waitlist`

---

## Environment Variables (Vercel)

All set in Vercel → TripHive → Settings → Environment Variables.  
Claude cannot set these — Brandon must add them manually.

| Variable | Status | Notes |
|----------|--------|-------|
| `ANTHROPIC_API_KEY` | ✅ Set | Main AI key |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ Set | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Set | |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Set | Admin client |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ Set (test) | Swap for live before launch |
| `STRIPE_SECRET_KEY` | ✅ Set (test) | Swap for live before launch |
| `STRIPE_WEBHOOK_SECRET` | ✅ Set (test) | Swap for live before launch |
| `SENDGRID_API_KEY` | ✅ Set | Invite emails |
| `SENDGRID_FROM_EMAIL` | ✅ Set | Currently Gmail; change to `noreply@tripcoord.ai` at launch |
| `TWILIO_ACCOUNT_SID` | ✅ Set | SMS invites (trial — needs upgrade for real users) |
| `TWILIO_AUTH_TOKEN` | ✅ Set | |
| `TWILIO_PHONE_NUMBER` | ✅ Set | +18445310179 |
| `GOOGLE_MAPS_KEY` | ✅ Set | Server-side Places API |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | ✅ Set | Client-side Maps embed |
| `NEXT_PUBLIC_APP_URL` | ✅ Set | https://www.tripcoord.ai |
| `UNSPLASH_ACCESS_KEY` | ❌ Missing | Dynamic trip card photos (#78) |
| `TICKETMASTER_API_KEY` | ❌ Missing | Real events data (#69) |
| `VIATOR_AFFILIATE_ID` | ❌ Missing | Affiliate booking links (#70) |
| `GETYOURGUIDE_AFFILIATE_ID` | ❌ Missing | Affiliate booking links (#70) |

---

## Open Development Tasks

These are the active items to build/fix, in rough priority order:

### 🔴 Must-Fix Before Any More Testing
- _All previously listed items shipped. Add new launch-blockers here as they surface._

### 🟠 Feature Work (Active)
- [ ] **Enable Google OAuth** (`#183`) — Google sign-in buttons exist but OAuth is not configured. Steps: Google Cloud Console → create OAuth Client ID → redirect URI: `https://pqizuvmtertpxhhxyemj.supabase.co/auth/v1/callback` → Supabase dashboard → Authentication → Providers → Google → enable + paste keys.
- [ ] **Build Trip Pass purchase flow** — trip selector + extra people picker + Stripe checkout. Not yet built.
- [ ] **Split Tracks + Co-organizer → Trip Pass tier** — currently gated at Explorer. Move to Trip Pass.
- [ ] **Wishlist for free users (no AI preview)** — free users can add to wishlist but can't get AI destination previews.
- [ ] **Invite-token system for `/join/[id]`** — currently anyone with a trip UUID can POST to `/api/trips/[id]/members` and add themselves as a guest, by design (open share-link flow). For private trips this should require a one-time token issued by the email/sms invite routes. Schema: add `trip_invites` table (already in `database.types.ts`), populate it from `/api/invite/email` + `/api/invite/sms`, validate token in `members POST`, mark consumed. Documented inline at `src/app/api/trips/[id]/members/route.ts` POST handler.
- [ ] **Trip Story real-data implementation** — `src/components/TripStoryModal.tsx` is currently mock-only. Real trips and the Year-in-Review now show a "Coming soon" placeholder. Rewrite the slide deck to consume real trip data: actual `tripPhotos` rows, real expenses + members + chat highlights instead of the hardcoded "Marcus tried to pronounce Þingvellir" laughs. Gated by `MOCK_TRIP_IDS` check; remove that gate once real-data slides land.
- [ ] **Per-priority difficulty UI** — design + build sliders on each selected priority chip in the Trip Builder so users can set "Adventure: Easy" or "Wellness: Challenging." State and `difficultyLevels` constant were removed; reintroduce when designing.
- [ ] **`#10` sidebar formatting fix** — user reported the sidebar items "aren't formatted properly for a screen" but couldn't describe specifically. Waiting on a screenshot. Don't speculate — confirm with the user before attempting a fix.

### 🟡 Polish & UX
- [ ] **Unsplash integration** (`#78`) — dynamic destination photos on trip cards. Code scaffold is ready; just needs `UNSPLASH_ACCESS_KEY` env var + wiring in `src/app/trips/page.tsx` and `dashboard/page.tsx`.
- [ ] **Ticketmaster events** (`#69`) — real event data on Discover/What's Out There. Needs `TICKETMASTER_API_KEY`.
- [ ] **Viator/GetYourGuide affiliate links** (`#70`) — "Book This" links on activity cards in the itinerary. Scaffold at `scripts/enrich-affiliate-links.ts`. Needs affiliate registration + API keys (blocked until site is live for affiliate approval).
- [ ] **Trip Story repositioning** — move Trip Story CTA from active itinerary toolbar to a "Memories" section on the dashboard that appears only after trip end date. (`src/app/trip/[id]/itinerary/page.tsx` + `dashboard/page.tsx`). Gates behind `tripEnded`; the placeholder "Coming soon" view will still show until the real-data implementation lands.
- [ ] **Dashboard "View All Notifications" button** — non-functional today, no `onClick`. Either build a `/notifications` page or remove the button. Per the wire-up rule, prefer building.
- [ ] **Affiliate disclosure** — Discover page renders Flights / Hotels / Things-to-Do affiliate links without per-link FTC disclosure. Add a small "(affiliate)" tag inline.

### 🟢 Go-Live Prerequisites (Brandon-owned)
- [ ] Re-enable email confirmation in Supabase (currently OFF for testing ease)
- [ ] Complete SendGrid domain authentication so emails land in inbox, not spam
- [ ] Add `/auth/update-password` to Supabase redirect allowlist
- [ ] Upgrade Twilio from trial to Pay As You Go + complete A2P 10DLC registration
- [ ] Swap Stripe test keys for live keys + recreate products in live mode + update `src/lib/stripe-prices.ts`
- [ ] Reset AI credits: `UPDATE profiles SET ai_credits_used = 0;`
- [ ] Run full pre-launch test pass (see `GOLIVE_CHECKLIST.md`)

---

## Code Conventions & Gotchas

### Declaration Order in itinerary/page.tsx
This file is 4000+ lines. `useCallback` and `useMemo` must come **after** all the `useState` and `useRef` declarations they reference. TypeScript in strict Next.js builds treats forward references inside closures as errors. Always grep `const \[myVar` vs `const myFunc` to verify ordering before committing.

### TypeScript Property Access
Always check `src/lib/types.ts` before accessing a property on a typed object. Common traps:
- `aiMeta.preferences?.priorities` (nested under `preferences`, NOT `aiMeta.priorities`)
- `aiMeta.destination` (singular, NOT `.destinations[0]` — use `tripRow?.destinations?.[0]` for multi-city)

### Design Mockup Rule
**Before making any font/color/layout change, show an HTML mockup to Brandon first.** Do not touch source files for visual design changes without prior approval.

### Supabase Types After Migrations
After any `CREATE TABLE` or `ALTER TABLE` migration:
1. Run `generate_typescript_types` MCP tool
2. Write output to `src/lib/database.types.ts`
3. Include this in the same commit as the migration
Skipping this step causes Vercel build failures.

### Pre-Commit Checklist
Before every `git push`:
1. Run `npx tsc --noEmit` — zero errors required
2. Check declaration order (hooks before their deps)
3. Check type shapes match `types.ts` and `database.types.ts`
4. Check cross-file response shapes (API route → caller)

### Mock Data Scope
`src/data/mock.ts` is **only** for the demo/preview experience (unauthenticated users). All authenticated user flows must use real Supabase data. Never fall back to mock data for logged-in users.

### Supabase Browser Client Singleton
**ALWAYS** import the singleton from `@/lib/supabase/client`, never call `createBrowserClient` from `@supabase/ssr` directly:
```ts
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase/client';
const supabase = createSupabaseBrowserClient();
```
Multiple instances fight over the same auth Web Lock and silently drop the auth session, which makes calls run as anonymous and silently fail RLS. This was the root cause of the photo-upload-vanishes-on-refresh bug (commit after `9191974`).

---

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
- **TripStoryModal mock-data gate** — real trips and Year-in-Review mode now show a "Coming soon" placeholder instead of leaking hardcoded "Marcus tried to pronounce Þingvellir" content. Mock trips still get the full demo experience (commit after `1c1355b`).
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

---

## Key File Reference

| What you're changing | File |
|---------------------|------|
| Itinerary page (main) | `src/app/trip/[id]/itinerary/page.tsx` |
| AI generation prompt | `src/app/api/generate-itinerary/route.ts` |
| Trip Builder wizard | `src/app/trip/new/page.tsx` |
| Feature gates / entitlements | `src/hooks/useEntitlements.ts` |
| Tier definitions + limits | `src/lib/types.ts` (TIER_LIMITS) |
| Stripe price IDs | `src/lib/stripe-prices.ts` |
| Shared TypeScript types | `src/lib/types.ts` |
| Supabase schema types | `src/lib/database.types.ts` |
| Auth user hook | `src/hooks/useCurrentUser.ts` |
| Go-live checklist | `GOLIVE_CHECKLIST.md` (workspace root) |
