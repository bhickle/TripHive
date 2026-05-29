/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for:
 *   - Explorer / Nomad subscriptions (mode: 'subscription')
 *   - Trip Pass one-time purchase (mode: 'payment')
 *
 * Body shape:
 *   { priceId: string; mode: 'subscription' | 'payment'; extraPeople?: number; tripId?: string }
 *
 * Returns: { url: string } — redirect the browser there.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripe, STRIPE_PRICES } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

// UUID v4 shape — also matches v1-v5; what we care about is that the caller
// can't shove a non-UUID string into Stripe metadata that ends up in
// success_url interpolation.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    const { priceId, mode, extraPeople = 0, tripId } = await req.json();

    if (!priceId || !mode) {
      return NextResponse.json({ error: 'Missing priceId or mode' }, { status: 400 });
    }

    // ── Get the logged-in user ──────────────────────────────────────────────
    // Use the shared @/lib/supabase/server singleton instead of inlining
    // createServerClient — keeps the cookie/auth lock unified with the rest
    // of the API surface (CLAUDE.md singleton rule).
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    // ── Trip Pass membership gate ───────────────────────────────────────────
    // For Trip Pass purchases, validate that the caller actually owns or is
    // a member of the trip they're buying a pass for. Previously this trusted
    // the body-supplied tripId blindly, which meant a user could buy a Trip
    // Pass for someone else's tripId — the webhook would then upsert into
    // trip_passes (granting THAT trip a pass) AND flip the buyer's own
    // subscription_tier to 'trip_pass'. Either side is wrong: the target
    // trip's organizer didn't ask for a pass, and the buyer ends up tied to
    // a trip they have no relationship to.
    if (mode === 'payment' && tripId) {
      if (typeof tripId !== 'string' || !UUID_RE.test(tripId)) {
        return NextResponse.json({ error: 'Invalid tripId' }, { status: 400 });
      }
      // Use admin client for the membership check — RLS would otherwise hide
      // rows from the trip if the buyer isn't already a member, masking the
      // distinction between "no such trip" and "you don't belong to it."
      const admin = createAdminClient();
      const { data: trip } = await admin
        .from('trips')
        .select('organizer_id')
        .eq('id', tripId)
        .maybeSingle();
      if (!trip) {
        return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
      }
      let allowed = trip.organizer_id === user.id;
      if (!allowed) {
        const { data: membership } = await admin
          .from('trip_members')
          .select('id')
          .eq('trip_id', tripId)
          .eq('user_id', user.id)
          .maybeSingle();
        allowed = !!membership;
      }
      if (!allowed) {
        return NextResponse.json(
          { error: 'You must be a member of this trip to buy a Trip Pass for it' },
          { status: 403 },
        );
      }
    }

    // ── Fetch or create Stripe customer ────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email, name')
      .eq('id', user.id)
      .single();

    let customerId: string = profile?.stripe_customer_id ?? '';

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? user.email ?? undefined,
        name:  profile?.name  ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // ── Build line items ───────────────────────────────────────────────────
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tripcoord.ai';

    const lineItems: { price: string; quantity: number }[] = [
      { price: priceId, quantity: 1 },
    ];

    // For Trip Pass with extra people, add extra-person line items
    if (mode === 'payment' && extraPeople > 0) {
      lineItems.push({
        price: STRIPE_PRICES.trip_pass.extra_person,
        quantity: extraPeople,
      });
    }

    // ── Create the Checkout Session ────────────────────────────────────────
    // For Trip Pass purchases (mode='payment' + tripId), land the buyer back
    // on the trip's group page so they can immediately invite the crew and
    // see the Crew Readiness panel — that's the primary post-purchase action
    // for Trip Pass per the design memo. Subscriptions still land on /settings.
    const successUrl = mode === 'payment' && tripId
      ? `${appUrl}/trip/${tripId}/group?checkout=success`
      : `${appUrl}/settings?checkout=success`;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode,
      line_items: lineItems,
      success_url: successUrl,
      cancel_url:  `${appUrl}/pricing?checkout=cancelled`,
      metadata: {
        supabase_user_id: user.id,
        ...(tripId ? { trip_id: tripId } : {}),
        ...(extraPeople > 0 ? { extra_people: String(extraPeople) } : {}),
      },
      // For subscriptions, allow the customer to switch plans
      ...(mode === 'subscription' ? {
        subscription_data: {
          metadata: { supabase_user_id: user.id },
        },
      } : {}),
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/checkout]', err);
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 });
  }
}
