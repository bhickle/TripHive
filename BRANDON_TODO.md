# Brandon — Tomorrow's To-Do (2026-06-06)

A focused, do-it-in-a-day list pulled from the go-live checklist. Ordered so dependencies come first. Each item says **where to click** and whether **Claude can do part of it**. Check `GOLIVE_CHECKLIST.md` for the long-form steps on any of these.

Status: ⬜ not started · 🔄 in progress · ✅ done

> Launch target: **Thursday, July 30, 2026 (International Day of Friendship)** — plenty of runway, but these are the load-bearing items.

---

## 1. Unblock deployments (do this FIRST — other items need to deploy)

- ⬜ **Get the current code live via a Deploy Hook.** Vercel → trip-hive → **Settings → Git → Deploy Hooks** → create one (branch `master`) → open the URL (or paste it to Claude). Builds the latest `master`.
- ⬜ **Reconnect Git so pushes deploy again.** Vercel → **Settings → Git** → Disconnect → reconnect `bhickle/TripHive`. Then GitHub → repo **Settings → Webhooks** → confirm the `vercel.com` hook shows green Recent Deliveries.
- ⬜ After it deploys, the Inngest `itinerary-finalize` function registers automatically (or **Claude runs** `curl -X PUT https://www.tripcoord.ai/api/inngest` once).

> _Background: pushes stopped creating Vercel deployments (last good = `8353e91`). It's a webhook problem, not the paid "On-Demand Concurrent Builds" feature — you don't need that. **Live site is fine; undeployed code is dormant — no rush, just cleanup.**_

---

## 2. Security — highest value, mostly 5-minute dashboard clicks

- ⬜ **Make the GitHub repo private.** GitHub → repo **Settings → Danger Zone → Change visibility → Private.** This is the single biggest "stop someone copying the whole codebase + AI prompts" win. Vercel keeps deploying on private repos. _(Confirmed still public today.)_
- ⬜ **Set a strong `PREVIEW_SECRET` in Vercel** (`openssl rand -hex 24`). Then **Claude removes** the `?? 'tc2026'` fallback in `src/middleware.ts` so the coming-soon gate fails closed.
- ⬜ **Domain-restrict the public Google Maps key.** Google Cloud Console → Credentials → `NEXT_PUBLIC_GOOGLE_MAPS_KEY` → HTTP-referrer restriction to `https://*.tripcoord.ai/*`. Stops bill-theft from the client-exposed key.
- ⬜ **Claude can do now:** scan git history for any committed secrets (gitleaks/trufflehog) + grep that no secret is `NEXT_PUBLIC_`. Just say go.

---

## 3. Make payments actually work (Stripe) — checkout is dead until this

- ⬜ **Create the prices in Stripe** (test mode first for testing, live mode for launch): Trip Pass **$36** one-time, Travel Pro **$14.99/mo** + **$149/yr**. Copy the price IDs.
- ⬜ **Send the price IDs to Claude** → Claude pastes them into `src/lib/stripe-prices.ts` (currently `price_REPLACE_ME_*` placeholders — checkout 404s until replaced).
- ⬜ For launch (can wait): swap the test keys for live keys in Vercel (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, new `STRIPE_WEBHOOK_SECRET`).

---

## 4. Vercel env vars to set (quick — paste-and-save)

- ⬜ **`CRON_SECRET`** (`openssl rand -hex 32`). Without it the daily cron 500s every morning — and the new Inngest-resync cron needs it too.
- ⬜ **Confirm `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`** are set (Production + Preview) from your Inngest setup.
- ⬜ **Verify `UNSPLASH_ACCESS_KEY`** is present (CLAUDE.md says set; go-live checklist still flags it — just confirm in Vercel).

---

## 5. Auth & email (needed before real signups)

- ⬜ **Re-enable email confirmation.** Supabase → Authentication → Providers → Email → "Confirm email" ON (currently OFF for testing).
- ⬜ **Add the password-reset redirect to the allowlist.** Supabase → Authentication → URL Configuration → add `https://www.tripcoord.ai/auth/update-password`.
- ⬜ **SendGrid domain authentication** (so invites don't hit spam) + set `SENDGRID_FROM_EMAIL=noreply@tripcoord.ai`. _(DNS records + verify — takes a few days to propagate, so start early.)_
- ⬜ **(Optional) Google OAuth** — Google Cloud OAuth Client ID → redirect `https://pqizuvmtertpxhhxyemj.supabase.co/auth/v1/callback` → paste into Supabase Providers → Google. Then Claude re-renders the sign-in buttons.

---

## 6. If there's time — start the slow ones (they have lead time)

- ⬜ **Twilio** — leave trial mode (add payment method) + start A2P 10DLC registration (carrier approval takes days).
- ⬜ **Unsplash** — once live, click "Apply for Production" (demo tier caps at 50 req/hr; approval takes ~a week).
- ⬜ **Sentry** (optional but recommended) — create project, paste `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN` into Vercel so you don't launch blind.

---

### What Claude is queued to do (just say the word)
- Paste real Stripe price IDs once you have them
- Remove the `tc2026` middleware fallback (after you set `PREVIEW_SECRET`)
- Scan git history for leaked secrets + audit `NEXT_PUBLIC_` usage
- Re-render the Google sign-in buttons (after OAuth is configured)
- Run the Inngest resync after the deploy pipeline is restored
- **Phase 2b** of background builds: move the generation loop server-side into the Inngest worker (the bigger code change — schedule when you want)
