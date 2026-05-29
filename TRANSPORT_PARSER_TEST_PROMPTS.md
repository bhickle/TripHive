# Transport Parser — Test Prompts

Paste each block into the **Transport Parser modal** (open it from an itinerary's day-header → "Parse a transport confirmation" or wherever you wire it in). One block per test. The "Expected" line tells you what to look for; the "Watch for" line is the failure-mode that's most worth confirming.

These were generated alongside the 2026-05-29 code review (commit `7ff4c4b`). The biggest known risk is **scenario 3 (multi-leg confirmations silently dropping the return)** — pay extra attention there.

---

## 1. Happy path — Flixbus (bus)

```
Flixbus Booking Confirmation FLIX-882104.
Route: Berlin ZOB → Prague Florenc.
Departure: 07:45 on Sept 18. Platform: Bay 3.
Seat: 22A. Price: €29 per person.
Be at the bay 15 minutes before departure.
Ref: FLIX-882104.
```

**Expected:** type=bus, departureTime=07:45, meetTime≈07:30, meetingPoint="Berlin ZOB, Bay 3" (or similar), destination=Prague Florenc, operator=Flixbus, confirmationRef=FLIX-882104, seatInfo=22A, costPerPerson=29.

**Watch for:** does it pull "Bay 3" into either meetingPoint or platform? Either is acceptable; both empty isn't.

---

## 2. Happy path — Hertz (car rental)

```
Hertz Confirmation HRZ-44210Q.
Pickup: Lisbon Airport, Hertz desk, Arrivals Hall.
Vehicle: Renault Clio compact.
Pickup date: Oct 4 at 11:30 AM.
Drop-off: Oct 9.
Rate: $38/day. Pickup code: 7720.
```

**Expected:** type=car_rental, departureTime=11:30 (note: PM → 24h conversion), meetingPoint="Lisbon Airport, Hertz desk, Arrivals Hall", carClass="Renault Clio compact", operator=Hertz, confirmationRef=HRZ-44210Q.

**Watch for:** 11:30 AM should land as `"11:30"`, NOT `"11:30 AM"`. The rest of the itinerary rendering assumes 24h.

---

## 3. Rail — Amtrak with outbound + return (MULTI-LEG TRAP) ⚠️

```
Amtrak eTicket — Reservation 39A8B2.

OUTBOUND:
  Train 175, NY Penn Station → Washington Union Station,
  depart 8:05 AM April 12, arrive 11:32 AM,
  Coach 5 Seat 41C.

RETURN:
  Train 188, Washington Union Station → NY Penn Station,
  depart 4:15 PM April 14, arrive 7:48 PM,
  Coach 3 Seat 22A.

Total $186.
```

**Expected:** one TransportLeg lands. Likely the OUTBOUND (8:05 AM / NY → DC). **The return leg silently disappears.**

**Watch for:** does the preview tell the user "we only got the outbound" or anything indicating multi-leg? If not, the user has no idea they need to add the return manually.

This is the biggest UX risk — most real Amtrak / Eurostar / round-trip confirmations have both legs in one email.

---

## 4. Excursion — Viator-style pickup

```
Viator Booking VR-7771-G.
Reykjavik Northern Lights Tour.
Pickup at your hotel lobby between 8:30–8:45 PM on Nov 3.
Bus departs Hallgrímskirkja parking at 9:00 PM.
Return ~1:00 AM.
$98 per person.
Ref VR-7771-G.
```

**Expected:** type=excursion, departureTime=21:00 (9:00 PM → 24h), meetTime≈20:30–20:45 (hotel pickup window), meetingPoint="hotel lobby" or "Hallgrímskirkja parking", operator=Viator, costPerPerson=98.

**Watch for:** the pickup window (8:30–8:45) vs the bus departure (9:00) — does meetTime land on the EARLIER window? It should.

---

## 5. 12-hour time format stress

```
Trainline confirmation TL-99X.
London Paddington to Bath Spa, departs 3:30 PM Tuesday,
Platform 11, Coach G Seat 18, £42pp.
Ref TL-99X.
```

**Expected:** type=train, departureTime=`"15:30"` (NOT `"3:30 PM"`), fromStation="London Paddington", toStation="Bath Spa", platform=11, seatInfo="Coach G Seat 18", costPerPerson=42.

**Watch for:** the **24h conversion**. There's no regex normalizer on `departureTime` — if Sonnet returns `"3:30 PM"` instead of `"15:30"`, the validation passes and renders verbatim, which other parts of the itinerary won't parse correctly.

---

## 6. Vague — missing required field (should 422 cleanly)

```
Hey, I booked us that bus thing for Wednesday around midday,
should be like an hour, $20ish each. I'll forward the email later.
```

**Expected:** **422 INCOMPLETE_PARSE** response with the modal showing the missing-fields banner. Required fields are `type`, `departureTime`, `meetingPoint`, `destination` — this paste has none of them concretely.

**Watch for:** the user IS charged a credit (intended behavior since the Anthropic call still ran — commit `7ff4c4b`). Verify in `profiles.ai_credits_used` afterwards.

---

## 7. Adversarial — non-transport text

```
The quick brown fox jumps over the lazy dog. Lorem ipsum dolor sit amet,
consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore
et dolore magna aliqua.
```

**Expected:** 422 INCOMPLETE_PARSE (Sonnet may invent something, but the required-field validator should reject).

**Watch for:** Sonnet sometimes hallucinates a plausible-looking leg from garbage. If a leg DOES appear, the destination/meetingPoint will be implausible — confirm the user can tell and can dismiss without saving.

---

## 8. Too short — should 400 before AI runs

```
bus tmrw
```

**Expected:** **400 INVALID_INPUT** ("Please provide at least 20 characters of booking confirmation text."). The short-circuit fires BEFORE `incrementAiCreditsUsed`, so the user is NOT charged a credit.

**Watch for:** verify no credit was deducted (check `profiles.ai_credits_used` before + after, should be unchanged).

---

## Other things to spot-check during testing

These came out of the code review but aren't paste-and-go:

- **Double-click on Confirm.** When the preview card appears, click "Add to Day N" rapidly two-three times. The `onAdd` handler has no disabled-after-click guard — duplicate legs may land. (Parse button IS guarded; Confirm isn't.)
- **`meetTime` missing.** If the parsed leg doesn't have `meetTime`, the preview hides the "Meet at" row entirely. Worth confirming the user understands the leg's missing that field rather than assuming it equals departureTime.
- **Modal close mid-edit.** Open the modal, type text, click outside or hit Escape — does the form clear or persist? Either is acceptable; just consistent.
- **Add-to-Day persistence.** After "Add to Day N" succeeds, navigate to that day's **Day-Of** view — the leg should render in the transport section with the right time. The persist path is `handleTransportAdded` → `persistDays` → `PATCH /api/trips/[id]` + localStorage.

## If you find a bug

The parser route is at `src/app/api/parse-transport/route.ts`; the modal is `src/components/ParseTransportModal.tsx`; the persistence flow that consumes the leg is in `src/app/trip/[id]/itinerary/Client.tsx` around `handleTransportAdded` (search for `transportLegs`). Drop a note in `/admin/support` or just ping it back to Claude.
