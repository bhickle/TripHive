'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Sidebar } from '@/components/Sidebar';
import { currentUser } from '@/data/mock';
import { discoverDestinations, DiscoverDestination, VibeTag } from '@/data/mock';
import {
  Search, Heart, Plane, Hotel, Ticket, Star, Flame,
  Globe2, ChevronRight, ArrowRight, Sparkles, Clock, DollarSign,
} from 'lucide-react';
import { useEntitlements } from '@/hooks/useEntitlements';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_VIBES: VibeTag[] = ['Adventure', 'Beach', 'City Break', 'Culture', 'Food', 'Nature', 'Romance', 'Wellness'];

const VIBE_EMOJI: Record<VibeTag, string> = {
  Adventure: '🧗',
  Beach: '🏖️',
  'City Break': '🏙️',
  Culture: '🏛️',
  Food: '🍜',
  Nature: '🌿',
  Romance: '🌅',
  Wellness: '🧘',
};

const CONTINENTS = ['All', 'Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America'];

// ─── Sub-components ───────────────────────────────────────────────────────────

function DestinationCard({
  dest,
  onWishlist,
  wishlisted,
}: {
  dest: DiscoverDestination;
  onWishlist: (id: string) => void;
  wishlisted: boolean;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="group bg-white rounded-2xl md:rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col border border-zinc-100"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image */}
      <div className="relative h-40 sm:h-52 overflow-hidden flex-shrink-0">
        <Image
          src={dest.image}
          alt={dest.name}
          fill
          className={`object-cover transition-transform duration-500 ${hovered ? 'scale-105' : 'scale-100'}`}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-2">
          {dest.trending && (
            <span className="flex items-center gap-1 bg-orange-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
              <Flame className="w-2.5 h-2.5" />
              Trending
            </span>
          )}
          {dest.editorPick && (
            <span className="flex items-center gap-1 bg-sky-900/80 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
              <Star className="w-2.5 h-2.5 fill-current" />
              Editor&apos;s Pick
            </span>
          )}
        </div>

        {/* Wishlist button */}
        <button
          onClick={() => onWishlist(dest.id)}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/40 transition-all"
        >
          <Heart className={`w-4 h-4 transition-colors ${wishlisted ? 'fill-rose-500 text-rose-500' : 'text-white'}`} />
        </button>

        {/* Destination name on image */}
        <div className="absolute bottom-3 left-3">
          <p className="text-white font-bold text-lg leading-tight drop-shadow-md">{dest.name}</p>
          <p className="text-white/80 text-xs drop-shadow-md">{dest.country}</p>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-5">
        <p className="text-zinc-600 text-sm leading-relaxed mb-4 flex-1">{dest.tagline}</p>

        {/* Vibes */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {dest.vibes.map(v => (
            <span key={v} className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
              {VIBE_EMOJI[v]} {v}
            </span>
          ))}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-zinc-400 mb-5">
          <span className="flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5" />
            ~${dest.avgCost.toLocaleString()}/wk
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {dest.flightHours}h flight
          </span>
        </div>

        {/* Affiliate CTAs */}
        <div className="grid grid-cols-3 gap-2">
          <a
            href={dest.affiliateLinks.flights}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="flex flex-col items-center gap-1 p-2.5 bg-sky-50 hover:bg-sky-100 rounded-xl transition-colors text-center"
          >
            <Plane className="w-4 h-4 text-sky-700" />
            <span className="text-[10px] font-bold text-sky-700">Flights</span>
          </a>
          <a
            href={dest.affiliateLinks.hotels}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="flex flex-col items-center gap-1 p-2.5 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors text-center"
          >
            <Hotel className="w-4 h-4 text-emerald-700" />
            <span className="text-[10px] font-bold text-emerald-700">Hotels</span>
          </a>
          <a
            href={dest.affiliateLinks.experiences}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="flex flex-col items-center gap-1 p-2.5 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors text-center"
          >
            <Ticket className="w-4 h-4 text-amber-700" />
            <span className="text-[10px] font-bold text-amber-700">Things to do</span>
          </a>
        </div>

        {/* Plan this trip */}
        <Link
          href={`/trip/new?destination=${encodeURIComponent(dest.name + ', ' + dest.country)}`}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-900 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Plan this trip
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

function FeaturedCard({ dest, onWishlist, wishlisted }: {
  dest: DiscoverDestination;
  onWishlist: (id: string) => void;
  wishlisted: boolean;
}) {
  return (
    <div className="relative rounded-2xl md:rounded-3xl overflow-hidden h-60 md:h-80 group flex-shrink-0 w-full">
      <Image
        src={dest.image}
        alt={dest.name}
        fill
        className="object-cover transition-transform duration-700 group-hover:scale-105"
        sizes="(max-width: 768px) 100vw, 50vw"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

      {/* Top badges */}
      <div className="absolute top-4 left-4 flex gap-2">
        <span className="bg-sky-900/80 backdrop-blur-sm text-white text-[10px] font-bold px-3 py-1.5 rounded-full flex items-center gap-1">
          <Star className="w-3 h-3 fill-current" /> Editor&apos;s Pick
        </span>
      </div>

      <button
        onClick={() => onWishlist(dest.id)}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/40 transition-all"
      >
        <Heart className={`w-4 h-4 transition-colors ${wishlisted ? 'fill-rose-500 text-rose-500' : 'text-white'}`} />
      </button>

      {/* Bottom content */}
      <div className="absolute bottom-0 left-0 right-0 p-6">
        <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">{dest.country}</p>
        <h3 className="text-white font-bold text-2xl mb-2">{dest.name}</h3>
        <p className="text-white/70 text-sm leading-snug mb-4 max-w-sm">{dest.description}</p>
        <div className="flex items-center gap-3">
          <a
            href={dest.affiliateLinks.flights}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="flex items-center gap-1.5 bg-white text-zinc-900 font-bold text-xs px-4 py-2.5 rounded-full hover:bg-zinc-100 transition-all"
          >
            <Plane className="w-3.5 h-3.5" /> Search flights
          </a>
          <a
            href={dest.affiliateLinks.hotels}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm text-white font-semibold text-xs px-4 py-2.5 rounded-full hover:bg-white/25 transition-all"
          >
            <Hotel className="w-3.5 h-3.5" /> Find hotels
          </a>
          <Link
            href={`/trip/new?destination=${encodeURIComponent(dest.name + ', ' + dest.country)}`}
            className="ml-auto flex items-center gap-1.5 text-white/60 hover:text-white text-xs font-semibold transition-colors"
          >
            Plan it <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const { hasWishlist } = useEntitlements();
  const [query, setQuery] = useState('');
  const [activeVibes, setActiveVibes] = useState<VibeTag[]>([]);
  const [activeContinent, setActiveContinent] = useState('All');
  const [wishlistedIds, setWishlistedIds] = useState<Set<string>>(new Set());
  const [showWishlistToast, setShowWishlistToast] = useState(false);

  const toggleVibe = (v: VibeTag) => {
    setActiveVibes(prev =>
      prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
    );
  };

  const handleWishlist = (id: string) => {
    if (!hasWishlist) return; // silently no-op if not unlocked
    setWishlistedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setShowWishlistToast(true);
    setTimeout(() => setShowWishlistToast(false), 2000);
  };

  const filtered = useMemo(() => {
    return discoverDestinations.filter(d => {
      const matchQuery = !query || d.name.toLowerCase().includes(query.toLowerCase()) || d.country.toLowerCase().includes(query.toLowerCase());
      const matchVibe = activeVibes.length === 0 || activeVibes.some(v => d.vibes.includes(v));
      const matchContinent = activeContinent === 'All' || d.continent === activeContinent;
      return matchQuery && matchVibe && matchContinent;
    });
  }, [query, activeVibes, activeContinent]);

  const editorPicks = discoverDestinations.filter(d => d.editorPick);
  const trending = discoverDestinations.filter(d => d.trending);

  return (
    <div className="flex h-screen bg-parchment">
      <Sidebar activePage="discover" user={currentUser} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

          {/* Page Header */}
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-700 mb-3">Discover</p>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h1 className="text-4xl font-display font-bold text-zinc-900">Where to next?</h1>
                <p className="text-sm text-zinc-400 mt-1">Hand-picked destinations with flights, hotels &amp; experiences — one click away.</p>
              </div>
              <div className="relative w-full sm:w-72 flex-shrink-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search destinations…"
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300 shadow-sm"
                />
              </div>
            </div>
          </div>

          <div className="space-y-12">

          {/* Filters */}
          <div className="space-y-3">
            {/* Vibe pills */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mr-1">Vibe</span>
              {ALL_VIBES.map(v => (
                <button
                  key={v}
                  onClick={() => toggleVibe(v)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    activeVibes.includes(v)
                      ? 'bg-sky-900 text-white shadow-sm'
                      : 'bg-white text-zinc-500 hover:text-zinc-800 border border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  {VIBE_EMOJI[v]} {v}
                </button>
              ))}
              {activeVibes.length > 0 && (
                <button onClick={() => setActiveVibes([])} className="text-xs text-zinc-400 hover:text-zinc-600 underline ml-1">
                  Clear
                </button>
              )}
            </div>

            {/* Continent pills */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mr-1">Region</span>
              {CONTINENTS.map(c => (
                <button
                  key={c}
                  onClick={() => setActiveContinent(c)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    activeContinent === c
                      ? 'bg-zinc-900 text-white'
                      : 'bg-white text-zinc-500 hover:text-zinc-800 border border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Editor's Picks — only shown when no active filter */}
          {activeVibes.length === 0 && activeContinent === 'All' && !query && (
            <section>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                    Editor&apos;s Picks
                  </h2>
                  <p className="text-sm text-zinc-400 mt-0.5">Our favorites right now</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {editorPicks.slice(0, 2).map(dest => (
                  <FeaturedCard
                    key={dest.id}
                    dest={dest}
                    onWishlist={handleWishlist}
                    wishlisted={wishlistedIds.has(dest.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Trending — only shown when no active filter */}
          {activeVibes.length === 0 && activeContinent === 'All' && !query && (
            <section>
              <div className="flex items-center gap-2 mb-5">
                <Flame className="w-5 h-5 text-orange-500" />
                <h2 className="text-xl font-bold text-zinc-900">Trending Now</h2>
                <span className="text-xs text-zinc-400 ml-1">— most searched this month</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {trending.map(dest => (
                  <div key={dest.id} className="relative rounded-2xl overflow-hidden h-36 md:h-44 group cursor-pointer flex-shrink-0">
                    <Image
                      src={dest.image}
                      alt={dest.name}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="25vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-3 left-3">
                      <p className="text-white font-bold text-base leading-tight">{dest.name}</p>
                      <p className="text-white/70 text-xs">{dest.country}</p>
                    </div>
                    <div className="absolute top-3 right-3">
                      <a
                        href={dest.affiliateLinks.flights}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                        className="w-8 h-8 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/40 transition-all"
                        title="Search flights"
                      >
                        <Plane className="w-3.5 h-3.5 text-white" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* All / filtered destinations */}
          <section>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                  <Globe2 className="w-5 h-5 text-zinc-400" />
                  {activeVibes.length > 0 || activeContinent !== 'All' || query
                    ? `${filtered.length} destination${filtered.length !== 1 ? 's' : ''} found`
                    : 'All Destinations'}
                </h2>
                {!query && activeVibes.length === 0 && activeContinent === 'All' && (
                  <p className="text-sm text-zinc-400 mt-0.5">Book direct with our trusted partners</p>
                )}
              </div>
              {(activeVibes.length > 0 || activeContinent !== 'All' || query) && (
                <button
                  onClick={() => { setActiveVibes([]); setActiveContinent('All'); setQuery(''); }}
                  className="text-xs text-zinc-400 hover:text-zinc-700 font-semibold underline"
                >
                  Clear all filters
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-20">
                <Globe2 className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                <p className="text-zinc-500 font-semibold">No destinations match your filters</p>
                <p className="text-zinc-400 text-sm mt-1">Try broadening your search</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map(dest => (
                  <DestinationCard
                    key={dest.id}
                    dest={dest}
                    onWishlist={handleWishlist}
                    wishlisted={wishlistedIds.has(dest.id)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Partner disclosure */}
          <p className="text-center text-xs text-zinc-300 pb-4">
            Some links on this page are affiliate links. tripcoord may earn a commission when you book — at no extra cost to you.
          </p>
          </div>
        </div>
      </div>

      {/* Wishlist toast */}
      {showWishlistToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 text-white text-sm font-semibold px-5 py-3 rounded-full shadow-xl flex items-center gap-2">
          <Heart className="w-4 h-4 fill-rose-500 text-rose-500" />
          Saved to your wishlist
        </div>
      )}
    </div>
  );
}
