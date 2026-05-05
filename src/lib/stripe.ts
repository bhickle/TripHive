/**
 * stripe.ts — Stripe server-side client + price ID constants
 *
 * Import `stripe` in any server-only file (API routes, server components).
 * Never import this in client components — it contains the secret key.
 */

import Stripe from 'stripe';
import { STRIPE_PRICES } from './stripe-prices';

// Re-export so server routes only need one import
export { STRIPE_PRICES };

// ─── Lazy singleton client ────────────────────────────────────────────────────
// We defer instantiation to request time so Next.js build-time static analysis
// never tries to construct Stripe with an undefined key.

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    _stripe = new Stripe(key, {
      // Don't pin apiVersion — let the SDK use its bundled default so the
      // typed surface always matches the wire format. The previous explicit
      // '2026-03-25.dahlia' didn't match stripe@22.0.2's bundled types.
      typescript: true,
    });
  }
  return _stripe;
}

// Convenience proxy — existing imports of `stripe` keep working without change.
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ─── Tier lookup (Stripe price → subscription_tier) ───────────────────────────
// Used by the webhook to map a price ID back to the DB tier value.

export const PRICE_TO_TIER: Record<string, 'explorer' | 'nomad'> = {
  [STRIPE_PRICES.explorer.monthly]: 'explorer',
  [STRIPE_PRICES.explorer.annual]:  'explorer',
  [STRIPE_PRICES.nomad.monthly]:    'nomad',
  [STRIPE_PRICES.nomad.annual]:     'nomad',
};
