# TripCoord — Go-Live Checklist

Items that need to happen before public launch. Status:
🟥 Not started · 🟧 In progress · 🟩 Done

Update the status emoji as you complete each item. CLAUDE.md links here for the full pre-launch test pass. Last verified 2026-05-09.

---

## 🔑 External services / API keys

### 🟥 Unsplash — create app, set demo key, then apply for Production
**Why:** Code is wired (attribution chip, download tracking, UTM-tagged links, server-side hotlinking) but `UNSPLASH_ACCESS_KEY` is **not set** in Vercel — the Unsplash photos feature is dormant. Demo tier caps at 50 req/hr; you'll want Production (5,000/hr) before launch traffic. Approval takes a few days to a week.

**Steps:**
1. Create an Unsplash developer app at https://unsplash.com/oauth/applications
2. Copy the Access Key, add `UNSPLASH_ACCESS_KEY` to Vercel env (Production + Preview)
3. Redeploy — confirm photos render on trip cards
4. Once live and traffic-verified, click **"Apply for Production"** in the Unsplash dashboard
5. **Timing:** apply 1–2 weeks before any marketing push.

### 🟥 Stripe — swap test keys for live
**Why:** Currently using test-mode keys, so no real charges go through.

**Steps:**
1. In Stripe Dashboard, switch to live mode
2. Recreate products (Trip Pass $30, Explorer $7.99/mo, Nomad $14.99/mo) in live mode — note the new price IDs
3. Update `src/lib/stripe-prices.ts` with the live price IDs
4. Update Vercel env vars:
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` → live publishable key
   - `STRIPE_SECRET_KEY` → live secret key
   - `STRIPE_WEBHOOK_SECRET` → new webhook secret (create a new live-mode webhook endpoint pointed at the Vercel `/api/webhooks/stripe` URL)
5. Redeploy
6. Test one purchase end-to-end with a real card before announcing

### 🟥 Twilio — leave trial mode
**Why:** Trial accounts can only SMS pre-verified numbers. Real users will be silently blocked.

**Steps:**
1. Add a payment method to upgrade from trial → Pay-As-You-Go
2. Complete A2P 10DLC registration (US carriers require this for SMS — Twilio walks you through it; takes a few days)
3. Confirm the existing `TWILIO_PHONE_NUMBER` (+18445310179) is approved on the new campaign

### 🟥 SendGrid — finish domain authentication + verify sender
**Why:** Without DKIM/SPF set up for `tripcoord.ai`, invite emails land in spam. The default fallback sender (`hello@tripcoord.ai`) is hardcoded in 2 routes — verify it as a sender before relying on the fallback.

**Steps:**
1. SendGrid → Settings → Sender Authentication → Authenticate Your Domain
2. Add the CNAME records SendGrid generates to your DNS provider (Vercel DNS or wherever the domain lives)
3. Verify within SendGrid
4. Update `SENDGRID_FROM_EMAIL` env var to `noreply@tripcoord.ai` (currently a Gmail address)
5. Verify `hello@tripcoord.ai` as a Single Sender too (used as a hard-coded fallback in `/api/invite/email` and `/api/auth/send-reset-email`)
6. Send a test invite to a fresh inbox to confirm it lands in Inbox, not Spam/Promotions

### 🟥 Supabase — upload branded auth email templates
**Why:** Default Supabase auth emails (signup confirm, password reset) look generic/spammy. Branded HTML lives in `email-templates/` at the project root.

**Steps:**
1. Supabase Dashboard → Authentication → Email Templates
2. Paste `email-templates/confirm-signup.html` into the **Confirm signup** template (subject: "Confirm your TripCoord account")
3. Paste `email-templates/reset-password.html` into the **Reset Password** template (subject: "Reset your TripCoord password")
4. Save both, send a test trigger from `/auth/signup` and the password reset flow

### 🟥 Sentry — create project and set DSN env vars (optional but recommended)
**Why:** Without it, you launch blind. `@sentry/nextjs` is already installed and config files are wired — they no-op cleanly without the DSN, so the app works either way. Adding the DSN flips on error monitoring with stack traces.

**Steps:**
1. Create a free account + project at https://sentry.io
2. Copy the DSN
3. Vercel → TripHive → Settings → Environment Variables → add:
   - `NEXT_PUBLIC_SENTRY_DSN` (client-side errors) — same DSN value
   - `SENTRY_DSN` (server-side errors) — same DSN value
4. Redeploy
5. (Later) for source maps in Sentry: add `SENTRY_AUTH_TOKEN` + wrap `next.config.js` with `withSentryConfig`. Not blocking — readable error frames work without it.

### 🟥 Inngest — Tier 2 build-durability prep (post-launch ready)
**Why:** Tier 1 build durability shipped 2026-05-09 (server-owned abort + per-day persist + resume detection). Tier 2 moves orchestration to an Inngest worker so builds complete even when the browser is fully closed. Not strictly launch-blocking, but recommended within the first 1-2 weeks of real traffic.

**Steps:**
1. Sign up at https://inngest.com, create a TripCoord environment
2. Vercel env vars: add `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` (Production + Preview)
3. Verify `itineraries` is in the Supabase `supabase_realtime` publication (Database → Replication)
4. Tell Claude when you're ready and the worker migration ships next

See `memory/project_tier2_prep.md` for the full prep notes + design rationale.

---

## 🔐 Auth / user setup

### 🟥 Supabase — re-enable email confirmation
**Why:** Currently OFF for testing ease. Real users should confirm their email.

**Steps:**
1. Supabase Dashboard → Authentication → Providers → Email → toggle "Confirm email" ON
2. Verify the confirmation email template + redirect URL look correct

### 🟥 Supabase — add `/auth/update-password` to redirect allowlist
**Why:** The password reset flow redirects users to `/auth/update-password` after they click the email link; if it's not in the allowlist, Supabase rejects the redirect.

**Steps:**
1. Supabase Dashboard → Authentication → URL Configuration → Redirect URLs
2. Add `https://www.tripcoord.ai/auth/update-password`
3. (Optional) add `http://localhost:3000/auth/update-password` for local dev

### 🟥 Google OAuth — enable Google sign-in (issue #183)
**Why:** Google sign-in buttons exist on /auth/login and /auth/signup but OAuth isn't configured, so the buttons currently no-op.

**Steps:**
1. Google Cloud Console → APIs & Services → Credentials → Create OAuth Client ID (Web application)
2. Authorized redirect URI: `https://pqizuvmtertpxhhxyemj.supabase.co/auth/v1/callback`
3. Copy the Client ID + Secret
4. Supabase Dashboard → Authentication → Providers → Google → toggle on, paste the keys
5. Test the flow on production after deploy

---

## 🗄️ Data hygiene + ops

### 🟥 Reset AI credit counters
**Why:** Testing during development pollutes the `ai_credits_used` counter. Real users should start at zero.

**Steps:** Run this against production Supabase:
```sql
UPDATE profiles SET ai_credits_used = 0;
```
Do this **the day of launch**, after final testing, before announcing.

### 🟥 Set `CRON_SECRET` in Vercel
**Why:** The daily preferences-fallback cron at `/api/cron/preferences-fallback` returns 500 every day at 09:00 UTC until this env var is set.

**Steps:**
1. Generate a random string (e.g. `openssl rand -hex 32`)
2. Vercel → TripHive → Settings → Environment Variables → add `CRON_SECRET` with the random value
3. Redeploy

### 🟥 Pre-launch database backup
**Why:** Once real users start writing trips, photos, expenses — losing data is unrecoverable. Take a snapshot before you announce.

**Steps:**
1. Supabase Dashboard → Database → Backups
2. Trigger a manual backup, verify it appears in the list
3. (Already on Pro tier? Daily PITR is automatic — confirm it's enabled.)

### 🟥 Verify production env vars set
Quick audit before launch — one missing key silently degrades a feature:

| Variable | Required for | CLAUDE.md status |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI itinerary generation | ✅ Set |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All client/SSR auth | ✅ Set |
| `SUPABASE_SERVICE_ROLE_KEY` | API admin client (RLS bypass) | ✅ Set |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Subscriptions + Trip Pass | 🟧 Test mode — see Stripe section above |
| `SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL` | Invite + reset emails | 🟧 Gmail sender — see SendGrid above |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | SMS invites | 🟧 Trial mode — see Twilio above |
| `GOOGLE_MAPS_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | Places autocomplete + Maps | ✅ Set |
| `NEXT_PUBLIC_APP_URL` | Email/SMS link generation | ✅ Set (`https://www.tripcoord.ai`) |
| `PREVIEW_SECRET` | Coming-soon bypass | 🟥 Verify set — middleware refuses all preview attempts when missing |
| `UNSPLASH_ACCESS_KEY` | Trip card cover photos | 🟥 Missing |
| `CRON_SECRET` | Daily preferences fallback | 🟥 Missing |
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | Error monitoring | 🟥 Missing — recommended |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Tier 2 build durability | 🟥 Missing — post-launch |
| `TICKETMASTER_API_KEY` | Real events on What's Out There | 🟥 Missing — post-launch |

### 🟥 npm audit + dependency review
- `npm audit` — review high/critical findings; only patch if exploitable in our context
- Vercel deployment logs scrolling cleanly, no recurring 500s
- Supabase advisors clean (Database → Advisors)
- Confirm RLS is enabled on every table that holds user data

---

## 🧪 Pre-launch test pass

### 🟥 Smoke test — core flows on production with a fresh account

- [ ] Sign up → confirm email lands → click link → land on dashboard
- [ ] Build a trip via the wizard, full multi-city, generate itinerary all the way through
- [ ] Edit the trip (destination/dates), regenerate
- [ ] Add a day, add an activity, vote on activities
- [ ] Invite someone via email, they accept, they show in members
- [ ] Invite someone via SMS (different phone number than the trial whitelist)
- [ ] Group chat sends + receives, **emoji reactions sync in realtime across two browsers**
- [ ] Create a vote, members cast, organizer closes
- [ ] Add an expense, settle it, **edit line items inline**, scan a receipt
- [ ] **Custom split** — confirm the live "shares total $X of $Y" preview turns green when balanced
- [ ] Mark itinerary `is_public_template = true`, view at `/community/[id]` — **organizer name shows first-name only**
- [ ] Fork the public template from `/discover`, dates persist, "(Copy)" suffix appears on Home Base
- [ ] Like an itinerary, like an activity, both counts persist on refresh
- [ ] **Logged-out, click Like on a community card → bounced through login → returns to /discover, like applied**
- [ ] Add destination to wishlist, paste a TripAdvisor URL, see preview card render
- [ ] **Wishlist heart toggle on /discover and /wishlist** — toggle off, refresh, confirm gone; toggle on, refresh, confirm saved
- [ ] **On My Radar source icons** — Globe (has links) vs Pencil (manual) renders correctly per card
- [ ] Click a Seasonal Collection card on Discover, grid filters correctly (or shows quick-plan chips when catalog is missing)
- [ ] Generate AI packing list (Nomad), AI phrasebook (Nomad)
- [ ] Buy a Trip Pass with a real card (after Stripe live keys are in)
- [ ] Subscribe to Explorer with a real card
- [ ] Cancel the subscription via the customer portal
- [ ] Trigger the password reset flow end-to-end
- [ ] Sign out, sign back in, dashboard reloads correctly

### 🟥 Photo flows (likes/comments/upload)

- [ ] Upload a photo to a trip — Day + Location are mandatory, button gates until both selected
- [ ] Refresh, photo still there with correct day grouping
- [ ] Upload progress reaches 100% and resolves cleanly (no 88%-stuck regression)
- [ ] Open a photo modal — Like button works, count persists across refresh
- [ ] Post a comment, edit it (pencil icon on hover), confirm "(edited)" indicator appears
- [ ] Delete a comment via custom in-app modal (no native browser confirm)
- [ ] **Two-browser realtime test:** open same photo on two browsers, like + comment from one, confirm the other updates within seconds without refresh
- [ ] Photo filter "Mallory" vs "You" — when you ARE Mallory, both filters return identical photos
- [ ] Verify uploader names are real names (or email-local-parts), no literal "You" persisting

### 🟥 Build durability — Tier 1 fixes

- [ ] **Tab close mid-build:** start a 7+ day trip, close tab around day 4, reopen 30s later, confirm resume from day 5+ (not day 1)
- [ ] **Refresh mid-build:** same as above but with a refresh instead of close
- [ ] **Long generation (Dublin-class):** 9-10 day single-city trip with food + nightlife + shopping all selected. Watch Vercel logs:
  - Should see `[generate-itinerary] persistGenerationDays` lines per day
  - If `First pass stop_reason=…` fires with `partialDayBuffered=true`, confirm `recoverTruncatedArray salvaged N day(s)` follows
  - Final result should have all requested days, no truncation
- [ ] **Mobile sleep mid-build:** start a build on mobile, lock the screen during generation, unlock — page should resume

### 🟥 Default travel partner

- [ ] Set a default partner via Settings → Default travel partner (email lookup)
- [ ] Confirm validation: self-pair rejected, unknown email rejected
- [ ] Create a new trip — partner auto-appears as a member in Group on first load
- [ ] Past trips are NOT retroactively shared (new trips only, by design)

### 🟥 Group Pack realtime

- [ ] Two browsers on the same trip's Prep page → Pack This → Group tab
- [ ] Add an item from one, confirm it appears in the other within seconds
- [ ] Toggle "packed" from one, confirm the checkbox flips on the other
- [ ] Delete from one, confirm it disappears from the other

### 🟥 Regenerate flow

- [ ] On a trip with `?mode=generating` already complete, click Regenerate (organizer-only)
- [ ] If it errors, "Go back and try again" button returns you to the trip page (not Trip Builder)
- [ ] Successful regenerate — new days replace old, no stale Iceland data flashes

### 🟥 Mobile-specific

- [ ] Trip Builder works on iPhone Safari + Chrome Android
- [ ] Photo upload flow works on mobile (camera roll picker)
- [ ] Photo modal Like + Comment buttons are tappable (always-visible affordance on touch widths)

---

## 📋 Open feature work (not launch-blocking)

These are useful to track but won't block launch. Status: not blocking but valuable post-launch.

- 🟥 **Ticketmaster events** (`#69`) — needs `TICKETMASTER_API_KEY` env var
- 🟥 **Viator/GetYourGuide affiliate links** (`#70`) — affiliate registration blocked until site is live for approval
- 🟥 **Group wishlist + voting** — let friends collaborate on "where should we go?" (deferred from On My Radar discussion)
- 🟥 **Comparison view on wishlist** — pick 2-3 saved destinations, see cost/season/flight-time side-by-side
- 🟥 **Calendar/seasonal strip on wishlist** — show items on a year ribbon by best season
- 🟥 **Seasonal Collections SEO landing pages** at `/discover/seasons/[slug]` (option B from the seasonal-collections discussion; A+C shipped instead)
- 🟥 **Web Push notifications (Tier 3)** — VAPID keys + service worker. Recommended to ship alongside Tier 2 Inngest, not before.
- 🟥 **`<img>` → `<Image>` migration** — TripStoryModal (12 instances), discover/[slug] hero, memories. Perf + a11y win, needs visual review.
- 🟥 **External legal review** — privacy + terms have been content-updated to match what's actually shipped (community sharing, OG link fetches, Sentry, analytics). Still worth a real lawyer pass before launch given AI use, payment data, and user content licensing.
- 🟥 **Yay/Nay dead-space layout decision** — green-bordered empty area in the votes section's right column. Needs Brandon's design call.

---

## 📚 What's already shipped

For context — see `CLAUDE.md` "Recently Shipped" sections for the full chronological log of every session's deliverables. Highlights from the most recent push (May 9 session):

- Tier 1 build durability (server-owned abort + per-day persist + resume detection)
- Photo likes/comments full backend with Realtime, edit/delete, custom delete modal
- Default travel partner auto-add on new trips
- Editable expense line items inline
- Wishlist persistence on both /discover and /wishlist
- Generation truncation root-cause fixes (token floor scaling, recoverTruncatedArray wired, continuation prompt hardening, gap-fill prevContext refresh, overloaded backoff, awaited final persist)
- Photo `'You'` fallback purge across all routes + backfill
- Day-Of crew renders real members
- Optimistic-update rollbacks on votes, save toggles, fork failures
- Discover privacy (first-name-only) + auth-gate + login redirect
- On My Radar source icons (globe vs pencil)
- ~970 LOC of dead code removed (unused components, mock leftovers)
