'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Globe, ArrowRight, Sparkles } from 'lucide-react';

interface Summary {
  userName: string;
  countryCount: number;
  cityCount: number;
  continentCount: number;
  daysAbroad: number;
}

interface ClientProps {
  userId: string;
  summary: Summary | null;
}

/**
 * Public-facing share landing. Shows the rendered card image, the
 * user's headline stats, and a signup CTA. No app shell — this page
 * is meant to look like a marketing card, not a logged-in surface,
 * because most viewers will be cold traffic from a social share.
 */
export default function ShareWorldClient({ userId, summary }: ClientProps) {
  const cardUrl = `/api/world/share-card/${userId}`;

  return (
    <div className="min-h-screen bg-parchment">
      {/* Marketing nav */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <Link href="/">
            <Image src="/tripcoord_logo.png" alt="tripcoord" width={140} height={44} className="h-9 w-auto" priority />
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/auth/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition">
              Log In
            </Link>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-1.5 bg-sky-800 hover:bg-sky-900 text-white font-semibold px-4 py-2 rounded-full text-sm transition-colors"
            >
              Get Started <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-700 mb-2 text-center">Travel Story</p>
        <h1 className="text-4xl sm:text-5xl font-script italic font-semibold text-zinc-900 text-center mb-3">
          {summary?.userName ? `${summary.userName}'s World` : 'My World'}
        </h1>
        {summary && summary.countryCount > 0 && (
          <p className="text-center text-zinc-500 text-sm sm:text-base mb-8">
            {summary.countryCount} {summary.countryCount === 1 ? 'country' : 'countries'} · {summary.cityCount} {summary.cityCount === 1 ? 'city' : 'cities'} · {summary.continentCount} {summary.continentCount === 1 ? 'continent' : 'continents'} · {summary.daysAbroad} travel days
          </p>
        )}

        {/* The share card image itself */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-zinc-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cardUrl}
            alt={summary ? `${summary.userName}'s travels on tripcoord` : 'A traveler on tripcoord'}
            width={1200}
            height={630}
            className="w-full h-auto"
          />
        </div>

        {/* CTA */}
        <div className="mt-10 bg-gradient-to-br from-sky-50 to-sky-100 border border-sky-100 rounded-2xl p-7 sm:p-9 text-center">
          <Globe className="w-10 h-10 text-sky-700 mx-auto mb-3" />
          <h2 className="font-script italic text-2xl sm:text-3xl font-semibold text-zinc-900 mb-2">
            Where to next?
          </h2>
          <p className="text-zinc-600 text-sm sm:text-base mb-5 max-w-md mx-auto">
            tripcoord turns a destination into a day-by-day itinerary your whole group can plan together. Start a trip in 60 seconds.
          </p>
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-1.5 bg-sky-800 hover:bg-sky-900 text-white font-semibold px-6 py-3 rounded-full text-sm sm:text-base transition-colors"
          >
            <Sparkles className="w-4 h-4" /> Plan your next trip <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <p className="text-center text-[11px] text-zinc-400 mt-10">
          Shared from tripcoord — AI-powered group trip planning · <Link href="/" className="underline">tripcoord.ai</Link>
        </p>
      </main>
    </div>
  );
}
