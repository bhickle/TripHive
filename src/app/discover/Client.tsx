'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Sidebar } from '@/components/Sidebar';
import { discoverDestinations as mockDiscoverDestinations, DiscoverDestination, VibeTag } from '@/data/mock';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  Search, Heart, Plane, Hotel, Ticket, Star, Flame,
  Globe2, ArrowRight, Sparkles, Clock, Lock, TrendingUp,
  ExternalLink, Sun, Sunset, Moon, ChevronLeft, ChevronRight, MapPin, Calendar,
} from 'lucide-react';
import { useEntitlements } from '@/hooks/useEntitlements';
import { ForkTripModal } from '@/components/ForkTripModal';

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

interface CommunityTrip {
  id: string;
  title: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  tripLength: number;
  groupSize: number;
  coverImage: string | null;
  coverImageMeta: { photographer?: string | null; photographerUrl?: string | null; photoUrl?: string | null } | null;
  organizerName: string | null;
  likeCount: number;
  viewerLiked: boolean;
  planClickCount: number;
  createdAt: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const CONTINENTS = ['All', 'Africa', 'Asia', 'Europe', 'North America', 'Oceania', 'South America'];

// Normalize a destination name for cross-card wishlist matching. Strips
// trailing country segments and collapses case so "Paris", "Paris, France",
// and "PARIS " all match the same wishlist entry.
function normalizeDestName(n: string): string {
  return n.trim().split(',')[0].trim().toLowerCase();
}

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
  wishlisted: boolean;
  canWishlist: boolean;
  onWishlist: () => void;
}

function FeaturedItineraryCard({ item, days, loadingDays, wishlisted, canWishlist, onWishlist }: FeaturedItineraryCardProps) {
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

        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onWishlist(); }}
          title={canWishlist ? (wishlisted ? 'Saved to On My Radar' : 'Save to On My Radar') : 'Explorer plan required to save destinations'}
          aria-label={canWishlist ? (wishlisted ? 'Remove from On My Radar' : 'Save to On My Radar') : 'Save (Explorer plan required)'}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/40 transition-all"
        >
          {canWishlist
            ? <Heart className={`w-4 h-4 transition-colors ${wishlisted ? 'fill-rose-500 text-rose-500' : 'text-white'}`} />
            : <Lock className="w-3.5 h-3.5 text-white/80" />
          }
        </button>

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-center gap-1.5 text-white/60 text-xs mb-1">
            <MapPin className="w-3 h-3" />
            {item.destination}, {item.country}
          </div>
          <h3 className="font-script italic text-2xl text-white font-bold leading-tight">{item.title}</h3>
        </div>
      </div>

      {/* Stats — budget intentionally not displayed; it's collected on
          the Trip Builder for hotel-tier + food-spend AI prompts but
          isn't a user-facing stat on Discover. */}
      <div className="flex items-center gap-4 px-4 py-2.5 border-b border-zinc-100 text-xs text-zinc-500">
        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-sky-500" />{item.durationDays} days</span>
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
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide mb-1.5">Day {day.day}</div>
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
                            rel="noopener noreferrer sponsored"
                            title="Affiliate link — opens an external booking site. tripcoord may earn a commission."
                            aria-label={`${act.affiliate_label.replace(' →', '')} — affiliate link, opens external site`}
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
            href={`/trip/new?destination=${encodeURIComponent(item.destination)}&days=${item.durationDays}&featured=${item.slug}`}
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

function SeasonalCard({
  collection,
  onCardClick,
  onPillClick,
}: {
  collection: SeasonalCollection;
  /** Click anywhere on the card body to filter the L2 grid to this collection */
  onCardClick: (collection: SeasonalCollection) => void;
  /** Click a destination pill to drill into that single destination */
  onPillClick: (destinationName: string) => void;
}) {
  const colors = seasonColors[collection.season] ?? seasonColors.summer;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onCardClick(collection)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCardClick(collection);
        }
      }}
      className={`group rounded-2xl border ${colors.border} ${colors.bg} overflow-hidden p-5 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-700`}
    >
      <div className={`w-10 h-1 rounded-full ${colors.accent} mb-3`} />
      <h4 className={`font-semibold text-base ${colors.text} mb-1`}>{collection.title}</h4>
      {collection.description && (
        <p className="text-zinc-500 text-xs leading-relaxed mb-3">{collection.description}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {collection.destinationNames.slice(0, 4).map(name => (
          <button
            key={name}
            onClick={(e) => { e.stopPropagation(); onPillClick(name); }}
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${colors.pill} hover:brightness-95 hover:underline-offset-2 hover:underline transition-all`}
          >
            {name}
          </button>
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
        <div className="flex items-center gap-4 text-xs text-zinc-500 mb-5">
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{dest.flightHours}h flight</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <a href={dest.affiliateLinks.flights} target="_blank" rel="noopener noreferrer sponsored"
            title="Affiliate link — opens an external booking site. tripcoord may earn a commission."
            aria-label={`Search flights to ${dest.name} — affiliate link`}
            className="flex flex-col items-center gap-1 p-2.5 bg-sky-50 hover:bg-sky-100 rounded-xl transition-colors text-center">
            <Plane className="w-4 h-4 text-sky-700" />
            <span className="text-[10px] font-bold text-sky-700">Flights</span>
          </a>
          <a href={dest.affiliateLinks.hotels} target="_blank" rel="noopener noreferrer sponsored"
            title="Affiliate link — opens an external booking site. tripcoord may earn a commission."
            aria-label={`Search hotels in ${dest.name} — affiliate link`}
            className="flex flex-col items-center gap-1 p-2.5 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors text-center">
            <Hotel className="w-4 h-4 text-emerald-700" />
            <span className="text-[10px] font-bold text-emerald-700">Hotels</span>
          </a>
          <a href={dest.affiliateLinks.experiences} target="_blank" rel="noopener noreferrer sponsored"
            title="Affiliate link — opens an external booking site. tripcoord may earn a commission."
            aria-label={`Search experiences in ${dest.name} — affiliate link`}
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

function TopSearchCard({
  name, rank, onSearch, featuredSlug, wishlisted, canWishlist, onWishlist,
}: {
  name: string;
  rank: number;
  onSearch: (name: string) => void;
  /** If a featured itinerary exists for this destination, the card opens
   *  the full preview instead of dropping into the trip builder blind. */
  featuredSlug: string | null;
  wishlisted: boolean;
  canWishlist: boolean;
  onWishlist: () => void;
}) {
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
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onWishlist(); }}
            title={canWishlist ? (wishlisted ? 'Saved to On My Radar' : 'Save to On My Radar') : 'Explorer plan required to save destinations'}
            aria-label={canWishlist ? (wishlisted ? 'Remove from On My Radar' : 'Save to On My Radar') : 'Save (Explorer plan required)'}
            className="w-7 h-7 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-all"
          >
            {canWishlist
              ? <Heart className={`w-3.5 h-3.5 transition-colors ${wishlisted ? 'fill-rose-500 text-rose-500' : 'text-white'}`} />
              : <Lock className="w-3 h-3 text-white/80" />
            }
          </button>
        </div>

        {/* Destination name */}
        <div>
          <p className="text-white/60 text-xs mb-1">Travelers are searching for</p>
          <h3 className="font-script italic text-2xl font-bold text-white leading-tight">{name}</h3>
        </div>

        {/* CTA — prefer opening a built itinerary preview when one exists for
            this destination, so users don't have to save blind. */}
        <div className="flex items-center justify-between mt-3">
          {featuredSlug ? (
            <Link
              href={`/discover/${featuredSlug}`}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              See 7-day itinerary
            </Link>
          ) : (
            <Link
              href={`/trip/new?destination=${encodeURIComponent(name)}`}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-full transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              Plan this trip
            </Link>
          )}
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
  const [communityTrips, setCommunityTrips] = useState<CommunityTrip[]>([]);
  const [communityLikedIds, setCommunityLikedIds] = useState<Set<string>>(new Set());
  // Horizontal "arrow-over" carousel for the community rail (not a stacking grid).
  const communityRailRef = useRef<HTMLDivElement>(null);
  const scrollCommunityRail = (dir: -1 | 1) => {
    const el = communityRailRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.9), behavior: 'smooth' });
  };
  const [forkingId, setForkingId] = useState<string | null>(null);
  // The modal opens with a pending trip target; null means closed.
  const [pendingForkTrip, setPendingForkTrip] = useState<CommunityTrip | null>(null);

  const [query, setQuery] = useState('');
  const [activeVibes, setActiveVibes] = useState<VibeTag[]>([]);
  const [activeContinent, setActiveContinent] = useState('All');
  // Set when the user clicks a Seasonal Collection card. Filters the L2
  // destination grid to just the collection's destinations and surfaces
  // the collection title in the section header.
  const [activeCollection, setActiveCollection] = useState<SeasonalCollection | null>(null);
  // Unified wishlist state — normalized destination name → wishlist row id.
  // Every card type (DestinationCard / FeaturedItineraryCard / TopSearchCard)
  // checks against this single map so a save from any surface reflects on
  // every other surface for the same destination. Use '__pending__' as a
  // placeholder row id between optimistic insert and the server returning
  // the real row id.
  const [wishlistedNames, setWishlistedNames] = useState<Map<string, string>>(new Map());
  const [showWishlistToast, setShowWishlistToast] = useState(false);
  // Generic action-failure toast — used by fork-failure path so the user
  // gets feedback instead of a silent modal close.
  const [actionError, setActionError] = useState<string | null>(null);
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

  // Community trips — public-template itineraries from the community
  useEffect(() => {
    fetch('/api/community')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (Array.isArray(data?.trips)) {
          setCommunityTrips(data.trips);
          // Seed the liked-state from the server so hearts the viewer already
          // tapped render filled on load (and don't get silently toggled off).
          setCommunityLikedIds(new Set(
            (data.trips as CommunityTrip[]).filter(t => t.viewerLiked).map(t => t.id),
          ));
        }
      })
      .catch(() => { /* silent — empty state is fine */ });
  }, []);

  // Hydrate wishlistedNames from the user's saved wishlist on mount so
  // hearts on every Discover surface reflect what's already saved.
  // Normalizes by first-segment lower-case so DB rows saved as either
  // "Kyoto" or "Kyoto, Japan" both resolve.
  useEffect(() => {
    if (!hasWishlist) return;
    if (currentUser.isLoading || currentUser.isDemo) return;
    if (!currentUser.id) return;
    fetch('/api/wishlist')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const items: Array<{ id: string; destination: string }> | undefined = data?.items;
        if (!items?.length) return;
        const map = new Map<string, string>();
        for (const it of items) {
          if (it.destination) map.set(normalizeDestName(it.destination), it.id);
        }
        if (map.size > 0) setWishlistedNames(map);
      })
      .catch(() => { /* swallow — discover hearts default to unsaved */ });
  }, [hasWishlist, currentUser.id, currentUser.isLoading, currentUser.isDemo]);

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

  // Filter the L2 destination grid to a single Seasonal Collection.
  // Scrolls the grid into view so the user can see the result of their click
  // — without this, the section header swap is easy to miss on tall screens.
  const handleCollectionClick = useCallback((collection: SeasonalCollection) => {
    setActiveCollection(collection);
    // Clear other filters that would compound — pill-click users want
    // just this collection, not a slice of it.
    setActiveVibes([]);
    setActiveContinent('All');
    setQuery('');
    if (typeof window !== 'undefined') {
      // Defer a tick so the layer transition (Featured/Seasonal hide) settles
      // before we scroll to the destination grid.
      setTimeout(() => {
        document.getElementById('layer-2-destinations')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }, []);

  // Pill click: prefer routing to a built featured itinerary preview when
  // one exists for this destination — that's the whole point of the
  // seasonal collection (handing the user a fully-planned 7-day trip).
  // Fall through to the search-query filter only if no featured exists.
  const handleSeasonalPillClick = useCallback((destinationName: string) => {
    const key = normalizeDestName(destinationName);
    const matched = featured.find(f => normalizeDestName(f.destination) === key);
    if (matched) {
      window.location.href = `/discover/${matched.slug}`;
      return;
    }
    setActiveCollection(null);
    setActiveVibes([]);
    setActiveContinent('All');
    setQuery(destinationName);
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        document.getElementById('layer-2-destinations')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }, [featured]);


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

  const handleCommunityLike = async (tripId: string) => {
    // Don't redirect while auth is still resolving — useCurrentUser is
    // briefly null on first paint, and the previous flow bounced
    // already-logged-in users to /auth/login during that window.
    if (currentUser.isLoading) return;
    if (!currentUser.id || currentUser.isDemo) {
      // Round-trip back to /discover so the user keeps their place.
      window.location.href = `/auth/login?redirect=${encodeURIComponent('/discover')}`;
      return;
    }
    const isLiked = communityLikedIds.has(tripId);
    // Optimistic toggle
    setCommunityLikedIds(prev => {
      const next = new Set(prev);
      isLiked ? next.delete(tripId) : next.add(tripId);
      return next;
    });
    setCommunityTrips(prev => prev.map(t =>
      t.id === tripId ? { ...t, likeCount: Math.max(0, t.likeCount + (isLiked ? -1 : 1)) } : t
    ));
    try {
      const res = await fetch(`/api/trips/${tripId}/like`, { method: isLiked ? 'DELETE' : 'POST' });
      if (!res.ok) throw new Error('like failed');
      const data = await res.json();
      // Reconcile against server count
      setCommunityTrips(prev => prev.map(t =>
        t.id === tripId ? { ...t, likeCount: data.count ?? t.likeCount } : t
      ));
    } catch {
      // Roll back
      setCommunityLikedIds(prev => {
        const next = new Set(prev);
        isLiked ? next.add(tripId) : next.delete(tripId);
        return next;
      });
      setCommunityTrips(prev => prev.map(t =>
        t.id === tripId ? { ...t, likeCount: Math.max(0, t.likeCount + (isLiked ? 1 : -1)) } : t
      ));
    }
  };

  // Step 1: clicking "Use as starting point" opens the date-picker modal.
  // Step 2: modal collects dates (or skip) and calls handleCommunityForkSubmit.
  const handleCommunityFork = (trip: CommunityTrip) => {
    if (currentUser.isLoading) return;
    if (!currentUser.id || currentUser.isDemo) {
      // Bounce through login but bring them back to /discover after — same
      // pattern as the Like button (line 619). Without ?redirect= the
      // user landed on /dashboard post-login instead of returning to the
      // trip card they were trying to fork.
      window.location.href = `/auth/login?redirect=${encodeURIComponent('/discover')}`;
      return;
    }
    if (forkingId) return;
    setPendingForkTrip(trip);
  };

  const handleCommunityForkSubmit = async (
    dates: { startDate: string | null; endDate: string | null }
  ) => {
    const trip = pendingForkTrip;
    if (!trip) return;
    setForkingId(trip.id);
    try {
      const res = await fetch(`/api/trips/${trip.id}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dates),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.tripId) {
        window.location.href = `/trip/${data.tripId}/itinerary`;
      } else {
        // Surface fork failures instead of silently dismissing the modal.
        // Previous behavior left the user staring at the Discover page
        // wondering whether they had clicked Use as starting point.
        setForkingId(null);
        setPendingForkTrip(null);
        setShowWishlistToast(false);
        setActionError(data?.error ?? "Couldn't copy that trip. Please try again.");
        setTimeout(() => setActionError(null), 4000);
      }
    } catch {
      setForkingId(null);
      setPendingForkTrip(null);
      setActionError("Couldn't copy that trip. Please try again.");
      setTimeout(() => setActionError(null), 4000);
    }
  };

  // Unified heart toggle. Accepts a payload (destination + optional metadata)
  // and toggles the wishlist for that destination name. Same handler powers
  // every heart on the Discover page — DestinationCard, FeaturedItineraryCard,
  // TopSearchCard — so a save from any surface reflects on all of them.
  const handleWishlistToggle = useCallback(async (payload: {
    destination: string;
    country?: string | null;
    coverImage?: string | null;
    bestSeason?: string | null;
    estimatedCost?: number | null;
    tags?: string[];
  }) => {
    if (!hasWishlist) return;
    if (currentUser.isLoading) return;
    if (!currentUser.id || currentUser.isDemo) {
      window.location.href = `/auth/login?redirect=${encodeURIComponent('/discover')}`;
      return;
    }
    const key = normalizeDestName(payload.destination);
    const existingRowId = wishlistedNames.get(key);
    const wasSaved = !!existingRowId;

    // Optimistic — flip heart immediately, reconcile on server response.
    setWishlistedNames(prev => {
      const next = new Map(prev);
      if (wasSaved) next.delete(key);
      else next.set(key, '__pending__');
      return next;
    });
    if (!wasSaved) {
      setShowWishlistToast(true);
      setTimeout(() => setShowWishlistToast(false), 2000);
    }

    try {
      if (wasSaved) {
        if (existingRowId === '__pending__') throw new Error('row id not yet resolved');
        const res = await fetch(`/api/wishlist?id=${existingRowId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`wishlist DELETE ${res.status}`);
      } else {
        const res = await fetch('/api/wishlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`wishlist POST ${res.status}`);
        const out = await res.json();
        if (out?.item?.id) {
          setWishlistedNames(prev => {
            const next = new Map(prev);
            next.set(key, out.item.id);
            return next;
          });
        }
      }
    } catch (err) {
      console.error('[discover] wishlist toggle failed:', err);
      setWishlistedNames(prev => {
        const next = new Map(prev);
        if (wasSaved && existingRowId) next.set(key, existingRowId);
        else next.delete(key);
        return next;
      });
    }
  }, [hasWishlist, currentUser, wishlistedNames]);

  // Adapter so the existing DestinationCard (which calls onWishlist with a
  // destination id) doesn't need a signature change. Resolves the id back
  // to the destination row + builds the payload.
  const handleWishlistById = useCallback((id: string) => {
    const dest = destinations.find(d => d.id === id);
    if (!dest) return;
    handleWishlistToggle({
      destination: dest.name,
      country: dest.country,
      coverImage: dest.image,
      bestSeason: dest.bestMonths,
      estimatedCost: dest.avgCost,
      tags: dest.vibes,
    });
  }, [destinations, handleWishlistToggle]);

  const filtered = useMemo(() => {
    // Pre-compute lowercased collection names + per-name "first segment"
    // (the city, before any comma). seasonal_collections.destination_names
    // are stored as "Santorini, Greece" but discover_destinations.name is
    // just "Santorini" — a strict equality match misses everything. We
    // accept a match when the collection's first segment matches the
    // destination's name (case-insensitive).
    const collectionFirstSegments = activeCollection
      ? activeCollection.destinationNames.map(n => n.split(',')[0].trim().toLowerCase())
      : null;
    return destinations.filter(d => {
      const matchQuery = !query || d.name.toLowerCase().includes(query.toLowerCase()) || d.country.toLowerCase().includes(query.toLowerCase());
      const matchVibe = activeVibes.length === 0 || activeVibes.some(v => d.vibes.includes(v));
      const matchContinent = activeContinent === 'All' || d.continent === activeContinent;
      const matchCollection = !collectionFirstSegments
        || collectionFirstSegments.includes(d.name.toLowerCase());
      return matchQuery && matchVibe && matchContinent && matchCollection;
    });
  }, [destinations, query, activeVibes, activeContinent, activeCollection]);

  const isFiltering = query.length > 0 || activeVibes.length > 0 || activeContinent !== 'All' || !!activeCollection;

  // Discover is one of the few pages publicly browsable while logged out.
  // For guests, swap the dark authenticated Sidebar (which links to
  // dashboard/wishlist/etc. that bounce to /auth/login) for a marketing
  // top header so the visit feels like a marketing page, not a leaky
  // app shell. Loading state gets the sidebar so paid users don't see
  // the guest header flash on refresh.
  const isGuest = !currentUser.isLoading && !currentUser.id;

  return (
    <div className={`bg-parchment ${isGuest ? 'min-h-screen' : 'flex h-screen'}`}>
      {isGuest ? (
        <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <Link href="/">
              <Image src="/tripcoord_logo.png" alt="tripcoord" width={140} height={44} className="h-9 w-auto" priority />
            </Link>
            <div className="flex items-center gap-2 sm:gap-4">
              <Link href="/pricing" className="hidden sm:inline-flex text-sm font-medium text-slate-600 hover:text-slate-900 transition">
                Pricing
              </Link>
              <Link href="/auth/login" className="btn-ghost">Log In</Link>
              <Link href="/auth/signup" className="btn-primary">Get Started</Link>
            </div>
          </div>
        </nav>
      ) : (
        <Sidebar activePage="discover" user={currentUser} />
      )}

      <div className={isGuest ? '' : 'flex-1 overflow-y-auto'}>
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
                <p className="text-sm text-zinc-500 mt-1">Hand-curated itineraries, destination inspiration, and one-click booking.</p>
              </div>
              <div className="relative w-full sm:w-72 flex-shrink-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
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
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mr-1">Vibe</span>
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
                <button onClick={() => setActiveVibes([])} className="text-xs text-zinc-500 hover:text-zinc-600 underline ml-1">Clear</button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mr-1">Region</span>
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
              {activeContinent !== 'All' && (
                <button onClick={() => setActiveContinent('All')} className="text-xs text-zinc-500 hover:text-zinc-600 underline ml-1">Clear</button>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════
              LAYER 1 — Featured itineraries + Top Searches (2+2 grid)
              Only shown when no filters active
          ══════════════════════════════════════════════════════════════ */}
          {!isFiltering && featured.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-script italic text-2xl font-semibold text-zinc-900">Featured Itineraries</h2>
                  <p className="text-sm text-zinc-500 mt-0.5">Hand-built 7-day trips from the tripcoord team — preview the days, then fork into your own</p>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {featured.slice(0, 2).map(item => (
                  <FeaturedItineraryCard
                    key={item.slug}
                    item={item}
                    days={featuredDays[item.slug] ?? []}
                    loadingDays={loadingFeaturedDays && !featuredDays[item.slug]}
                    wishlisted={wishlistedNames.has(normalizeDestName(item.destination))}
                    canWishlist={hasWishlist}
                    onWishlist={() => handleWishlistToggle({
                      destination: item.destination,
                      country: item.country,
                      coverImage: item.heroImage,
                      bestSeason: item.seasonTags?.[0] ?? null,
                      estimatedCost: item.avgCostPerDay ? item.avgCostPerDay * item.durationDays : null,
                      tags: item.vibes,
                    })}
                  />
                ))}
              </div>
            </section>
          )}

          {!isFiltering && topSearches.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-script italic text-2xl font-semibold text-zinc-900">Trending Now</h2>
                  <p className="text-sm text-zinc-500 mt-0.5">What travelers are searching for this week — tap to see a built itinerary or save for later</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {topSearches.slice(0, 4).map((s, i) => {
                  // Match the trending name to a featured itinerary so the
                  // card can offer a real preview instead of dropping the
                  // user straight into the blank Trip Builder.
                  const matched = featured.find(f =>
                    normalizeDestName(f.destination) === normalizeDestName(s.name)
                  );
                  return (
                    <TopSearchCard
                      key={s.name}
                      name={s.name}
                      rank={i + 1}
                      onSearch={handleSearchChange}
                      featuredSlug={matched?.slug ?? null}
                      wishlisted={wishlistedNames.has(normalizeDestName(s.name))}
                      canWishlist={hasWishlist}
                      onWishlist={() => handleWishlistToggle({
                        destination: s.name,
                        country: matched?.country ?? null,
                        coverImage: matched?.heroImage ?? null,
                        tags: matched?.vibes ?? [],
                      })}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* ══════════════════════════════════════════════════════════════
              LAYER 2 — Community itineraries (replaces the old Curated
              Destinations grid). Real trips users have opted to share
              publicly, sorted by like count → plan-click count → recency.
              Filters from the search bar don't apply here — community
              trips don't carry vibe tags.
          ══════════════════════════════════════════════════════════════ */}
          {!isFiltering && (
            <section>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-script italic text-2xl font-semibold text-zinc-900">
                    What the community is building
                  </h2>
                  <p className="text-sm text-zinc-500 mt-0.5">
                    Real itineraries from TripCoord travelers — like &apos;em, save &apos;em, or use one as your starting point
                  </p>
                </div>
              </div>

              {communityTrips.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-zinc-100">
                  <Globe2 className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                  <p className="text-zinc-700 font-semibold">No public itineraries yet</p>
                  <p className="text-zinc-500 text-sm mt-1 max-w-md mx-auto">
                    Be the first — toggle <span className="font-semibold">Share publicly</span> on
                    one of your itineraries to add it here.
                  </p>
                </div>
              ) : (
                <div className="relative">
                  {/* Arrow-over carousel: a few cards visible, arrow through the
                      rest — not a stacking grid that grows downward. */}
                  <button
                    type="button"
                    onClick={() => scrollCommunityRail(-1)}
                    aria-label="Scroll left"
                    className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-9 h-9 rounded-full bg-white shadow-md border border-zinc-200 flex items-center justify-center text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollCommunityRail(1)}
                    aria-label="Scroll right"
                    className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 w-9 h-9 rounded-full bg-white shadow-md border border-zinc-200 flex items-center justify-center text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <div
                    ref={communityRailRef}
                    className="flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  >
                    {communityTrips.map(trip => {
                    const liked = communityLikedIds.has(trip.id);
                    return (
                      <div
                        key={trip.id}
                        className="snap-start shrink-0 w-[300px] sm:w-[330px] bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col"
                      >
                        <Link href={`/community/${trip.id}`} className="block group">
                          <div className="relative h-44 overflow-hidden bg-gradient-to-br from-ocean-700 via-ocean-800 to-earth-700">
                            {trip.coverImage && (
                              <Image
                                src={trip.coverImage}
                                alt={trip.destination}
                                fill
                                className="object-cover group-hover:scale-105 transition-transform duration-500"
                              />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                            {trip.likeCount > 0 && (
                              <div className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/90 text-white backdrop-blur-sm">
                                <Heart className="w-3 h-3 fill-current" /> {trip.likeCount}
                              </div>
                            )}
                            <div className="absolute bottom-3 left-3 right-3">
                              <p className="text-white font-script italic text-xl font-semibold drop-shadow">{trip.destination}</p>
                            </div>
                          </div>
                        </Link>

                        <div className="p-4 flex-1 flex flex-col gap-3">
                          <div className="flex items-center gap-3 text-xs text-zinc-500">
                            {trip.tripLength > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="w-3 h-3" /> {trip.tripLength} {trip.tripLength === 1 ? 'day' : 'days'}
                              </span>
                            )}
                            {trip.groupSize > 0 && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {trip.groupSize} {trip.groupSize === 1 ? 'traveler' : 'travelers'}
                              </span>
                            )}
                          </div>
                          {trip.organizerName && (
                            <p className="text-xs text-zinc-500">by {trip.organizerName.split(/\s+/)[0]}</p>
                          )}
                          <div className="flex items-center gap-2 mt-auto">
                            <button
                              onClick={() => handleCommunityLike(trip.id)}
                              className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                                liked
                                  ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                  : 'bg-zinc-50 text-zinc-600 border border-zinc-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200'
                              }`}
                              aria-label={liked ? 'Unlike' : 'Like'}
                            >
                              <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-current' : ''}`} />
                              {liked ? 'Liked' : 'Like'}
                            </button>
                            <button
                              onClick={() => handleCommunityFork(trip)}
                              disabled={forkingId === trip.id}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-300 text-white text-xs font-semibold rounded-lg transition-all"
                            >
                              {forkingId === trip.id ? 'Copying…' : 'Use as starting point'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* When filters are active, show the original destination grid
              against the editor-curated discover_destinations rows so
              search/vibe/collection filtering still has something to
              bite on. The id is a scroll anchor for collection-card
              and seasonal-pill clicks.

              Special case: when a Seasonal Collection is the active
              filter, surface the matching featured itineraries (with
              full 7-day previews) above the destination grid — that's
              what the user came here for. */}
          {isFiltering && (() => {
            // Featured itineraries that belong to the active collection
            // (matched by first-segment name). Empty array if no collection
            // is active or no featured itinerary matches.
            const collectionFeatured = activeCollection
              ? activeCollection.destinationNames
                  .map(n => featured.find(f => normalizeDestName(f.destination) === normalizeDestName(n)))
                  .filter((x): x is FeaturedItinerary => !!x)
              : [];
            return (
            <section id="layer-2-destinations">
              <div className="flex items-center justify-between mb-5">
                <div>
                  {activeCollection ? (
                    <>
                      <h2 className="font-script italic text-2xl font-semibold text-zinc-900">
                        {activeCollection.title}
                      </h2>
                      <p className="text-sm text-zinc-500 mt-0.5">
                        {collectionFeatured.length > 0
                          ? `${collectionFeatured.length} ready-to-fork 7-day itineraries`
                          : `${filtered.length} destination${filtered.length !== 1 ? 's' : ''}`}
                        {activeCollection.description && ` · ${activeCollection.description}`}
                      </p>
                    </>
                  ) : (
                    <h2 className="font-script italic text-2xl font-semibold text-zinc-900">
                      {filtered.length} destination{filtered.length !== 1 ? 's' : ''} found
                    </h2>
                  )}
                </div>
                <button
                  onClick={() => { setActiveVibes([]); setActiveContinent('All'); setQuery(''); setActiveCollection(null); }}
                  className="text-xs text-zinc-500 hover:text-zinc-700 font-semibold underline"
                >
                  Clear all filters
                </button>
              </div>

              {collectionFeatured.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  {collectionFeatured.map(item => (
                    <FeaturedItineraryCard
                      key={item.slug}
                      item={item}
                      days={featuredDays[item.slug] ?? []}
                      loadingDays={loadingFeaturedDays && !featuredDays[item.slug]}
                      wishlisted={wishlistedNames.has(normalizeDestName(item.destination))}
                      canWishlist={hasWishlist}
                      onWishlist={() => handleWishlistToggle({
                        destination: item.destination,
                        country: item.country,
                        coverImage: item.heroImage,
                        bestSeason: item.seasonTags?.[0] ?? null,
                        estimatedCost: item.avgCostPerDay ? item.avgCostPerDay * item.durationDays : null,
                        tags: item.vibes,
                      })}
                    />
                  ))}
                </div>
              )}

              {filtered.length === 0 ? (
                activeCollection ? (
                  // Collection-specific empty state: many seasonal collections
                  // reference destinations that don't exist in our destination
                  // catalog yet. Surface the collection's intended destinations
                  // as quick-plan chips so the user can still take action.
                  collectionFeatured.length === 0 && (
                    <div className="bg-white border border-zinc-100 rounded-2xl p-8 text-center">
                      <Globe2 className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                      <p className="text-zinc-700 font-semibold">We&apos;re still building itineraries for these</p>
                      <p className="text-zinc-500 text-sm mt-1 mb-5">
                        Pick one and plan it yourself in the meantime.
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {activeCollection.destinationNames.map(name => (
                          <Link
                            key={name}
                            href={`/trip/new?destination=${encodeURIComponent(name)}`}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 text-sm font-medium rounded-full transition-colors"
                          >
                            <Plane className="w-3.5 h-3.5" /> {name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-center py-20">
                    <Globe2 className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                    <p className="text-zinc-500 font-semibold">No destinations match your filters</p>
                    <p className="text-zinc-500 text-sm mt-1">Try broadening your search</p>
                  </div>
                )
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filtered.map(dest => (
                    <DestinationCard
                      key={dest.id}
                      dest={dest}
                      onWishlist={handleWishlistById}
                      wishlisted={wishlistedNames.has(normalizeDestName(dest.name))}
                      canWishlist={hasWishlist}
                      onCardClick={() => logDestinationEvent(dest.name, 'card_click')}
                      onPlanClick={() => logDestinationEvent(dest.name, 'plan_click')}
                    />
                  ))}
                </div>
              )}
            </section>
            );
          })()}

          {/* ══════════════════════════════════════════════════════════════
              LAYER 3 — Seasonal collections (SEO-driven)
              Only shown when no filters active
          ══════════════════════════════════════════════════════════════ */}
          {!isFiltering && seasonal.length > 0 && (
            <section>
              <div className="mb-5">
                <h2 className="font-script italic text-2xl font-semibold text-zinc-900">Seasonal Collections</h2>
                <p className="text-sm text-zinc-500 mt-1 max-w-2xl leading-relaxed">
                  Curated 7-day starter itineraries for the trips people ask us about most — Mediterranean
                  summers, European Christmas markets, family theme parks, fall foliage. Click a destination
                  to open its full week, then fork it into your own trip and customize from there.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {seasonal.map(collection => (
                  <SeasonalCard
                    key={collection.slug}
                    collection={collection}
                    onCardClick={handleCollectionClick}
                    onPillClick={handleSeasonalPillClick}
                  />
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

      {/* Action-failure toast — surfaces fork errors so the user knows
          the modal closed because something went wrong, not because
          their click silently worked. */}
      {actionError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium px-5 py-3 rounded-xl shadow-xl">
          {actionError}
        </div>
      )}

      {/* Fork confirmation modal — collects optional dates before /api/.../fork */}
      <ForkTripModal
        open={!!pendingForkTrip}
        destination={pendingForkTrip?.destination ?? ''}
        tripLength={pendingForkTrip?.tripLength ?? 0}
        forking={!!forkingId && pendingForkTrip?.id === forkingId}
        onClose={() => { if (!forkingId) setPendingForkTrip(null); }}
        onSubmit={handleCommunityForkSubmit}
      />
    </div>
  );
}
