/**
 * Provider-agnostic affiliate link layer (Phase 0 of the booking-commission
 * monetization plan — see MONETIZATION.md).
 *
 * Everything here is OFF until the relevant `NEXT_PUBLIC_*` env var is set, so
 * no affiliate UI renders for users until you've been approved by a partner and
 * configured its ID. Affiliate IDs are public by nature (they appear in the
 * outbound URL), hence `NEXT_PUBLIC_*` rather than server-only secrets.
 *
 * Phase 0 deliberately uses *search* deep-links — built from a name + city —
 * instead of per-item API resolution, so a link works for ANY activity or hotel
 * the moment a provider ID is set (no catalog enrichment pass required). The
 * `scripts/enrich-affiliate-links.ts` API approach can layer on later for exact
 * product deep-links where conversion matters.
 *
 * ⚠️ The exact URL/param formats below are the documented public ones but should
 * be confirmed against each partner's own dashboard/link-builder at integration
 * time — affiliates occasionally change tag parameter names.
 */

// ── Activities / experiences ──────────────────────────────────────────────────
// Viator direct (no traffic minimum, ~a few days to approve) OR GetYourGuide via
// a network (GYG has no direct program — join through Travelpayouts/Awin and use
// the partner id they issue). Set whichever you're approved for; Viator wins if
// both are present.
const VIATOR_PID = process.env.NEXT_PUBLIC_VIATOR_PARTNER_ID ?? '';
const GYG_PARTNER_ID = process.env.NEXT_PUBLIC_GETYOURGUIDE_PARTNER_ID ?? '';

// ── Hotels / lodging ──────────────────────────────────────────────────────────
// Stay22 (≈instant approval, 5-min setup) OR a Booking.com affiliate id (aid).
const STAY22_AID = process.env.NEXT_PUBLIC_STAY22_AID ?? '';
const BOOKING_AID = process.env.NEXT_PUBLIC_BOOKING_AID ?? '';

/** Shown next to every affiliate link (FTC disclosure). */
export const AFFILIATE_DISCLOSURE =
  'Affiliate link — opens an external booking site. tripcoord may earn a commission.';

/** True when at least one activities provider is configured. */
export function hasActivityAffiliate(): boolean {
  return !!(VIATOR_PID || GYG_PARTNER_ID);
}

/** True when at least one hotel provider is configured. */
export function hasHotelAffiliate(): boolean {
  return !!(STAY22_AID || BOOKING_AID);
}

/** True when any affiliate provider is configured (master switch for UI). */
export function isAffiliateEnabled(): boolean {
  return hasActivityAffiliate() || hasHotelAffiliate();
}

/**
 * Tagged search deep-link for an activity / experience. Returns `null` when
 * either (a) no activities provider is configured, or (b) we don't have a
 * city to scope the search by — a city-less search on Viator/GetYourGuide
 * returns a global "Sunset Tour" mix that's almost guaranteed to mismatch
 * the user's actual destination, so we'd rather render no link than the
 * wrong one.
 */
export function activityBookingUrl(opts: { name: string; city?: string | null }): string | null {
  const city = (opts.city ?? '').trim();
  const name = opts.name?.trim() ?? '';
  if (!city || !name) return null;
  const query = encodeURIComponent(`${name} ${city}`);

  if (VIATOR_PID) {
    return `https://www.viator.com/searchResults/all?text=${query}&pid=${encodeURIComponent(VIATOR_PID)}&mcid=42383&medium=link`;
  }
  if (GYG_PARTNER_ID) {
    return `https://www.getyourguide.com/s/?q=${query}&partner_id=${encodeURIComponent(GYG_PARTNER_ID)}`;
  }
  return null;
}

/**
 * Tagged search deep-link for lodging. Returns `null` when no hotel provider is
 * configured. `query` is typically a hotel name (+ city), or just a destination
 * for a general "find a place to stay" link. Optional ISO dates pre-fill the
 * search window.
 */
export function hotelBookingUrl(opts: {
  query: string;
  checkIn?: string | null;
  checkOut?: string | null;
}): string | null {
  const q = (opts.query ?? '').trim();
  if (!q) return null;

  if (STAY22_AID) {
    const params = new URLSearchParams({ aid: STAY22_AID, address: q });
    if (opts.checkIn) params.set('checkin', opts.checkIn);
    if (opts.checkOut) params.set('checkout', opts.checkOut);
    return `https://www.stay22.com/allez/root?${params.toString()}`;
  }
  if (BOOKING_AID) {
    const params = new URLSearchParams({ aid: BOOKING_AID, ss: q });
    if (opts.checkIn) params.set('checkin', opts.checkIn);
    if (opts.checkOut) params.set('checkout', opts.checkOut);
    return `https://www.booking.com/searchresults.html?${params.toString()}`;
  }
  return null;
}
