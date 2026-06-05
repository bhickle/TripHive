/**
 * stripe-prices.ts — Client-safe price ID constants
 *
 * This file contains ONLY the Stripe price IDs — no SDK imports.
 * Safe to import in both client and server components.
 *
 * The actual Stripe client lives in src/lib/stripe.ts (server-only).
 */

export const STRIPE_PRICES = {
  // Travel Pro — the single paid subscription (collapsed Explorer + Nomad,
  // 2026-06-05). $14.99/mo, $149/yr.
  // ⚠️ PLACEHOLDERS — Brandon must create these prices in the Stripe dashboard
  // (test mode now, live at launch) and paste the real IDs here before merge.
  travel_pro: {
    monthly: 'price_REPLACE_ME_travel_pro_monthly',
    annual:  'price_REPLACE_ME_travel_pro_annual',
  },
  trip_pass: {
    // ⚠️ PLACEHOLDER — new $36 base price (raised from $30). Create in Stripe
    // and paste the real ID here. The $4 extra-person price is unchanged.
    base:         'price_REPLACE_ME_trip_pass_36',
    extra_person: 'price_1TP9yx0oQIONbBaW6AvfMRJv',
  },
  // Legacy price IDs — retained ONLY so the webhook can still resolve renewal
  // events for existing Explorer/Nomad subscribers to 'travel_pro'. Never
  // surfaced in checkout. Safe to delete once every legacy sub has migrated
  // to a travel_pro price (post-launch cleanup).
  legacy: {
    explorerMonthly: 'price_1TP9ME0oQIONbBaWFrLUHkxS',
    explorerAnnual:  'price_1TP9Mn0oQIONbBaWJpJM57GK',
    nomadMonthly:    'price_1TP9NF0oQIONbBaWrcpq2ZQE',
    nomadAnnual:     'price_1TP9Na0oQIONbBaWCNP0xv5H',
  },
} as const;
