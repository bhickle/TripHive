'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Globe, CheckCircle, ArrowLeft, X, Sparkles, Users, Zap,
  CalendarDays, Map, Camera, Bell, Shield, Star, ChevronDown,
  ChevronUp, Lock, Crown,
} from 'lucide-react';
import { PRICING } from '@/hooks/useEntitlements';

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
  { label: 'Active trips', icon: <Map className="w-4 h-4" />, free: '1 trip', trip_pass: '1 trip', explorer: 'Your whole travel year', nomad: 'Your whole travel year' },
  { label: 'Travelers per trip', icon: <Users className="w-4 h-4" />, free: 'Up to 4', trip_pass: 'Up to 6 (+add-ons)', explorer: 'Up to 8', nomad: 'Up to 15' },
  { label: 'Manual itinerary builder', icon: <CalendarDays className="w-4 h-4" />, free: true, trip_pass: true, explorer: true, nomad: true },
  // AI
  { label: 'AI itinerary generation', icon: <Sparkles className="w-4 h-4" />, free: false, trip_pass: true, explorer: true, nomad: true },
  { label: 'AI credits', icon: <Zap className="w-4 h-4" />, free: false, trip_pass: '30 per pass', explorer: '100 / month', nomad: '350 / month', nomadHighlight: true },
  { label: 'Transport confirmation parser', icon: <Sparkles className="w-4 h-4" />, free: false, trip_pass: true, explorer: true, nomad: true },
  // Group
  { label: 'Activity voting', icon: <Star className="w-4 h-4" />, free: 'View only', trip_pass: true, explorer: true, nomad: true },
  { label: 'Group chat & expense splitting', icon: <Users className="w-4 h-4" />, free: false, trip_pass: true, explorer: true, nomad: true },
  { label: 'Split-track itineraries', icon: <Map className="w-4 h-4" />, free: false, trip_pass: false, explorer: false, nomad: true, nomadHighlight: true },
  { label: 'Co-organizer role', icon: <Users className="w-4 h-4" />, free: false, trip_pass: false, explorer: false, nomad: true, nomadHighlight: true },
  // Stories & memories
  { label: 'Trip Story', icon: <Camera className="w-4 h-4" />, free: false, trip_pass: true, explorer: true, nomad: true },
  { label: 'Year in Review', icon: <CalendarDays className="w-4 h-4" />, free: false, trip_pass: false, explorer: false, nomad: true, nomadHighlight: true },
  { label: 'Photo gallery', icon: <Camera className="w-4 h-4" />, free: false, trip_pass: true, explorer: true, nomad: true },
  // Tools
  { label: 'Packing & prep checklists', icon: <CheckCircle className="w-4 h-4" />, free: false, trip_pass: true, explorer: true, nomad: true },
  { label: 'Wishlist & destination discovery', icon: <Globe className="w-4 h-4" />, free: false, trip_pass: false, explorer: true, nomad: true },
  { label: 'Flight price alerts', icon: <Bell className="w-4 h-4" />, free: false, trip_pass: false, explorer: 'Up to 3', nomad: 'As many as you need' },
  // Support
  { label: 'Early access to new features', icon: <Star className="w-4 h-4" />, free: false, trip_pass: false, explorer: false, nomad: true, nomadHighlight: true },
  { label: 'Support', icon: <Shield className="w-4 h-4" />, free: 'Community', trip_pass: 'Email', explorer: 'Email', nomad: 'Priority' },
];

// ─── FAQ ─────────────────────────────────────────────────────────────────────

const faqs = [
  {
    q: 'What exactly is a Trip Pass?',
    a: "A Trip Pass is a one-time $30 purchase tied to a single trip. It unlocks all AI features, group tools, and Trip Story for that trip for up to 6 travelers. It's perfect if you travel once or twice a year and don't want a monthly subscription. The pass is active for your trip duration plus 30 days after.",
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
    a: "Your credits refresh on your next billing date. You'll see a heads-up before you're close so it's never a surprise. If you need more immediately, upgrading to Nomad gives you 350 credits — enough for even the most enthusiastic planner.",
  },
  {
    q: 'Can I switch plans?',
    a: "Yes, anytime. Upgrades take effect immediately. If you downgrade, your current plan stays active until the end of your billing period.",
  },
  {
    q: 'Do you offer annual billing?',
    a: "Yes — pay annually and save ~20%. Explorer drops to $6.42/mo ($76.99/year) and Nomad to $10.42/mo ($124.99/year). No subscription renews without a reminder.",
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

export default function PricingPage() {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');

  const explorerPrice = billing === 'annual' ? (PRICING.explorer.annual / 12).toFixed(2) : PRICING.explorer.monthly.toFixed(2);
  const nomadPrice = billing === 'annual' ? (PRICING.nomad.annual / 12).toFixed(2) : PRICING.nomad.monthly.toFixed(2);
  const explorerBilled = billing === 'annual' ? `$${PRICING.explorer.annual}/year` : null;
  const nomadBilled = billing === 'annual' ? `$${PRICING.nomad.annual}/year` : null;

  return (
    <div className="min-h-screen bg-white">

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg border-b border-zinc-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-zinc-500 hover:text-zinc-800 transition-colors text-sm font-medium">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-800 to-green-800 flex items-center justify-center">
              <Globe className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-zinc-900 tracking-tight">tripcoord</span>
          </div>
          <Link href="/auth/signup" className="px-4 py-2 bg-zinc-900 hover:bg-zinc-700 text-white text-sm font-semibold rounded-full transition-all">
            Get started free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-20 pb-10 px-4 text-center">
        <p className="text-sky-700 text-xs font-bold uppercase tracking-widest mb-4">Pricing</p>
        <h1 className="text-5xl sm:text-6xl font-bold text-zinc-900 mb-5 leading-tight tracking-tight">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 max-w-6xl mx-auto">

          {/* Free */}
          <div className="bg-white border border-zinc-200 rounded-3xl p-7 flex flex-col">
            <div className="mb-5">
              <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-1.5">Free</p>
              <p className="text-zinc-500 text-sm leading-snug">Try tripcoord. See what the fuss is about.</p>
            </div>
            <div className="mb-6">
              <span className="text-4xl font-bold text-zinc-900">$0</span>
              <span className="text-zinc-400 text-sm ml-1">/ month</span>
            </div>
            <Link href="/auth/signup" className="w-full text-center py-3 border border-zinc-200 hover:border-zinc-400 text-zinc-700 font-semibold rounded-full text-sm transition-all mb-7">
              Get started
            </Link>
            <ul className="space-y-3 flex-1">
              {[
                '1 active trip',
                'Up to 4 travelers',
                'Manual itinerary builder',
                'Join trips via invite link',
                'Activity voting (view only)',
                'Community support',
              ].map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-zinc-600">
                  <CheckCircle className="w-4 h-4 text-zinc-300 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
              <li className="flex items-start gap-2.5 text-sm text-zinc-400">
                <X className="w-4 h-4 text-zinc-200 flex-shrink-0 mt-0.5" />
                No AI features
              </li>
            </ul>
          </div>

          {/* Trip Pass */}
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-7 flex flex-col">
            <div className="mb-5">
              <p className="text-amber-700 text-xs font-bold uppercase tracking-widest mb-1.5">Trip Pass</p>
              <p className="text-amber-800 text-sm leading-snug">One trip, fully unlocked. No subscription needed.</p>
            </div>
            <div className="mb-1">
              <span className="text-4xl font-bold text-zinc-900">${PRICING.trip_pass.base}</span>
              <span className="text-zinc-500 text-sm ml-1">/ trip</span>
            </div>
            <p className="text-xs text-amber-700 font-medium mb-6">+$4/person beyond 6 · up to 12</p>
            <Link href="/auth/signup" className="w-full text-center py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-full text-sm transition-all mb-7 shadow-sm">
              Buy a Pass
            </Link>
            <ul className="space-y-3 flex-1">
              {[
                'Up to 6 travelers (+ add-ons)',
                '30 AI credits for this trip',
                'AI itinerary generation',
                'Transport confirmation parser',
                'Trip Story (shareable)',
                'Group chat & expense splitting',
                'Packing & prep checklists',
                'Photo gallery',
                'Email support',
              ].map(f => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-amber-900">
                  <CheckCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Explorer — Most Popular */}
          <div className="bg-sky-900 border border-sky-800 rounded-3xl p-7 flex flex-col relative shadow-xl shadow-sky-900/20">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-sky-500 to-green-500 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full shadow-md">
              Most Popular
            </div>
            <div className="mb-5 mt-2">
              <p className="text-sky-300 text-xs font-bold uppercase tracking-widest mb-1.5">Explorer</p>
              <p className="text-sky-100/70 text-sm leading-snug">Your whole travel year, covered.</p>
            </div>
            <div className="mb-1">
              <span className="text-4xl font-bold text-white">${explorerPrice}</span>
              <span className="text-sky-300 text-sm ml-1">/ month</span>
            </div>
            {explorerBilled
              ? <p className="text-xs text-sky-300 font-medium mb-6">Billed {explorerBilled} · 2 months free</p>
              : <p className="text-xs text-sky-400 mb-6">Billed monthly · cancel anytime</p>
            }
            <Link href="/auth/signup" className="w-full text-center py-3 bg-white hover:bg-sky-50 text-sky-900 font-bold rounded-full text-sm transition-all mb-7 shadow-sm">
              Start free trial
            </Link>
            <ul className="space-y-3 flex-1">
              {[
                'Plan trips all year long',
                'Up to 8 travelers per trip',
                '100 AI credits / month',
                'AI itinerary generation',
                'Transport confirmation parser',
                'Trip Story for every trip',
                'Group chat & expense splitting',
                'Packing & prep checklists',
                'Wishlist & destination discovery',
                'Flight price alerts (up to 3)',
                'Photo gallery',
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
          <div className="bg-white border border-zinc-200 rounded-3xl p-7 flex flex-col relative">
            <div className="absolute top-6 right-6">
              <Crown className="w-5 h-5 text-amber-400" />
            </div>
            <div className="mb-5">
              <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest mb-1.5">Nomad</p>
              <p className="text-zinc-500 text-sm leading-snug">For the organizer everyone counts on.</p>
            </div>
            <div className="mb-1">
              <span className="text-4xl font-bold text-zinc-900">${nomadPrice}</span>
              <span className="text-zinc-400 text-sm ml-1">/ month</span>
            </div>
            {nomadBilled
              ? <p className="text-xs text-zinc-500 font-medium mb-6">Billed {nomadBilled} · 2 months free</p>
              : <p className="text-xs text-zinc-400 mb-6">Billed monthly · cancel anytime</p>
            }
            <Link href="/auth/signup" className="w-full text-center py-3 bg-zinc-900 hover:bg-zinc-700 text-white font-bold rounded-full text-sm transition-all mb-7 shadow-sm">
              Start free trial
            </Link>
            <ul className="space-y-3 flex-1">
              {[
                { text: 'Everything in Explorer', highlight: false },
                { text: 'Up to 15 travelers per trip', highlight: false },
                { text: '350 AI credits / month', highlight: true },
                { text: 'Split-track itineraries (Track A/B)', highlight: true },
                { text: 'Co-organizer role — share edit access', highlight: true },
                { text: 'Year in Review', highlight: true },
                { text: 'Flight alerts — as many as you need', highlight: false },
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
          <h2 className="text-3xl font-bold text-zinc-900 mb-4">Smart AI. Not a blank cheque.</h2>
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
        <h2 className="text-3xl font-bold text-zinc-900 text-center mb-12">Compare plans</h2>
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
        <h2 className="text-3xl font-bold text-zinc-900 text-center mb-10">Questions</h2>
        <div className="space-y-3">
          {faqs.map(faq => <FaqItem key={faq.q} q={faq.q} a={faq.a} />)}
        </div>
      </section>

      {/* CTA footer */}
      <section className="bg-gradient-to-br from-sky-900 via-zinc-900 to-green-900 py-20 px-4 text-center">
        <h2 className="text-4xl font-bold text-white mb-4">Ready to actually enjoy planning?</h2>
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
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-sky-800 flex items-center justify-center">
              <Globe className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-zinc-400 text-sm font-semibold">tripcoord</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-zinc-600">
            <Link href="#" className="hover:text-zinc-400 transition-colors">Privacy</Link>
            <Link href="#" className="hover:text-zinc-400 transition-colors">Terms</Link>
            <Link href="#" className="hover:text-zinc-400 transition-colors">Contact</Link>
          </div>
          <p className="text-zinc-600 text-xs">© 2026 tripcoord. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
