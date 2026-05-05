/**
 * POST /api/webhooks/stripe
 *
 * Receives signed Stripe webhook events and updates Supabase accordingly.
 *
 * Events handled:
 *   checkout.session.completed        — new subscription OR one-time Trip Pass
 *   customer.subscription.updated     — plan changed, renewed, etc.
 *   customer.subscription.deleted     — subscription cancelled / expired
 *   invoice.payment_succeeded         — renew AI credits monthly
 *   invoice.payment_failed            — optional: flag account for retry
 *
 * IMPORTANT: This route must be excluded from Next.js body parsing so we
 * can verify the raw Stripe signature. The `export const config` at the
 * bottom handles that.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe, PRICE_TO_TIER } from '@/lib/stripe';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
// Stripe SDK uses Node-specific APIs (Buffer, crypto); pin to Node runtime.
export const runtime = 'nodejs';

// ─── AI credit allocations per tier ──────────────────────────────────────────
const TIER_CREDITS: Record<string, number> = {
  explorer: 100,
  nomad:    350,
  free:     10,
};

// Tiers (ordered low → high) used to detect downgrade attempts when buying Trip Pass.
const SUBSCRIPTION_TIER_RANK: Record<string, number> = {
  free: 0,
  trip_pass: 1,
  explorer: 2,
  nomad: 3,
};

// ─── Helper: update profile tier ─────────────────────────────────────────────
async function setTier(
  userId: string,
  tier: 'free' | 'explorer' | 'nomad',
  subscriptionId?: string,
) {
  const supabaseAdmin = createAdminClient();
  const credits = TIER_CREDITS[tier] ?? 10;

  // Idempotency: if the profile already reflects this tier + subscription_id
  // AND the credit window is still active, skip the write to avoid resetting
  // ai_credits_used on a webhook retry of a previously-processed event.
  if (subscriptionId) {
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('subscription_tier, stripe_subscription_id, ai_credits_reset_at')
      .eq('id', userId)
      .single();

    if (
      existing?.subscription_tier === tier &&
      existing?.stripe_subscription_id === subscriptionId &&
      existing?.ai_credits_reset_at &&
      new Date(existing.ai_credits_reset_at).getTime() > Date.now()
    ) {
      console.log(`[stripe/webhook] setTier skipped (already ${tier} for sub ${subscriptionId})`);
      return;
    }
  }

  await supabaseAdmin
    .from('profiles')
    .update({
      subscription_tier: tier,
      ai_credits_total: credits,
      ai_credits_used: 0,
      ai_credits_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
    })
    .eq('id', userId);
}

// ─── Helper: look up supabase user ID from Stripe customer ───────────────────
async function userIdFromCustomer(customerId: string): Promise<string | null> {
  const supabaseAdmin = createAdminClient();
  // First try: metadata on the Stripe customer object (most reliable)
  const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
  const metaId = customer.metadata?.supabase_user_id;
  if (metaId) return metaId;

  // Fallback: look up via stripe_customer_id in profiles table
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();
  return data?.id ?? null;
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    console.error('[stripe/webhook] signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // ── Route events ───────────────────────────────────────────────────────────
  try {
    switch (event.type) {
      // ── New checkout completed ─────────────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        if (!userId) break;

        if (session.mode === 'subscription') {
          // Subscription — resolve the price to a tier
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          const priceId = sub.items.data[0]?.price.id;
          const tier = PRICE_TO_TIER[priceId];
          if (tier) {
            await setTier(userId, tier, sub.id);
          }
        } else if (session.mode === 'payment') {
          // One-time Trip Pass — upsert the trip_passes row, but ONLY set
          // subscription_tier='trip_pass' if the user is currently on free.
          // Otherwise an Explorer/Nomad user buying a Trip Pass for a
          // friend/group would be downgraded.
          const tripId = session.metadata?.trip_id;
          const extraPeople = parseInt(session.metadata?.extra_people ?? '0', 10);
          const now = new Date();
          const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
          const supabaseAdmin = createAdminClient();

          const { data: existingProfile } = await supabaseAdmin
            .from('profiles')
            .select('subscription_tier')
            .eq('id', userId)
            .single();

          const currentRank = SUBSCRIPTION_TIER_RANK[existingProfile?.subscription_tier ?? 'free'] ?? 0;
          const tripPassRank = SUBSCRIPTION_TIER_RANK['trip_pass'];

          if (currentRank < tripPassRank) {
            // User was on free → upgrade to trip_pass
            await supabaseAdmin.from('profiles').update({
              subscription_tier: 'trip_pass',
            }).eq('id', userId);
          }
          // else: user already has explorer/nomad — leave subscription_tier alone

          if (tripId) {
            // Upsert the trip pass record (idempotent on user_id + trip_id)
            await supabaseAdmin.from('trip_passes').upsert({
              user_id: userId,
              trip_id: tripId,
              purchased_at: now.toISOString(),
              expires_at: expiresAt,
              extra_people: extraPeople,
              ai_credits_total: 30,
              ai_credits_used: 0,
            }, { onConflict: 'user_id,trip_id' });
          }
        }
        break;
      }

      // ── Subscription updated (plan change, renewal, trial end) ────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await userIdFromCustomer(sub.customer as string);
        if (!userId) break;

        const priceId = sub.items.data[0]?.price.id;
        const tier = PRICE_TO_TIER[priceId];

        if (sub.status === 'active' && tier) {
          await setTier(userId, tier, sub.id);
        } else if (sub.status === 'canceled' || sub.status === 'unpaid') {
          await setTier(userId, 'free');
        }
        break;
      }

      // ── Subscription cancelled / expired ──────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await userIdFromCustomer(sub.customer as string);
        if (!userId) break;
        await setTier(userId, 'free');
        break;
      }

      // ── Invoice paid — reset monthly AI credits ────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.billing_reason !== 'subscription_cycle') break; // skip first payment (covered by checkout.session.completed)

        const userId = await userIdFromCustomer(invoice.customer as string);
        if (!userId) break;

        const supabaseAdmin = createAdminClient();
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('subscription_tier, ai_credits_reset_at')
          .eq('id', userId)
          .single();

        if (profile?.subscription_tier && profile.subscription_tier !== 'free' && profile.subscription_tier !== 'trip_pass') {
          // Idempotency: each subscription_cycle invoice represents one billing
          // period. period_end is when the cycle ends. If we've already credited
          // this cycle (reset_at >= period_end), skip — Stripe is retrying.
          const periodEndMs = invoice.period_end * 1000;
          const alreadyResetMs = profile.ai_credits_reset_at
            ? new Date(profile.ai_credits_reset_at).getTime()
            : 0;

          if (alreadyResetMs > periodEndMs) {
            console.log(`[stripe/webhook] credit reset skipped (already credited for cycle ending ${new Date(periodEndMs).toISOString()})`);
            break;
          }

          const credits = TIER_CREDITS[profile.subscription_tier] ?? 10;
          await supabaseAdmin.from('profiles').update({
            ai_credits_used: 0,
            ai_credits_total: credits,
            ai_credits_reset_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          }).eq('id', userId);
        }
        break;
      }

      // ── Payment failed ────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        // Stripe will retry automatically. We log but don't downgrade yet —
        // Stripe will fire subscription.deleted if it ultimately gives up.
        const invoice = event.data.object as Stripe.Invoice;
        console.warn('[stripe/webhook] payment failed for customer:', invoice.customer);
        break;
      }

      default:
        // Unhandled event — just acknowledge
        break;
    }
  } catch (err) {
    console.error('[stripe/webhook] handler error:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Note: In Next.js 14 App Router, body parsing is not automatic —
// req.text() reads the raw body directly, which is what Stripe needs
// for signature verification. No config needed.
