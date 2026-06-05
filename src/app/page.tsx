'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Map, Sparkles, CheckCircle2, DollarSign, Compass, Plane, Ship, Globe2, Users, Shuffle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PRICING } from '@/hooks/useEntitlements';
import { MarketingNav } from '@/components/MarketingNav';

/**
 * Marketing landing page.
 *
 * Ported from /mockups/landing-page.html (the approved design) on 2026-05-29.
 * Detailed plan comparison lives on /pricing — this page's pricing strip is
 * intentionally minimal (4 short-blurb cards funneling to /pricing). All
 * sign-up CTAs route to /auth/signup; Stripe checkout fires from /pricing
 * after auth.
 */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-parchment font-sans text-zinc-800 antialiased">
      {/* ─── Nav ─── */}
      <MarketingNav />
      {/* The MarketingNav component below is shared with /pricing so the
          marketing header reads identically on both pages. Anchor links use
          /#id form so they work from /pricing (navigate-then-scroll) AND
          from / (browser handles same-page hash). */}

      {/* ─── Hero ─── */}
      <section className="gradient-hero text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-1/4 w-96 h-96 rounded-full blur-3xl bg-white"></div>
        </div>
        <div className="relative max-w-4xl mx-auto px-5 py-24 sm:py-32 text-center">
          <div className="inline-block mb-6 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full border border-white/30">
            <p className="text-sm font-semibold">✦ Your trips&apos; command center</p>
          </div>
          <h1 className="font-script italic text-5xl sm:text-6xl lg:text-7xl font-semibold leading-tight mb-6">
            Every great trip starts somewhere. Start it here.
          </h1>
          <p className="text-xl sm:text-2xl text-sky-50 mb-10 max-w-3xl mx-auto leading-relaxed">
            tripcoord turns a spark of an idea into a real, day-by-day trip — the plan, the people, and the
            day-of. Build it solo or bring the crew to pull it off together.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth/signup"
              className="bg-amber-500 hover:bg-amber-600 inline-flex items-center justify-center gap-2 px-8 py-4 text-white font-bold rounded-full text-lg shadow-lg hover:shadow-xl transition"
            >
              Start planning — free <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="#how"
              className="inline-flex items-center justify-center px-8 py-4 border-2 border-white text-white font-bold rounded-full text-lg hover:bg-white/10 transition"
            >
              See How It Works
            </Link>
          </div>
          <p className="text-sky-100 text-sm mt-8">No credit card to start • Solo or group</p>
        </div>
      </section>

      {/* ─── Problem ─── */}
      <section className="bg-parchment">
        <div className="max-w-3xl mx-auto px-5 py-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">The problem</p>
          <h2 className="font-script italic text-4xl md:text-5xl font-semibold text-zinc-900 mb-5 leading-tight">
            Your trip lives in twelve tabs, a few apps, and a group chat.
          </h2>
          <p className="text-zinc-600 text-lg leading-relaxed mb-4">
            The itinerary&apos;s in a doc. Confirmations buried in your inbox. The who-owes-who in a spreadsheet.
            And the big decisions? Lost in a group chat at message #243. Whether you&apos;re planning solo or for
            ten, it&apos;s the same scattered mess every single time.
          </p>
          <p className="text-xl font-bold text-zinc-900">
            What if the whole trip just lived in one place?
          </p>
        </div>
      </section>

      {/* ─── All in one place ─── */}
      <section id="all-in-one" className="bg-white">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">All In One Place</p>
            <h2 className="font-script italic text-4xl md:text-5xl font-semibold text-zinc-900 mb-4">
              Everything for the trip — start to finish.
            </h2>
            <p className="text-zinc-600 text-lg max-w-2xl mx-auto">
              One home base for the plan, the people, and the day-of. No more app-juggling.
            </p>
          </div>

          {/* Toolkit grid — Lucide icons (was emojis until 2026-05-29). Chrome
              consistency: marketing page now uses the same icon library as
              the in-app surfaces (dashboard, sidebar, itinerary, etc.). */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {([
              // Group-OS features lead (reinforces new positioning), classic
              // planning tools second, supporting features last. Cruise mode
              // tile demoted 2026-05-29 (the upload-detect-cruise code stays,
              // but the marketing claim was overselling what shipped).
              { Icon: Users,        title: 'Group voting',      sub: 'Yay/nay activities together' },
              { Icon: DollarSign,   title: 'Expense split',     sub: 'Who owes who' },
              { Icon: Compass,      title: 'Day-of guide',      sub: 'Where to be, when' },
              { Icon: Map,          title: 'Itinerary builder', sub: 'Day-by-day, multi-city' },
              { Icon: CheckCircle2, title: 'Prep checklist',    sub: "Don't-forget, sorted" },
              { Icon: Sparkles,     title: 'Discover',          sub: 'Curated trips & ideas' },
              { Icon: Plane,        title: 'Layover planner',   sub: 'Make the most of it' },
              { Icon: Globe2,       title: 'Travel map',        sub: "Everywhere you've been" },
            ] as { Icon: LucideIcon; title: string; sub: string }[]).map(({ Icon, title, sub }) => (
              <div key={title} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 text-center">
                <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-sky-50 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-sky-800" />
                </div>
                <p className="font-bold text-sm text-zinc-800">{title}</p>
                <p className="text-xs text-zinc-500 mt-1">{sub}</p>
              </div>
            ))}
          </div>

          {/* Trip types */}
          <div className="text-center">
            <p className="text-sm font-semibold text-zinc-500 mb-4">Built for every kind of trip:</p>
            <div className="flex flex-wrap justify-center gap-2.5">
              {[
                '🏖️ Weekend escapes',
                '✈️ Long-haul adventures',
                '🛬 Layovers',
                '🚢 Cruises',
                '🏙️ Multi-city',
                '👥 Group getaways',
              ].map(label => (
                <span
                  key={label}
                  className="px-4 py-2 rounded-full bg-parchment border border-zinc-200 text-sm font-medium text-zinc-700"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section id="how" className="bg-parchment">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">How it works</p>
            <h2 className="font-script italic text-4xl md:text-5xl font-semibold text-zinc-900">
              From idea to itinerary in minutes.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                n: 1,
                title: 'Describe the trip.',
                body: 'Where, when, what you’re into. tripcoord drafts a full day-by-day itinerary in minutes — any length, any number of cities.',
              },
              {
                n: 2,
                title: 'Make it yours.',
                body: 'Edit, reorder, regenerate, add your own stops and prep tasks. Going with people? Invite them on one link to vote and chip in.',
              },
              {
                n: 3,
                title: 'Go.',
                body: 'Everything’s in your pocket — the plan, the day-of guide, the splits. And it all gets saved to your travel map when you’re home.',
              },
            ].map(({ n, title, body }) => (
              <div key={n} className="bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition p-7">
                <div className="w-10 h-10 rounded-full bg-amber-500 text-white font-bold flex items-center justify-center mb-4">{n}</div>
                <h3 className="font-script italic text-xl font-semibold text-zinc-900 mb-2">{title}</h3>
                <p className="text-zinc-600 text-sm leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features (4 pillars) ─── */}
      <section id="features" className="bg-white">
        <div className="max-w-5xl mx-auto px-5 py-20 space-y-16">

          {/* Pillar 1 (NEW LEAD 2026-05-29): group coordination.
              Was the day-of pillar; group moves up to reinforce the
              "group trip's planning OS" hero. Image on RIGHT (default
              grid order, no flip classes). */}
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <Users className="w-8 h-8 text-sky-800" />
              <h3 className="font-script italic text-3xl font-semibold text-zinc-900 mt-2 mb-3">
                The whole crew, on one link.
              </h3>
              <p className="text-zinc-600 leading-relaxed">
                Invite everyone on one link — they vote on activities, chat, and split costs with you.
                For the friend who always ends up planning the group trip, the herding finally has a home.
                Going solo? Same toolkit, just fewer voices.
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 text-sm text-zinc-500">
              <div className="flex -space-x-2 mb-4">
                <div className="w-9 h-9 rounded-full bg-sky-200 border-2 border-white flex items-center justify-center text-sky-800 font-bold text-xs">SA</div>
                <div className="w-9 h-9 rounded-full bg-emerald-200 border-2 border-white flex items-center justify-center text-emerald-800 font-bold text-xs">JD</div>
                <div className="w-9 h-9 rounded-full bg-amber-200 border-2 border-white flex items-center justify-center text-amber-800 font-bold text-xs">MK</div>
                <div className="w-9 h-9 rounded-full bg-zinc-200 border-2 border-white flex items-center justify-center text-zinc-700 font-bold text-xs">+3</div>
              </div>
              <div className="bg-amber-50 rounded-xl px-3 py-2 mb-2 flex justify-between">
                <span className="text-zinc-700 font-medium">🍷 Winery tour</span>
                <span className="font-bold text-emerald-700">5 👍</span>
              </div>
              <div className="bg-zinc-50 rounded-xl px-3 py-2 flex justify-between">
                <span className="text-zinc-700 font-medium">🧗 Via ferrata</span>
                <span className="font-bold text-zinc-500">3 👍</span>
              </div>
              <div className="mt-3 bg-emerald-50 rounded-xl px-3 py-2 flex justify-between">
                <span className="font-semibold text-emerald-800">Dinner, split 5 ways</span>
                <span className="font-bold text-emerald-700">€18 ea</span>
              </div>
            </div>
          </div>

          {/* Pillar 2: split tracks. The differentiating mechanic; image
              on LEFT (use order classes to flip for visual rhythm vs P1). */}
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="order-2 md:order-1 bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-sky-50 rounded-xl p-3">
                  <p className="font-bold text-sky-800 mb-2">Track A · Foodies</p>
                  <p className="text-zinc-600">🥘 Market crawl</p>
                  <p className="text-zinc-600">☕ Coffee roastery</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3">
                  <p className="font-bold text-amber-800 mb-2">Track B · Hikers</p>
                  <p className="text-zinc-600">⛰️ Ridge trail</p>
                  <p className="text-zinc-600">🏞️ Waterfall</p>
                </div>
              </div>
              <div className="text-center mt-3 text-xs font-semibold text-zinc-500">
                ↓ meet for dinner · 7:30 · Casa Nova
              </div>
            </div>
            <div className="order-1 md:order-2">
              <Shuffle className="w-8 h-8 text-sky-800" />
              <h3 className="font-script italic text-3xl font-semibold text-zinc-900 mt-2 mb-3">
                Split up without falling apart.
              </h3>
              <p className="text-zinc-600 leading-relaxed">
                The foodies want the market. The hikers want the trail. With split tracks,
                tripcoord runs two plans for the same day — then brings everyone back together for dinner,
                with the meetup time and spot already set. Nobody misses out, nobody fights about it.
              </p>
            </div>
          </div>

          {/* Pillar 3: Day-Of. Was the lead pillar; moves down so the
              hero's group-OS framing reads first. Image on RIGHT
              (default order again). */}
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <Compass className="w-8 h-8 text-sky-800" />
              <h3 className="font-script italic text-3xl font-semibold text-zinc-900 mt-2 mb-3">
                It doesn&apos;t stop at the itinerary.
              </h3>
              <p className="text-zinc-600 leading-relaxed">
                A chatbot hands you a plan and walks away. tripcoord goes the distance — a &ldquo;don&apos;t forget&rdquo; prep checklist,
                a day-of guide that tells everyone where to be and when, and a travel map that fills in as you go.
                Your trips live here, not in a tab you&apos;ll lose by Tuesday.
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 text-sm text-zinc-600">
              <p className="font-bold text-zinc-800 mb-3">✅ Before you go</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2"><span className="text-emerald-600 font-bold">✓</span> Passport &amp; visa check</div>
                <div className="flex items-center gap-2"><span className="text-emerald-600 font-bold">✓</span> Confirm hotel check-ins</div>
                <div className="flex items-center gap-2 text-zinc-400"><span>○</span> Download offline maps</div>
                <div className="flex items-center gap-2 text-zinc-400"><span>○</span> Share itinerary with home</div>
              </div>
              <p className="text-xs text-zinc-400 mt-3">+ day-of guide · travel map</p>
            </div>
          </div>

          {/* Pillar 4: first draft */}
          <div className="text-center max-w-2xl mx-auto pt-4">
            <Sparkles className="w-8 h-8 text-sky-800 mx-auto" />
            <h3 className="font-script italic text-3xl font-semibold text-zinc-900 mt-2 mb-3">
              A starting point, not a finish line.
            </h3>
            <p className="text-zinc-600 leading-relaxed">
              tripcoord drafts the trip — real stops, food, photo spots, timing — and you shape it into yours.
              Multi-city trips included. A starting point you build on, not a wall of text you have to untangle.
            </p>
          </div>

        </div>
      </section>

      {/* ─── Pricing (both/and) ─── */}
      <section id="pricing" className="bg-parchment">
        <div className="max-w-6xl mx-auto px-5 py-20">

          {/* What's free vs. what's paid */}
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">What&apos;s free, what&apos;s paid</p>
            <h2 className="font-script italic text-4xl md:text-5xl font-semibold text-zinc-900">
              Start free. Upgrade when it&apos;s worth it.
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto mb-16">
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-7">
              <p className="font-bold text-zinc-900 mb-1">Free — for your whole group</p>
              <p className="text-xs text-zinc-500 mb-4">No one you invite ever has to pay.</p>
              <ul className="space-y-2.5 text-sm text-zinc-700">
                {[
                  'Build an itinerary with tripcoord',
                  'Invite everyone on one link',
                  'Vote on activities & group chat',
                  'Browse Discover & save a wishlist',
                  'Your travel map',
                ].map(f => (
                  <li key={f} className="flex gap-2">
                    <span className="text-emerald-600 font-bold">✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-7">
              <p className="font-bold text-zinc-900 mb-1">Paid — Trip Pass or subscription</p>
              <p className="text-xs text-zinc-500 mb-4">
                A Trip Pass unlocks these for everyone on one trip. Travel Pro keeps them on for you all year.
              </p>
              <ul className="space-y-2.5 text-sm text-zinc-700">
                {[
                  'Split expenses as a group',
                  'Split-track days — split up, regroup',
                  'Add a co-organizer',
                  'More AI builds, longer trips, bigger groups',
                ].map(f => (
                  <li key={f} className="flex gap-2">
                    <span className="text-amber-500 font-bold">★</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Plans */}
          <div className="text-center mb-12">
            <h3 className="font-script italic text-3xl md:text-4xl font-semibold text-zinc-900 mb-3">
              However you travel, there&apos;s a fit.
            </h3>
            <p className="text-zinc-600 text-lg max-w-2xl mx-auto">
              One big trip this year? Grab a Trip Pass — pay once, your whole group included.
              Always planning the next one? Travel Pro keeps every tool unlocked, all year.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start max-w-4xl mx-auto">
            {/* Free */}
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 flex flex-col">
              <p className="font-bold text-zinc-900 text-lg">Free</p>
              <p className="text-sm text-zinc-500 mt-1 mb-4">Dip a toe in.</p>
              <p className="text-sm text-zinc-600 leading-relaxed flex-1">
                Plan a trip, build an itinerary, and invite your group to collaborate. See how it feels.
              </p>
              <Link
                href="/auth/signup"
                className="mt-5 text-center bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-800 font-semibold py-2.5 rounded-full text-sm transition"
              >
                Start free
              </Link>
            </div>

            {/* Trip Pass (highlighted · Most popular) */}
            <div className="bg-white rounded-2xl border-2 border-amber-400 shadow-md p-6 flex flex-col relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wide bg-amber-500 text-white px-3 py-1 rounded-full whitespace-nowrap">
                Most popular
              </span>
              <p className="font-bold text-zinc-900 text-lg">Trip Pass</p>
              <p className="text-sm text-zinc-500 mt-1 mb-1">For the one big trip.</p>
              <p className="text-xs text-amber-700 font-semibold mb-4">${PRICING.trip_pass.base} · pay once</p>
              <p className="text-sm text-zinc-600 leading-relaxed flex-1">
                Pay once for a single trip — your whole crew included. The full toolkit, no subscription needed.
              </p>
              <Link
                href="/pricing"
                className="mt-5 text-center bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-full text-sm transition"
              >
                Get a pass
              </Link>
            </div>

            {/* Travel Pro (Best value) */}
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 flex flex-col relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wide bg-emerald-600 text-white px-3 py-1 rounded-full whitespace-nowrap">
                Best value
              </span>
              <p className="font-bold text-zinc-900 text-lg">Travel Pro</p>
              <p className="text-sm text-zinc-500 mt-1 mb-1">For the always-planning.</p>
              <p className="text-xs text-emerald-700 font-semibold mb-4">${PRICING.travel_pro.monthly} / month</p>
              <p className="text-sm text-zinc-600 leading-relaxed flex-1">
                Every tool tripcoord makes — the most AI builds, longer trips, bigger groups, split tracks, and a co-organizer.
                For people who are always plotting the next one.
              </p>
              <Link
                href="/pricing"
                className="mt-5 text-center bg-white border border-amber-400 text-amber-700 hover:bg-amber-50 font-semibold py-2.5 rounded-full text-sm transition"
              >
                Go Travel Pro
              </Link>
            </div>
          </div>
          <p className="text-center text-sm text-zinc-500 mt-8">
            Not sure?{' '}
            <Link href="/pricing" className="text-amber-700 font-semibold hover:underline">
              Compare all plans →
            </Link>
          </p>
        </div>
      </section>

      {/* ─── Objection handler ─── */}
      <section className="bg-white">
        <div className="max-w-3xl mx-auto px-5 py-20 text-center">
          <h2 className="font-script italic text-3xl md:text-4xl font-semibold text-zinc-900 mb-4">
            &ldquo;Can&apos;t I just ask a chatbot?&rdquo;
          </h2>
          <p className="text-zinc-600 text-lg leading-relaxed">
            A chatbot gives you a one-off itinerary in a window you&apos;ll lose by Tuesday. tripcoord is where
            your trips actually live — planned, coordinated, split, and saved. From a weekend away
            to a month abroad, on your own or with everyone.{' '}
            <span className="font-bold text-zinc-900">It&apos;s the part that happens after the itinerary.</span>
          </p>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="bg-parchment">
        <div className="max-w-3xl mx-auto px-5 py-16">
          <h2 className="font-script italic text-4xl font-semibold text-center text-zinc-900 mb-10">
            Good questions.
          </h2>
          <div className="space-y-3">
            {[
              {
                q: 'Is it just for groups?',
                a: 'Not at all. tripcoord works great solo — itineraries, prep, layovers, and your travel map are all yours alone. The group tools are right there for when you want them.',
              },
              {
                q: 'Is it free?',
                a: 'Yes, to start. Plan a trip and invite your group on the free plan. A Trip Pass covers one big trip; Travel Pro is a subscription for people who travel more often.',
              },
              {
                q: 'Trip Pass or a subscription — which do I want?',
                a: 'Taking one big trip this year? A Trip Pass is perfect — pay once, whole group included. Planning several trips a year? Travel Pro keeps everything unlocked all year and works out cheaper per trip.',
              },
              {
                q: 'Do my friends need to pay?',
                a: 'No. Everyone you invite can vote on activities and chat free — on any trip. To split expenses and run split-track days as a group, the trip just needs a Trip Pass: one purchase opens those tools to your whole crew, and no one else pays a thing.',
              },
              {
                q: 'What if I already booked something?',
                a: 'Drop in your travel-agent PDF or confirmation email and tripcoord turns it into an editable trip you (and your group) can build on.',
              },
            ].map(({ q, a }) => (
              <details key={q} className="bg-white rounded-2xl border border-zinc-100 p-5 group">
                <summary className="font-semibold cursor-pointer flex justify-between items-center text-zinc-800">
                  {q}
                  <span className="text-amber-600 group-open:rotate-45 transition text-lg">+</span>
                </summary>
                <p className="text-zinc-600 text-sm mt-3 leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="gradient-hero relative overflow-hidden">
        <div className="relative max-w-3xl mx-auto px-5 py-20 text-center text-white">
          <h2 className="font-script italic text-4xl md:text-5xl font-semibold mb-4 leading-tight">
            Every great trip starts somewhere.
            <br />
            Start yours here.
          </h2>
          <Link
            href="/auth/signup"
            className="bg-amber-500 hover:bg-amber-600 inline-flex items-center justify-center gap-2 text-white font-bold px-8 py-4 rounded-full mt-3 shadow-lg hover:shadow-xl transition"
          >
            Start planning — free <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="text-sky-100 text-sm mt-4">No credit card to start • Solo or group</p>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="bg-zinc-900 text-zinc-400">
        <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-script italic text-2xl font-semibold text-white">tripcoord</span>
            <span className="text-zinc-500 text-sm ml-1">· From solo to group trips, made easy</span>
          </div>
          <div className="flex gap-6 text-sm">
            <Link href="/pricing" className="hover:text-white transition">Pricing</Link>
            <Link href="/discover" className="hover:text-white transition">Discover</Link>
            <Link href="/legal/privacy" className="hover:text-white transition">Privacy</Link>
            <Link href="/legal/terms" className="hover:text-white transition">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
