'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Sidebar } from '@/components/Sidebar';
import { discoverDestinations as mockDiscoverDestinations, DiscoverDestination, VibeTag } from '@/data/mock';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  Search, Heart, Plane, Hotel, Ticket, Star, Flame,
  Globe2, ArrowRight, Sparkles, Clock, DollarSign, Lock, TrendingUp,
  ExternalLink, Sun, Sunset, Moon, ChevronRight, MapPin, Calendar,
} from 'lucide-react';
import { useEntitlements } from '@/hooks/useEntitlements';

// ─── Event logging ─────────────────────────────────────────────────────────

function logDestinationEvent(destination: string, eventType: 'search' | 'card_click' | 'plan_click') {
  fetch('/api/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination, eventType }),
  }).catch(() => { /* silent */ });
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface Activity {
  time: 'morning' | 'afternoon' | 'evening';
  title: string;
  description: string;
  affiliate_url?: string;
  affiliate_label?: string;
  cost_usd?: number;
}

interface ItineraryDay {
  day: number;
  title: string;
  activities: Activity[];
}

interface FeaturedItinerary {
  id: string;
  slug: string;
  destination: string;
  country: string;
  title: string;
  tagline: string | null;
  heroImage: string | null;
  durationDays: number;
  vibes: string[];
  personaTags: string[];
  seasonTags: string[];
  avgCostPerDay: number | null;
  editorPick: boolean | null;
}

interface SeasonalCollection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  season: string;
  accentColor: string | null;
  heroImage: string | null;
  destinationNames: string[];
}

// ─── Constants ─────────────────────────────────────────────────────────────

const CONTINENTS = ['All', 'Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America'];

const timeConfig = {
  morning:   { dot: 'bg-amber-400',  badge: 'bg-amber-50  text-amber-700  border-amber-200',  icon: Sun,    label: 'Morning'   },
  afternoon: { dot: 'bg-sky-400',    badge: 'bg-sky-50    text-sky-700    border-sky-200',    icon: Sunset, label: 'Afternoon' },
  evening:   { dot: 'bg-violet-400', badge: 'bg-violet-50 text-violet-700 border-violet-200', icon: Moon,   label: 'Evening'   },
};

const seasonColors: Record<string, { accent: string; bg: string; border: string; text: string; pill: string }> = {
  summer:     { accent: 'bg-amber-400',  bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-700',  pill: 'bg-amber-100 text-amber-800'  },
  winter:     { accent: 'bg-sky-500',    bg: 'bg-sky-50',    border: 'border-sky-200',   text: 'text-sky-700',    pill: 'bg-sky-100   text-sky-800'    },
  spring:     { accent: 'bg-emerald-400',bg: 'bg-emerald-50',border: 'border-emerald-200',text:'text-emerald-700',pill: 'bg-emerald-100 text-emerald-800'},
  fall:       { accent: 'bg-orange-400', bg: 'bg-orange-50', border: 'border-orange-200',text: 'text-orange-700', pill: 'bg-orange-100 text-orange-800' },
  'year-round':{ accent:'bg-violet-400', bg: 'bg-violet-50', border: 'border-violet-200',text: 'text-violet-700', pill: 'bg-violet-100 text-violet-800' },
};

// ─── Featured Itinerary Card ────────────────────────────────────────────────

interface FeaturedItineraryCardProps {
  item: FeaturedItinerary;
  days: ItineraryDay[];
  loadingDays: boolean;
}

function FeaturedItineraryCard({ item, days, loadingDays }: FeaturedItineraryCardProps) {
  const previewDays = days.slice(0, 4);

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
      {/* Hero */}
      <div className="relative h-52 overflow-hidden">
        {item.heroImage ? (
          <Image
            src={item.heroImage}
            alt={item.destination}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-sky-600 to-indigo-700" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

        {item.editorPick && (
          <div className="absolute top-3 left-3 flex items-center gap-1 bg-amber-400 text-amber-900 text-[10px] font-bold px-2.5 py-1 rounded-full">
            <Star className="w-2.5 h-2.5 fill-current" />
            Editor&apos;s Pick
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-center gap-1.5 text-white/60 text-xs mb-1">
            <MapPin className="w-3 h-3" />
            {item.destination}, {item.country}
          </div>
          <h3 className="font-script italic text-2xl text-white font-bold leading-tight">{item.title}</h3>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-zinc-100 text-xs text-zinc-500">
        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-sky-500" />{item.durationDays} days</span>
        {item.avgCostPerDay && <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5 text-emerald-500" />~${item.avgCostPerDay}/day</span>}
        {item.vibes.slice(0, 2).map(v => (
          <span key={v} className="capitalize bg-zinc-100 px-2 py-0.5 rounded-full">{v}</span>
        ))}
      </div>

      {/* Day-by-day preview */}
      <div className="p-4">
        {loadingDays ? (
          <div className="flex gap-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="flex-1 h-24 bg-zinc-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : previewDays.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {previewDays.map(day => (
              <div key={day.day} className="bg-stone-50 rounded-xl p-3 border border-zinc-100">
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wide mb-1.5">Day {day.day}</div>
                <div className="text-xs font-semibold text-zinc-700 mb-2 leading-snug line-clamp-1">{day.title}</div>
                <div className="space-y-1.5">
                  {day.activities.map((act, idx) => {
                    const cfg = timeConfig[act.time] ?? timeConfig.morning;
                    const Icon = cfg.icon;
                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                          <span className="text-[10px] text-zinc-500 truncate">{act.title}</span>
                        </div>
                        {act.affiliate_url && act.affiliate_label && (
                          <a
                            href={act.affiliate_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className={`inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${cfg.badge}`}
                          >
                            <Icon className="w-2 h-2 shrink-0" />
                            <span className="truncate max-w-[80px]">{act.affiliate_label.replace(' →', '')}</span>
                            <ExternalLink className="w-2 h-2 shrink-0" />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Footer CTAs */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-100">
          <Link
            href={`/discover/${item.slug}`}
            className="text-xs text-zinc-500 hover:text-zinc-700 flex items-center gap-1 transition-colors"
          >
            See full itinerary <ChevronRight className="w-3.5 h-3.5" />
          </Link>
          <Link
            href={`/plan?destination=${encodeURIComponent(item.destination)}&days=${item.durationDays}&featured=${item.slug}`}
            className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-700 text-white text-xs font-bold px-4 py-2 rounded-full transition-colors"
            onClick={() => logDestinationEvent(item.destination, 'plan_click')}
          >
            <Sparkles className="w-3 h-3" />
            Start planning this trip
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Seasonal Collection Card ───────────────────────────────────────────────

function SeasonalCard({ collection }: { collection: SeasonalCollection }) {
  const colors = seasonColors[collection.season] ?? seasonColors.summer;

  return (
    <div className={`rounded-2xl border ${colors.border} ${colors.bg} overflow-hidden p-5`}>
      <div className={`w-10 h-1 rounded-full ${colors.accent} mb-3`} />
      <h4 className={`font-semibold text-base ${colors.text} mb-1`}>{collection.title}</h4>
      {collection.description && (
        <p className="text-zinc-500 text-xs leading-relaxed mb-3">{collection.description}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {collection.destinationNames.slice(0, 4).map(name => (
          <span key={name} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors.pill}`}>
            {name}
          </span>
        ))}
        {collection.destinationNames.length > 4 && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors.pill}`}>
            +{collection.destinationNames.length - 4} more
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Destination Card (Layer 2) ─────────────────────────────────────────────

function DestinationCard({
  dest, onWishlist, wishlisted, canWishlist, onCardClick, onPlanClick,
}: {
  dest: DiscoverDestination;
  onWishlist: (id: string) => void;
  wishlisted: boolean;
  canWishlist: boolean;
  onCardClick?: () => void;
  onPlanClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col border border-zinc-100 cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onCardClick}
    >
      <div className="relative h-40 sm:h-52 overflow-hidden flex-shrink-0">
        <Image
          src={dest.image}
          alt={dest.name}
          fill
          className={`object-cover transition-transform duration-500 ${hovered ? 'scale-105' : 'scale-100'}`}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <div className="absolute top-3 left-3 flex gap-2">
          {dest.trending && (
            <span className="flex items-center gap-1 bg-orange-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
              <Flame className="w-2.5 h-2.5" />Trending
            </span>
          )}
          {dest.editorPick && (
            <span className="flex items-center gap-1 bg-sky-900/80 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
              <Star className="w-2.5 h-2.5 fill-current" />Editor&apos;s Pick
            </span>
          )}
        </div>
        <button
          onClick={() => onWishlist(dest.id)}
          title={canWishlist ? 'Save to wishlist' : 'Explorer plan required to save destinations'}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/40 transition-all"
        >
          {canWishlist
            ? <Heart className={`w-4 h-4 transition-colors ${wishlisted ? 'fill-rose-500 text-rose-500' : 'text-white'}`} />
            : <Lock className="w-3.5 h-3.5 text-white/80" />
          }
        </button>
        <div className="absolute bottom-3 left-3">
          <p className="font-script italic text-xl text-white leading-tight drop-shadow-md">{dest.name}, {dest.country}</p>
        </div>
      </div>

      <div className="flex flex-col flex-1 p-5">
        <p className="text-zinc-600 text-sm leading-relaxed mb-4 flex-1">{dest.tagline}</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {dest.vibes.map(v => (
            <span key={v} className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">{v}</span>
          ))}
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-400 mb-5">
          <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" />~${dest.avgCost.toLocaleString()}/wk</span>
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{dest.flightHours}h flight</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <a href={dest.affiliateLinks.flights} target="_blank" rel="noopener noreferrer sponsored"
            className="flex flex-col items-center gap-1 p-2.5 bg-sky-50 hover:bg-sky-100 rounded-xl transition-colors text-center">
            <Plane className="w-4 h-4 text-sky-700" />
            <span className="text-[10px] font-bold text-sky-700">Flights</span>
          </a>
          <a href={dest.affiliateLinks.hotels} target="_blank" rel="noopener noreferrer sponsored"
            className="flex flex-col items-center gap-1 p-2.5 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors text-center">
            <Hotel className="w-4 h-4 text-emerald-700" />
            <span className="text-[10px] font-bold text-emerald-700">Hotels</span>
          </a>
          <a href={dest.affiliateLinks.experiences} target="_blank" rel="noopener noreferrer sponsored"
            className="flex flex-col items-center gap-1 p-2.5 bg-amber-50 hover:bg-amber-100 rounded-xl transition-colors text-center">
            <Ticket className="w-4 h-4 text-amber-700" />
            <span className="text-[10px] font-bold text-amber-700">Things to do</span>
          </a>
        </div>
        <Link
          href={`/trip/new?destination=${encodeURIComponent(dest.name + ', ' + dest.country)}`}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-900 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl transition-all"
          onClick={e => { e.stopPropagation(); onPlanClick?.(); }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Plan this trip
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

// ─── Top Search Card ────────────────────────────────────────────────────────

function TopSearchCard({ name, rank, onSearch }: { name: string; rank: number; onSearch: (name: string) => void }) {
  return (
    <div
      className="relative bg-gradient-to-br from-sky-600 to-indigo-700 rounded-2xl overflow-hidden cursor-pointer group hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
      onClick={() => onSearch(name)}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.08),transparent)]" />
      <div className="p-5 h-full flex flex-col justify-between min-h-[160px]">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1.5 bg-white/15 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
            <TrendingUp className="w-3 h-3" />
            Trending #{rank}
          </span>
          <Search className="w-4 h-4 text-white/40 group-hover:text-white/70 transition-colors" />
        </div>

        {/* Destination name */}
        <div>
          <p className="text-white/60 text-xs mb-1">Travelers are searching for</p>
          <h3 className="font-script italic text-2xl font-bold text-white leading-tight">{name}</h3>
        </div>

        {/* CTA */}
        <div className="flex items-center justify-between mt-3">
          <Link
            href={`/trip/new?destination=${encodeURIComponent(name)}`}
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            Plan this trip
          </Link>
          <span className="text-white/40 text-xs group-hover:text-white/60 transition-colors">
            Search →
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const currentUser = useCurrentUser();
  const { hasWishlist } = useEntitlements();

  // ── State ──────────────────────────────────────────────────────────────
  const [destinations, setDestinations] = useState<DiscoverDestination[]>(mockDiscoverDestinations);
  const [topSearches, setTopSearches] = useState<Array<{ name: string; count: number }>>([]);
  const [featured, setFeatured] = useState<FeaturedItinerary[]>([]);
  const [seasonal, setSeasonal] = useState<SeasonalCollection[]>([]);
  const [featuredDays, setFeaturedDays] = useState<Record<string, ItineraryDay[]>>({});
  const [loadingFeaturedDays, setLoadingFeaturedDays] = useState(false);

  const [query, setQuery] = useState('');
  const [activeVibes, setActiveVibes] = useState<VibeTag[]>([]);
  const [activeContinent, setActiveContinent] = useState('All');
  const [wishlistedIds, setWishlistedIds] = useState<Set<string>>(new Set());
  const [showWishlistToast, setShowWishlistToast] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────

  // Destinations + top searches
  useEffect(() => {
    fetch('/api/discover')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.destinations?.length) setDestinations(data.destinations);
        if (data?.topSearches?.length) setTopSearches(data.topSearches);
      })
      .catch(() => { /* keep mock fallback */ });
  }, []);

  // Featured itineraries + seasonal collections
  useEffect(() => {
    fetch('/api/featured-itineraries')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.featured?.length) setFeatured(data.featured);
        if (data?.seasonal?.length) setSeasonal(data.seasonal);
      })
      .catch(() => { /* silent */ });
  }, []);

  // Fetch full itinerary days for each featured item (for day preview)
  useEffect(() => {
    if (!featured.length) return;
    setLoadingFeaturedDays(true);
    Promise.all(
      featured.map(f =>
        fetch(`/api/featured-itineraries/${f.slug}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => ({ slug: f.slug, days: (data?.itinerary?.days ?? []) as ItineraryDay[] }))
          .catch(() => ({ slug: f.slug, days: [] as ItineraryDay[] }))
      )
    ).then(results => {
      const map: Record<string, ItineraryDay[]> = {};
      results.forEach(r => { map[r.slug] = r.days; });
      setFeaturedDays(map);
    }).finally(() => setLoadingFeaturedDays(false));
  }, [featured]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleSearchChange = useCallback((value: string) => {
    setQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.trim().length >= 2) {
      searchTimerRef.current = setTimeout(() => {
        logDestinationEvent(value.trim(), 'search');
      }, 800);
    }
  }, []);

  const toggleVibe = (v: VibeTag) => {
    setActiveVibes(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  };

  const handleWishlist = (id: string) => {
    if (!hasWishlist) return;
    setWishlistedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setShowWishlistToast(true);
    setTimeout(() => setShowWishlistToast(false), 2000);
  };

  const filtered = useMemo(() => {
    return destinations.filter(d => {
      const matchQuery = !query || d.name.toLowerCase().includes(query.toLowerCase()) || d.country.toLowerCase().includes(query.toLowerCase());
      const matchVibe = activeVibes.length === 0 || activeVibes.some(v => d.vibes.includes(v));
      const matchContinent = activeContinent === 'All' || d.continent === activeContinent;
      return matchQuery && matchVibe && matchContinent;
    });
  }, [destinations, query, activeVibes, activeContinent]);

  const isFiltering = query.length > 0 || activeVibes.length > 0 || activeContinent !== 'All';

  return (
    <div className="flex h-screen bg-parchment">
      <Sidebar activePage="discover" user={currentUser} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8 space-y-12">

          {/* ── Page Header ────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-700 mb-3">Discover</p>

            {!hasWishlist && (
              <div className="flex items-center justify-between gap-4 px-5 py-4 mb-6 bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0">
                    <Lock className="w-4 h-4 text-sky-700" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">Explorer feature</p>
                    <p className="text-xs text-zinc-500">Upgrade to save destinations to your wishlist and unlock full discovery.</p>
                  </div>
                </div>
                <Link href="/pricing" className="flex-shrink-0 px-4 py-2 bg-sky-800 hover:bg-sky-900 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap">
                  Upgrade
                </Link>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h1 className="text-4xl font-script italic font-semibold text-zinc-900">Where to next?</h1>
                <p className="text-sm text-zinc-400 mt-1">Hand-curated itineraries, destination inspiration, and one-click booking.</p>
              </div>
              <div className="relative w-full sm:w-72 flex-shrink-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={query}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Search destinations…"
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300 shadow-sm"
                />
              </div>
            </div>
          </div>

          {/* ── Filters ────────────────────────────────────────────────── */}
          <div className="space-y-3 -mt-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mr-1">Vibe</span>
              {(['Adventure', 'Culture', 'Food', 'Photography', 'Nature', 'Wellness', 'Nightlife', 'Sports', 'History', 'Shopping'] as VibeTag[]).map(v => (
                <button
                  key={v}
                  onClick={() => toggleVibe(v)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    activeVibes.includes(v)
                      ? 'bg-sky-900 text-white shadow-sm'
                      : 'bg-white text-zinc-500 hover:text-zinc-800 border border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  {v}
                </button>
              ))}
              {activeVibes.length > 0 && (
                <button onClick={() => setActiveVibes([])} className="text-xs text-zinc-400 hover:text-zinc-600 underline ml-1">Clear</button>
              )}
            </div>
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

          {/* ══════════════════════════════════════════════════════════════
              LAYER 1 — Featured itineraries + Top Searches (2+2 grid)
              Only shown when no filters active
          ══════════════════════════════════════════════════════════════ */}
          {!isFiltering && (featured.length > 0 || topSearches.length > 0) && (
            <section>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-script italic text-2xl font-semibold text-zinc-900">Featured Itineraries</h2>
                  <p className="text-sm text-zinc-400 mt-0.5">Hand-built trips from the tripcoord team — plus what travelers are searching right now</p>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Editorial picks — capped at 2 */}
                {featured.slice(0, 2).map(item => (
                  <FeaturedItineraryCard
                    key={item.slug}
                    item={item}
                    days={featuredDays[item.slug] ?? []}
                    loadingDays={loadingFeaturedDays && !featuredDays[item.slug]}
                  />
                ))}
                {/* Top search cards — fill up to 2 slots */}
                {topSearches.slice(0, 2).map((s, i) => (
                  <TopSearchCard
                    key={s.name}
                    name={s.name}
                    rank={i + 1}
                    onSearch={handleSearchChange}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ══════════════════════════════════════════════════════════════
              LAYER 2 — Curated by vibe (all destinations)
          ══════════════════════════════════════════════════════════════ */}
          <section>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-script italic text-2xl font-semibold text-zinc-900">
                  {isFiltering
                    ? `${filtered.length} destination${filtered.length !== 1 ? 's' : ''} found`
                    : 'Curated Destinations'}
                </h2>
                {!isFiltering && (
                  <p className="text-sm text-zinc-400 mt-0.5">Flights, hotels &amp; experiences — one click away</p>
                )}
              </div>
              {isFiltering && (
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
                    canWishlist={hasWishlist}
                    onCardClick={() => logDestinationEvent(dest.name, 'card_click')}
                    onPlanClick={() => logDestinationEvent(dest.name, 'plan_click')}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ══════════════════════════════════════════════════════════════
              LAYER 3 — Seasonal collections (SEO-driven)
              Only shown when no filters active
          ══════════════════════════════════════════════════════════════ */}
          {!isFiltering && seasonal.length > 0 && (
            <section>
              <div className="mb-5">
                <h2 className="font-script italic text-2xl font-semibold text-zinc-900">Seasonal Collections</h2>
                <p className="text-sm text-zinc-400 mt-0.5">The best destinations for every season and occasion</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {seasonal.map(collection => (
                  <SeasonalCard key={collection.slug} collection={collection} />
                ))}
              </div>
            </section>
          )}

          {/* Partner disclosure */}
          <p className="text-center text-xs text-zinc-300 pb-4">
            Some links on this page are affiliate links. tripcoord may earn a commission when you book — at no extra cost to you.
          </p>

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
