'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { currentUser, wishlistItems as mockWishlistItems } from '@/data/mock';
import { WishlistItem } from '@/lib/types';
import {
  Heart, Plus, Sparkles, Calendar, DollarSign, Search,
  MapPin, Loader2, X, ArrowRight, Check, Mountain, Waves,
  Compass, Utensils, Music, ShoppingBag, ChevronRight, Lock,
  Camera, Dumbbell, Landmark, Leaf,
} from 'lucide-react';
import Image from 'next/image';
import { usePlacesSearch } from '@/hooks/usePlacesSearch';
import { useEntitlements } from '@/hooks/useEntitlements';
import { UpgradeModal } from '@/components/UpgradeModal';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterType = 'cost' | 'season' | 'all';
type SortType = 'cost-low' | 'cost-high' | 'name';
type ModalStage = 'search' | 'generating' | 'preview';
type TravelVibe = 'adventure' | 'culture' | 'food' | 'photography' | 'nature' | 'wellness' | 'nightlife' | 'sports' | 'history' | 'shopping';

interface TripLengthOption {
  label: string;
  days: number;
  sublabel: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VIBE_OPTIONS: { id: TravelVibe; label: string; icon: React.ReactNode }[] = [
  { id: 'adventure',   label: 'Adventure',   icon: <Mountain   className="w-3.5 h-3.5" /> },
  { id: 'culture',     label: 'Culture',     icon: <Compass    className="w-3.5 h-3.5" /> },
  { id: 'food',        label: 'Food',        icon: <Utensils   className="w-3.5 h-3.5" /> },
  { id: 'photography', label: 'Photography', icon: <Camera     className="w-3.5 h-3.5" /> },
  { id: 'nature',      label: 'Nature',      icon: <Leaf       className="w-3.5 h-3.5" /> },
  { id: 'wellness',    label: 'Wellness',    icon: <Waves      className="w-3.5 h-3.5" /> },
  { id: 'nightlife',   label: 'Nightlife',   icon: <Music      className="w-3.5 h-3.5" /> },
  { id: 'sports',      label: 'Sports',      icon: <Dumbbell   className="w-3.5 h-3.5" /> },
  { id: 'history',     label: 'History',     icon: <Landmark   className="w-3.5 h-3.5" /> },
  { id: 'shopping',    label: 'Shopping',    icon: <ShoppingBag className="w-3.5 h-3.5" /> },
];

const TRIP_LENGTH_OPTIONS: TripLengthOption[] = [
  { label: 'Weekend',   days: 3,  sublabel: '2–3 days' },
  { label: 'Week',      days: 7,  sublabel: '5–7 days' },
  { label: '10 Days',   days: 10, sublabel: '9–11 days' },
  { label: 'Two Weeks', days: 14, sublabel: '12–15 days' },
];

const GENERATION_MESSAGES = [
  'Researching top experiences…',
  'Finding the best time to visit…',
  'Estimating trip costs…',
  'Pulling together highlights…',
  'Almost ready…',
];

// Unsplash cover photos keyed by destination keyword
const DESTINATION_COVERS: Record<string, string> = {
  kyoto:       'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800',
  japan:       'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800',
  tokyo:       'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800',
  bali:        'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800',
  paris:       'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800',
  france:      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800',
  barcelona:   'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800',
  spain:       'https://images.unsplash.com/photo-1543783207-ec64e4d95325?w=800',
  italy:       'https://images.unsplash.com/photo-1555992336-03a23c7b20ee?w=800',
  rome:        'https://images.unsplash.com/photo-1555992336-03a23c7b20ee?w=800',
  iceland:     'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800',
  reykjavik:   'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=800',
  morocco:     'https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=800',
  marrakech:   'https://images.unsplash.com/photo-1597212618440-806262de4f6b?w=800',
  portugal:    'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800',
  lisbon:      'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800',
  porto:       'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800',
  thailand:    'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800',
  bangkok:     'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800',
  mexico:      'https://images.unsplash.com/photo-1518638150340-f706e86654de?w=800',
  peru:        'https://images.unsplash.com/photo-1526392060635-9d6019884377?w=800',
  patagonia:   'https://images.unsplash.com/photo-1531761535209-180857e963b9?w=800',
  argentina:   'https://images.unsplash.com/photo-1531761535209-180857e963b9?w=800',
  greece:      'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800',
  santorini:   'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800',
  switzerland: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800',
  alps:        'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800',
  vietnam:     'https://images.unsplash.com/photo-1557750255-c76072a7aad1?w=800',
  colombia:    'https://images.unsplash.com/photo-1504700610630-ac6aba3536d3?w=800',
  default:     'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800',
};

function getCoverImage(destination: string): string {
  const key = destination.toLowerCase();
  for (const [word, url] of Object.entries(DESTINATION_COVERS)) {
    if (word !== 'default' && key.includes(word)) return url;
  }
  return DESTINATION_COVERS.default;
}

// Mock highlights for graceful fallback when no API key
const VIBE_HIGHLIGHTS: Record<TravelVibe, string[]> = {
  adventure:   ['Hiking top trails', 'Rock climbing & rappelling', 'White-water rafting', 'Paragliding over the valley'],
  culture:     ['UNESCO heritage site tour', 'Local cooking class', 'Museum & gallery day', 'Evening folklore performance'],
  food:        ['Street food market crawl', 'Chef\'s table dinner', 'Local winery tour', 'Morning fish market visit'],
  photography: ['Golden hour viewpoints', 'Architecture walking tour', 'Wildlife spotting & shooting', 'Sunrise summit hike'],
  nature:      ['National park day hike', 'Wildlife sanctuary visit', 'Scenic coastal walk', 'Stargazing at night'],
  wellness:    ['Rooftop infinity pools', 'Sunrise yoga sessions', 'Thermal spa day', 'Slow morning at a local café'],
  nightlife:   ['Rooftop bar sunset drinks', 'Underground club night', 'Live music venue crawl', 'Late-night food market'],
  sports:      ['Surf lesson at dawn', 'Cycling countryside routes', 'Guided kayaking tour', 'Bouldering at the crag'],
  history:     ['Guided old town walk', 'Ancient ruins day trip', 'Local history museum', 'Evening folklore performance'],
  shopping:    ['Local market browsing', 'Artisan craft district', 'Design district stroll', 'Night market haul'],
};

// ─── Add Destination Modal ────────────────────────────────────────────────────

function AddDestinationModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (item: WishlistItem) => void;
}) {
  const [stage, setStage] = useState<ModalStage>('search');
  const [destination, setDestination] = useState('');
  const [vibe, setVibe] = useState<TravelVibe>('adventure');
  const [tripDays, setTripDays] = useState<number>(7);
  const [msgIdx, setMsgIdx] = useState(0);
  const [preview, setPreview] = useState<WishlistItem | null>(null);

  const { query, setQuery, suggestions, loading } = usePlacesSearch(250);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Cycle generation messages
  useEffect(() => {
    if (stage !== 'generating') return;
    const t = setInterval(() => setMsgIdx(i => Math.min(i + 1, GENERATION_MESSAGES.length - 1)), 900);
    return () => clearInterval(t);
  }, [stage]);

  const handleGenerate = useCallback(async () => {
    if (!destination.trim()) return;
    setStage('generating');
    setMsgIdx(0);

    // Build rough start/end dates from today + tripDays for the API call
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() + 3); // plan 3 months out
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + tripDays - 1);
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    // Scale budget estimate by trip length (rough per-day rate of ~$350)
    const estimatedCost = Math.round((600 + tripDays * 350) / 50) * 50;
    const budget = estimatedCost;

    try {
      const res = await fetch('/api/generate-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination,
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          tripLength: tripDays,
          groupType: 'friends',
          priorities: [vibe],
          budget,
          budgetBreakdown: {
            flights: Math.round(budget * 0.30 / 50) * 50,
            hotel:   Math.round(budget * 0.25 / 50) * 50,
            food:    Math.round(budget * 0.20 / 50) * 50,
            experiences: Math.round(budget * 0.18 / 50) * 50,
            transport:   Math.round(budget * 0.07 / 50) * 50,
          },
          ageRanges: ['25-35'],
          accessibilityNeeds: [],
        }),
      });

      const data = await res.json();

      // Gather highlights from across multiple days for longer trips
      let highlights: string[] = VIBE_HIGHLIGHTS[vibe];
      if (res.ok && data.itinerary?.days?.length) {
        const allActivities: string[] = [];
        // Sample from day 1, middle day, and last day for variety
        const sampleDays = [0, Math.floor(data.itinerary.days.length / 2), data.itinerary.days.length - 1];
        const seen = new Set<number>();
        for (const di of sampleDays) {
          if (seen.has(di)) continue;
          seen.add(di);
          const acts = data.itinerary.days[di]?.activities ?? [];
          if (acts.length) allActivities.push(acts[0].name);
        }
        if (allActivities.length >= 2) highlights = allActivities;
      }

      const city = destination.split(',')[0].trim();
      const country = destination.includes(',') ? destination.split(',').slice(-1)[0].trim() : '';

      setPreview({
        id: `wish_${Date.now()}`,
        destination: city,
        country,
        coverImage: getCoverImage(destination),
        bestSeason: 'Year-round',
        estimatedCost,
        tags: [vibe.charAt(0).toUpperCase() + vibe.slice(1)],
        highlights,
        aiGenerated: true,
        tripDays,
      });
      setStage('preview');
    } catch {
      const city = destination.split(',')[0].trim();
      const country = destination.includes(',') ? destination.split(',').slice(-1)[0].trim() : '';
      setPreview({
        id: `wish_${Date.now()}`,
        destination: city,
        country,
        coverImage: getCoverImage(destination),
        bestSeason: 'Year-round',
        estimatedCost,
        tags: [vibe.charAt(0).toUpperCase() + vibe.slice(1)],
        highlights: VIBE_HIGHLIGHTS[vibe],
        aiGenerated: true,
        tripDays,
      });
      setStage('preview');
    }
  }, [destination, vibe, tripDays]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-600" />
            <h2 className="font-script italic font-semibold text-slate-900">
              {stage === 'search'     ? 'Add a Destination'      :
               stage === 'generating' ? 'Building your preview…' :
                                        'Here\'s a sneak peek'}
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Stage: Search ─────────────────────────────────────────────── */}
        {stage === 'search' && (
          <div className="p-6 space-y-5">
            {/* Destination search */}
            <div ref={searchRef} className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-2">Where to?</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search cities, countries, regions…"
                  value={query || destination}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setDestination(e.target.value);
                    setShowSuggestions(e.target.value.length >= 2);
                  }}
                  onFocus={() => query.length >= 2 && setShowSuggestions(true)}
                  className="w-full pl-9 pr-9 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent"
                  autoFocus
                />
                {loading
                  ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                  : destination && <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-600" />
                }
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                  {suggestions.map((s) => (
                    <button
                      key={s.placeId}
                      type="button"
                      onClick={() => {
                        setDestination(s.name);
                        setQuery(s.name);
                        setShowSuggestions(false);
                      }}
                      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-sky-50 transition-colors text-left"
                    >
                      <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-slate-900 text-sm">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.address}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Social import hint */}
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-lg">📌</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-700">Saw it on Instagram or TikTok?</p>
                <p className="text-xs text-slate-400">Pinterest sync & link import coming soon</p>
              </div>
              <span className="text-xs font-semibold text-sky-600 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full flex-shrink-0">Soon</span>
            </div>

            {/* Trip length */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">How long?</label>
              <div className="grid grid-cols-4 gap-2">
                {TRIP_LENGTH_OPTIONS.map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setTripDays(opt.days)}
                    className={`flex flex-col items-center py-2.5 px-2 rounded-xl border-2 text-center transition-all duration-150 ${
                      tripDays === opt.days
                        ? 'border-sky-600 bg-sky-50 text-sky-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <span className="text-sm font-semibold leading-tight">{opt.label}</span>
                    <span className={`text-xs mt-0.5 ${tripDays === opt.days ? 'text-sky-500' : 'text-slate-400'}`}>
                      {opt.sublabel}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Vibe selector */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">What's the vibe?</label>
              <div className="grid grid-cols-3 gap-2">
                {VIBE_OPTIONS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVibe(v.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all duration-150 ${
                      vibe === v.id
                        ? 'border-sky-600 bg-sky-50 text-sky-700'
                        : 'border-slate-200 hover:border-slate-300 text-slate-600'
                    }`}
                  >
                    <span className={vibe === v.id ? 'text-sky-600' : 'text-slate-400'}>{v.icon}</span>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={!destination.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-sky-700 to-sky-600 text-white font-semibold shadow hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Sparkles className="w-4 h-4" />
              Preview This Destination
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Stage: Generating ─────────────────────────────────────────── */}
        {stage === 'generating' && (
          <div className="p-8 flex flex-col items-center text-center space-y-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-sky-200 animate-ping opacity-25 scale-150" />
              <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-sky-700 to-green-700 flex items-center justify-center shadow-lg">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
            </div>
            <div>
              <p className="font-script italic font-semibold text-slate-900 text-lg mb-1">{destination.split(',')[0]}</p>
              <p className="text-sm text-slate-500 min-h-5 transition-all duration-300">{GENERATION_MESSAGES[msgIdx]}</p>
            </div>
            <div className="w-full max-w-xs h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-sky-600 to-green-600 rounded-full animate-pulse" style={{ width: '70%' }} />
            </div>
          </div>
        )}

        {/* ── Stage: Preview ────────────────────────────────────────────── */}
        {stage === 'preview' && preview && (
          <div className="overflow-hidden">
            {/* Cover image */}
            <div className="relative h-44">
              <Image
                src={preview.coverImage}
                alt={preview.destination}
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4">
                <h3 className="font-display font-bold text-white text-xl">{preview.destination}</h3>
                {preview.country && <p className="text-white/70 text-sm">{preview.country}</p>}
              </div>
              <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/40 backdrop-blur-sm text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                <Sparkles className="w-3 h-3" />
                AI Preview
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Highlights */}
              {preview.highlights && preview.highlights.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Top Highlights</p>
                  <ul className="space-y-1.5">
                    {preview.highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <ChevronRight className="w-3.5 h-3.5 text-sky-500 flex-shrink-0 mt-0.5" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Meta chips */}
              <div className="flex items-center gap-2 flex-wrap">
                {preview.tags.map(tag => (
                  <span key={tag} className="px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-100 rounded-full text-xs font-medium">
                    {tag}
                  </span>
                ))}
                <span className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                  <Calendar className="w-3 h-3" />
                  {tripDays} days
                </span>
                <span className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-medium">
                  <DollarSign className="w-3 h-3" />
                  ~${preview.estimatedCost.toLocaleString()} est.
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Maybe Later
                </button>
                <button
                  onClick={() => { onSave(preview); onClose(); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-sm font-semibold transition-colors"
                >
                  <Heart className="w-4 h-4" />
                  Save to Wishlist
                </button>
              </div>

              <p className="text-center text-xs text-slate-400">
                You can plan a full trip from your wishlist anytime.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tag colour helper ────────────────────────────────────────────────────────

function getTagColor(tag: string) {
  const colors: Record<string, string> = {
    Culture:     'bg-blue-100 text-blue-800',
    Food:        'bg-sky-100 text-sky-900',
    Adventure:   'bg-sky-100 text-sky-800',
    Nature:      'bg-emerald-100 text-emerald-800',
    Temples:     'bg-sky-100 text-sky-900',
    Hiking:      'bg-green-100 text-green-800',
    Markets:     'bg-rose-100 text-rose-800',
    Photography: 'bg-purple-100 text-purple-800',
    Romance:     'bg-pink-100 text-pink-800',
    Wellness:    'bg-teal-100 text-teal-800',
    Relaxed:     'bg-teal-100 text-teal-800',
    Balanced:    'bg-zinc-100 text-zinc-700',
    Foodie:      'bg-orange-100 text-orange-800',
    Nightlife:   'bg-purple-100 text-purple-800',
    Cultural:    'bg-blue-100 text-blue-800',
  };
  return colors[tag] || 'bg-zinc-100 text-zinc-800';
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WishlistPage() {
  const { hasWishlist, getUpgradePrompt } = useEntitlements();

  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortType, setSortType] = useState<SortType>('name');
  const [allItems, setAllItems] = useState<WishlistItem[]>(mockWishlistItems);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set(mockWishlistItems.map(i => i.id)));
  const [showModal, setShowModal] = useState(false);

  const handleSaveNew = (item: WishlistItem) => {
    setAllItems(prev => [...prev, item]);
    setSavedIds(prev => new Set([...Array.from(prev), item.id]));
  };

  const getFilteredAndSorted = () => {
    let filtered = Array.from(savedIds)
      .map(id => allItems.find(w => w.id === id))
      .filter(Boolean) as WishlistItem[];

    if (filterType === 'cost') {
      filtered = filtered.filter(item => item.estimatedCost < 3500);
    } else if (filterType === 'season') {
      filtered = filtered.filter(item =>
        item.bestSeason.toLowerCase().includes('mar') ||
        item.bestSeason.toLowerCase().includes('apr') ||
        item.bestSeason.toLowerCase().includes('may')
      );
    }

    if (sortType === 'cost-low')  filtered.sort((a, b) => a.estimatedCost - b.estimatedCost);
    else if (sortType === 'cost-high') filtered.sort((a, b) => b.estimatedCost - a.estimatedCost);
    else filtered.sort((a, b) => a.destination.localeCompare(b.destination));

    return filtered;
  };

  const filteredItems = getFilteredAndSorted();

  const toggleWishlist = (id: string) => {
    setSavedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Wishlist is a paid feature — show upgrade wall for free users ─────────
  if (!hasWishlist) {
    const prompt = getUpgradePrompt('feature_locked');
    return (
      <div className="flex h-screen bg-parchment">
        <Sidebar activePage="wishlist" user={currentUser} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-sm w-full text-center">
            {/* Blurred preview cards */}
            <div className="relative mb-8">
              <div className="grid grid-cols-2 gap-3 opacity-30 blur-sm pointer-events-none select-none">
                {mockWishlistItems.slice(0, 4).map(item => (
                  <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="w-full h-20 bg-gradient-to-br from-sky-100 to-emerald-100 rounded-xl mb-3" />
                    <p className="text-xs font-semibold text-zinc-700 truncate">{item.destination}</p>
                    <p className="text-[10px] text-zinc-400">{item.country}</p>
                  </div>
                ))}
              </div>
              {/* Lock overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-800 to-green-700 flex items-center justify-center shadow-xl">
                  <Lock className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <h2 className="text-xl font-bold text-zinc-900 mb-2">{prompt.headline}</h2>
            <p className="text-zinc-500 text-sm leading-relaxed mb-6">{prompt.body}</p>

            <div className="flex flex-col gap-2">
              <Link
                href="/pricing"
                className="w-full flex items-center justify-center gap-2 py-3 bg-sky-800 hover:bg-sky-900 text-white font-semibold rounded-full transition-all text-sm"
              >
                <Sparkles className="w-4 h-4" />
                {prompt.ctaLabel}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-parchment">
      <Sidebar activePage="wishlist" user={currentUser} />

      {showModal && (
        <AddDestinationModal
          onClose={() => setShowModal(false)}
          onSave={handleSaveNew}
        />
      )}

      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-sky-700 mb-3">Your Collection</p>
            <div className="flex items-center justify-between">
              <h1 className="text-4xl font-script italic font-semibold text-zinc-900">On My Radar</h1>
              <div className="bg-sky-800 text-white font-semibold px-4 py-2 rounded-full text-sm">
                {savedIds.size} saved
              </div>
            </div>
          </div>

          {/* Seasonality Alert */}
          <div className="mb-8 bg-sky-50 border border-sky-200 rounded-2xl p-4 flex items-start gap-3">
            <Calendar className="w-5 h-5 text-sky-700 flex-shrink-0 mt-1" />
            <div>
              <p className="font-semibold text-sky-900">Best time to visit Kyoto is in 3 weeks!</p>
              <p className="text-sm text-sky-900 mt-1">Spring cherry blossoms typically peak mid-April. Book your flight now for better prices.</p>
            </div>
          </div>

          {/* Filter / Sort Bar */}
          <div className="mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              {(['all', 'cost', 'season'] as FilterType[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                    filterType === f
                      ? 'bg-sky-800 text-white'
                      : 'bg-white border border-zinc-200 text-zinc-700 hover:border-sky-400'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'cost' ? 'Budget-Friendly' : 'Spring Season'}
                </button>
              ))}
            </div>
            <select
              value={sortType}
              onChange={(e) => setSortType(e.target.value as SortType)}
              className="px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-700 bg-white hover:border-sky-400 focus:ring-2 focus:ring-sky-700 transition-all"
            >
              <option value="name">Sort by Name</option>
              <option value="cost-low">Price: Low to High</option>
              <option value="cost-high">Price: High to Low</option>
            </select>
          </div>

          {/* Wishlist Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {/* Add Destination Card */}
            <button
              onClick={() => setShowModal(true)}
              className="group rounded-2xl border-2 border-dashed border-sky-300 hover:border-sky-500 bg-sky-50 hover:bg-sky-100 transition-all p-8 flex flex-col items-center justify-center min-h-80 cursor-pointer"
            >
              <div className="w-14 h-14 rounded-full bg-sky-100 group-hover:bg-sky-200 flex items-center justify-center mb-3 transition-colors">
                <Plus className="w-7 h-7 text-sky-700 group-hover:text-sky-800 transition-colors" />
              </div>
              <p className="font-semibold text-sky-900">Add Destination</p>
              <p className="text-sm text-sky-700 mt-1 text-center">Search anywhere and get an AI-powered preview</p>
              <div className="mt-4 flex items-center gap-1.5 text-xs text-sky-600 font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                AI highlights included
              </div>
            </button>

            {/* Wishlist Cards */}
            {filteredItems.map((item) => (
              <div key={item.id} className="group rounded-2xl overflow-hidden bg-white border border-zinc-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                {/* Cover */}
                <div className="relative h-52 overflow-hidden bg-zinc-100">
                  <Image
                    src={item.coverImage}
                    alt={item.destination}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <button
                    onClick={() => toggleWishlist(item.id)}
                    className="absolute top-3 right-3 p-2 rounded-full bg-white/95 hover:bg-white shadow-md transition-all"
                  >
                    <Heart className={`w-5 h-5 transition-all ${savedIds.has(item.id) ? 'fill-sky-700 text-sky-700' : 'text-zinc-400 hover:text-sky-700'}`} />
                  </button>
                  {item.aiGenerated && (
                    <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/40 backdrop-blur-sm text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                      <Sparkles className="w-3 h-3" />
                      AI
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="font-script italic text-xl text-white/90 leading-tight drop-shadow-sm">{item.destination}, {item.country}</p>
                  </div>
                </div>

                {/* Content */}
                <div className="p-4">

                  {/* Highlights (AI-generated items) */}
                  {item.highlights && item.highlights.length > 0 ? (
                    <ul className="space-y-1 mb-3">
                      {item.highlights.slice(0, 3).map((h, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-600">
                          <ChevronRight className="w-3 h-3 text-sky-400 flex-shrink-0 mt-0.5" />
                          {h}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {item.tags.map((tag) => (
                        <span key={tag} className={`px-2.5 py-1 rounded-full text-xs font-medium ${getTagColor(tag)}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <Calendar className="w-3 h-3" />
                        <span>{item.bestSeason}</span>
                      </div>
                      {item.tripDays && (
                        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                          <MapPin className="w-3 h-3" />
                          <span>{item.tripDays} days</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="font-script italic text-xl text-zinc-900">${item.estimatedCost.toLocaleString()}</span>
                      <span className="text-xs text-zinc-400">est. cost</span>
                    </div>
                  </div>

                  {/* Hover CTA */}
                  <div
                    className="mt-3 pt-3 border-t border-zinc-50 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer"
                    onClick={() => {
                      const params = new URLSearchParams({ destination: `${item.destination}, ${item.country}` });
                      if (item.tripDays) params.set('days', String(item.tripDays));
                      window.location.href = `/trip/new?${params.toString()}`;
                    }}
                  >
                    <span className="text-xs font-medium text-sky-700">Plan this trip</span>
                    <ArrowRight className="w-3.5 h-3.5 text-sky-700" />
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      </main>
    </div>
  );
}
