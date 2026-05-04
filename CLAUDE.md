# TripCoord — Claude Code Context

> **App name:** TripCoord (brand) / **Repo:** TripHive / **Domain:** tripcoord.ai  
> **Stack:** Next.js 14 App Router · TypeScript · Tailwind CSS · Supabase · Anthropic Claude API · Stripe  
> **Last updated:** 2026-05-04

---

## What This App Does

TripCoord is an AI-powered travel planning app. Users describe a trip (destination, dates, group, budget, priorities) and Claude generates a complete day-by-day itinerary with activity tracks, food spots, photo spots, and practical notes. The app also handles group collaboration (invite members, vote on activities, split expenses), packing lists, prep checklists, and a "Discover" feed of curated experiences.

---

## Repository & Deploy Workflow

**Repo:** `https://github.com/bhickle/TripHive.git`  
**Branch:** `master` (auto-deploys to Vercel on every push)  
**Vercel project ID:** `prj_CXOmPJ4ffTCbxR4lurg3jho7pEsW`  
**Team ID:** `team_aXNtbEj1uZq70pRXyemRnhx5`

### ⚠️ Git Lock Workaround (Windows mount issue)
The `.git/index.lock` file frequently gets stuck on the Windows-mounted folder. **Never try to delete it directly — it won't work.** Instead, always commit via a temp clone:

```bash
TEMP="/sessions/exciting-gifted-edison/tripcoord-deploy"
TOKEN=$(cat "/sessions/exciting-gifted-edison/mnt/.claude/github_token.txt")
rm -rf "$TEMP" && mkdir -p "$TEMP"
rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' \
  "/sessions/exciting-gifted-edison/mnt/Travel App/wayfare/" "$TEMP/"
cd "$TEMP"
git init -q
git remote add origin "https://bhickle:${TOKEN}@github.com/bhickle/TripHive.git"
git fetch origin -q && git reset --hard origin/master -q
git config user.email "brandon.hickle@gmail.com"
git config user.name "Brandon Hickle"
# Copy changed files in, then:
git add <files>
git commit -m "message"
git push origin master
```

After pushing, copy changed files back to the workspace so they stay in sync:
```bash
cp "$TEMP/src/path/to/file.tsx" "/sessions/exciting-gifted-edison/mnt/Travel App/wayfare/src/path/to/file.tsx"
```

### TypeScript Check
Always run before committing:
```bash
cd "/sessions/exciting-gifted-edison/mnt/Travel App/wayfare" && npx tsc --noEmit 2>&1
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
- [ ] **Fix: itinerary page crash on empty activeDays** — when `activeDays` is empty at load (e.g. Supabase returns no days yet), certain callbacks crash with "cannot read property of undefined". Add null guards. (`src/app/trip/[id]/itinerary/page.tsx`)
- [ ] **Fix: silent vote/delete failures** — vote and delete API calls fail silently; no error toast shown to user. Add `try/catch` + error state display. (itinerary page)
- [ ] **Fix: group page optimistic vote has no rollback** — when a vote API call fails, the UI already updated; there's no rollback. (`src/app/trip/[id]/group/page.tsx`)

### 🟠 Feature Work (Active)
- [ ] **Enable Google OAuth** (`#183`) — Google sign-in buttons exist but OAuth is not configured. Steps: Google Cloud Console → create OAuth Client ID → redirect URI: `https://pqizuvmtertpxhhxyemj.supabase.co/auth/v1/callback` → Supabase dashboard → Authentication → Providers → Google → enable + paste keys.
- [ ] **Fix: trip page cutoff at 4 days** — Brandon's personal trip generation cut off at 4 days. Suspected cause: AI credit limit (all accounts have `ai_credits_used = ai_credits_total` for testing). Before testing generation again, run: `UPDATE profiles SET ai_credits_used = 0 WHERE email = 'brandon.hickle@gmail.com';` in Supabase SQL editor.
- [ ] **Build Trip Pass purchase flow** — trip selector + extra people picker + Stripe checkout. Not yet built.
- [ ] **Split Tracks + Co-organizer → Trip Pass tier** — currently gated at Explorer. Move to Trip Pass.
- [ ] **Wishlist for free users (no AI preview)** — free users can add to wishlist but can't get AI destination previews.

### 🟡 Polish & UX
- [ ] **Unsplash integration** (`#78`) — dynamic destination photos on trip cards. Code scaffold is ready; just needs `UNSPLASH_ACCESS_KEY` env var + wiring in `src/app/trips/page.tsx` and `dashboard/page.tsx`.
- [ ] **Ticketmaster events** (`#69`) — real event data on Discover/What's Out There. Needs `TICKETMASTER_API_KEY`.
- [ ] **Viator/GetYourGuide affiliate links** (`#70`) — "Book This" links on activity cards in the itinerary. Scaffold at `scripts/enrich-affiliate-links.ts`. Needs affiliate registration + API keys (blocked until site is live for affiliate approval).
- [ ] **Trip Story repositioning** — move Trip Story CTA from active itinerary toolbar to a "Memories" section on the dashboard that appears only after trip end date. (`src/app/trip/[id]/itinerary/page.tsx` + `dashboard/page.tsx`)

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
5. After pushing from temp clone, sync files back to workspace mount

### Mock Data Scope
`src/data/mock.ts` is **only** for the demo/preview experience (unauthenticated users). All authenticated user flows must use real Supabase data. Never fall back to mock data for logged-in users.

---

## Recently Shipped (Last Few Sessions)

- **Live-build SSE itinerary generation** — trips generate live into the itinerary page; skeleton mode prevents old data bleed
- **Multi-city itinerary with day-5 fix** — city headers, per-city segments, Day 5 continuation bug fixed
- **Add Day feature** — modal to insert AI-generated or blank day at any position; renumbers all subsequent days
- **Toolbar cleanup** — standalone Add Someone removed; Invite Someone + Day now in Add dropdown; icons standardized
- **Auto-collapse Photo Spots + Where to Stay** — both sidebar sections start collapsed at load
- **Pack This tab rebuilt** — Group Pack / My Pack / Gifts sub-tabs with Supabase-backed souvenir items
- **Expense tracking + group chat** — Who Owes Who tab, Realtime chat, emoji reactions
- **Stripe integration** — checkout, portal, webhook, tier update pipeline all working (test mode)

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
