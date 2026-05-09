# TripCoord — Go-Live Checklist

Items that need to happen before public launch. Status:
🟥 Not started · 🟧 In progress · 🟩 Done

Update the status emoji as you complete each item. CLAUDE.md links here for the full pre-launch test pass.

---

## 🔑 External services / API keys

### 🟥 Unsplash — submit for Production approval
**Why:** Demo tier caps at 50 requests/hour. Production tier is 5,000/hr and is required before any meaningful traffic. Approval takes a few days to a week.

**Prereqs already done:** `UNSPLASH_ACCESS_KEY` set in Vercel · attribution chip live · download tracking wired · UTM-tagged links · server-side hotlinking only.

**Steps:**
1. Go to https://unsplash.com/oauth/applications/{your-app-id}
2. Click **"Apply for Production"**
3. Submit the form — they'll check the live site for the four prereqs above
4. Wait for approval email
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

### 🟥 SendGrid — finish domain authentication
**Why:** Without DKIM/SPF set up for `tripcoord.ai`, invite emails land in spam.

**Steps:**
1. SendGrid → Settings → Sender Authentication → Authenticate Your Domain
2. Add the CNAME records SendGrid generates to your DNS provider (Vercel DNS or wherever the domain lives)
3. Verify within SendGrid
4. Update `SENDGRID_FROM_EMAIL` env var to `noreply@tripcoord.ai` (currently a Gmail)
5. Send a test invite to a fresh inbox to confirm it lands in Inbox, not Spam/Promotions

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

## 🗄️ Data hygiene

### 🟥 Reset AI credit counters
**Why:** Testing during development pollutes the `ai_credits_used` counter. Real users should start at zero.

**Steps:** Run this against production Supabase:
```sql
UPDATE profiles SET ai_credits_used = 0;
```
Do this **the day of launch**, after final testing, before announcing.

### 🟥 Set `CRON_SECRET` in Vercel
**Why:** The daily preferences-fallback cron at `/api/cron/preferences-fallback` returns 500 every day at 09:00 UTC until this env var is set. Steps in that route's docstring.

**Steps:**
1. Generate a random string (e.g. `openssl rand -hex 32`)
2. Vercel → TripHive → Settings → Environment Variables → add `CRON_SECRET` with the random value
3. Redeploy

---

## 🧪 Pre-launch test pass

### 🟥 Full smoke test
Walk through each flow on production with a fresh test account:

- [ ] Sign up → confirm email lands → click link → land on dashboard
- [ ] Build a trip via the wizard, full multi-city, generate itinerary all the way through
- [ ] Edit the trip (destination/dates), regenerate
- [ ] Add a day, add an activity, vote on activities
- [ ] Invite someone via email, they accept, they show in members
- [ ] Invite someone via SMS (different phone number than the trial whitelist)
- [ ] Group chat sends + receives, emoji reactions work
- [ ] Create a vote, members cast, organizer closes
- [ ] Add an expense, settle it, scan a receipt
- [ ] Mark itinerary `is_public_template = true`, view at `/community/[id]`
- [ ] Fork the public template from `/discover`, dates persist, "(Copy)" suffix appears on Home Base
- [ ] Like an itinerary, like an activity, both counts persist on refresh
- [ ] Add destination to wishlist, paste a TripAdvisor URL, see preview card render
- [ ] Click a Seasonal Collection card on Discover, grid filters correctly
- [ ] Upload a photo to a trip, refresh, photo still there
- [ ] Generate AI packing list (Nomad), AI phrasebook (Nomad)
- [ ] Buy a Trip Pass with a real card (after Stripe live keys are in)
- [ ] Subscribe to Explorer with a real card
- [ ] Cancel the subscription via the customer portal
- [ ] Trigger the password reset flow end-to-end
- [ ] Sign out, sign back in, dashboard reloads correctly

### 🟥 Verify Vercel monitoring is live
- [ ] `npm audit` for known high vulnerabilities (3 reported earlier — review)
- [ ] Vercel deployment logs scrolling cleanly, no recurring 500s
- [ ] Supabase logs/advisors clean

---

## 📋 Open feature work (not launch-blocking)

These are useful to track but won't block launch.

- 🟥 **Ticketmaster events** (`#69`) — needs `TICKETMASTER_API_KEY` env var
- 🟥 **Viator/GetYourGuide affiliate links** (`#70`) — affiliate registration blocked until site is live for approval
- 🟥 **Group wishlist + voting** — would let friends collaborate on "where should we go?" (deferred from On My Radar discussion)
- 🟥 **Comparison view on wishlist** — pick 2-3 saved destinations, see cost/season/flight-time side-by-side (deferred)
- 🟥 **Calendar/seasonal strip on wishlist** — show items on a year ribbon by best season (deferred)
- 🟥 **Seasonal Collections SEO landing pages** at `/discover/seasons/[slug]` — option B from the seasonal-collections discussion; A+C shipped instead

---

## ✅ Already shipped (recent)

For context — these were the last few sessions' deliverables, all in production:

- Server-side AI credit enforcement across all 5 AI routes
- Unsplash dynamic photos with attribution chip + download tracking + persistent meta on `cover_image_meta`
- Community layer: public itinerary templates, itinerary + activity likes, fork-as-starting-point with date picker + "(Copy)" suffix
- Don't Forget hub: 7+7 default seed list, edit/delete UI, gift emoji removed, "0/1 completed" placeholder fix
- The Pics page: Upload moved to top, Trip Recap moved to bottom
- Home Base trips sorted chronologically
- Group page: lucide tab icons matching Don't Forget, chat composer redesigned (embedded send, viewport height)
- Community-share toggle moved from Group page to itinerary header (small Globe icon with hover tooltip)
- Audit pass: 17 silent-failure findings, all HIGH and most MED fixed
- Wishlist: AI Preview removed, OG-scraped link cards added
- Discover Seasonal Collections: clickable, filter the destination grid
