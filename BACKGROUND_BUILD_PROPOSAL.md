# Background Itinerary Build — Partner Brief

> **Status:** Proposal / discussion document. No code changes made.
> **Authored:** 2026-05-30
> **Owner decision needed:** go / no-go on Tier 2 + which notification channels to ship.
> **Companion mockups:** `mockups/background-build-experience.html`, `mockups/background-build-ready.html`

---

## 1. The one-paragraph version

tripcoord generates itineraries by **streaming day-by-day in the browser**, slicing long/multi-city trips into 3-day chunks because a single serverless function caps at 5 minutes. That works well for an engaged user on a desktop, but it ties the build to the browser staying open, and the chunk-by-chunk approach causes some itinerary-quality seams. We've already shipped the hard part of the fix (server-side durability, May 9). This brief proposes the next step: an **optional background build** where the work runs server-side, the user can close the tab, and we **notify them when the trip is ready** — using notification plumbing that already exists. It also unlocks fewer/larger chunks, which directly improves itinerary coherence.

---

## 2. How builds work today

1. User finishes the 8-step Trip Builder → "Build My Trip."
2. A **skeleton** trip row is created; user is redirected to `/trip/[id]/itinerary?mode=generating`.
3. The **browser** computes the chunk plan (3-day slices; one or more per city) and loops over it, calling the build API once per chunk.
4. Each chunk **streams days** back over SSE; days appear live as they arrive.
5. Each day passes a **verify-before-show** location check before it's allowed to render.
6. Days are saved to the cloud after each chunk and once more at the end.

**Why we chunk:** the serverless function ceiling is 5 minutes (and that already requires the paid Vercel tier). A 10-day trip is 3–4 minutes of generation at the edge of that cliff, so we split it into safe 3-day slices.

---

## 3. What we already fixed (shipped May 9, baked ~3 weeks)

The fragile "browser owns everything" model is **already partly solved**:

- The server **no longer cancels** generation when the browser disconnects — it finishes the in-flight chunk and **saves each day server-side** as it goes.
- **Resume-on-reload:** refresh mid-build and it picks up from the first missing day. If the server finished while the user was away, it just shows the completed trip.
- **Credits are charged once per build**, regardless of how many chunks it takes.

**The remaining gap:** the *chunk loop still runs in the browser*. So if the tab closes mid-build, the current chunk's work survives — but **the next chunk doesn't start until the user returns**. Closing that gap is this proposal.

---

## 4. The issues — and which are caused by the build model

Being precise here matters, because two different problems get blamed on "the build":

| Issue | Root cause | Fixed by background build? |
|---|---|---|
| **Wrong-city venues** (e.g. a Paris restaurant on a Versailles day trip) | Prompt/anchor + verification gaps — **not chunking** | Already fixed May 30 (verify-before-show + prompt rules). Independent of this work. |
| **Repeated restaurants/venues across day 3↔4 boundaries** | Chunking — each slice is a separate AI call with only a summary of prior days | **Yes** — fewer/larger chunks reduce the seams |
| **Pacing / theme drift between chunks** | Same — later chunks don't "feel" earlier ones | **Yes** — improved with bigger context windows per call |
| **Multi-city transition seams** | Chunk handoff at city boundaries | **Yes** — partially |
| **"We built 5 of 7 days, tap Regenerate"** partial builds | A chunk failed its retries mid-loop in the browser | **Yes** — durable server retries instead of browser-loop failure |
| **Build dies when phone sleeps / tab closes on long builds** | Chunk loop lives in the browser | **Yes** — this is the core fix |

**Takeaway for partners:** the recent *correctness* bugs are already handled. The value of background build is (a) reliability on mobile/long/multi-city trips, and (b) a real lever on itinerary *coherence*, because removing the timeout pressure lets us stop slicing so aggressively.

---

## 5. The proposal

### 5a. Make it a choice, not a replacement
Keep today's **live streaming build** (great for engaged desktop users who want to watch it happen) and add an opt-in:

> **"Build in the background — we'll let you know when it's ready."**

Recommended as the **default for mobile, long (7+ day), and multi-city trips**, where the live build is most fragile.

### 5b. How the background build works
- Move the chunk orchestration **off the browser** and into a durable background worker (Inngest). Each chunk becomes a retryable step with **no 5-minute ceiling**.
- The browser becomes a **passive observer**: it subscribes to the trip over Supabase Realtime (already used for chat, votes, photos, notifications) and watches days fill in — or the user closes the tab entirely.
- When the build finishes, we **notify** the user.

### 5c. The notification — mostly already built
- **In-app** (instant, <100ms): add an `itinerary_ready` type to the existing notifications system. The bell + Realtime delivery already exist; this is a small addition, not new infrastructure.
- **Email** ("Your Paris trip is ready"): reuse the existing SendGrid transactional/lifecycle email plumbing.
- **Web push** (phone notification even with the app closed): the **only** genuinely new piece — no push/VAPID code exists today. Recommend deferring to post-launch unless partners want it at day one.

---

## 6. Effort, cost, and what's blocking it

| Piece | Effort | Notes |
|---|---|---|
| Tier 2 — background worker (Inngest) | ~3–5 days | Inngest free tier (50K runs / 500 concurrent steps) covers early scale |
| Tier 3 — in-app + email "ready" notification | ~½ day | Reuses existing notification + SendGrid plumbing |
| Web push (optional) | +1–2 days | New: service worker + VAPID keys. Defer unless needed at launch |

**The only blocker is administrative, not technical:**
1. Create an Inngest account → add `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` to the hosting env.
2. Confirm Supabase Realtime replication includes the `itineraries` table (likely already on).
3. (Optional, for push) generate VAPID keys.

---

## 7. Recommendations (ranked)

1. **Green-light Tier 2 (background build via Inngest).** Highest leverage: fixes the close-the-tab failure mode *and* enables coherence improvements. Blocker is an account + two keys, not engineering risk.
2. **Ship it as a choice**, defaulting to background for mobile / long / multi-city.
3. **Wire `itinerary_ready` into the existing notification system** (in-app + email). Defer web push to post-launch.
4. **Add a whole-trip coherence pass** (dedupe venues across the entire trip, sanity-check pacing) once builds are durable — directly targets the chunk-seam issues.
5. **Use the bake-period data** (per-day save logs + chunk durations) to decide whether background steps are per-chunk or per-day.

---

## 8. Quality vs. reliability — two separate tracks

It's tempting to assume "background build" will also clean up the itineraries. **It won't, on its own.** Keeping these as two distinct tracks prevents a 3–5 day investment that comes back with itineraries that look identical.

| | **Track A — Reliability** | **Track B — Quality / coherence** |
|---|---|---|
| **Problem it solves** | Builds dying on tab-close / phone-sleep; partial "5 of 7 days" builds | Repeated venues across chunk seams; pacing & theme drift |
| **The fix** | Background build (Inngest) + "ready" notification | Whole-trip coherence pass + larger chunks + verify-before-show (shipped) |
| **Needs Inngest?** | Yes | No |
| **Effort** | ~3–5 days (+ ½ day notification) | ~1–2 days (coherence pass) |
| **If you only did this one** | Builds never die — but itineraries unchanged | Cleaner itineraries — but long mobile builds still fragile |

**Why they're related but not the same:** chunking exists only to dodge the 5-minute timeout. Track A removes that ceiling, which *enables* bigger chunks (fewer seams). But the coherence win comes from **actually changing the chunk size / adding the pass** — not from moving the loop to Inngest. The ideal end state is both; if sequencing for itinerary quality alone, **Track B comes first** (cheaper, more direct).

---

## 9. Cost impact — what adds money, what saves it

Current rough per-build cost (single-city, modeled — real figure lives in the Anthropic console):
- **Anthropic generation:** ~$0.40–0.70 (Sonnet 4.6 @ ~$3/M input, $15/M output); multi-city is a multiple.
- **Places verification:** ~$0.03 per venue, on every venue that clears the free Tier-1 string check. On a venue-dense 9-day trip this can **rival or exceed the Anthropic cost** — it's quietly the biggest variable line item.
- **Vercel Pro:** already paid (required for the 5-min `maxDuration`).

### Adds money
| Item | Cost | Notes |
|---|---|---|
| **Inngest (background build)** | **~$0 near-term** | Free tier = 50K runs / 500 concurrent steps; paid only at real scale |
| **Coherence pass** | **+~$0.02–0.05/build if on Haiku** (or ~$0.10–0.25 on Sonnet) | One extra AI call over the assembled trip. Use Haiku — it's a structured check, not creative writing |
| **Email "ready" notification** | fractions of a cent/email | SendGrid already paid for |
| **Web push (optional)** | **$0 vendor cost** | VAPID keys are free; cost is only eng time. Defer post-launch |

### Saves money (the rework opportunities)
| Rework | Why it saves | Size of lever |
|---|---|---|
| **Larger chunks (3 → 4–5 days)** | Fewer AI calls ⇒ the system prompt + `prevContext` + exclude lists are re-sent fewer times. A 10-day trip drops from ~4 calls to ~2 | Medium — input-token only (output is unchanged), but real on multi-chunk trips |
| **Prompt-cache optimization** (already-scoped deferred task) | Move stable content (budget/group/pace/persona text) into the cached block so it clears the 2K floor — casual users currently get **zero** caching. Est. **~67% input-token cut** on chunks 2+ | Medium-large on chunked trips; pure rework, no new cost |
| **Cache the Places location-verification** | ✅ **SHIPPED 2026-05-30.** Was a bare fetch with no cache — every venue passing Tier 1 re-billed ~$0.03 on *every* build, regens/other users paid again, retries re-billed the whole day. Now backed by a global `venue_location_cache` table (cross-build, cross-user, 30-day TTL) + a per-request memo so corrections don't re-bill unchanged venues. Wired into generate-itinerary, add-day, and suggest-activity. Fail-open + correctness unchanged | **The largest single saving** — was ~$1.35 on a venue-dense 9-day trip at 0% reuse; now near-zero after warmup |
| **Fewer partial-build regenerations** | A failed/partial build → user taps Regenerate → a **second full build** of Anthropic + Places cost the company eats. Background build reduces partial failures | Medium — removes duplicate spend on the unhappy path |
| **Fewer verify retries** | Better first-pass coherence ⇒ fewer verify-before-show re-prompts (each retry = re-prompt + re-verify) | Small-medium |

**Net read for partners:**
- **Track A (reliability)** is roughly **cost-neutral** on AI (same generation work) with a tiny Inngest bill at scale — and it *saves* money by cutting duplicate-regeneration spend on failed builds.
- **Track B (quality)** *adds* a small per-build coherence cost (keep it on Haiku) but the chunk + cache reworks it enables **more than pay for it** in input-token savings.
- **The single highest-ROI cost action** is unglamorous and independent of both tracks: **confirm the Places location-verification is cached.** If it isn't, that's likely the biggest dollar leak in the whole pipeline.

---

## 10. What a coherence pass would actually check

A single post-generation pass over the fully-assembled trip (cheap on Haiku) that returns a **patch list**, not a regeneration:

- **Cross-day venue dedupe** — same restaurant/attraction unintentionally appearing on two days (the classic chunk-seam artifact).
- **Pacing balance** — no day overloaded while another is thin; every day has sensible meal coverage.
- **Variety / theme drift** — not three museum-heavy days back-to-back unless the user asked for it; flags monotony introduced at chunk boundaries.
- **Budget consistency** — price tier doesn't silently drift richer/cheaper across days (a known multi-chunk symptom).
- **Continuity of named threads** — e.g. "tomorrow we'll see X" references actually resolve.

It does **not** re-verify locations (verify-before-show already guarantees that per day) and does **not** rewrite good days — it surfaces a small set of targeted fixes. That's what keeps it a ~$0.02–0.05 add rather than a second full build.

---

## 11. Decisions needed from partners

**Track A — reliability:**
- [ ] Go / no-go on background build (Inngest).
- [ ] Notification channels at launch: in-app only, in-app + email, or also web push?
- [ ] Default behavior: background always, or only for mobile / long / multi-city trips?
- [ ] Who sets up the Inngest account + keys, and by when?

**Track B — quality:**
- [ ] Build the coherence pass? (Haiku, ~$0.02–0.05/build, ~1–2 days.)
- [ ] Sequence: Track B first (quality), Track A first (reliability), or parallel?

**Cost actions (independent of both tracks):**
- [x] ~~Confirm the Places location-verification is cached~~ — **Was NOT cached; now SHIPPED (2026-05-30).** New `venue_location_cache` table (global, 30-day TTL) + per-request memo; wired into all three verify paths; swept by the existing expire-venue-cache cron. tsc clean. The retry re-billing is solved by the shared memo (unchanged venues hit cache on the re-check).
- [ ] Pull up the prompt-cache optimization from post-launch deferral once there's real traffic to measure hit rates.

---

## 12. What does NOT change

- The live streaming build stays — this is additive.
- The verify-before-show location guarantee is unaffected (it runs inside the build regardless of where the loop lives).
- Pricing/credits: still one charge per build.
