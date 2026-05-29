'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback } from 'react';
import { ArrowRight } from 'lucide-react';
import { PRICING } from '@/hooks/useEntitlements';

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
  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className="min-h-screen bg-parchment font-sans text-zinc-800 antialiased">
      {/* ─── Nav ─── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-zinc-200">
        <nav className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image src="/tripcoord_logo.png" alt="tripcoord" width={140} height={44} className="h-9 w-auto" priority />
          </Link>
          <div className="hidden md:flex items-center gap-7 text-sm font-semibold text-zinc-600">
            <button type="button" onClick={() => scrollTo('all-in-one')} className="hover:text-zinc-900 transition">
              Everything inside
            </button>
            <button type="button" onClick={() => scrollTo('how')} className="hover:text-zinc-900 transition">
              How It Works
            </button>
            <Link href="/pricing" className="hover:text-zinc-900 transition">
              Pricing
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/auth/login"
              className="text-sm font-semibold text-zinc-500 hover:text-zinc-800 px-3 py-2 rounded-lg hover:bg-zinc-100 transition"
            >
              Log In
            </Link>
            <Link
              href="/auth/signup"
              className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-sm hover:shadow-md transition"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      {/* ─── Hero ─── */}
      <section className="gradient-hero text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-1/4 w-96 h-96 rounded-full blur-3xl bg-white"></div>
        </div>
        <div className="relative max-w-4xl mx-auto px-5 py-24 sm:py-32 text-center">
          <div className="inline-block mb-6 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full border border-white/30">
            <p className="text-sm font-semibold">✦ group planning made easy — solo trips, too</p>
          </div>
          <h1 className="font-script italic text-5xl sm:text-6xl lg:text-7xl font-semibold leading-tight mb-6">
            Every trip you take, in one place
          </h1>
          <p className="text-xl sm:text-2xl text-blue-50 mb-10 max-w-3xl mx-auto leading-relaxed">
            Weekend escapes, long-haul adventures, layovers, cruises — all planned and organized from one
            home base. On your own, or with the whole crew. tripcoord gets you started in minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/auth/signup"
              className="bg-amber-500 hover:bg-amber-600 inline-flex items-center justify-center gap-2 px-8 py-4 text-white font-bold rounded-full text-lg shadow-lg hover:shadow-xl transition"
            >
              Start planning — free <ArrowRight className="w-5 h-5" />
            </Link>
            <button
              type="button"
              onClick={() => scrollTo('how')}
              className="inline-flex items-center justify-center px-8 py-4 border-2 border-white text-white font-bold rounded-full text-lg hover:bg-white/10 transition"
            >
              See How It Works
            </button>
          </div>
          <p className="text-blue-100 text-sm mt-8">No credit card to start • Solo or group</p>
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
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">All in one place</p>
            <h2 className="font-script italic text-4xl md:text-5xl font-semibold text-zinc-900 mb-4">
              Everything for the trip — start to finish.
            </h2>
            <p className="text-zinc-600 text-lg max-w-2xl mx-auto">
              One home base for the plan, the people, and the day-of. No more app-juggling.
            </p>
          </div>

          {/* Toolkit grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {[
              { emoji: '🗺️', title: 'Itinerary builder', sub: 'Day-by-day, multi-city' },
              { emoji: '✨', title: 'Discover', sub: 'Curated trips & ideas' },
              { emoji: '✅', title: 'Prep checklist', sub: "Don't-forget, sorted" },
              { emoji: '💸', title: 'Expense split', sub: 'Who owes who' },
              { emoji: '🧭', title: 'Day-of guide', sub: 'Where to be, when' },
              { emoji: '🛬', title: 'Layover planner', sub: 'Make the most of it' },
              { emoji: '🚢', title: 'Cruise mode', sub: 'Port-stop planning' },
              { emoji: '🌎', title: 'Travel map', sub: "Everywhere you've been" },
            ].map(({ emoji, title, sub }) => (
              <div key={title} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5 text-center">
                <div className="text-2xl mb-2">{emoji}</div>
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

          {/* Pillar 1: it goes the distance */}
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <span className="text-3xl">🧭</span>
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

          {/* Pillar 2: solo or group */}
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="order-2 md:order-1 bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 text-sm text-zinc-500">
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
            <div className="order-1 md:order-2">
              <span className="text-3xl">👥</span>
              <h3 className="font-script italic text-3xl font-semibold text-zinc-900 mt-2 mb-3">
                Solo today, the whole crew tomorrow.
              </h3>
              <p className="text-zinc-600 leading-relaxed">
                Plan a solo weekend in peace — or invite your people on one link and let them vote on activities,
                chat, and split the costs with you. For the friend who always ends up planning the group trip,
                the herding finally has a home.
              </p>
            </div>
          </div>

          {/* Pillar 3: split tracks */}
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <span className="text-3xl">🔀</span>
              <h3 className="font-script italic text-3xl font-semibold text-zinc-900 mt-2 mb-3">
                Split up without falling apart.
              </h3>
              <p className="text-zinc-600 leading-relaxed">
                The foodies want the market. The hikers want the trail. With <strong>split tracks</strong>,
                tripcoord runs two plans for the same day — then brings everyone back together for dinner,
                with the meetup time and spot already set. Nobody misses out, nobody fights about it.
              </p>
            </div>
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
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
          </div>

          {/* Pillar 4: first draft */}
          <div className="text-center max-w-2xl mx-auto pt-4">
            <span className="text-3xl">✦</span>
            <h3 className="font-script italic text-3xl font-semibold text-zinc-900 mt-2 mb-3">
              A first draft in minutes. You make it yours.
            </h3>
            <p className="text-zinc-600 leading-relaxed">
              tripcoord builds the first draft with real activity ideas, food spots, photo spots, and timing —
              multi-city trips included. A starting point you shape, not a wall of text you have to untangle.
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
                A Trip Pass unlocks these for everyone on one trip. Explorer &amp; Nomad keep them on for you all year.
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
              Always planning the next one? Explorer and Nomad keep every tool unlocked, all year.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
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

            {/* Explorer (Best value) */}
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 flex flex-col relative">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wide bg-emerald-600 text-white px-3 py-1 rounded-full whitespace-nowrap">
                Best value
              </span>
              <p className="font-bold text-zinc-900 text-lg">Explorer</p>
              <p className="text-sm text-zinc-500 mt-1 mb-1">For regular travelers.</p>
              <p className="text-xs text-emerald-700 font-semibold mb-4">${PRICING.explorer.monthly} / month</p>
              <p className="text-sm text-zinc-600 leading-relaxed flex-1">
                More trips, longer trips, split tracks, and a co-organizer — for people who take a few getaways a year and love planning them.
              </p>
              <Link
                href="/pricing"
                className="mt-5 text-center bg-white border border-amber-400 text-amber-700 hover:bg-amber-50 font-semibold py-2.5 rounded-full text-sm transition"
              >
                Go Explorer
              </Link>
            </div>

            {/* Nomad */}
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 flex flex-col">
              <p className="font-bold text-zinc-900 text-lg">Nomad</p>
              <p className="text-sm text-zinc-500 mt-1 mb-1">For the always-planning.</p>
              <p className="text-xs text-zinc-700 font-semibold mb-4">${PRICING.nomad.monthly} / month</p>
              <p className="text-sm text-zinc-600 leading-relaxed flex-1">
                The most trips, the longest itineraries, the biggest groups, and every tool tripcoord makes.
                For people who are always plotting the next one.
              </p>
              <Link
                href="/pricing"
                className="mt-5 text-center bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-800 font-semibold py-2.5 rounded-full text-sm transition"
              >
                Go Nomad
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
                a: 'Yes, to start. Plan a trip and invite your group on the free plan. A Trip Pass covers one big trip; Explorer and Nomad are subscriptions for people who travel more often.',
              },
              {
                q: 'Trip Pass or a subscription — which do I want?',
                a: 'Taking one big trip this year? A Trip Pass is perfect — pay once, whole group included. Planning several trips a year? Explorer or Nomad keep everything unlocked all year and work out cheaper per trip.',
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
            Your next trip is waiting.
            <br />
            Let&apos;s get it organized.
          </h2>
          <Link
            href="/auth/signup"
            className="bg-amber-500 hover:bg-amber-600 inline-flex items-center justify-center gap-2 text-white font-bold px-8 py-4 rounded-full mt-3 shadow-lg hover:shadow-xl transition"
          >
            Start planning — free <ArrowRight className="w-5 h-5" />
          </Link>
          <p className="text-blue-100 text-sm mt-4">No credit card to start • Solo or group</p>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="bg-zinc-900 text-zinc-400">
        <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-script italic text-2xl font-semibold text-white">tripcoord</span>
            <span className="text-zinc-500 text-sm ml-1">· group travel made easy — solo trips, too</span>
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
