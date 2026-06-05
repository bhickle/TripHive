'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';

interface MarketingNavProps {
  /** When true, "How It Works" + "All In One Place" anchors scroll within the
      page; otherwise they link back to the homepage sections. */
  showAnchors?: boolean;
}

export function MarketingNav({ showAnchors = true }: MarketingNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  // One source of truth for the link targets so the desktop row and the mobile
  // sheet stay in sync. Anchors scroll in-page on the landing route, otherwise
  // they hop back to the homepage section.
  const links = [
    { label: 'All In One Place', href: showAnchors ? '#all-in-one' : '/#all-in-one' },
    // Section id on the landing page is "how" (not "how-it-works") — must match
    // or the link scrolls nowhere.
    { label: 'How It Works', href: showAnchors ? '#how' : '/#how' },
    { label: 'Pricing', href: '/pricing' },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-parchment/80 backdrop-blur-md border-b border-zinc-100">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center" onClick={() => setMenuOpen(false)}>
          <Image src="/tripcoord_logo.png" alt="tripcoord" width={140} height={44} priority className="h-9 w-auto" />
        </Link>

        {/* Center nav links — desktop */}
        <div className="hidden md:flex items-center gap-8">
          {links.map(l => (
            <Link
              key={l.label}
              href={l.href}
              className="text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          <Link href="/auth/login" className="hidden sm:inline-flex text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors">
            Log In
          </Link>
          <Link href="/auth/signup" className="px-4 py-2 bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold rounded-full transition-colors">
            Get Started
          </Link>
          {/* Mobile menu toggle — the center links are hidden below md, so
              without this the Pricing page was unreachable from the top nav. */}
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="md:hidden w-9 h-9 -mr-2 flex items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown sheet */}
      {menuOpen && (
        <div className="md:hidden border-t border-zinc-100 bg-parchment/95 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-6 py-3 flex flex-col">
            {links.map(l => (
              <Link
                key={l.label}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="py-2.5 text-sm font-medium text-zinc-700 hover:text-zinc-900 transition-colors"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/auth/login"
              onClick={() => setMenuOpen(false)}
              className="sm:hidden py-2.5 text-sm font-medium text-zinc-700 hover:text-zinc-900 transition-colors border-t border-zinc-100 mt-1 pt-3"
            >
              Log In
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
