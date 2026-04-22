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
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { stripe, STRIPE_PRICES } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    const { priceId, mode, extraPeople = 0, tripId } = await req.json();

    if (!priceId || !mode) {
      return NextResponse.json({ error: 'Missing priceId or mode' }, { status: 400 });
    }

    // ── Get the logged-in user ──────────────────────────────────────────────
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
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
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode,
      line_items: lineItems,
      success_url: `${appUrl}/settings?checkout=success`,
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
