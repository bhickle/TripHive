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

// ─── Singleton client ─────────────────────────────────────────────────────────

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-03-25.dahlia',
  typescript: true,
});

// ─── Tier lookup (Stripe price → subscription_tier) ───────────────────────────
// Used by the webhook to map a price ID back to the DB tier value.

export const PRICE_TO_TIER: Record<string, 'explorer' | 'nomad'> = {
  [STRIPE_PRICES.explorer.monthly]: 'explorer',
  [STRIPE_PRICES.explorer.annual]:  'explorer',
  [STRIPE_PRICES.nomad.monthly]:    'nomad',
  [STRIPE_PRICES.nomad.annual]:     'nomad',
};
