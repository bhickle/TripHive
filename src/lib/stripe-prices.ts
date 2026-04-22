/**
 * stripe-prices.ts — Client-safe price ID constants
 *
 * This file contains ONLY the Stripe price IDs — no SDK imports.
 * Safe to import in both client and server components.
 *
 * The actual Stripe client lives in src/lib/stripe.ts (server-only).
 */

export const STRIPE_PRICES = {
  explorer: {
    monthly: 'price_1TP9ME0oQIONbBaWFrLUHkxS',
    annual:  'price_1TP9Mn0oQIONbBaWJpJM57GK',
  },
  nomad: {
    monthly: 'price_1TP9NF0oQIONbBaWrcpq2ZQE',
    annual:  'price_1TP9Na0oQIONbBaWCNP0xv5H',
  },
  trip_pass: {
    base:         'price_1TP9wM0oQIONbBaW8OsYfdUd',
    extra_person: 'price_1TP9yx0oQIONbBaW6AvfMRJv',
  },
} as const;
