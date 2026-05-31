# tripcoord — Claude Code Context

> **App name:** tripcoord (brand, always lowercase) / **Repo:** tripcoord / **Domain:** tripcoord.ai  
> **Stack:** Next.js 14 App Router · TypeScript · Tailwind CSS · Supabase · Anthropic Claude API · Stripe  
> **Last updated:** 2026-05-30

---

## What This App Does

tripcoord is an AI-powered travel planning app. Users describe a trip (destination, dates, group, budget, priorities) and Claude generates a complete day-by-day itinerary with activity tracks, food spots, photo spots, and practical notes. The app also handles group collaboration (invite members, vote on activities, split expenses), packing lists, prep checklists, and a "Discover" feed of curated experiences.

---

## Repository & Deploy Workflow

**Repo:** `https://github.com/bhickle/tripcoord.git` (renamed from `TripHive` — GitHub redirects the old URL)  
**Branch:** `master` (auto-deploys to Vercel on every push)  
**Vercel project ID:** `prj_CXOmPJ4ffTCbxR4lurg3jho7pEsW`  
**Team ID:** `team_aXNtbEj1uZq70pRXyemRnhx5`

### Dev Environment
Working directly on the Windows-native filesystem (`C:\Users\abby0\Documents\Claude\TripHive`) via Claude Code. (Local folder kept as `TripHive` — it's wired into the Claude project path; renaming it gains nothing and breaks local config.) Default shell is **PowerShell**; Bash is also available via the Bash tool. Git operations run directly against the local repo — no temp clone needed.

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
| `free` | 25 AI credits/mo (= 1 build), 4 travelers, 7-day max trip |
| `trip_pass` | 50 credits per pass (1 build + 1 regen + 5 small tweaks), 6 base travelers (extras purchasable), 7-day max |
| `explorer` | 100 credits/mo (~4 builds), 6 travelers, 10-day max, split tracks + co-organizer |
| `nomad` | 200 credits/mo (~8 builds), 12 travelers, 14-day max, all features |

Gates live in `useEntitlements` hook → checked against `profile.subscription_tier` from Supabase.  
`UpgradeModal` + `LockBadge` components handle the UI gating.

---

## Supabase

- **Project ref:** `pqizuvmtertpxhhxyemj`
- **URL:** `https://pqizuvmtertpxhhxyemj.supabase.co`
- Admin client bypasses RLS — use for server-side operations that need to see all rows
- Browser client respects RLS — use in API routes that should scope to the authenticated user
- **After any schema migration:** run `generate_typescript_types` MCP tool and write `src/lib/supabase/database.types.ts` in the same commit. Missing this breaks Vercel builds.

Key tables: `profiles`, `trips`, `itineraries`, `trip_members`, `trip_invites`, `trip_photos`, `group_messages`, `group_votes`, `vote_options`, `vote_responses`, `expenses`, `packing_items`, `souvenir_items`, `prep_tasks`, `wishlist_items`, `discover_destinations`, `featured_itineraries`, `seasonal_collections`, `waitlist`

---

## Environment Variables (Vercel)

All set in Vercel → tripcoord → Settings → Environment Variables.  
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
| `UNSPLASH_ACCESS_KEY` | ✅ Set | Dynamic trip card photos (#78 — shipped; cover photos render live) |
| `TICKETMASTER_API_KEY` | ❌ Missing | Real events data (#69) |
| `VIATOR_AFFILIATE_ID` | ❌ Missing | Affiliate booking links (#70) |
| `GETYOURGUIDE_AFFILIATE_ID` | ❌ Missing | Affiliate booking links (#70) |

---

## Open Development Tasks

These are the active items to build/fix, in rough priority order. Note: this list goes stale fast. Always cross-check against `git log` before assuming a task is unfinished — many "open" items here are knocked out within a session and not removed promptly.

### 🔴 Must-Fix Before Any More Testing
- _All previously listed items shipped. Add new launch-blockers here as they surface._
- **QA-audit open items** — the 2026-05-30 full-site audit shipped ~30 fixes; the remainder are tracked in **`SITE_QA_AUDIT_2026-05-30.md`** (top "Still open" list). The launch-relevant ones: **SEC-3** (remove the `?? 'tc2026'` middleware fallback + set a strong `PREVIEW_SECRET` — launch-blocker), **SEC-2/COMP-1** (allow-list `priceId` + clamp `extraPeople` in `stripe/checkout`), **MONEY-3** (reconcile the 3 credit-reset writers). Deferred-with-reason (need a product call / schema change / real traffic): DATA-2 (realtime clobber), GROUP-6 (settle-by-id), SHARE-5 (world opt-in), DB-7 (RLS perf — post-traffic).
- ~~Server-side AI credit enforcement~~ — **Shipped 2026-05-08, extended 2026-05-16, refactored 2026-05-29.** Shared helpers `checkAiCredits` / `incrementAiCreditsUsed` in `lib/supabase/aiCredits.ts` (two-phase: gate before, charge after success — failed AI calls don't burn credits). Atomic increment via Postgres RPC since 2026-05-29 (`increment_user_ai_credits` / `increment_trip_pass_credits`) — parallel calls no longer clobber the read-baseline-then-write. **Trip Pass credit pooling**: when an AI action is fired with `tripId` AND that trip has an active Trip Pass, the charge routes to `trip_passes.ai_credits_used` instead of the user's personal counter. Trip-scoped AI endpoints (build, regen, add-day, suggest, transport-parse, parse-itinerary, discover, hotels, enrich) pass `tripId`; user-scoped Nomad endpoints (packing, phrasebook, receipt scan, layover) don't. Narrow TODO: a user whose own tier is `trip_pass` calling a user-scoped action without `tripId` is exempt. Currently only happens for Nomad-feature actions (which require Nomad tier anyway, so trip_pass users never reach them). **Build-level claim (2026-05-29):** chunked builds now charge ONCE per build via the `trips.build_credits_charged_at` atomic-claim — 25 credits per build regardless of chunks/cities. 1 free build = 1 actual trip, not "first 3 days of a trip" (see [Build credit claim semantics](#build-credit-claim-semantics) under Code Conventions). Multi-city is now properly gated to paid tiers (client `LockBadge` + server 403 `MULTI_CITY_LOCKED`).

### 🟠 Feature Work (Active)
- [ ] **Build durability Tier 2 (Inngest)** — Tier 1 shipped 2026-05-09 (server-owned abort + per-day persistence + resume detection). Tier 2 moves orchestration to an Inngest worker so builds complete even when the browser is fully closed. Blocked on Brandon's prep checklist (Inngest account + `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` in Vercel). See `memory/project_tier2_prep.md`.
- [ ] **Enable Google OAuth** (`#183`) — Google sign-in buttons exist but OAuth is not configured. Steps: Google Cloud Console → create OAuth Client ID → redirect URI: `https://pqizuvmtertpxhhxyemj.supabase.co/auth/v1/callback` → Supabase dashboard → Authentication → Providers → Google → enable + paste keys.
- ~~Yay/Nay dead-space layout decision~~ — **Shipped 2026-05-25, commit `a28d0f5`.** Replaced the fixed 2-column grid with a CSS masonry flow so Group Votes, Activity Pulse, Wishlist, and Nay Watch auto-balance across two columns. No more dead space. Empty Group Votes state now shows an inviting card with starter prompts.
- [ ] **Monetization — affiliate go-live + repricing (post-launch)** — full plan in `MONETIZATION.md`. Phase 0 shipped (provider-agnostic affiliate layer in `src/lib/affiliate.ts`; gated "Book this" on activity cards + "Find this hotel" in Where to Stay — all dark until an env var is set). Remaining:
  - [ ] Once the domain is live, apply to affiliate programs: Travelpayouts (~24h auto-approve; also the path to GetYourGuide), Stay22 (~instant, hotels), Viator (direct, ~a few days, no traffic minimum).
  - [ ] Before enabling, confirm each partner's exact deep-link param format against their dashboard (Viator `pid/mcid`, Stay22 `allez`, Booking `aid`) — flagged in `src/lib/affiliate.ts`.
  - [ ] Turn it on by setting `NEXT_PUBLIC_VIATOR_PARTNER_ID` / `_GETYOURGUIDE_PARTNER_ID` / `_STAY22_AID` / `_BOOKING_AID` in Vercel, then eyeball the live placement of the gated links (built without seeing them rendered).
  - [ ] **Pricing decision (launch-time, not strictly post-launch):** reprice subscriptions per Model A — collapse Explorer+Nomad into one Pro (~$39/yr), drop Trip Pass to ~$19, make group collab + expense-split free; update `src/lib/stripe-prices.ts` + `TIER_LIMITS`. Then converge toward free + booking commissions (Model B) as commission revenue proves out.
- ~~Invite-token system Phase 2 (privacy gate)~~ — **Shipped 2026-05-08, commit `8e575cb`.**
- ~~Trip Story real-data implementation~~ — **Shipped 2026-05-08.**
- ~~Per-priority difficulty UI~~ — **Closed 2026-05-08, won't build.**
- ~~Click expense line item to view/edit details~~ — **Shipped 2026-05-09.** Inline expand on expense rows reveals editable line items (description + amount, add/remove rows, optimistic save via PATCH). See `src/app/trip/[id]/group/page.tsx`.

### 🟡 Polish & UX
- [ ] **Reference-link fetch reliability** (shipped 2026-05-25, commit `58fdefe`) — "Plan this trip" on an On My Radar item now fetches the user's saved links via `/api/fetch-reference` (Reddit `.json`, else HTML→text; SSRF-guarded, bot UA, best-effort, no AI/credit cost) and feeds the extracted text to the generator as a "reference material" prompt slot. **Limitation:** it's a plain server-side fetch + tag-strip, so it gets little/nothing from sites that bot-block, login-wall, or render content in JS. Known problem sites: **TripAdvisor** (Cloudflare/anti-bot — and it's literally suggested in the paste box, so this will be common), **Reddit** (unauth bot 403s), **Instagram / TikTok / X / Facebook / Pinterest / Yelp** (login wall + JS), **Booking / Expedia / Airbnb** (anti-bot), **YouTube** (description only, no transcript), **Google Maps/Docs links** (JS app, no static text). Generally fine: most travel blogs, Medium/Substack, news articles, Wikipedia. Failure is graceful — `referenceContent` stays empty, the build proceeds on destination + priorities, and the Trip Builder's "pulled ideas" chip just never flips to "ready." **Fallback if it matters:** a render/proxy scraping service (e.g. a headless-render API) for the JS/anti-bot sites, official APIs where they exist (Reddit OAuth, YouTube transcript), and/or a Readability-style extractor + a small Haiku summarization pass on whatever HTML is retrieved.
- ~~**Unsplash integration** (`#78`)~~ — **Shipped.** `UNSPLASH_ACCESS_KEY` is set; dynamic destination cover photos render live on trip cards via `/api/unsplash/photo` (resolved URL persisted to `trips.cover_image`, attribution chip + download tracking per Unsplash production guidelines). See `src/components/TripCard.tsx`.
- [ ] **Ticketmaster events** (`#69`) — real event data on Discover/What's Out There. Needs `TICKETMASTER_API_KEY`.
- [ ] **Viator/GetYourGuide affiliate links** (`#70`) — "Book This" links on activity cards in the itinerary. Scaffold at `scripts/enrich-affiliate-links.ts`. Needs affiliate registration + API keys (blocked until site is live for affiliate approval).
- [ ] **Prompt-cache optimization (low priority)** — `cacheableGuidance` can fall below Anthropic's 2K-token threshold for users with few priorities, in which case caching silently doesn't happen. Not a regression — the current architecture is correct, just sub-optimal at the low end. Bigger fix: move stable user-prompt content (budgetTierText, groupTypeText, walkingRuleText, etc.) into the cacheable region so multi-city chunks share more cache. Audit notes from 2026-05-08.
- [ ] **Deferred from the 2026-05-25 full-site QA** (full context in `SITE_QA_AUDIT.md`) — three low-priority items consciously left after the audit:
  - [ ] **Multi-city Trip Builder step-2 back-nav gate** — building a 2+ city trip, allocating nights, then clicking Back to "Where To" can leave **Next** stuck behind a "nights exceed your trip length" message (it compares against the default length that hasn't updated yet). Rare; worth fixing if reproducible. `src/app/trip/new/Client.tsx` (step-2 Next-disabled logic).
  - [ ] **Dashboard stale-session 401 redirect is dead code** — `/api/trips` returns `200 {trips:[]}` for an unauthenticated request, so the dashboard's "bounce to login on 401" never fires (an expired session shows an empty dashboard instead). Proper fix is a `/api/trips` contract change touching other callers, so left alone. `src/app/dashboard/Client.tsx:95`.
  - [ ] **Activity Pulse vote-count lag** — under simultaneous multi-user voting the on-screen count can briefly lag the `activity_votes` truth; self-corrects on reload, no data loss. `src/app/trip/[id]/itinerary/Client.tsx` (handleVote count merge).
- [ ] **Verify featured-fork date-less trip flow (live site)** — the `b42a18b` P1 fix (Add Day crash + "Invalid Date" header on date-less forks) could not be runtime-verified locally (no `.env.local`/Supabase keys, no browser automation, and the fork is a prod DB write). Confirm on tripcoord.ai while logged in: Discover → open a Seasonal Collection (or a matched Trending card) → **Use as starting point** → **Skip — I'll pick dates later** → the itinerary renders, day headers read **"Day N"** (not "Invalid Date"), and **+ Add → Day** works without freezing.
- [ ] **Verify saved-layover flow (live site)** — Layover Planner saved plans (`a92a627` + suggestions persistence) couldn't be runtime-verified locally (auth + DB write). Confirm on tripcoord.ai: set airport + time → Find → **+ Add to layover** items (and a hotel) → sidebar fills, reorder/remove work → **Save this layover** → leave the page and return → the switcher shows it and loading it restores the basket **and** the generated suggestions. Also confirm the Find button isn't stuck on return.
- [ ] **Verify build-credit refactor (live site)** — from the 2026-05-29 QA pass. Free-tier 7-day single-city build should complete end-to-end and charge **25 credits total** (not 75 per the old per-chunk math). Then click Regenerate on the same trip → charges another 25 (`profiles.ai_credits_used` increments by 25 each time; check via Supabase dashboard). As a free user, the "Add another destination" multi-city button should show a lock icon; if you DevTools-bypass the click handler, the API should 403 with `MULTI_CITY_LOCKED`.
- [ ] **Verify Stripe cancel-at-period-end (live site, requires Stripe test mode)** — also from 2026-05-29. From the Billing Portal click Cancel on a paid subscription → confirm `profiles.subscription_cancel_at` is set to the period end (Supabase dashboard). Reactivate before the period ends → row clears back to NULL. At period end, Stripe fires `subscription.deleted` → tier flips to `free` and `subscription_cancel_at` clears again.
- [ ] **Verify vote unique constraint (live site)** — invite a second member with the same display name as an existing member; both should be able to vote on the same poll without one silently failing (old `UNIQUE (vote_id, voter_name)` would have collided).
- [ ] **Storage cruft cleanup (low priority)** — photo-upload audit 2026-05-25: the `trip-photos` bucket has 7 orphan objects (all Apr 17–May 9, pre-fix era) with no matching `trip_photos` row, and the `avatars` bucket accumulates superseded avatars (timestamped paths, no delete-on-replace). Both are harmless storage cost, not correctness — the current upload path cleans up the storage object on a failed DB insert, so no NEW orphans accrue. Optional housekeeping script if storage cost ever matters.
- [ ] **Deferred feature ideas (rescued from the retired `QA_ACTION_LIST.md`, 2026-05-25)** — not bugs, just unbuilt:
  - [ ] **Frequent Flyers / travel-buddy list** — a saved list of recurring travel companions, so you don't re-enter the same people every trip. Surfaces in invite/member flows.
  - [ ] **Map the booked hotel** — when a hotel is marked "I Booked This," plot it on the trip map/route alongside activities.
  - [ ] **"Days Out There" playful counter** — make the dashboard stat card show something playful (hours/min/sec ticking) instead of a flat day count.
- [ ] **AI-behavioral retests (code fixes shipped 2026-05-25; confirm on a fresh live build)** — re-verify on real generations: (a) long itineraries cutting off ~12:30 PM / sparse days, (b) long trips repeating restaurants, (c) day-highlight text wrapping vertically in Nightlife/Shopping/Photo-tips, (d) day-count label disagreeing with dates (7-day card showing "6d").

### 🟢 Go-Live Prerequisites (Brandon-owned)
- [ ] **Lowercase `tripcoord` rebrand — remaining steps.** Product copy, email templates/bodies, comments, affiliate tracking params, and forward-looking docs were rebranded + pushed 2026-05-25 (commit `910e3e1`, `tsc` clean — pure 1:1 token swap, no identifiers touched). Old variants (Wayfare / TripHive / TripCoord) are gone from app code. Brand is **strictly lowercase everywhere**. What's left is dashboard/infra work:
  - [ ] **GitHub:** rename repo `TripHive` → `tripcoord` (Settings). Old URL auto-redirects, so nothing breaks immediately. _Then ask Claude to run `git remote set-url origin https://github.com/bhickle/tripcoord.git`._
  - [ ] **Vercel:** rename project `TripHive` → `tripcoord` (Settings → General; project ID `prj_…` unchanged, deploys unaffected, git link follows the GitHub rename).
  - [ ] **Vercel env:** set `SENDGRID_FROM_EMAIL=noreply@tripcoord.ai` (also tracked in the env-vars table above).
  - [ ] **Supabase Auth → Email Templates:** paste the updated copy from `email-templates/confirm-signup.html` + `email-templates/reset-password.html` (live emails are dashboard-configured; the files are just source).
  - [ ] **Supabase (optional, cosmetic):** rename the project display name (ref `pqizuvmtertpxhhxyemj` is immutable — nothing connects by name).
  - [ ] **SendGrid:** update the verified sender's display name if it still reads "TripCoord" (code now sends as `tripcoord`).
  - [ ] **Claude can do on request:** (a) read-only Supabase content scan (discover/featured/seasonal/notifications rows) for any stored "TripCoord" strings; (b) sweep `/mockups/*` (still say `TRIPCOORD`) and the stale `wayfare` path note in `CLAUDE_CODE_FIXLIST.md:296`.
  - Note: the **local folder stays `TripHive`** on purpose — it's wired into the Claude project path; renaming gains nothing and breaks local config.
- [ ] Re-enable email confirmation in Supabase (currently OFF for testing ease)
- [ ] **Enable Maps Static API on the Google Maps key** (Google Cloud Console → APIs & Services → enable "Maps Static API"). The Trip Story "Where we went" map uses Static Maps; it renders broken until this is enabled (separate API from Maps JS / Places). _From the 2026-05-30 QA audit._
- [ ] **Enable leaked-password protection in Supabase Auth** (Auth → Providers → Password → toggle on; checks HaveIBeenPwned). _QA audit finding DB-5._
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
2. Write output to `src/lib/supabase/database.types.ts`
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

### Brand color discipline
The product runs on a tight palette — don't introduce new accent families ad-hoc.

- **Primary action color: sky-800 / sky-900.** Used for `.btn-primary`, every Settings save button, every itinerary action, every Group hub CTA. The `.btn-primary` global was amber until 2026-05-29; flipping it to sky was a one-line cascade across auth.
- **Amber-500 / amber-600**: reserved for **Trip Pass marketing** (Trip Pass tier card, the "Most popular" badge on landing+pricing) AND the landing-page hero CTA. Anywhere else, amber reads as "Trip Pass / paid hero." Do NOT use amber for generic primary actions.
- **Emerald-600**: the "Best value" badge (Explorer). Reserved for that single role.
- **Track A = sky-500, Track B = amber-500**. Was violet/rose pre-2026-05-29; both colors are now reused for other purposes ("AI Pick" badge = violet pill; error states = rose) so don't reintroduce violet/rose for tier or track identification.
- **Warning / notice banners (ruling 2026-05-30, "Treatment B"):** `rose` (bg-rose-50, border-rose-200, text-rose-700, rose-500 icon) for **problems / failures / cautions / needs-action** (couldn't-load, "this will overwrite," validation warnings). `zinc` (bg-zinc-100, border-zinc-200, text-zinc-600, zinc-400 Info icon) for **neutral FYIs** (travel advisories, feature explainers, "do X first" hints). Do NOT use amber for warnings — amber stays reserved for **paid moments** (Trip Pass marketing, hero, credits-paywall / upgrade upsells, which legitimately stay amber).
- **Neutrals: text-zinc-900 for headings, text-zinc-500-700 for body, text-slate-500-700 for form labels.** Mix them carefully — pages that mix zinc + slate without intent feel inconsistent. The Day-Of page used to live in a parallel slate palette; reconciling it to zinc fixed the "different product" feel.
- **Borders + chrome:** `border-zinc-100` for content cards (white-on-parchment cards), `border-slate-200` or `border-slate-300` for interactive form controls. Mixing slate and zinc on borders is OK if they're in different contexts.

If you find yourself reaching for purple/indigo/rose/pink/teal as a "fresh accent," stop. The palette was deliberately narrowed in the 2026-05-29 design sweep — re-introducing colors widens the maintenance surface and dilutes the brand.

### Empty state pattern
Use `<EmptyState>` from `src/components/EmptyState.tsx` for any list/grid/tab that needs to render a "nothing to show here" state. Don't hand-code a new icon-title-cta cluster.

```tsx
<EmptyState
  icon={MessageCircle}
  title="No messages yet"
  description="Say hi to the crew below."
  compact      // optional — less vertical padding for in-tab use
  cta={{ label: 'Browse Discover', href: '/discover' }}       // OR
  action={{ label: '+ Add first expense', onClick: handler }} // OR neither
/>
```

The component renders: white `rounded-2xl border-zinc-100` card, centered icon in a `zinc-100` chip, semibold `zinc-700` title, `zinc-500` description, optional `bg-sky-800 rounded-full` CTA. Hand-coding the same shape per surface was how we ended up with 6 different empty-state patterns across the app pre-2026-05-29. Three are now using the component (chat / expenses / packing); other surfaces can migrate incrementally.

The Group Votes "starter prompts" empty state (with clickable question chips) is a deliberate richer variant — leave it alone. `<EmptyState>` is for the simple icon-title-description-CTA case.

### Build credit claim semantics
Chunked builds (long single-city, multi-city) call `/api/generate-itinerary` once per 3-day chunk, but billing is per-build, not per-chunk. The race-safe primitive is an atomic claim on `trips.build_credits_charged_at`:

```
UPDATE trips
SET build_credits_charged_at = now()
WHERE id = $tripId AND build_credits_charged_at IS NULL
RETURNING id;
```

The chunk whose UPDATE returns a row wins the claim and pays via `checkAiCredits` + `incrementAiCreditsUsed`. Every subsequent chunk's UPDATE returns 0 rows → that chunk is `source: 'exempt'` and skips both gate and increment. Regenerate (`?fresh=1`) sends `freshRebuild: true` on its first chunk ONLY (one-shot `sentFreshRebuild` flag in the build effect); server clears the claim before re-claiming. Two failure cases revert the claim so the user can retry: `checkAiCredits` 402-denied and `dayIndex === 0` at stream end. Trip Pass pooling is unaffected — pooling logic lives inside `checkAiCredits` which still runs once for the claim winner. Don't move credit charging out of this pattern without preserving the "1 build = 1 charge" guarantee; the prior per-chunk model 402'd free users mid-build.

### Supabase Browser Client Singleton
**ALWAYS** import the singleton from `@/lib/supabase/client`, never call `createBrowserClient` from `@supabase/ssr` directly:
```ts
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase/client';
const supabase = createSupabaseBrowserClient();
```
Multiple instances fight over the same auth Web Lock and silently drop the auth session, which makes calls run as anonymous and silently fail RLS. This was the root cause of the photo-upload-vanishes-on-refresh bug (commit after `9191974`).

### Verify-before-show (AI emit gate)
Every AI route that emits a day or activity to the user runs through a 2-tier location-validation gate BEFORE the data reaches the client. The shared helper is `src/lib/places/verifyDayLocations.ts`:

```ts
import { validateAndCorrectDay } from '@/lib/places/verifyDayLocations';
const result = await validateAndCorrectDay(dayObj, {
  anthropic: client,
  modelId: 'claude-sonnet-4-6',
  systemPrompt: SYSTEM_PROMPT,
  placesApiKey: process.env.GOOGLE_MAPS_KEY ?? '',
  maxRetries: 2,
  sendStatus: (msg) => send({ type: 'status', message: msg }),
});
if (!result.ok) { /* hard fail — return 500 / SSE error, don't charge */ }
return result.day;
```

**Tier 1** (free): string-check every activity's `address` against `day.city` (normalized — strip diacritics, lowercase, expand St./Mt.). **Tier 2** (~$0.03/venue): Places API lookup for venues that passed Tier 1, check the resolved `formattedAddress` contains `day.city`. On failure: re-prompt the AI for the single failing day/activity with explicit correction guidance + retry up to 2x. On hard fail: emit error + don't charge credits.

Coverage: `/api/generate-itinerary` (all 3 SSE emit sites), `/api/trips/[id]/add-day`, `/api/suggest-activity`. The smaller-grain `addressContainsCity` + `lookupPlacesAddress` are exported for the single-activity path. Brandon's 2026-05-30 directive: "I want it to verify before becoming an itinerary." Don't add a NEW AI-emit route without wiring it through this gate.

---

## Older sessions

All session notes live in `CHANGELOG.md` (newest first): the **2026-05-30 full-site QA audit + remediation marathon** (~31 commits, 5 migrations — full findings in `SITE_QA_AUDIT_2026-05-30.md`), then the May 29 night → May 30 morning marathon (QA pass + landing reposition + verify-before-show), May 29 evening multi-admin + design-consistency-sweep, May 29 product-polish + landing port, May 29 QA pass, May 9, May 8, May 7, and earlier. CLAUDE.md carries no inline "Recently Shipped" section, just this pointer, to stay under the 40K-char auto-load threshold.

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
| Supabase schema types | `src/lib/supabase/database.types.ts` |
| Auth user hook | `src/hooks/useCurrentUser.ts` |
| Verify-before-show helper | `src/lib/places/verifyDayLocations.ts` |
| Shared marketing nav (/ + /pricing) | `src/components/MarketingNav.tsx` |
| Shared empty-state shell | `src/components/EmptyState.tsx` |
| Day-preview extractor (community/founder) | `src/lib/itinerary-preview.ts` |
| Pricing-strategy partner outline | `PRICING_TIER_COLLAPSE_OUTLINE.md` |
| Go-live checklist | `GOLIVE_CHECKLIST.md` (workspace root) |
