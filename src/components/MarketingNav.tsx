'use client';

import Link from 'next/link';
import Image from 'next/image';

/**
 * Shared marketing header used on `/` and `/pricing`.
 *
 * Before this lived in two places: `/` had the full nav with anchor links,
 * `/pricing` had a stripped-down nav with just a Back arrow + Get Started.
 * Brandon's 2026-05-29 audit flagged the inconsistency — clicking Pricing
 * from the landing page dropped the user into a visually different shell.
 *
 * Anchor links use `/#id` so they navigate-and-scroll from `/pricing` and
 * just hash-scroll from `/`. The browser handles both natively; no JS
 * scroll callback needed.
 *
 * Branding: tripcoord wordmark left, anchor nav center (hidden on mobile),
 * Log In + Get Started right. Amber on the Get Started CTA is the
 * deliberate landing-hero exception in the brand palette (the rest of the
 * app uses sky-800 for primary actions).
 */
export function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-zinc-200">
      <nav className="max-w-7xl mx-auto px-5 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <Image src="/tripcoord_logo.png" alt="tripcoord" width={140} height={44} className="h-9 w-auto" priority />
        </Link>
        <div className="hidden md:flex items-center gap-7 text-sm font-semibold text-zinc-600">
          <Link href="/#all-in-one" className="hover:text-zinc-900 transition">
            All In One Place
          </Link>
          <Link href="/#how" className="hover:text-zinc-900 transition">
            How It Works
          </Link>
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
  );
}
