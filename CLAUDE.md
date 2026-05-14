# TripCoord — Claude Code Context

> **App name:** TripCoord (brand) / **Repo:** TripHive / **Domain:** tripcoord.ai  
> **Stack:** Next.js 14 App Router · TypeScript · Tailwind CSS · Supabase · Anthropic Claude API · Stripe  
> **Last updated:** 2026-05-09

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
| `free` | 10 AI credits/mo, 4 travelers, 7-day max trip |
| `trip_pass` | 30 credits per pass, 6 base travelers (extras purchasable), 7-day max |
| `explorer` | 100 credits/mo, 8 travelers, 10-day max, split tracks + co-organizer |
| `nomad` | 250 credits/mo, 15 travelers, 14-day max, all features |

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
| `PREVIEW_SECRET` | ⚠️ Optional (pre-launch) | Coming-soon bypass — `?preview=<value>` sets a 90-day cookie. **Middleware falls back to the literal `tc2026` when this env var is unset** (re-introduced 2026-05-13 to unblock pre-launch testers). Anyone who reads the bundled middleware JS can see the fallback, so it's a speedbump not real access control. **Before public launch:** set this to a strong value in Vercel AND remove the `?? 'tc2026'` fallback in `src/middleware.ts` line 11. Do BOTH — env var alone is not enough while the fallback is in source. |
| `UNSPLASH_ACCESS_KEY` | ❌ Missing | Dynamic trip card photos (#78) |
| `TICKETMASTER_API_KEY` | ❌ Missing | Real events data (#69) |
| `VIATOR_AFFILIATE_ID` | ❌ Missing | Affiliate booking links (#70) |
| `GETYOURGUIDE_AFFILIATE_ID` | ❌ Missing | Affiliate booking links (#70) |

---

## Open Development Tasks

These are the active items to build/fix, in rough priority order. Note: this list goes stale fast. Always cross-check against `git log` before assuming a task is unfinished — many "open" items here are knocked out within a session and not removed promptly.

### 🔴 Must-Fix Before Any More Testing
- _All previously listed items shipped. Add new launch-blockers here as they surface._
- ~~Server-side AI credit enforcement~~ — **Shipped 2026-05-08.** Factored shared helpers `checkAiCredits` / `incrementAiCreditsUsed` in `lib/supabase/aiCredits.ts` (two-phase: gate before, charge after success — failed AI calls don't burn credits). Wired into all five AI routes: `parse-itinerary`, `parse-transport`, `suggest-activity`, `generate-itinerary` (charge fires on stream `done` only when `daysEmitted > 0`), and `trips/[id]/add-day`. Free tier (10 cr/mo) → 1 generate-itinerary OR 5 add-days OR 10 parses. Paid tiers (explorer 100, nomad 350) enforced too. `trip_pass` left as exempt with a `TODO(launch)` to wire into per-pass billing on `trip_passes.ai_credits_used` — currently passes through without enforcement. Known limitation: client-side multi-city chunking calls `generate-itinerary` once per chunk, so a 3-chunk trip = 30 credits. Multi-city is gated upstream so free tier rarely hits this; explorer/nomad caps absorb it fine.

### 🟠 Feature Work (Active)
- [ ] **Build durability Tier 2 (Inngest)** — Tier 1 shipped 2026-05-09 (server-owned abort + per-day persistence + resume detection). Tier 2 moves orchestration to an Inngest worker so builds complete even when the browser is fully closed. Blocked on Brandon's prep checklist (Inngest account + `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` in Vercel). See `memory/project_tier2_prep.md`.
- [ ] **Enable Google OAuth** (`#183`) — Google sign-in buttons exist but OAuth is not configured. Steps: Google Cloud Console → create OAuth Client ID → redirect URI: `https://pqizuvmtertpxhhxyemj.supabase.co/auth/v1/callback` → Supabase dashboard → Authentication → Providers → Google → enable + paste keys.
- [ ] **Yay/Nay dead-space layout decision** (PDF #3 deferred) — Brandon flagged a green-bordered empty area in the votes section's right column. Two options: (a) move Wishlist + Nay Watch into the right column of the votes grid so they fill space, (b) collapse to single-column on lg+ entirely. Needs Brandon's design call before implementing.
- ~~Invite-token system Phase 2 (privacy gate)~~ — **Shipped 2026-05-08, commit `8e575cb`.**
- ~~Trip Story real-data implementation~~ — **Shipped 2026-05-08.**
- ~~Per-priority difficulty UI~~ — **Closed 2026-05-08, won't build.**
- ~~Click expense line item to view/edit details~~ — **Shipped 2026-05-09.** Inline expand on expense rows reveals editable line items (description + amount, add/remove rows, optimistic save via PATCH). See `src/app/trip/[id]/group/page.tsx`.

### 🟡 Polish & UX
- [ ] **Unsplash integration** (`#78`) — dynamic destination photos on trip cards. Code scaffold is ready; just needs `UNSPLASH_ACCESS_KEY` env var + wiring in `src/app/trips/page.tsx` and `dashboard/page.tsx`.
- [ ] **Ticketmaster events** (`#69`) — real event data on Discover/What's Out There. Needs `TICKETMASTER_API_KEY`.
- [ ] **Viator/GetYourGuide affiliate links** (`#70`) — "Book This" links on activity cards in the itinerary. Scaffold at `scripts/enrich-affiliate-links.ts`. Needs affiliate registration + API keys (blocked until site is live for affiliate approval).
- [ ] **Prompt-cache optimization (low priority)** — `cacheableGuidance` can fall below Anthropic's 2K-token threshold for users with few priorities, in which case caching silently doesn't happen. Not a regression — the current architecture is correct, just sub-optimal at the low end. Bigger fix: move stable user-prompt content (budgetTierText, groupTypeText, walkingRuleText, etc.) into the cacheable region so multi-city chunks share more cache. Audit notes from 2026-05-08.

### 🟢 Go-Live Prerequisites (Brandon-owned)
- [ ] Re-enable email confirmation in Supabase (currently OFF for testing ease)
- [ ] Complete SendGrid domain authentication so emails land in inbox, not spam
- [ ] Add `/auth/update-password` to Supabase redirect allowlist
- [ ] Upgrade Twilio from trial to Pay As You Go + complete A2P 10DLC registration
- [ ] Swap Stripe test keys for live keys + recreate products in live mode + update `src/lib/stripe-prices.ts`
- [ ] Reset AI credits: `UPDATE profiles SET ai_credits_used = 0;` (run on the day of launch, after final testing)
- [ ] Reset Brandon's credits during testing: `UPDATE profiles SET ai_credits_used = 0 WHERE email = 'brandon.hickle@gmail.com';`
- [ ] Set `CRON_SECRET` in Vercel env vars (any random string) — the daily preferences-fallback cron at `/api/cron/preferences-fallback` returns 500 every day at 09:00 UTC until set. Steps in the route's docstring.
- [ ] **Drop three brand icon assets in `/public/`** — none of these exist yet, so:
  - `og-image.png` (1200×630) — what shows when someone shares a tripcoord.ai link on iMessage/Slack/Twitter/Facebook. Without it, the preview thumbnail is blank. Referenced in layout metadata since commit `4653e36`.
  - `favicon.ico` (16×16 + 32×32 multi-size .ico file) — the small icon in browser tabs and bookmarks. Without it, browsers show a default generic icon.
  - `apple-touch-icon.png` (180×180) — the icon iOS uses when someone adds tripcoord to their home screen. Without it, iOS uses a screenshot of the page, which looks ugly.
  - All three can be generated from the tripcoord wordmark/icon — a free service like [realfavicongenerator.net](https://realfavicongenerator.net) takes one source image and outputs the full set. Drop the files in `/public/` and they just work; no code changes needed.
- [ ] Configure Google OAuth — Google Cloud Console → OAuth Client ID → redirect URI `https://pqizuvmtertpxhhxyemj.supabase.co/auth/v1/callback` → paste keys into Supabase Auth → Providers → Google. Then re-render the hidden Google sign-in buttons on `/auth/login` + `/auth/signup` (handlers were removed in commit `4653e36`; restore handler + button together when ready).
- [ ] Register for Viator + GetYourGuide affiliate programs (blocked until live site approval) → add `VIATOR_AFFILIATE_ID` + `GETYOURGUIDE_AFFILIATE_ID` to Vercel env. Run `scripts/enrich-affiliate-links.ts` to backfill existing activities.
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
