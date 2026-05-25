# TripCoord — QA Pass 2 (2026-05-25)

> **STATUS: All 9 findings (3 P1 + 6 P2) fixed in the same session.** See each
> item; code changes span itinerary, dayof, discover, memories, the featured-fork
> route, and the generate-packing route. The "Already-tracked" items at the
> bottom remain deferred by prior decision.

Full-site correctness sweep via static code review + Supabase data validation,
run after this session's shipped work (favicon, domestic prep card + seed list,
Add-menu icons, discover-wishlist vote fix, 5s undo toasts, featured "Use as
starting point" fork). Method: 3 parallel review agents across surface clusters
+ direct DB integrity queries. No browser run.

**Headline:** the featured-fork feature we shipped this session has a real P1 —
forked trips created with the "Skip — I'll pick dates later" option have
date-less days, which crashes **Add Day** and renders **"Invalid Date"** day
headers. Two other P1s are pre-existing (My Pack AI generation, Day-Of split
tracks).

Severity: P0 = launch-blocker, P1 = fix soon, P2 = polish / self-correcting.
Confidence noted per item.

---

## P1 — fix soon

### 1. Add Day crashes on a date-less trip (fork regression)
`src/app/trip/[id]/itinerary/Client.tsx` (~2627–2647, `handleAddDay`) · high
`new Date(prevDay.date + 'T12:00:00').toISOString()` throws `RangeError: Invalid
time value` when `prevDay.date` is `''`. Featured forks where the user skipped
the date picker have `date: ''` on every day (fork route leaves it blank by
design). The date math runs *before* the AI-mode `try`, and the manual-mode
path has no try/catch — so the throw is uncaught: manual mode leaves
`addDayGenerating` stuck `true` (button frozen, modal open); AI mode's
catch/finally never runs. Add Day is a natural next step right after forking.
**Fix:** guard empty/invalid `date` before `toISOString()` (fall back to a
sequential offset or skip date assignment).

### 2. "My Pack" AI generation writes group-scope rows
`src/app/api/generate-packing/route.ts:39,99` (caller `prep/Client.tsx:642–665`) · high · pre-existing
Route ignores the `scope` field and hardcodes `user_id: null`. The client's My
Pack generator POSTs `scope: 'personal'`, then reloads `?scope=mine`
(`user_id = caller`) — so AI items never appear in My Pack and instead land in
the shared **Group Pack** (broadcast to all members via realtime). **Fix:**
honor `scope`; set `user_id = caller` for `personal`.

### 3. Day-Of guide drops all split-track activities
`src/app/trip/[id]/dayof/Client.tsx:374–385` · high · pre-existing
Timeline is built only from `currentDay.tracks.shared`; `track_a`/`track_b` are
never included, so on a split-track trip (Explorer/Nomad) every track activity
is missing from the day-of schedule, "Happening Now," and the done/total
counters. Every other surface iterates all three tracks. **Fix:** include
track_a/track_b.

---

## P2 — polish / self-correcting

### 4. "Invalid Date" day header on a date-less trip (fork regression)
`src/app/trip/[id]/itinerary/Client.tsx:3086` · med
Same root cause as #1 — the day `<h1>` renders the literal "Invalid Date" when
`currentDayData.date` is empty. Other date sites guard with
`date ? new Date(...) : null`; this one doesn't. **Fix:** same date guard.

### 5. Unguarded `tracks.track_a/track_b.map/filter` in 5 mutation handlers
`itinerary/Client.tsx` vote (~535), edit/move (~2192), delete (~2276),
suggest-another (~2396), revert (~2419) · med
Direct `.map()/.filter()` with no `?? []`. The rest of the file defends these,
so malformed/legacy days (or raw AI/parse output omitting a track) can crash —
the vote handler is worst since it maps **all** days. Clean forks populate the
arrays, so not currently triggered by the new feature. **Fix:** normalize tracks
at the single load/sync chokepoint (`syncAiDays` + Supabase load) rather than
patching five sites.

### 6. Featured-fork guard misses demo users
`src/app/discover/Client.tsx` (~969, `handleFeaturedFork`) · high (small impact)
Guard is `if (!currentUser.id)` only; the sibling community-fork and wishlist
handlers also check `currentUser.isDemo`. A demo user has a truthy fake id but
no real session → "Use as starting point" calls the endpoint, gets 401, shows
the generic error toast instead of bouncing to login/signup. **Fix:** add
`|| currentUser.isDemo`.

### 7. Fork `trip_length` derivation is loose
`src/app/api/featured-itineraries/[slug]/fork/route.ts:118` · low
`duration_days ?? days.length` — DB check confirms all 21 featured itineraries
currently match, so defensive only. **Fix:** use `days.length` to bind length to
the copied days.

### 8. Optimistic uploaded photos lack `uploaderId`
`src/app/trip/[id]/memories/Client.tsx:766–774` · med · pre-existing
New rows pushed on upload omit `uploaderId`, so the contributor filter shows the
just-uploaded photo as a separate loose-name entry and it won't match a uuid
filter selection until a refresh. **Fix:** include `uploaderId` on the optimistic row.

### 9. Optimistic photo blob→URL swap keys on non-unique `activity`
`src/app/trip/[id]/memories/Client.tsx:892–896` · med · pre-existing
When several files in one batch share a location label, the blob→public-URL swap
matches the first row repeatedly and leaves later rows as dead `blob:` URLs
(despite a successful insert), so they vanish on refresh. **Fix:** match by the
row's unique `id`.

---

## Validated clean (checked, no action)

- **Featured data:** all 21 published itineraries have `duration_days` == actual
  day count; activity times are only morning/afternoon/evening → fork transform
  is safe and the itinerary UI covers every value.
- **Undo logic** (wishlist + prep 5s undo): no double-commit, no stuck toast;
  unmount-flush + superseding-delete + undo paths are mutually exclusive per id.
- **Cross-trip scoping:** all mutating trip routes (packing/prep/souvenirs/
  expenses/messages/photos) re-scope by `trip_id`; no trip-A→trip-B writes.
- **Auth redirects:** login/signup use same-origin `safeRedirect` (no open
  redirect); update-password gated behind recovery/session.
- **AI tier gate (Discover "Personalize with AI"):** UX gate only; server-side
  credit gate still applies, so no credit leak. Free/Trip Pass correctly locked.
- **generate-itinerary:** two-phase credit charge (gate before, charge after
  success) is correct; optional prompt fields defensively defaulted.
- **discover-wishlist vote fix:** saved-but-unvoted rows handled; no spurious deletes.

## Already-tracked (not re-listed)
Dashboard stale-session 401 dead branch; middleware `?? 'tc2026'` preview
fallback; multi-city Trip Builder step-2 back-nav gate; Activity Pulse vote-count
lag. All four already in CLAUDE.md / SITE_QA_AUDIT.md as deferred.
