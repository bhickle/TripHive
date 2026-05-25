# TripCoord — Monetization Plan

> Working strategy doc (2026-05-25). Captures the competitive reality, the two
> viable monetization models, and the phased path to get from a launchable
> subscription bridge to the market-winning free + booking-commission model.
> Informed by live competitive research (see Sources at bottom).

---

## The market reality (why this matters)

- **AI itinerary generation is commoditized.** ChatGPT/Gemini/Claude do it free; every OTA has bolted on AI. Generation is not a moat.
- **The strongest planners give collaboration away free and monetize on bookings.** Mindtrip is 100% free (booking commissions via Priceline/Viator, now agentic flight booking). Wanderlog Pro is ~$40/yr with free collaborative editing + expense splitting + community itineraries. WePlanify is free with group polls + budget + packing + AI discovery (≈ our feature set).
- **Subscriptions fight the episodic nature of travel.** People plan 1–3 trips/yr, not monthly → high churn on monthly subs.
- **Implication:** our current pricing ($96/yr Explorer, $144/yr Nomad) is high vs market and charges for things that are free elsewhere. The booking-commission model is where the winners are.

---

## Model A — Repriced subscription (the launch bridge)

Viable day 1. Competitive repricing of today's tiers.

| Tier | Price | For | Gets |
|---|---|---|---|
| **Free** | $0 | Everyone (hook + community seed) | ~2 AI builds/mo, **group collab + expense split free**, 6 travelers, 10-day |
| **Trip Pass** | **$19** one-time | Episodic planners (most users) | Full features for one trip, regen + tweaks, up to 12 travelers, 30-day validity |
| **Pro** | **$39/yr** (or $4.99/mo) | Frequent travelers | Unlimited builds, split tracks, co-organizer, AI packing/phrasebook/receipt, offline/PDF, ad-free |

Changes vs today: collapse Explorer + Nomad into one **Pro at Wanderlog-competitive $39/yr**; make **collaboration + expense split free** (competitors give it away — charging loses the comparison); drop Trip Pass to **$19** (< a year of Wanderlog). Reframe "credits" as "builds" (users don't think in credits).

Tradeoff: lower ARPU than today's pricing, but actually sellable.

---

## Model B — Free + booking commissions (the end state)

The shape the market winners have. Not viable day 1 (needs partner approval), but reachable within ~days–2 weeks of launch (see timelines below).

| Layer | Price to user | Revenue |
|---|---|---|
| **Core app** (planning, collab, AI) | Free | — (growth engine → more bookings) |
| **Bookings** | Free to book | Activities ~8% (Viator/GYG) · hotels ~4–7% (Stay22/Booking) · insurance/eSIM/car via Travelpayouts |
| **Pro/Supporter** (optional) | $29/yr or $3.99/mo | Thin recurring: ad-free, unlimited AI, offline, early access |

Illustrative unit economics: a booked trip (~$400 activities + ~$700 lodging) ≈ **$32 + $35 ≈ $67 commission**. At ~10% of planners booking through us, ~$6–7/planner/trip — scales with engaged users instead of fighting churn; the Pro tier stacks on top.

### Decision matrix

| | A — repriced sub | B — free + commissions |
|---|---|---|
| Viable day 1 | ✅ | ❌ (approval needed) |
| Revenue ceiling | price × retention | volume × booking intent |
| Churn risk | high (episodic) | none |
| "Why pay, X is free" | present | gone |
| Build effort | low (repricing) | medium (affiliate layer — scaffold exists) |

---

## Recommended path: sequence, don't choose

1. **Launch on Model A repriced** — the only model viable day 1; the repricing keeps it competitive instead of a corner.
2. **Apply to affiliates the moment the domain is live** (see timelines).
3. **Layer in commissions** (Phase 2) as approvals land.
4. **Converge to Model B**: free core + commissions + a thin ~$29–39/yr Pro.

---

## Affiliate program reality (the launch constraint, debunked)

You need a **live site with real travel content** (we have it), NOT traffic/establishment.

| Provider | What | Approval | Commission | Notes |
|---|---|---|---|---|
| **Travelpayouts** | Aggregator (flights, hotels, GYG, insurance, car) | Auto / ~24h | varies | Fastest on-ramp; one integration, many brands; the path to GetYourGuide |
| **Stay22** | Hotels / lodging | ~instant, CSM within the hour | high (≈30% of platform commission) | 5-min script; ideal for "Where to Stay" |
| **Viator (direct)** | Tours / activities | Manual, ~a few days; **no traffic minimum** | ~8%, 30-day cookie | Favors original travel content |
| **GetYourGuide** | Tours / activities | via Awin (~7%) / Travelpayouts (~8%) / TradeDoubler (~5%) | ~8% | No direct program |
| Booking.com, Expedia TAAP, hotel chains, Airalo (eSIM), insurance | hotels/flights/extras | need traffic | varies | Phase 3, once we have volume |

---

## Phased rollout

- **Phase 0 — pre-launch (in progress):** provider-agnostic affiliate layer that's OFF until env vars are set. Shipped: `src/lib/affiliate.ts` (`activityBookingUrl` / `hotelBookingUrl` / `isAffiliateEnabled` + disclosure), gated hotel CTA in the itinerary "Where to Stay" section. Pending: gated "Book this" on itinerary activity cards (mockup-first — net-new UI element).
- **Phase 1 — launch day:** ship Model A repriced; apply to Travelpayouts + Stay22 + Viator.
- **Phase 2 — week 1–2:** approvals land → set the `NEXT_PUBLIC_*` IDs in Vercel → affiliate links go live automatically. Review placement/styling before enabling.
- **Phase 3 — as traffic grows:** add direct/higher-value programs; decide how thin to make the subscription.

### Commission surfaces in the app
- Itinerary **activity cards** → "Book this" (Viator/GYG).
- Itinerary **"Where to Stay"** → hotel CTA (Stay22/Booking). ← wired (gated)
- **Prep / Day-of** → eSIM, insurance, car rental (Travelpayouts).
- **Featured / Discover** itineraries already render affiliate links — highest-intent surface.

### Env vars to set when approved (Vercel; public — used in outbound URLs)
- `NEXT_PUBLIC_VIATOR_PARTNER_ID` and/or `NEXT_PUBLIC_GETYOURGUIDE_PARTNER_ID` — activities
- `NEXT_PUBLIC_STAY22_AID` and/or `NEXT_PUBLIC_BOOKING_AID` — hotels

Nothing affiliate renders until at least one of these is set. ⚠️ Confirm exact deep-link param formats against each partner dashboard before enabling (noted in `affiliate.ts`).

---

## Sources
- Wanderlog pricing 2026 — https://monkeyeatingmango.com/blog/wanderlog-pricing-2026/
- Mindtrip (free + commissions; agentic booking) — https://www.prnewswire.com/news-releases/mindtrip-launches-travels-first-all-in-one-agentic-ai-flight-booking-experience-powered-by-partnership-with-sabre-and-paypal-302763838.html
- Layla pricing — https://aitravel.tools/layla-ai-review/
- Group trip planners 2026 (WePlanify et al.) — https://www.weplanify.com/en/alternatives/best-group-trip-planner-apps
- Viator affiliate requirements — https://commissiondex.com/program/viator/
- Travelpayouts review — https://www.anitahendrieka.com/travelpayouts-review/
- Stay22 review/approval — https://thefabryk.com/blog/stay22-review
