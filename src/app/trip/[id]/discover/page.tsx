'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Search, MapPin, Star, Clock, Plus, AlertCircle, Check, ExternalLink, ThumbsUp, ThumbsDown } from 'lucide-react';
import { MOCK_TRIP_IDS } from '@/data/mock';

interface DiscoverItem {
  id: string;
  name: string;
  category: 'experiences' | 'dining' | 'events' | 'nature' | 'sights' | 'sports';
  rating: number;
  priceRange: string;
  description: string;
  duration: string;
  difficulty: string;
  location: string;
  affiliatePartner: 'Viator' | 'Ticketmaster' | 'OpenTable' | 'Recreation.gov' | 'Booking.com';
  affiliateCommission: number;
  /** Partner-specific product/listing ID (e.g. Viator productCode, OpenTable rid).
   *  Populated by the affiliate enrichment script — empty until that runs. */
  affiliateProductId?: string;
  /** Pre-built deep link to the exact listing with affiliate tracking baked in.
   *  When present, getAffiliateUrl() uses this directly instead of building a generic URL. */
  affiliateDeepUrl?: string;
  bookable: boolean;
  imageGradient: string;
  imageUrl?: string;
  matchScore: number;
}

const discoverItems: DiscoverItem[] = [
  {
    id: 'exp_1',
    name: 'Northern Lights Photography Tour',
    category: 'experiences',
    rating: 4.8,
    priceRange: '$95–$150',
    description: 'Expert-led tour to optimal dark sky viewing locations with professional photography guidance.',
    duration: '4 hours',
    difficulty: 'Easy',
    location: 'Outside Reykjavik',
    affiliatePartner: 'Viator',
    affiliateCommission: 8,
    bookable: true,
    imageGradient: 'from-purple-400 to-indigo-600',
    imageUrl: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=640&h=360&auto=format&fit=crop&q=80',
    matchScore: 98,
  },
  {
    id: 'exp_2',
    name: 'Golden Circle Day Trip',
    category: 'experiences',
    rating: 4.7,
    priceRange: '$65–$120',
    description: 'Full-day guided tour covering Þingvellir, Geysir, and Gullfoss with lunch included.',
    duration: '8 hours',
    difficulty: 'Moderate',
    location: 'South Iceland',
    affiliatePartner: 'Viator',
    affiliateCommission: 8,
    bookable: true,
    imageGradient: 'from-amber-300 to-orange-500',
    imageUrl: 'https://images.unsplash.com/photo-1476610182048-b716b8518aae?w=640&h=360&auto=format&fit=crop&q=80',
    matchScore: 95,
  },
  {
    id: 'exp_3',
    name: 'Whale Watching Expedition',
    category: 'experiences',
    rating: 4.6,
    priceRange: '$85–$110',
    description: 'Sail from the Old Harbour seeking minke whales, dolphins, and puffins in natural habitat.',
    duration: '3 hours',
    difficulty: 'Easy',
    location: 'Reykjavik Harbor',
    affiliatePartner: 'Viator',
    affiliateCommission: 8,
    bookable: true,
    imageGradient: 'from-cyan-400 to-blue-600',
    imageUrl: 'https://images.unsplash.com/photo-1568430462989-44163eb1752f?w=640&h=360&auto=format&fit=crop&q=80',
    matchScore: 92,
  },
  {
    id: 'exp_4',
    name: 'Glacier Hiking on Sólheimajökull',
    category: 'experiences',
    rating: 4.9,
    priceRange: '$95–$140',
    description: 'Guided glacier hike with crampons, ice axes, and safety gear provided. Moderate physical demand.',
    duration: '3.5 hours',
    difficulty: 'Challenging',
    location: 'South Iceland',
    affiliatePartner: 'Viator',
    affiliateCommission: 8,
    bookable: true,
    imageGradient: 'from-blue-200 to-cyan-500',
    imageUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=640&h=360&auto=format&fit=crop&q=80',
    matchScore: 94,
  },
  {
    id: 'exp_5',
    name: 'Blue Lagoon Premium Spa',
    category: 'experiences',
    rating: 4.5,
    priceRange: '$80–$150',
    description: 'Iconic geothermal spa with mineral-rich waters, premium amenities, and one signature drink included.',
    duration: '3 hours',
    difficulty: 'Easy',
    location: 'Grindavík',
    affiliatePartner: 'Booking.com',
    affiliateCommission: 5,
    bookable: true,
    imageGradient: 'from-teal-300 to-cyan-600',
    imageUrl: 'https://images.unsplash.com/photo-1504701954957-2010ec3bcec1?w=640&h=360&auto=format&fit=crop&q=80',
    matchScore: 88,
  },
  {
    id: 'din_1',
    name: 'Grillið',
    category: 'dining',
    rating: 4.7,
    priceRange: '$$$ ($80+)',
    description: 'Upscale Icelandic cuisine with panoramic city views. Specialties: Arctic char, lamb, local seafood.',
    duration: '2 hours',
    difficulty: 'Easy',
    location: 'Hagatorg, Reykjavik',
    affiliatePartner: 'OpenTable',
    affiliateCommission: 3,
    bookable: true,
    imageGradient: 'from-red-400 to-rose-600',
    imageUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=640&h=360&auto=format&fit=crop&q=80',
    matchScore: 86,
  },
  {
    id: 'din_2',
    name: 'Bæjarins Beztu',
    category: 'dining',
    rating: 4.6,
    priceRange: '$ ($8–$15)',
    description: 'Legendary Icelandic hot dog stand since 1937. Must-try local experience with fresh toppings.',
    duration: '30 mins',
    difficulty: 'Easy',
    location: 'Old Harbor, Reykjavik',
    affiliatePartner: 'OpenTable',
    affiliateCommission: 2,
    bookable: false,
    imageGradient: 'from-yellow-400 to-orange-500',
    imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=640&h=360&auto=format&fit=crop&q=80',
    matchScore: 90,
  },
  {
    id: 'din_3',
    name: 'Dill Restaurant',
    category: 'dining',
    rating: 4.8,
    priceRange: '$$$ ($120+)',
    description: 'Michelin-starred dining featuring modern Icelandic cuisine. Tasting menu available.',
    duration: '3 hours',
    difficulty: 'Easy',
    location: 'City Center, Reykjavik',
    affiliatePartner: 'OpenTable',
    affiliateCommission: 4,
    bookable: true,
    imageGradient: 'from-slate-400 to-gray-700',
    imageUrl: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=640&h=360&auto=format&fit=crop&q=80',
    matchScore: 84,
  },
  {
    id: 'din_4',
    name: 'Fish Market',
    category: 'dining',
    rating: 4.6,
    priceRange: '$$ ($40–$80)',
    description: 'Seafood-focused restaurant with fresh catches daily. Multiple sharing boards available.',
    duration: '1.5 hours',
    difficulty: 'Easy',
    location: 'Aðalstræti, Reykjavik',
    affiliatePartner: 'OpenTable',
    affiliateCommission: 3,
    bookable: true,
    imageGradient: 'from-blue-400 to-indigo-600',
    imageUrl: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=640&h=360&auto=format&fit=crop&q=80',
    matchScore: 85,
  },
  {
    id: 'evt_1',
    name: 'Sigur Rós at Harpa Concert Hall',
    category: 'events',
    rating: 4.9,
    priceRange: '$45–$95',
    description: 'Live performance by Iceland\'s iconic post-rock band at the stunning Harpa venue.',
    duration: '2 hours',
    difficulty: 'Easy',
    location: 'Harpa, Reykjavik',
    affiliatePartner: 'Ticketmaster',
    affiliateCommission: 6,
    bookable: true,
    imageGradient: 'from-purple-500 to-pink-500',
    imageUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=640&h=360&auto=format&fit=crop&q=80',
    matchScore: 97,
  },
  {
    id: 'nat_1',
    name: 'Þingvellir National Park',
    category: 'nature',
    rating: 4.8,
    priceRange: 'Free',
    description: 'UNESCO World Heritage site. Walk between continental tectonic plates with stunning rift valley views.',
    duration: '2–3 hours',
    difficulty: 'Easy',
    location: 'East of Reykjavik',
    affiliatePartner: 'Recreation.gov',
    affiliateCommission: 0,
    bookable: false,
    imageGradient: 'from-green-400 to-emerald-600',
    imageUrl: 'https://images.unsplash.com/photo-1499244571948-7ccddb3583f1?w=640&h=360&auto=format&fit=crop&q=80',
    matchScore: 93,
  },
  {
    id: 'nat_2',
    name: 'Skógafoss Waterfall Hike',
    category: 'nature',
    rating: 4.7,
    priceRange: 'Free',
    description: 'Iconic 60-meter waterfall with a 500-step climb rewarding panoramic views and rainbows.',
    duration: '1.5 hours',
    difficulty: 'Moderate',
    location: 'South Coast',
    affiliatePartner: 'Recreation.gov',
    affiliateCommission: 0,
    bookable: false,
    imageGradient: 'from-blue-300 to-cyan-500',
    imageUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=640&h=360&auto=format&fit=crop&q=80',
    matchScore: 91,
  },
  {
    id: 'nat_3',
    name: 'Landmannalaugar Hot Springs',
    category: 'nature',
    rating: 4.6,
    priceRange: 'Free',
    description: 'Stunning high-altitude geothermal hot springs surrounded by multicolored rhyolite mountains.',
    duration: '4–5 hours',
    difficulty: 'Challenging',
    location: 'Central Highlands',
    affiliatePartner: 'Recreation.gov',
    affiliateCommission: 0,
    bookable: false,
    imageGradient: 'from-orange-400 to-red-500',
    imageUrl: 'https://images.unsplash.com/photo-1530373310011-46c7c9cf5ef3?w=640&h=360&auto=format&fit=crop&q=80',
    matchScore: 87,
  },
  {
    id: 'sports_1',
    name: 'Icelandic Horse Riding Tour',
    category: 'sports',
    rating: 4.7,
    priceRange: '$85–$150',
    description: 'Guided horseback riding on Icelandic horses across natural terrain and lava fields.',
    duration: '2–3 hours',
    difficulty: 'Moderate',
    location: 'South Iceland',
    affiliatePartner: 'Viator',
    affiliateCommission: 8,
    bookable: true,
    imageGradient: 'from-amber-500 to-orange-600',
    imageUrl: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?w=640&h=360&auto=format&fit=crop&q=80',
    matchScore: 89,
  },
];

const smartAlerts = [
  {
    id: 'alert_1',
    icon: 'Zap',
    title: 'Sigur Rós Concert Alert',
    message: 'Sigur Rós is performing at Harpa Concert Hall on Sep 17 — during your trip! Tickets from $45.',
    timestamp: '2 hours ago',
  },
  {
    id: 'alert_2',
    icon: 'Star',
    title: 'Northern Lights Forecast',
    message: 'KP5 aurora activity predicted for Sep 17. Book a photography tour to maximize your chances.',
    timestamp: '1 hour ago',
  },
  {
    id: 'alert_3',
    icon: 'AlertCircle',
    title: 'New Experience on Viator',
    message: 'Private Golden Circle tour with hidden hot spring — 95% match for your group. Limited availability.',
    timestamp: '30 mins ago',
  },
];

const categoryIcons: Record<DiscoverItem['category'], string> = {
  experiences: '🎯',
  dining: '🍽️',
  events: '🎭',
  nature: '🏔️',
  sights: '🏛️',
  sports: '⛹️',
};

type FilterCategory = 'all' | DiscoverItem['category'];
type SortOption = 'match' | 'rating' | 'price';

// MOCK_TRIP_IDS is imported from @/data/mock — single source of truth

export default function DiscoverPage({ params }: { params: { id: string } }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all');
  const [sortBy, setSortBy] = useState<SortOption>('match');
  const [bookableOnly, setBookableOnly] = useState(false);
  const [savedItems, setSavedItems] = useState<Set<string>>(new Set());
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  const [showAlerts, setShowAlerts] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [bookedItems, setBookedItems] = useState<Set<string>>(new Set());
  const [showDayPicker, setShowDayPicker] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tripDays, setTripDays] = useState<any[]>([]);
  const [addingToDay, setAddingToDay] = useState<string | null>(null); // itemId being saved
  const [addToastItem, setAddToastItem] = useState<string | null>(null); // itemId that just succeeded

  // Voting state
  const [votes, setVotes] = useState<Record<string, 'up' | 'down' | null>>({});
  const [voteCounts, setVoteCounts] = useState<Record<string, { up: number; down: number }>>({});

  const handleVote = (itemId: string, direction: 'up' | 'down') => {
    const current = votes[itemId] ?? null;
    const counts = voteCounts[itemId] ?? { up: 0, down: 0 };

    let newUp = counts.up;
    let newDown = counts.down;
    let newVote: 'up' | 'down' | null;

    if (current === direction) {
      // Clicking same button — toggle off
      newVote = null;
      if (direction === 'up') newUp = Math.max(0, newUp - 1);
      else newDown = Math.max(0, newDown - 1);
    } else {
      // Switching or first vote
      newVote = direction;
      if (direction === 'up') {
        newUp += 1;
        if (current === 'down') newDown = Math.max(0, newDown - 1);
      } else {
        newDown += 1;
        if (current === 'up') newUp = Math.max(0, newUp - 1);
      }
    }

    setVotes(prev => ({ ...prev, [itemId]: newVote }));
    setVoteCounts(prev => ({ ...prev, [itemId]: { up: newUp, down: newDown } }));
  };

  // For non-mock trips: fetch AI-generated destination recommendations
  const isMockTrip = MOCK_TRIP_IDS.has(params.id);
  const [aiItems, setAiItems] = useState<DiscoverItem[] | null>(null);
  // Start in loading state for real trips so we don't flash "No recommendations loaded yet"
  // before the async fetch even begins
  const [aiLoading, setAiLoading] = useState(!isMockTrip);
  const [aiError, setAiError] = useState(false);
  const [aiErrorDetail, setAiErrorDetail] = useState<string>('');
  const [aiDestination, setAiDestination] = useState<string>('');

  useEffect(() => {
    if (isMockTrip) return;

    // Read destination from localStorage (set by upload or new-trip flow)
    const readDestination = async () => {
      let destination = '';

      // Try Supabase first for UUID trip IDs
      const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(params.id);
      if (looksLikeUuid) {
        try {
          const res = await fetch(`/api/trips/${params.id}`);
          if (res.ok) {
            const { trip, itinerary } = await res.json();
            destination = trip.destination || '';
            // Store days so "We're doing this" can actually save to the itinerary
            if (Array.isArray(itinerary?.days)) setTripDays(itinerary.days);
          }
        } catch { /* fall through */ }
      }

      // Fallback 1: user trips registry (for upload_* IDs)
      if (!destination) {
        try {
          const userTrips = JSON.parse(localStorage.getItem('tripcoord_user_trips') || '[]');
          const found = userTrips.find((t: { id: string; destination?: string }) => t.id === params.id);
          if (found?.destination) destination = found.destination;
        } catch { /* ignore */ }
      }

      // Fallback 2: generatedTripMeta — only if it belongs to this trip
      if (!destination) {
        try {
          const storedId = localStorage.getItem('currentTripId');
          if (storedId === params.id || params.id.startsWith('upload_')) {
            const stored = localStorage.getItem('generatedTripMeta');
            if (stored) destination = JSON.parse(stored).destination || '';
          }
        } catch { /* ignore */ }
      }

      if (!destination) {
        setAiLoading(false);
        return;
      }
      setAiDestination(destination);
      setAiLoading(true);
      setAiError(false);

      try {
        const res = await fetch('/api/generate-discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destination }),
        });
        if (res.ok) {
          const { items } = await res.json();
          setAiItems(items);
        } else {
          const body = await res.json().catch(() => ({}));
          setAiErrorDetail(body.detail ?? `HTTP ${res.status}`);
          setAiError(true);
        }
      } catch (e) {
        setAiErrorDetail(e instanceof Error ? e.message : 'Network error');
        setAiError(true);
      }

      setAiLoading(false);
    };

    readDestination();
  }, [isMockTrip, params.id]);

  // Use AI items for non-mock trips; hardcoded items for mock/demo trips
  const sourceItems: DiscoverItem[] = isMockTrip ? discoverItems : (aiItems ?? []);

  const filteredItems = useMemo(() => {
    let items = sourceItems;

    if (activeCategory !== 'all') {
      items = items.filter(item => item.category === activeCategory);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
      );
    }

    if (bookableOnly) {
      items = items.filter(item => item.bookable);
    }

    items.sort((a, b) => {
      if (sortBy === 'match') {
        return b.matchScore - a.matchScore;
      } else if (sortBy === 'rating') {
        return b.rating - a.rating;
      } else {
        const getPrice = (range: string): number => {
          if (!range || range.toLowerCase().includes('free')) return -1;
          const stripped = range.trim();
          // Pure dollar-sign notation: "$" → 25, "$$" → 50, "$$$" → 75
          if (/^\$+$/.test(stripped)) return stripped.length * 25;
          // Numeric ranges like "$25-$50", "$50–$100" — use the lower bound
          const numMatch = stripped.match(/\d+/);
          if (numMatch) return parseInt(numMatch[0], 10);
          // Fallback: count leading $ signs
          const dollarMatch = stripped.match(/^\$+/);
          return dollarMatch ? dollarMatch[0].length * 25 : 999;
        };
        return getPrice(a.priceRange) - getPrice(b.priceRange);
      }
    });

    return items;
  }, [activeCategory, searchQuery, sortBy, bookableOnly, sourceItems]);

  // Save a discover item to the itinerary for the chosen day
  const addToItinerary = async (item: DiscoverItem, dayNumber: number) => {
    if (isMockTrip) {
      // Demo trip — just mark as added locally with a toast
      setAddedItems(prev => { const s = new Set(prev); s.add(item.id); return s; });
      setShowDayPicker(null);
      setAddToastItem(item.id);
      setTimeout(() => setAddToastItem(null), 2500);
      return;
    }

    setAddingToDay(item.id);
    try {
      // Get fresh days in case another edit occurred
      let days = tripDays;
      if (!days.length) {
        const res = await fetch(`/api/trips/${params.id}`);
        if (res.ok) {
          const { itinerary } = await res.json();
          days = itinerary?.days ?? [];
          setTripDays(days);
        }
      }

      const dayIndex = days.findIndex((d: { day?: number }) => d.day === dayNumber);
      if (dayIndex === -1) throw new Error(`Day ${dayNumber} not found`);

      // Build a new activity from the discover item
      const newActivity = {
        id: `disc_${item.id}_${Date.now()}`,
        dayNumber,
        timeSlot: item.category === 'dining' ? '19:00–21:00' : '14:00–16:00',
        name: item.name,
        title: item.name,
        address: item.location,
        website: null,
        isRestaurant: item.category === 'dining',
        mealType: item.category === 'dining' ? 'dinner' : null,
        track: 'shared',
        priceLevel: 2,
        description: item.description,
        costEstimate: null,
        confidence: 0.8,
        verified: false,
        packingTips: [],
        transportToNext: null,
        fromDiscover: true,
      };

      // Append to the correct day's shared track
      const updatedDays = days.map((d: { day?: number; tracks?: { shared?: unknown[] } }, i: number) => {
        if (i !== dayIndex) return d;
        return {
          ...d,
          tracks: {
            ...d.tracks,
            shared: [...(d.tracks?.shared ?? []), newActivity],
          },
        };
      });

      const patchRes = await fetch(`/api/trips/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: updatedDays }),
      });

      if (!patchRes.ok) throw new Error('Save failed');

      setTripDays(updatedDays);
      setAddedItems(prev => { const s = new Set(prev); s.add(item.id); return s; });
      setShowDayPicker(null);
      setAddToastItem(item.id);
      setTimeout(() => setAddToastItem(null), 2500);
    } catch (err) {
      console.error('[addToItinerary]', err);
    } finally {
      setAddingToDay(null);
    }
  };

  const toggleSavedItem = (id: string) => {
    const newSaved = new Set(savedItems);
    if (newSaved.has(id)) {
      newSaved.delete(id);
    } else {
      newSaved.add(id);
    }
    setSavedItems(newSaved);
  };

  const categories: Array<{ value: FilterCategory; label: string }> = [
    { value: 'all', label: 'Made For You' },
    { value: 'experiences', label: 'Experiences' },
    { value: 'dining', label: 'Dining' },
    { value: 'events', label: 'Events' },
    { value: 'nature', label: 'Nature' },
    { value: 'sports', label: 'Sports' },
  ];

  // Affiliate base URLs with tripcoord tracking codes
  // In production these would be replaced with signed partner-specific deep links
  const affiliateBaseUrls: Record<string, string> = {
    'Viator':         'https://www.viator.com',
    'Ticketmaster':   'https://www.ticketmaster.com',
    'OpenTable':      'https://www.opentable.com',
    'Recreation.gov': 'https://www.recreation.gov',
    'Booking.com':    'https://www.booking.com',
  };

  const partnerLogos: Record<string, string> = {
    'Viator':         '🎯',
    'Ticketmaster':   '🎟️',
    'OpenTable':      '🍽️',
    'Recreation.gov': '🏕️',
    'Booking.com':    '🏨',
  };

  /** Build an affiliate URL for the given item.
   *  Prefers affiliateDeepUrl (exact listing) when available;
   *  falls back to UTM-tagged homepage until the enrichment script runs. */
  const getAffiliateUrl = (item: DiscoverItem) => {
    if (item.affiliateDeepUrl) return item.affiliateDeepUrl;
    const base = affiliateBaseUrls[item.affiliatePartner] || '#';
    if (base === '#') return '#';
    const params = new URLSearchParams({
      utm_source: 'tripcoord',
      utm_medium: 'referral',
      utm_campaign: 'discover',
      utm_content: item.id,
      ref: 'tripcoord',
    });
    return `${base}?${params.toString()}`;
  };

  return (
    <div className="min-h-screen bg-parchment">
      {/* Static Compact Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-zinc-100">
        <div className="px-6 py-4 max-w-7xl mx-auto">
          {/* Title + meta row */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-script italic text-xl font-semibold text-zinc-900">
                {isMockTrip ? 'Discover Reykjavik' : `Discover ${aiDestination || '…'}`}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {aiLoading ? 'Finding the best spots…' : `Curated for your group · ${filteredItems.length} results`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-3 py-2 bg-parchment border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-700"
              >
                <option value="match">Best Match</option>
                <option value="rating">Highest Rated</option>
                <option value="price">Price: Low to High</option>
              </select>
              <label className="flex items-center gap-2 cursor-pointer text-sm whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={bookableOnly}
                  onChange={(e) => setBookableOnly(e.target.checked)}
                  className="w-4 h-4 accent-sky-800"
                />
                <span className="text-zinc-600">Bookable</span>
              </label>
            </div>
          </div>

          {/* Search + Category pills */}
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0 w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-700"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto">
              {categories.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setActiveCategory(cat.value)}
                  className={`px-4 py-2 rounded-full font-semibold transition-all whitespace-nowrap text-sm ${
                    activeCategory === cat.value
                      ? 'bg-zinc-900 text-white'
                      : 'bg-parchment border border-zinc-200 text-zinc-600 hover:border-sky-400 hover:text-zinc-900'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
              {(searchQuery || activeCategory !== 'all' || bookableOnly) && (
                <button
                  onClick={() => { setSearchQuery(''); setActiveCategory('all'); setBookableOnly(false); }}
                  className="px-3 py-2 text-xs text-sky-700 hover:text-sky-800 font-medium whitespace-nowrap"
                >
                  Clear ✕
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Smart Alerts Panel — only shown for mock trips (alerts are Iceland-specific) */}
      {showAlerts && isMockTrip && (
        <div className="bg-white border-b border-zinc-100 px-6 py-4">
          <div className="max-w-7xl mx-auto">
            <h3 className="font-semibold text-zinc-900 mb-3">Smart Alerts</h3>
            <div className="space-y-3">
              {smartAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-3 p-4 bg-sky-50 rounded-2xl border border-sky-200">
                  <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0 text-lg">
                    {alert.icon === 'Zap' && '⚡'}
                    {alert.icon === 'Star' && '⭐'}
                    {alert.icon === 'AlertCircle' && '🔔'}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-zinc-900 text-sm">{alert.title}</p>
                    <p className="text-sm text-zinc-700 mt-0.5">{alert.message}</p>
                    <p className="text-xs text-zinc-500 mt-1">{alert.timestamp}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="px-6 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Loading state while AI generates destination recommendations */}
          {!isMockTrip && aiLoading && (
            <div className="text-center py-20">
              <div className="w-14 h-14 bg-sky-800 rounded-2xl flex items-center justify-center shadow-lg animate-pulse mx-auto mb-4">
                <span className="text-white font-bold text-2xl">t</span>
              </div>
              <p className="text-sm font-semibold uppercase tracking-widest text-sky-700 mb-2">AI Recommendations</p>
              <p className="text-lg font-bold text-zinc-900">Finding things to do in {aiDestination}…</p>
              <p className="text-sm text-zinc-400 mt-1">Pulling local experiences, dining, and hidden gems</p>
            </div>
          )}
          {!isMockTrip && !aiLoading && aiItems === null && (
            <div className="text-center py-16">
              <p className="text-3xl mb-3">{aiError ? '⚠️' : '🗺️'}</p>
              <p className="text-zinc-700 font-semibold">
                {aiError ? 'Couldn\'t load recommendations' : 'No recommendations loaded yet.'}
              </p>
              <p className="text-sm text-zinc-400 mt-1">
                {aiError
                  ? 'Something went wrong generating AI picks. Try again below.'
                  : 'Try navigating back to your itinerary and returning here.'}
              </p>
              {aiErrorDetail && (
                <p className="mt-2 text-xs text-zinc-400 font-mono bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 max-w-md mx-auto break-all">{aiErrorDetail}</p>
              )}
              {aiError && aiDestination && (
                <button
                  onClick={() => {
                    setAiError(false);
                    setAiErrorDetail('');
                    setAiLoading(true);
                    fetch('/api/generate-discover', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ destination: aiDestination }),
                    })
                      .then(async r => {
                        if (r.ok) return r.json();
                        const body = await r.json().catch(() => ({}));
                        setAiErrorDetail(body.detail ?? `HTTP ${r.status}`);
                        return Promise.reject();
                      })
                      .then(({ items }) => setAiItems(items))
                      .catch(() => setAiError(true))
                      .finally(() => setAiLoading(false));
                  }}
                  className="mt-4 px-5 py-2.5 bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold rounded-full transition-colors"
                >
                  Try Again
                </button>
              )}
            </div>
          )}
          {(isMockTrip || (!aiLoading && aiItems !== null)) && (filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-2xl mb-2">🌵</p>
              <p className="text-zinc-600 font-semibold">Tumbleweeds. Try a different filter.</p>
            </div>
          ) : (
            <>
              {/* Activity Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                {filteredItems.map((item) => (
                  <div key={item.id} className="bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col group">
                    {/* Photo / Gradient header */}
                    <div className={`relative h-44 overflow-hidden rounded-t-2xl bg-gradient-to-br ${item.imageGradient}`}>
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="absolute inset-0 w-full h-full object-cover"
                          loading="lazy"
                        />
                      )}
                      {!item.imageUrl && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-6xl">{categoryIcons[item.category]}</span>
                        </div>
                      )}
                      {/* Permanent subtle bottom gradient for text legibility */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                      {/* Category badge */}
                      <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-1 bg-black/40 backdrop-blur-sm text-white text-xs font-semibold rounded-full">
                        <span>{categoryIcons[item.category]}</span>
                        {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                      </span>
                      {/* Match score badge */}
                      {item.matchScore >= 90 && (
                        <span className="absolute top-3 right-3 inline-flex items-center px-2.5 py-1 bg-green-700/90 backdrop-blur-sm text-white text-xs font-bold rounded-full">
                          {item.matchScore}% match
                        </span>
                      )}
                      {/* Hover: Add to Itinerary button */}
                      <div className="absolute inset-0 flex items-end justify-center pb-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => setShowDayPicker(showDayPicker === item.id ? null : item.id)}
                          className="bg-sky-800 hover:bg-sky-900 text-white font-semibold px-5 py-2.5 rounded-full inline-flex items-center gap-2 transition-all shadow-lg"
                        >
                          <Plus className="w-4 h-4" />
                          We're Doing This
                        </button>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1">
                          <h3 className="font-script italic font-semibold text-zinc-900 text-lg line-clamp-2">{item.name}</h3>
                          <div className="flex items-center gap-1 mt-2">
                            <Star className="w-4 h-4 text-sky-600 fill-current" />
                            <span className="font-semibold text-zinc-900 text-sm">{item.rating}</span>
                            <span className="text-zinc-500 text-sm">|</span>
                            <span className="text-sky-700 font-semibold text-sm">{item.priceRange}</span>
                          </div>
                        </div>
                        {/* Yay / Nay voting */}
                        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                          <button
                            onClick={() => handleVote(item.id, 'up')}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                              votes[item.id] === 'up'
                                ? 'bg-emerald-500 text-white shadow-sm'
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            }`}
                            title="Yay — I want to do this"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                            {(voteCounts[item.id]?.up ?? 0) > 0 && (
                              <span>{voteCounts[item.id].up}</span>
                            )}
                          </button>
                          <button
                            onClick={() => handleVote(item.id, 'down')}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                              votes[item.id] === 'down'
                                ? 'bg-rose-500 text-white shadow-sm'
                                : 'bg-rose-50 text-rose-500 hover:bg-rose-100'
                            }`}
                            title="Nay — not for me"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                            {(voteCounts[item.id]?.down ?? 0) > 0 && (
                              <span>{voteCounts[item.id].down}</span>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-zinc-600 mb-4 line-clamp-2 flex-1">{item.description}</p>

                      {/* Details */}
                      <div className="flex items-center gap-3 text-xs text-zinc-600 mb-4">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {item.duration}
                        </span>
                        <span>•</span>
                        <span>{item.difficulty}</span>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2 mt-auto">
                        <button
                          onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                          className="flex-1 px-3 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg font-medium text-sm transition-colors"
                        >
                          Tell Me More
                        </button>
                        {item.bookable && (
                          <a
                            href={getAffiliateUrl(item)}
                            target="_blank"
                            rel="noopener noreferrer sponsored"
                            className="flex-1 px-3 py-2.5 bg-zinc-900 hover:bg-black text-white rounded-lg font-medium text-sm transition-colors text-center flex items-center justify-center gap-1.5"
                            title={`Book on ${item.affiliatePartner}`}
                          >
                            <span>{partnerLogos[item.affiliatePartner]}</span>
                            <span>Lock It In</span>
                            <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                          </a>
                        )}
                        <button
                          onClick={() => setShowDayPicker(showDayPicker === item.id ? null : item.id)}
                          className={`px-3 py-2.5 rounded-lg transition-colors ${
                            addedItems.has(item.id)
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                          }`}
                          title="Add to itinerary"
                        >
                          {addedItems.has(item.id) ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                        </button>
                      </div>

                      {showDayPicker === item.id && (
                        <div className="p-3 bg-parchment border-t border-zinc-200 mt-3 rounded-lg">
                          <p className="text-xs font-semibold text-zinc-700 mb-2">Add to which day?</p>
                          <div className="flex flex-wrap gap-2">
                            {(tripDays.length > 0 ? tripDays : Array.from({ length: 7 }, (_, i) => ({ day: i + 1 }))).map((d: { day?: number }) => (
                              <button
                                key={d.day}
                                disabled={addingToDay === item.id}
                                onClick={() => addToItinerary(item, d.day ?? 1)}
                                className="px-3 py-1.5 bg-sky-100 hover:bg-sky-200 text-sky-800 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                              >
                                {addingToDay === item.id ? '…' : `Day ${d.day}`}
                              </button>
                            ))}
                          </div>
                          <p className="text-xs text-zinc-500 mt-2">This activity will be appended to the selected day. The trip organizer may need to manually adjust the schedule to fit it in.</p>
                        </div>
                      )}
                    </div>

                    {/* Expanded Details */}
                    {expandedItem === item.id && (
                      <div className="border-t border-zinc-200 p-5 bg-parchment space-y-4">
                        <div>
                          <h4 className="font-semibold text-zinc-900 mb-2">Full Description</h4>
                          <p className="text-sm text-zinc-700">{item.description}</p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs font-medium text-zinc-600 uppercase tracking-wide">Duration</p>
                            <p className="text-sm font-semibold text-zinc-900">{item.duration}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-zinc-600 uppercase tracking-wide">Difficulty</p>
                            <p className="text-sm font-semibold text-zinc-900">{item.difficulty}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-zinc-600 uppercase tracking-wide">Location</p>
                            <p className="text-sm font-semibold text-zinc-900 flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              {item.location}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-zinc-600 uppercase tracking-wide">Price</p>
                            <p className="text-sm font-semibold text-zinc-900">{item.priceRange}</p>
                          </div>
                        </div>

                        <div className="bg-white rounded-lg p-3 border border-zinc-200">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-base">{partnerLogos[item.affiliatePartner]}</span>
                            <p className="text-xs font-semibold text-zinc-700 uppercase tracking-wide">
                              {item.affiliatePartner}
                            </p>
                            {item.affiliateCommission > 0 && (
                              <span className="ml-auto text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                {item.affiliateCommission}% supports tripcoord
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500">
                            {item.affiliateCommission > 0
                              ? `Booking via ${item.affiliatePartner} earns tripcoord a referral commission at no extra cost to you.`
                              : `No booking required — free entry or self-directed activity.`}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowDayPicker(showDayPicker === item.id ? null : item.id)}
                            className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                              addedItems.has(item.id)
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-sky-800 hover:bg-sky-900 text-white'
                            }`}
                          >
                            <span>{addedItems.has(item.id) ? "✓ Added to Plan" : "We're Doing This"}</span>
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleSavedItem(item.id)}
                            className={`flex-1 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                              savedItems.has(item.id)
                                ? 'bg-zinc-200 text-zinc-700 border border-zinc-300 hover:bg-zinc-300'
                                : 'border border-zinc-300 hover:bg-parchment text-zinc-600'
                            }`}
                          >
                            {savedItems.has(item.id) ? '✓ Saved' : 'Maybe Later'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ))}

          {/* Affiliate disclosure */}
          <div className="mt-12 pt-6 border-t border-zinc-200">
            <div className="flex items-start gap-3 p-4 bg-zinc-50 rounded-xl border border-zinc-200">
              <span className="text-lg flex-shrink-0">🤝</span>
              <p className="text-xs text-zinc-500 leading-relaxed">
                <span className="font-semibold text-zinc-600">Affiliate disclosure:</span> Some &ldquo;Lock It In&rdquo; links are affiliate links — when you book through them tripcoord earns a small referral commission from our partners (Viator, OpenTable, Ticketmaster, Booking.com) at{' '}
                <span className="font-medium">no extra cost to you</span>. Commissions help keep tripcoord free. We only surface experiences our algorithm rates highly for your group.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Success toast — "Added to Day X" */}
      {addToastItem && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-emerald-700 text-white text-sm font-semibold px-5 py-3 rounded-full shadow-lg animate-fade-in">
          <Check className="w-4 h-4" />
          Added to your itinerary!
        </div>
      )}
    </div>
  );
}
