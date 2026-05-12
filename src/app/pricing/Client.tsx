'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Globe, CheckCircle, ArrowLeft, X, Sparkles, Users, Zap,
  CalendarDays, Map, Camera, Shield, Star, ChevronDown,
  ChevronUp, Lock, Crown, Loader2, Receipt, AlertCircle, Plus,
} from 'lucide-react';
import { PRICING } from '@/hooks/useEntitlements';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { STRIPE_PRICES } from '@/lib/stripe-prices';
import { useAuth } from '@/context/AuthContext';

// ─── Feature rows for the comparison table ───────────────────────────────────

const featureRows: {
  label: string;
  icon: React.ReactNode;
  free: string | boolean;
  trip_pass: string | boolean;
  explorer: string | boolean;
  nomad: string | boolean;
  nomadHighlight?: boolean;
}[] = [
  // Planning
  { label: 'Active trips', icon: <Map className="w-4 h-4" />, free: 'Unlimited', trip_pass: '1 trip (pass)', explorer: 'Unlimited', nomad: 'Unlimited' },
  { label: 'Travelers per trip', icon: <Users className="w-4 h-4" />, free: 'Up to 4', trip_pass: 'Up to 6 (+add-ons)', explorer: 'Up to 8', nomad: 'Up to 15' },
  { label: 'Manual itinerary builder', icon: <CalendarDays className="w-4 h-4" />, free: true, trip_pass: true, explorer: true, nomad: true },
  { label: 'Packing & prep checklists', icon: <CheckCircle className="w-4 h-4" />, free: true, trip_pass: true, explorer: true, nomad: true },
  { label: 'Activity voting', icon: <Star className="w-4 h-4" />, free: true, trip_pass: true, explorer: true, nomad: true },
  { label: 'Group invite & member management', icon: <Users className="w-4 h-4" />, free: true, trip_pass: true, explorer: true, nomad: true },
  { label: 'Trip Story', icon: <Camera className="w-4 h-4" />, free: true, trip_pass: true, explorer: true, nomad: true },
  // AI
  { label: 'AI itinerary generation', icon: <Sparkles className="w-4 h-4" />, free: '7 days, 1/month', trip_pass: 'Up to 7 days', explorer: 'Up to 10 days', nomad: 'Up to 14 days', nomadHighlight: true },
  { label: 'AI credits', icon: <Zap className="w-4 h-4" />, free: '10 / month', trip_pass: '30 per pass', explorer: '100 / month', nomad: '300 / month', nomadHighlight: true },
  { label: 'Transport confirmation parser', icon: <Sparkles className="w-4 h-4" />, free: false, trip_pass: true, explorer: true, nomad: true },
  { label: 'AI packing list', icon: <Sparkles className="w-4 h-4" />, free: false, trip_pass: false, explorer: false, nomad: true, nomadHighlight: true },
  { label: 'AI travel phrasebook', icon: <Sparkles className="w-4 h-4" />, free: false, trip_pass: false, explorer: false, nomad: true, nomadHighlight: true },
  // Group & trips
  { label: 'Photo gallery', icon: <Camera className="w-4 h-4" />, free: true, trip_pass: true, explorer: true, nomad: true },
  { label: 'Group chat', icon: <Users className="w-4 h-4" />, free: true, trip_pass: true, explorer: true, nomad: true },
  { label: 'Group expense tracking', icon: <Receipt className="w-4 h-4" />, free: false, trip_pass: true, explorer: true, nomad: true },
  { label: 'AI receipt scanning', icon: <Sparkles className="w-4 h-4" />, free: false, trip_pass: false, explorer: false, nomad: true, nomadHighlight: true },
  { label: 'Split-track itineraries', icon: <Map className="w-4 h-4" />, free: false, trip_pass: true, explorer: true, nomad: true },
  { label: 'Co-organizer role', icon: <Users className="w-4 h-4" />, free: false, trip_pass: true, explorer: true, nomad: true },
  { label: 'Wishlist & destination discovery', icon: <Globe className="w-4 h-4" />, free: 'Save only', trip_pass: false, explorer: true, nomad: true },
  { label: 'Year in Review', icon: <Star className="w-4 h-4" />, free: false, trip_pass: false, explorer: true, nomad: true },
  // Support
  { label: 'Early access to new features', icon: <Star className="w-4 h-4" />, free: false, trip_pass: false, explorer: false, nomad: true, nomadHighlight: true },
  { label: 'Support', icon: <Shield className="w-4 h-4" />, free: 'Community', trip_pass: 'Email', explorer: 'Email', nomad: 'Priority' },
];

// ─── FAQ ─────────────────────────────────────────────────────────────────────

const faqs = [
  {
    q: 'What exactly is a Trip Pass?',
    a: "A Trip Pass is a one-time $30 purchase tied to a single trip. It unlocks AI itinerary generation, the transport parser, photo gallery, and more for up to 6 travelers. It's perfect if you travel once or twice a year and don't want a monthly subscription. The pass is active for your trip duration plus 30 days after.",
  },
  {
    q: 'Can I add more people to a Trip Pass?',
    a: "Yes — you can add travelers beyond the base 6 for $4 per person, up to 12 total. So a group of 10 would be $30 + $16 = $46 for the whole trip.",
  },
  {
    q: 'What are AI credits and what do they cost?',
    a: "AI credits are how we keep AI features sustainable. Generating a full itinerary costs 10 credits. Regenerating or tweaking it costs 5. Parsing a transport confirmation costs 1. Most people never come close to their monthly limit — the cap is a backstop for edge cases, not something you'll notice in normal use. Credits refresh each billing period.",
  },
  {
    q: 'What happens if I use all my AI credits?',
    a: "Your credits refresh on your next billing date. You'll see a heads-up before you're close so it's never a surprise. If you need more immediately, upgrading to Nomad gives you 300 credits — enough for even the most enthusiastic planner.",
  },
  {
    q: 'Can I switch plans?',
    a: "Yes, anytime. Upgrades take effect immediately. If you downgrade, your current plan stays active until the end of your billing period.",
  },
  {
    q: 'Do you offer annual billing?',
    a: "Yes — pay annually and save ~20%. Explorer drops to $6.42/mo ($76.99/year) and Nomad to ~$12/mo ($143.99/year). No subscription renews without a reminder.",
  },
  {
    q: 'What happens to my data if I cancel?',
    a: "Your trips and data are stored safely for 30 days after cancellation. Reactivate anytime to pick up exactly where you left off.",
  },
];

// ─── Components ───────────────────────────────────────────────────────────────

function FeatureCell({ value, highlight = false }: { value: string | boolean; highlight?: boolean }) {
  if (value === true) return <CheckCircle className="w-5 h-5 text-emerald-500 mx-auto" />;
  if (value === false) return <X className="w-4 h-4 text-zinc-300 mx-auto" />;
  return (
    <span className={`text-xs font-semibold text-center leading-tight ${highlight ? 'text-sky-700' : 'text-zinc-600'}`}>
      {value}
    </span>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-zinc-100 rounded-2xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left hover:bg-zinc-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="font-semibold text-zinc-900 text-sm">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-zinc-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-6 pb-5 text-sm text-zinc-500 leading-relaxed border-t border-zinc-100 pt-4">
          {a}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// Per-trip row shape returned by /api/trips. Kept narrow on purpose — the
// pricing-page picker only needs identity + display fields.
interface PickerTrip {
  id: string;
  title?: string | null;
  destination?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  group_size?: number | null;
}

// Next.js 14 requires useSearchParams() consumers to live inside a Suspense
// boundary so the static prerender can bail to client rendering for just
// the search-param-dependent slice. Hoisting the body into an inner
// component keeps the existing JSX intact.
export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingPageInner />
    </Suspense>
  );
}

function PricingPageInner() {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Trip Pass picker ──────────────────────────────────────────────────────
  // A Trip Pass purchase needs a tripId, but the visitor on this page may not
  // have one yet. Flow:
  //   1. Not authenticated → bounce to signup, return to /pricing?intent=trip_pass
  //   2. Authenticated, no trips → route to /trip/new
  //   3. Authenticated with trips → show a picker; clicking a trip starts
  //      checkout for that tripId with the live extra-person price
  // After signup, the URL carries ?intent=trip_pass which auto-triggers the
  // picker so the user doesn't have to click "Buy a Pass" twice.
  const [showTripPicker, setShowTripPicker] = useState(false);
  useEscapeKey(() => setShowTripPicker(false), showTripPicker);
  const [tripPickerTrips, setTripPickerTrips] = useState<PickerTrip[]>([]);
  const [tripPickerLoading, setTripPickerLoading] = useState(false);

  const handleTripPassClick = async () => {
    if (!user) {
      router.push('/auth/signup?redirect=/pricing%3Fintent%3Dtrip_pass');
      return;
    }
    setTripPickerLoading(true);
    setCheckoutError(null);
    try {
      const res = await fetch('/api/trips');
      const data = await res.json().catch(() => ({}));
      const trips: PickerTrip[] = Array.isArray(data?.trips) ? data.trips : [];
      if (trips.length === 0) {
        router.push('/trip/new');
        return;
      }
      setTripPickerTrips(trips);
      setShowTripPicker(true);
    } catch {
      setCheckoutError('Could not load your trips. Please try again.');
    } finally {
      setTripPickerLoading(false);
    }
  };

  // Auto-open picker after signup-redirect-back if intent=trip_pass.
  useEffect(() => {
    if (searchParams?.get('intent') === 'trip_pass' && user && !showTripPicker) {
      handleTripPassClick();
    }
    // We deliberately don't include handleTripPassClick in deps — it'd
    // rebuild every render and re-fire the picker. The intent + user check
    // is the actual trigger condition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  const handlePickerTripPassCheckout = async (trip: PickerTrip) => {
    setCheckingOut(STRIPE_PRICES.trip_pass.base);
    setCheckoutError(null);
    const groupSize = Math.min(trip.group_size ?? PRICING.trip_pass.baseGroupSize, PRICING.trip_pass.maxGroupSize);
    const extraPeople = Math.max(0, groupSize - PRICING.trip_pass.baseGroupSize);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: STRIPE_PRICES.trip_pass.base,
          mode: 'payment',
          tripId: trip.id,
          extraPeople,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setCheckoutError(data.error ?? 'Could not start checkout.');
        setCheckingOut(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setCheckoutError('Could not start checkout. Please try again.');
      setCheckingOut(null);
    }
  };

  // ── Kick off Stripe checkout ──────────────────────────────────────────────
  // Without the explicit res.ok check, a non-2xx response (5xx, auth fail,
  // missing price ID) used to short-circuit through `data.url && regex`,
  // null out the loading state, and leave the user staring at the page with
  // no feedback. Now we surface a banner above the cards so they know the
  // action failed and can retry.
  async function startCheckout(priceId: string, mode: 'subscription' | 'payment') {
    // If not logged in, send to signup first; after auth they'll come back to pricing
    if (!user) {
      router.push(`/auth/signup?redirect=/pricing`);
      return;
    }

    setCheckingOut(priceId);
    setCheckoutError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, mode }),
      });
      if (!res.ok) {
        let detail = `request failed (${res.status})`;
        try {
          const errBody = await res.json() as { error?: string };
          if (errBody?.error) detail = errBody.error;
        } catch { /* response wasn't JSON */ }
        throw new Error(detail);
      }
      const data = await res.json() as { url?: string };
      if (data.url && /^https:\/\/(checkout\.stripe\.com|billing\.stripe\.com)\//.test(data.url)) {
        window.location.href = data.url;
      } else {
        throw new Error('Stripe did not return a valid checkout URL.');
      }
    } catch (err) {
      console.error('Checkout failed:', err);
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setCheckoutError(`Couldn't start checkout — ${msg} Please try again.`);
      setCheckingOut(null);
    }
  }

  const explorerPrice = billing === 'annual' ? (PRICING.explorer.annual / 12).toFixed(2) : PRICING.explorer.monthly.toFixed(2);
  const nomadPrice = billing === 'annual' ? (PRICING.nomad.annual / 12).toFixed(2) : PRICING.nomad.monthly.toFixed(2);
  const explorerBilled = billing === 'annual' ? `$${PRICING.explorer.annual}/year` : null;
  const nomadBilled = billing === 'annual' ? `$${PRICING.nomad.annual}/year` : null;

  return (
    <div className="min-h-screen bg-parchment">

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg border-b border-zinc-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-zinc-500 hover:text-zinc-800 transition-colors text-sm font-medium">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <Image src="/tripcoord_logo.png" alt="tripcoord" width={140} height={44} className="h-9 w-auto" />
          <Link href="/auth/signup" className="px-4 py-2 bg-zinc-900 hover:bg-zinc-700 text-white text-sm font-semibold rounded-full transition-all">
            Get started free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-20 pb-10 px-4 text-center">
        <p className="text-sky-700 text-xs font-bold uppercase tracking-widest mb-4">Pricing</p>
        <h1 className="font-script italic text-5xl sm:text-6xl font-semibold text-zinc-900 mb-5 leading-tight tracking-tight">
          Pay for what you need.<br />Not a dollar more.
        </h1>
        <p className="text-lg text-zinc-500 max-w-xl mx-auto mb-10">
          Start free. Buy a pass for a single trip. Or subscribe and never think about it again.
        </p>

        {/* Billing toggle */}
        <div className="inline-flex items-center bg-zinc-100 rounded-full p-1 gap-1">
          <button
            onClick={() => setBilling('monthly')}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${billing === 'monthly' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling('annual')}
            className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${billing === 'annual' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
          >
            Annual
            <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">Save 20%</span>
          </button>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="max-w-7xl mx-auto px-4 pb-16">
        {billing === 'annual' && (
          <p className="text-center text-xs text-zinc-400 mb-4">
            Annual billing is available for Explorer and Nomad subscriptions only.
          </p>
        )}
        {checkoutError && (
          <div className="max-w-2xl mx-auto mb-5 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="flex-1">{checkoutError}</span>
            <button
              onClick={() => setCheckoutError(null)}
              className="text-rose-400 hover:text-rose-600 transition-colors"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className={`grid gap-5 max-w-6xl mx-auto ${billing === 'annual' ? 'grid-cols-1 sm:grid-cols-2 max-w-2xl' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'}`}>

          {/* Free */}
          {billing === 'monthly' && (
          <div className="bg-white border border-zinc-200 rounded-3xl p-7 flex flex-col">
            <div className="mb-5">
              <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-1.5">Free</p>
              <p className="text-zinc-500 text-sm leading-snug">Try tripcoord. See what the fuss is about.</p>
            </div>
            <div className="mb-6">
              <span className="font-script italic text-4xl font-semibold text-zinc-900">$0</span>
              <span className="text-zinc-400 text-sm ml-1">/ month</span>
            </div>
            <Link href="/auth/signup" className="w-full text-center py-3 border border-zinc-200 hover:border-zinc-400 text-zinc-700 font-semibold rounded-full text-sm transition-all mb-7">
              Get started
            </Link>
            <ul className="space-y-3 flex-1">
              {[
                'Unlimited active trips',
                'Up to 4 travelers',
                'Manual itinerary builder',
                '10 AI credits / month',
                'Group chat',
                'Photo gallery',
                'Destination wishlist (save & organize)',
                'Join trips via invite link',
                'Activity voting',
                'Community support',
              ].map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-600">
                  <CheckCircle className="w-4 h-4 text-zinc-300 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          )}

          {/* Trip Pass */}
          {billing === 'monthly' && (
          <div id="trip-pass" className="bg-amber-50 border border-amber-200 rounded-3xl p-7 flex flex-col scroll-mt-24">
            <div className="mb-5">
              <p className="text-amber-700 text-xs font-bold uppercase tracking-widest mb-1.5">Trip Pass</p>
              <p className="text-amber-800 text-sm leading-snug">One trip, fully unlocked. No subscription needed.</p>
            </div>
            <div className="mb-1">
              <span className="font-script italic text-4xl font-semibold text-zinc-900">${PRICING.trip_pass.base}</span>
              <span className="text-zinc-500 text-sm ml-1">/ trip</span>
            </div>
            <p className="text-xs text-amber-700 font-medium mb-6">+$4/person beyond 6 · up to 12</p>
            <button
              onClick={handleTripPassClick}
              disabled={tripPickerLoading}
              className="w-full text-center py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-full text-sm transition-all mb-7 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {tripPickerLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {tripPickerLoading ? 'Loading…' : 'Buy a Pass'}
            </button>
            <ul className="space-y-3 flex-1">
              {[
                'Up to 6 travelers (+ add-ons)',
                '30 AI credits for this trip',
                'AI itinerary generation',
                'Transport confirmation parser',
                'Group expense tracking (manual splits)',
                'Split-track itineraries (Track A/B)',
                'Co-organizer role — share edit access',
                'Trip Story (shareable)',
                'Group invite & member management',
                'Packing & prep checklists',
                'Email support',
              ].map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-amber-900">
                  <CheckCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          )}

          {/* Explorer — Most Popular */}
          <div id="explorer" className="bg-sky-900 border border-sky-800 rounded-3xl p-7 flex flex-col relative shadow-xl shadow-sky-900/20 scroll-mt-24">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-sky-500 to-green-500 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full shadow-md">
              Most Popular
            </div>
            <div className="mb-5 mt-2">
              <p className="text-sky-300 text-xs font-bold uppercase tracking-widest mb-1.5">Explorer</p>
              <p className="text-sky-100/70 text-sm leading-snug">Your whole travel year, covered.</p>
            </div>
            <div className="mb-1">
              <span className="font-script italic text-4xl font-semibold text-white">${explorerPrice}</span>
              <span className="text-sky-300 text-sm ml-1">/ month</span>
            </div>
            {explorerBilled
              ? <p className="text-xs text-sky-300 font-medium mb-6">Billed {explorerBilled} · 2 months free</p>
              : <p className="text-xs text-sky-400 mb-6">Billed monthly · cancel anytime</p>
            }
            <button
              onClick={() => startCheckout(
                billing === 'annual' ? STRIPE_PRICES.explorer.annual : STRIPE_PRICES.explorer.monthly,
                'subscription'
              )}
              disabled={!!checkingOut}
              className="w-full flex items-center justify-center gap-2 py-3 bg-white hover:bg-sky-50 text-sky-900 font-bold rounded-full text-sm transition-all mb-7 shadow-sm disabled:opacity-70"
            >
              {checkingOut === (billing === 'annual' ? STRIPE_PRICES.explorer.annual : STRIPE_PRICES.explorer.monthly)
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting…</>
                : 'Get Explorer'
              }
            </button>
            <ul className="space-y-3 flex-1">
              {[
                'Plan trips all year long',
                'Up to 8 travelers per trip',
                '100 AI credits / month',
                'AI itinerary generation — up to 10 days',
                'Transport confirmation parser',
                'Group expense tracking (manual splits)',
                'Split-track itineraries (Track A/B)',
                'Co-organizer role — share edit access',
                'Wishlist & destination discovery',
                'Year in Review',
                'Trip Story for every trip',
                'Packing & prep checklists',
                'Email support',
              ].map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-sky-100">
                  <CheckCircle className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Nomad */}
          <div id="nomad" className="bg-white border border-zinc-200 rounded-3xl p-7 flex flex-col relative scroll-mt-24">
            <div className="absolute top-6 right-6">
              <Crown className="w-5 h-5 text-amber-400" />
            </div>
            <div className="mb-5">
              <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-1.5">Nomad</p>
              <p className="text-zinc-500 text-sm leading-snug">For the organizer everyone counts on.</p>
            </div>
            <div className="mb-1">
              <span className="font-script italic text-4xl font-semibold text-zinc-900">${nomadPrice}</span>
              <span className="text-zinc-400 text-sm ml-1">/ month</span>
            </div>
            {nomadBilled
              ? <p className="text-xs text-zinc-500 font-medium mb-6">Billed {nomadBilled} · 2 months free</p>
              : <p className="text-xs text-zinc-400 mb-6">Billed monthly · cancel anytime</p>
            }
            <button
              onClick={() => startCheckout(
                billing === 'annual' ? STRIPE_PRICES.nomad.annual : STRIPE_PRICES.nomad.monthly,
                'subscription'
              )}
              disabled={!!checkingOut}
              className="w-full flex items-center justify-center gap-2 py-3 bg-zinc-900 hover:bg-zinc-700 text-white font-bold rounded-full text-sm transition-all mb-7 shadow-sm disabled:opacity-70"
            >
              {checkingOut === (billing === 'annual' ? STRIPE_PRICES.nomad.annual : STRIPE_PRICES.nomad.monthly)
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting…</>
                : 'Get Nomad'
              }
            </button>
            <ul className="space-y-3 flex-1">
              {[
                { text: 'Everything in Explorer', highlight: false },
                { text: 'Up to 15 travelers per trip', highlight: false },
                { text: 'AI itineraries up to 14 days', highlight: true },
                { text: '300 AI credits / month', highlight: true },
                { text: 'AI receipt scanning (scan to split)', highlight: true },
                { text: 'AI packing list (destination-specific)', highlight: true },
                { text: 'AI travel phrasebook', highlight: true },
                { text: 'Early access to new features', highlight: true },
                { text: 'Priority support', highlight: false },
              ].map(f => (
                <li key={f.text} className="flex items-start gap-2.5 text-sm">
                  <CheckCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${f.highlight ? 'text-amber-400' : 'text-zinc-300'}`} />
                  <span className={f.highlight ? 'text-zinc-900 font-semibold' : 'text-zinc-600'}>{f.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Trip pass add-on note */}
        <p className="text-center text-xs text-zinc-400 mt-6">
          Trip Pass add-ons: +$4/person beyond 6 travelers · max 12 per trip · pass valid for trip duration + 30 days
        </p>
      </section>

      {/* AI Credits explainer */}
      <section className="bg-zinc-50 border-y border-zinc-100 py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white border border-zinc-200 rounded-full px-4 py-2 mb-6">
            <Zap className="w-4 h-4 text-sky-600" />
            <span className="text-sm font-semibold text-zinc-700">How AI credits work</span>
          </div>
          <h2 className="font-script italic text-3xl font-semibold text-zinc-900 mb-4">Smart AI. Not a blank check.</h2>
          <p className="text-zinc-500 mb-10 leading-relaxed">
            AI credits let us keep the lights on without charging per-call. Most users never get close to the limit.
            Think of it as a fair-use guardrail, not a wall.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-left">
            {[
              { action: 'Generate itinerary', cost: 10, icon: '🗺️' },
              { action: 'Tweak itinerary', cost: 5, icon: '✏️' },
              { action: 'Parse confirmation', cost: 1, icon: '📧' },
              { action: 'Activity suggestions', cost: 2, icon: '💡' },
            ].map(item => (
              <div key={item.action} className="bg-white border border-zinc-100 rounded-2xl p-4">
                <p className="text-2xl mb-2">{item.icon}</p>
                <p className="text-zinc-900 font-bold text-sm mb-0.5">{item.action}</p>
                <p className="text-sky-700 font-black text-lg">{item.cost} <span className="text-zinc-400 font-normal text-xs">credit{item.cost !== 1 ? 's' : ''}</span></p>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-400 mt-6">Credits refresh each billing period. Unused credits don&apos;t roll over.</p>
        </div>
      </section>

      {/* Comparison table */}
      <section className="max-w-5xl mx-auto px-4 py-20">
        <h2 className="font-script italic text-3xl font-semibold text-zinc-900 text-center mb-12">Compare plans</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left py-3 pr-6 text-zinc-400 font-semibold text-xs uppercase tracking-wide w-56">Feature</th>
                {[
                  { label: 'Free', color: 'text-zinc-500' },
                  { label: 'Trip Pass', color: 'text-amber-600' },
                  { label: 'Explorer', color: 'text-sky-700' },
                  { label: 'Nomad', color: 'text-zinc-900' },
                ].map(col => (
                  <th key={col.label} className={`text-center py-3 px-4 font-bold text-sm ${col.color}`}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {featureRows.map((row, i) => (
                <tr key={row.label} className={`border-b border-zinc-50 ${i % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50'}`}>
                  <td className="py-3 pr-6 text-zinc-600 font-medium flex items-center gap-2">
                    <span className="text-zinc-300">{row.icon}</span>
                    {row.label}
                  </td>
                  <td className="py-3 px-4 text-center"><FeatureCell value={row.free} /></td>
                  <td className="py-3 px-4 text-center"><FeatureCell value={row.trip_pass} /></td>
                  <td className="py-3 px-4 text-center"><FeatureCell value={row.explorer} /></td>
                  <td className="py-3 px-4 text-center"><FeatureCell value={row.nomad} highlight={row.nomadHighlight} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Social proof strip */}
      <section className="bg-zinc-900 py-12 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            { quote: "Bought the Trip Pass for our Iceland trip. Easiest $30 I've ever spent — had the whole week planned in 20 minutes.", name: 'Maya R.', tag: 'Trip Pass user' },
            { quote: "The co-organizer feature on Nomad is genuinely a game changer. My partner and I can both edit without stepping on each other.", name: 'James T.', tag: 'Nomad subscriber' },
            { quote: "I was skeptical about the AI credits thing but I've never come close to the limit. Explorer is totally worth it.", name: 'Priya S.', tag: 'Explorer subscriber' },
          ].map(t => (
            <div key={t.name}>
              <p className="text-zinc-300 text-sm leading-relaxed mb-4 italic">&ldquo;{t.quote}&rdquo;</p>
              <p className="text-white font-bold text-sm">{t.name}</p>
              <p className="text-zinc-500 text-xs">{t.tag}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-2xl mx-auto px-4 py-20">
        <h2 className="font-script italic text-3xl font-semibold text-zinc-900 text-center mb-10">Questions</h2>
        <div className="space-y-3">
          {faqs.map(faq => <FaqItem key={faq.q} q={faq.q} a={faq.a} />)}
        </div>
      </section>

      {/* CTA footer */}
      <section className="bg-gradient-to-br from-sky-900 via-zinc-900 to-green-900 py-20 px-4 text-center">
        <h2 className="font-script italic text-4xl font-semibold text-white mb-4">Ready to actually enjoy planning?</h2>
        <p className="text-sky-200 mb-10 max-w-lg mx-auto">
          Start free. Upgrade when you need it. No pressure, no tricks.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/auth/signup" className="px-8 py-3.5 bg-white text-zinc-900 font-bold rounded-full text-sm hover:bg-zinc-100 transition-all shadow-lg">
            Start for free
          </Link>
          <Link href="/auth/signup" className="px-8 py-3.5 bg-white/10 border border-white/20 text-white font-semibold rounded-full text-sm hover:bg-white/20 transition-all">
            Buy a Trip Pass  →
          </Link>
        </div>
        <p className="text-sky-300/50 text-xs mt-8">No credit card required to start free · Cancel anytime</p>
      </section>

      {/* Footer */}
      <footer className="bg-zinc-950 py-8 px-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Image src="/tripcoord_logo.png" alt="tripcoord" width={120} height={38} className="h-7 w-auto brightness-0 invert opacity-60" />
          <div className="flex items-center gap-6 text-xs text-zinc-600">
            <Link href="/legal/privacy" className="hover:text-zinc-400 transition-colors">Privacy</Link>
            <Link href="/legal/terms" className="hover:text-zinc-400 transition-colors">Terms</Link>
            <a href="mailto:hello@tripcoord.ai" className="hover:text-zinc-400 transition-colors">Contact</a>
          </div>
          <p className="text-zinc-600 text-xs">© 2026 tripcoord. All rights reserved.</p>
        </div>
      </footer>

      {/* ─── Trip Pass picker ────────────────────────────────────────────────
          Shown after the user clicks "Buy a Pass" while authenticated. Lists
          their trips so they can apply the pass to a specific one — pricing
          adjusts live based on each trip's group_size. */}
      {showTripPicker && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Choose a trip for your pass"
          onClick={() => setShowTripPicker(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 relative"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setShowTripPicker(false)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
            <h2 className="font-script italic text-2xl font-semibold text-zinc-900 mb-1 pr-8">Which trip is this for?</h2>
            <p className="text-sm text-zinc-500 mb-5">
              Trip Pass is one-time, tied to a single trip. Pick one below or start a new one.
            </p>
            <div className="space-y-2 mb-4">
              {tripPickerTrips.map(trip => {
                const groupSize = Math.min(trip.group_size ?? PRICING.trip_pass.baseGroupSize, PRICING.trip_pass.maxGroupSize);
                const extraPeople = Math.max(0, groupSize - PRICING.trip_pass.baseGroupSize);
                const totalPrice = PRICING.trip_pass.base + extraPeople * PRICING.trip_pass.extraPersonFee;
                const dateRange = trip.start_date && trip.end_date
                  ? `${new Date(trip.start_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(trip.end_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                  : null;
                const purchasing = checkingOut === STRIPE_PRICES.trip_pass.base;
                return (
                  <button
                    key={trip.id}
                    onClick={() => handlePickerTripPassCheckout(trip)}
                    disabled={purchasing}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-zinc-200 hover:border-amber-400 hover:bg-amber-50 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-900 truncate">{trip.title || trip.destination || 'Untitled trip'}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {[trip.destination, dateRange, `${groupSize} ${groupSize === 1 ? 'traveler' : 'travelers'}`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0">
                      <span className="text-base font-semibold text-amber-700">${totalPrice}</span>
                      {extraPeople > 0 && (
                        <span className="text-[10px] text-amber-600 -mt-0.5">+{extraPeople} extra</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => { setShowTripPicker(false); router.push('/trip/new'); }}
              className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-zinc-300 hover:border-zinc-500 hover:bg-zinc-50 text-zinc-700 font-semibold rounded-xl text-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              Build a new trip
            </button>
            {checkoutError && (
              <p className="mt-3 text-xs text-rose-600 text-center">{checkoutError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
