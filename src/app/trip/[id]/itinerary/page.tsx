'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { itineraryDays, trips } from '@/data/mock';
import { Activity, TransportLeg } from '@/lib/types';
import { usePlacesSearch, PlaceDetails } from '@/hooks/usePlacesSearch';
import {
  Plus,
  Cloud,
  CloudRain,
  Sun,
  Wind,
  MapPin,
  ExternalLink,
  Clock,
  Utensils,
  Star,
  Search,
  Loader2,
  X,
  CheckCircle2,
  ThumbsUp,
  ThumbsDown,
  Languages,
  Sparkles,
  Car,
  Bus,
  TrainFront,
  Compass,
  ChevronDown,
  ChevronUp,
  Hash,
  Users,
  DollarSign,
  AlertCircle,
  Camera,
  Backpack,
  Flag,
  Pencil,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { TripStoryModal } from '@/components/TripStoryModal';
import { ParseTransportModal } from '@/components/ParseTransportModal';
import { MapView } from '@/components/MapView';
import { UpgradeModal, LockBadge } from '@/components/UpgradeModal';
import { useEntitlements } from '@/hooks/useEntitlements';
import { Map } from 'lucide-react';

// ─── Transport helpers ────────────────────────────────────────────────────────

const transportConfig: Record<
  TransportLeg['type'],
  { icon: React.ReactNode; label: string; dotColor: string; badgeBg: string; badgeText: string; borderColor: string }
> = {
  car_rental: {
    icon: <Car className="w-4 h-4" />,
    label: 'Car Rental',
    dotColor: 'bg-amber-400',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    borderColor: 'border-amber-200',
  },
  bus: {
    icon: <Bus className="w-4 h-4" />,
    label: 'Bus / Coach',
    dotColor: 'bg-indigo-400',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-700',
    borderColor: 'border-indigo-200',
  },
  train: {
    icon: <TrainFront className="w-4 h-4" />,
    label: 'Train',
    dotColor: 'bg-emerald-400',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    borderColor: 'border-emerald-200',
  },
  excursion: {
    icon: <Compass className="w-4 h-4" />,
    label: 'Excursion Pickup',
    dotColor: 'bg-rose-400',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-700',
    borderColor: 'border-rose-200',
  },
};

function TransportCard({ leg }: { leg: TransportLeg }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = transportConfig[leg.type];
  const hasDetails = !!(leg.operator || leg.confirmationRef || leg.notes || leg.carClass || leg.fromStation || leg.toStation || leg.platform || leg.seatInfo || leg.costPerPerson);

  return (
    <div className={`bg-white rounded-2xl border ${cfg.borderColor} shadow-sm overflow-hidden`}>
      {/* Main row */}
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`flex-shrink-0 ${cfg.badgeBg} ${cfg.badgeText} p-1.5 rounded-lg`}>
              {cfg.icon}
            </span>
            <div className="min-w-0">
              <span className={`text-[10px] font-bold uppercase tracking-wide ${cfg.badgeText}`}>{cfg.label}</span>
              <p className="text-zinc-900 font-bold text-sm leading-snug truncate">{leg.destination}</p>
            </div>
          </div>
          {hasDetails && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex-shrink-0 p-1.5 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
              aria-label={expanded ? 'Collapse details' : 'Expand details'}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* Meet time + meeting point */}
        <div className="flex flex-col gap-1.5">
          {leg.meetTime && (
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0" />
              <p className="text-xs font-semibold text-zinc-700">
                Meet at <span className="text-zinc-900">{leg.meetTime}</span>
              </p>
            </div>
          )}
          <div className="flex items-start gap-2">
            <MapPin className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-500">{leg.meetingPoint}</p>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0" />
            <p className="text-xs text-zinc-500">
              Departs <span className="font-semibold text-zinc-700">{leg.departureTime}</span>
              {leg.duration && <span className="text-zinc-400"> · {leg.duration}</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Expandable details */}
      {expanded && hasDetails && (
        <div className={`border-t ${cfg.borderColor} px-4 py-3 bg-zinc-50 flex flex-col gap-2`}>
          {leg.operator && (
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wide w-20 flex-shrink-0">Operator</span>
              <span className="text-zinc-700 text-xs font-medium">{leg.operator}</span>
            </div>
          )}
          {leg.carClass && (
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wide w-20 flex-shrink-0">Vehicle</span>
              <span className="text-zinc-700 text-xs font-medium">{leg.carClass}</span>
            </div>
          )}
          {(leg.fromStation || leg.toStation) && (
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wide w-20 flex-shrink-0">Route</span>
              <span className="text-zinc-700 text-xs font-medium">
                {leg.fromStation}{leg.fromStation && leg.toStation ? ' → ' : ''}{leg.toStation}
              </span>
            </div>
          )}
          {leg.platform && (
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wide w-20 flex-shrink-0">Platform</span>
              <span className="text-zinc-700 text-xs font-medium">{leg.platform}</span>
            </div>
          )}
          {leg.seatInfo && (
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wide w-20 flex-shrink-0">Seat</span>
              <span className="text-zinc-700 text-xs font-medium">{leg.seatInfo}</span>
            </div>
          )}
          {leg.confirmationRef && (
            <div className="flex items-center gap-2">
              <Hash className="w-3 h-3 text-zinc-300 flex-shrink-0" />
              <span className="text-zinc-500 text-xs">Ref:</span>
              <span className="text-zinc-800 text-xs font-mono font-semibold tracking-wide">{leg.confirmationRef}</span>
            </div>
          )}
          {leg.costPerPerson !== undefined && (
            <div className="flex items-center gap-2">
              <DollarSign className="w-3 h-3 text-zinc-300 flex-shrink-0" />
              <span className="text-zinc-700 text-xs font-medium">${leg.costPerPerson} per person</span>
            </div>
          )}
          {leg.notes && (
            <div className="flex items-start gap-2 pt-1">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-zinc-500 text-xs leading-relaxed">{leg.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Price level → symbol
const priceLevelLabel = (level?: number) => {
  if (level === undefined || level === null) return null;
  return ['Free', '$', '$$', '$$$', '$$$$'][level] ?? null;
};

// Star rating display
function StarRating({ rating, reviewCount }: { rating: number; reviewCount?: number }) {
  return (
    <div className="flex items-center gap-1">
      <Star className="w-3.5 h-3.5 fill-sky-600 text-sky-600" />
      <span className="text-xs font-semibold text-zinc-700">{rating.toFixed(1)}</span>
      {reviewCount !== undefined && (
        <span className="text-xs text-zinc-400">({reviewCount.toLocaleString()})</span>
      )}
    </div>
  );
}

export default function ItineraryPage() {
  const params = useParams<{ id: string }>();
  const tripPageId = params?.id ?? '';
  const [selectedDay, setSelectedDay] = useState(1);
  const [activityAdded, setActivityAdded] = useState(false);
  const [activityDeleted, setActivityDeleted] = useState(false);
  const [showAddActivityModal, setShowAddActivityModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [suggestingActivityId, setSuggestingActivityId] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [showParseModal, setShowParseModal] = useState(false);
  const [showMapView, setShowMapView] = useState(false);
  const [upgradePromptKey, setUpgradePromptKey] = useState<'feature_locked' | 'no_ai' | null>(null);

  const { hasTripStory, hasTransportParser, getUpgradePrompt } = useEntitlements();

  // Extra transport legs added live via the parser (keyed by day number)
  const [addedTransport, setAddedTransport] = useState<Record<number, TransportLeg[]>>({});

  const handleTransportAdded = useCallback((leg: TransportLeg) => {
    setAddedTransport(prev => ({
      ...prev,
      [selectedDay]: [...(prev[selectedDay] ?? []), leg],
    }));
  }, [selectedDay]);

  // Voting: { [activityId]: { up: number, down: number, myVote: 'up'|'down'|null } }
  const [votes, setVotes] = useState<Record<string, { up: number; down: number; myVote: 'up' | 'down' | null }>>({});

  const handleVote = (activityId: string, direction: 'up' | 'down') => {
    setVotes(prev => {
      const current = prev[activityId] ?? { up: 0, down: 0, myVote: null };
      // Toggle off if same vote
      if (current.myVote === direction) {
        return {
          ...prev,
          [activityId]: {
            up: direction === 'up' ? current.up - 1 : current.up,
            down: direction === 'down' ? current.down - 1 : current.down,
            myVote: null,
          },
        };
      }
      // Switch vote
      return {
        ...prev,
        [activityId]: {
          up: direction === 'up' ? current.up + 1 : (current.myVote === 'up' ? current.up - 1 : current.up),
          down: direction === 'down' ? current.down + 1 : (current.myVote === 'down' ? current.down - 1 : current.down),
          myVote: direction,
        },
      };
    });
  };

  // AI-generated itinerary (loaded from localStorage if available)
  const [aiDays, setAiDays] = useState<typeof itineraryDays | null>(null);
  const [aiMeta, setAiMeta] = useState<{
    destination?: string; startDate?: string; endDate?: string;
    budget?: number; budgetBreakdown?: Record<string, number>;
    groupType?: string;
    isCruise?: boolean; cruiseLine?: string;
    bookedHotels?: Array<{ name: string; address?: string; checkIn?: string; checkOut?: string }>;
    hotelSuggestions?: Array<{
      name: string; address?: string; neighborhood?: string;
      pricePerNight?: number; priceLevel?: number;
      whyRecommended?: string; bookingUrl?: string;
    }>;
    practicalNotes?: {
      currency?: string; tipping?: string; customs?: string; entryRequirements?: string;
    };
  } | null>(null);
  const [showAiBanner, setShowAiBanner] = useState(false);

  useEffect(() => {
    const load = async () => {
      // 1. Try Supabase first using the CURRENT PAGE's trip ID (from the URL)
      const looksLikeUuid = tripPageId && /^[0-9a-f-]{36}$/i.test(tripPageId);
      if (looksLikeUuid) {
        try {
          const res = await fetch(`/api/trips/${tripPageId}`);
          if (res.ok) {
            const { itinerary } = await res.json();
            if (Array.isArray(itinerary.days) && itinerary.days.length > 0) {
              setAiDays(itinerary.days);
              setShowAiBanner(true);
              if (itinerary.meta) setAiMeta(itinerary.meta);
              return;
            }
          }
        } catch {
          // Supabase load failed — fall through to localStorage
        }
      }

      // 2. localStorage fallback — ONLY if the stored generated trip matches THIS page's trip ID
      try {
        const storedCurrentId = typeof window !== 'undefined'
          ? localStorage.getItem('currentTripId')
          : null;
        // Use localStorage data only for the specific trip it belongs to
        const idMatches = !storedCurrentId || storedCurrentId === tripPageId
          || tripPageId.startsWith('upload_'); // upload_ IDs are always localStorage-only
        if (!idMatches) return; // Wrong trip — don't bleed another trip's data in

        const stored = localStorage.getItem('generatedItinerary');
        const meta = localStorage.getItem('generatedTripMeta');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAiDays(parsed);
            setShowAiBanner(true);
            if (meta) setAiMeta(JSON.parse(meta));
          }
        }
      } catch {
        // localStorage unavailable or invalid JSON — use mock data
      }
    };
    load();
  }, [tripPageId]);

  const clearAiItinerary = useCallback(() => {
    localStorage.removeItem('generatedItinerary');
    localStorage.removeItem('generatedTripMeta');
    localStorage.removeItem('currentTripId');
    setAiDays(null);
    setAiMeta(null);
    setShowAiBanner(false);
    setSelectedDay(1);
  }, []);

  // Form state
  const [newActivityName, setNewActivityName] = useState('');
  const [newActivityAddress, setNewActivityAddress] = useState('');
  const [newActivityWebsite, setNewActivityWebsite] = useState('');
  const [newActivityStartTime, setNewActivityStartTime] = useState('');
  const [newActivityEndTime, setNewActivityEndTime] = useState('');
  const [newActivityTrack, setNewActivityTrack] = useState<'shared' | 'track_a' | 'track_b'>('shared');
  const [newActivityIsRestaurant, setNewActivityIsRestaurant] = useState(false);
  const [newActivityIsPrivate, setNewActivityIsPrivate] = useState(false);
  const [newActivityDay, setNewActivityDay] = useState(1);

  // Place enrichment state
  const [selectedPlace, setSelectedPlace] = useState<PlaceDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const { query, setQuery, suggestions, loading: searchLoading, fetchDetails, clearSearch } = usePlacesSearch(300);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelectPlace = async (placeId: string, name: string) => {
    setNewActivityName(name);
    setQuery(name);
    setShowSuggestions(false);
    setLoadingDetails(true);

    const details = await fetchDetails(placeId);
    if (details) {
      setSelectedPlace(details);
      if (details.address) setNewActivityAddress(details.address);
      if (details.website) setNewActivityWebsite(details.website);
      // Auto-detect restaurant
      if (details.types?.some(t => ['restaurant', 'food', 'cafe', 'bar'].includes(t))) {
        setNewActivityIsRestaurant(true);
      }
    }
    setLoadingDetails(false);
  };

  const resetModal = () => {
    setNewActivityName('');
    setNewActivityAddress('');
    setNewActivityWebsite('');
    setNewActivityStartTime('');
    setNewActivityEndTime('');
    setNewActivityTrack('shared');
    setNewActivityIsRestaurant(false);
    setNewActivityIsPrivate(false);
    setNewActivityDay(selectedDay);
    setSelectedPlace(null);
    clearSearch();
    setShowSuggestions(false);
  };

  const handleCloseModal = () => {
    setShowAddActivityModal(false);
    setEditingActivity(null);
    resetModal();
  };

  // ─── Derived state — declared early so callbacks below can reference them ────
  const activeDays = aiDays ?? itineraryDays;
  const trip = aiMeta
    ? { ...trips[0], destination: aiMeta.destination || trips[0].destination,
        budgetBreakdown: (aiMeta.budgetBreakdown as unknown as typeof trips[0]['budgetBreakdown']) ?? trips[0].budgetBreakdown,
        budgetTotal: aiMeta.budget ?? trips[0].budgetTotal }
    : (trips.find(t => t.id === 'trip_1') || trips[0]);
  const currentDayData = activeDays.find((d: { day: number }) => d.day === selectedDay) || activeDays[0];

  // ─── Persist updated days to state + localStorage + Supabase ─────────────────
  const persistDays = useCallback((updated: typeof itineraryDays) => {
    setAiDays(updated);
    try { localStorage.setItem('generatedItinerary', JSON.stringify(updated)); } catch { /* ignore */ }

    // Fire-and-forget sync to Supabase — use the URL trip ID directly so this
    // works regardless of whether localStorage has 'currentTripId' set (e.g. on
    // direct navigation via bookmark or dashboard link).
    const tripId = params.id;
    if (tripId && /^[0-9a-f-]{36}$/i.test(tripId)) {
      fetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: updated }),
      }).catch(() => { /* non-critical — localStorage is the source of truth */ });
    }
  }, [params.id]);

  // ─── Save activity (add new or update existing) ──────────────────────────────
  const handleSubmit = () => {
    const timeSlot = newActivityStartTime && newActivityEndTime
      ? `${newActivityStartTime}–${newActivityEndTime}`
      : newActivityStartTime
      ? `${newActivityStartTime}–${newActivityStartTime}`
      : '12:00–13:00';

    const targetDay = editingActivity ? newActivityDay : selectedDay;

    const savedActivity: Activity = {
      id: editingActivity?.id ?? `act_d${targetDay}_${Date.now()}`,
      dayNumber: targetDay,
      timeSlot,
      name: newActivityName,
      title: newActivityName,
      address: newActivityAddress || undefined,
      website: newActivityWebsite || undefined,
      isRestaurant: newActivityIsRestaurant,
      isPrivate: newActivityIsPrivate,
      track: newActivityTrack,
      priceLevel: selectedPlace?.priceLevel ?? (newActivityIsRestaurant ? 2 : 1),
      description: '',
      costEstimate: 0,
      confidence: 1,
      verified: !!selectedPlace,
      packingTips: [],
      rating: selectedPlace?.rating,
      reviewCount: selectedPlace?.reviewCount,
      googleVerified: !!selectedPlace,
    };

    const isMoving = editingActivity && editingActivity.dayNumber !== targetDay;

    const updatedDays = (activeDays as typeof itineraryDays).map(day => {
      if (editingActivity && !isMoving && day.day === targetDay) {
        // Same-day edit: replace in place
        return {
          ...day,
          tracks: {
            shared: day.tracks.shared.map((a: Activity) => a.id === editingActivity.id ? savedActivity : a),
            track_a: day.tracks.track_a.map((a: Activity) => a.id === editingActivity.id ? savedActivity : a),
            track_b: day.tracks.track_b.map((a: Activity) => a.id === editingActivity.id ? savedActivity : a),
          },
        };
      }
      if (isMoving && day.day === editingActivity!.dayNumber) {
        // Remove from old day
        return {
          ...day,
          tracks: {
            shared: day.tracks.shared.filter((a: Activity) => a.id !== editingActivity!.id),
            track_a: day.tracks.track_a.filter((a: Activity) => a.id !== editingActivity!.id),
            track_b: day.tracks.track_b.filter((a: Activity) => a.id !== editingActivity!.id),
          },
        };
      }
      if (day.day === targetDay && (isMoving || !editingActivity)) {
        // Add to target day (new activity or moved activity)
        return {
          ...day,
          tracks: {
            ...day.tracks,
            [newActivityTrack]: [...(day.tracks[newActivityTrack as keyof typeof day.tracks] as Activity[] ?? []), savedActivity],
          },
        };
      }
      return day;
    });

    persistDays(updatedDays as typeof itineraryDays);
    setShowAddActivityModal(false);
    setEditingActivity(null);
    setActivityAdded(true);
    setTimeout(() => setActivityAdded(false), 2500);
    resetModal();
  };

  // ─── Open modal pre-filled for editing ───────────────────────────────────────
  const handleEditActivity = useCallback((activity: Activity) => {
    setEditingActivity(activity);
    setNewActivityName(activity.name || activity.title || '');
    setNewActivityAddress(activity.address || '');
    setNewActivityWebsite(activity.website || '');
    const [start, end] = (activity.timeSlot ?? '').split(/–|—/);
    setNewActivityStartTime(start?.trim() ?? '');
    setNewActivityEndTime(end?.trim() ?? '');
    setNewActivityTrack((activity.track as 'shared' | 'track_a' | 'track_b') ?? 'shared');
    setNewActivityIsRestaurant(activity.isRestaurant ?? false);
    setNewActivityIsPrivate(activity.isPrivate ?? false);
    setNewActivityDay(activity.dayNumber ?? selectedDay);
    setShowAddActivityModal(true);
  }, [selectedDay]);

  // ─── Delete activity ──────────────────────────────────────────────────────────
  const handleDeleteActivity = useCallback((activityId: string) => {
    const updatedDays = (activeDays as typeof itineraryDays).map(day => {
      if (day.day !== selectedDay) return day;
      return {
        ...day,
        tracks: {
          shared: day.tracks.shared.filter((a: Activity) => a.id !== activityId),
          track_a: day.tracks.track_a.filter((a: Activity) => a.id !== activityId),
          track_b: day.tracks.track_b.filter((a: Activity) => a.id !== activityId),
        },
      };
    });
    persistDays(updatedDays as typeof itineraryDays);
    setActivityDeleted(true);
    setTimeout(() => setActivityDeleted(false), 2500);
  }, [activeDays, selectedDay, persistDays]);

  // ─── AI: suggest a replacement activity ──────────────────────────────────────
  const handleSuggestAnother = useCallback(async (activity: Activity) => {
    setSuggestingActivityId(activity.id);
    setSuggestError(null);
    try {
      const res = await fetch('/api/suggest-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: trip.destination,
          dayNumber: selectedDay,
          date: currentDayData.date,
          mealType: (activity as Activity & { mealType?: string }).mealType ?? null,
          isRestaurant: activity.isRestaurant ?? false,
          existingActivityName: activity.name || activity.title,
          timeSlot: activity.timeSlot,
          track: activity.track,
          budget: aiMeta?.budget,
          budgetBreakdown: aiMeta?.budgetBreakdown,
          isCruise: aiMeta?.isCruise ?? false,
          cruiseLine: aiMeta?.cruiseLine ?? '',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.activity) throw new Error(data.message || 'No suggestion returned');

      const replacement: Activity = { ...data.activity, id: activity.id, track: activity.track };
      const updatedDays = (activeDays as typeof itineraryDays).map(day => {
        if (day.day !== selectedDay) return day;
        return {
          ...day,
          tracks: {
            shared: day.tracks.shared.map((a: Activity) => a.id === activity.id ? replacement : a),
            track_a: day.tracks.track_a.map((a: Activity) => a.id === activity.id ? replacement : a),
            track_b: day.tracks.track_b.map((a: Activity) => a.id === activity.id ? replacement : a),
          },
        };
      });
      persistDays(updatedDays as typeof itineraryDays);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Could not get suggestion');
      setTimeout(() => setSuggestError(null), 3000);
    } finally {
      setSuggestingActivityId(null);
    }
  }, [activeDays, selectedDay, currentDayData, trip, aiMeta, persistDays]);

  // activeDays / trip / currentDayData declared earlier (above persistDays) so callbacks can use them

  const weatherData: Record<number, { icon: React.ReactNode; temp: number; condition: string }> = {
    1: { icon: <Cloud className="w-8 h-8" />, temp: 54, condition: 'Partly Cloudy' },
    2: { icon: <Sun className="w-8 h-8" />, temp: 57, condition: 'Sunny' },
    3: { icon: <CloudRain className="w-8 h-8" />, temp: 50, condition: 'Rainy' },
    4: { icon: <Cloud className="w-8 h-8" />, temp: 52, condition: 'Overcast' },
    5: { icon: <Wind className="w-8 h-8" />, temp: 48, condition: 'Windy' },
  };
  const weather = weatherData[selectedDay] || weatherData[1];

  // Show "Weather Today" only during the week of the trip; otherwise "Avg. Weather"
  const weatherLabel = (() => {
    const tripStart = aiMeta?.startDate ? new Date(aiMeta.startDate) : null;
    const tripEnd = aiMeta?.endDate ? new Date(aiMeta.endDate) : null;
    if (!tripStart) return 'Avg. Weather';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfTripWeek = new Date(tripStart);
    startOfTripWeek.setDate(startOfTripWeek.getDate() - 7);
    const isWithinTripWindow = today >= startOfTripWeek && (!tripEnd || today <= tripEnd);
    return isWithinTripWindow ? 'Weather Today' : 'Avg. Weather';
  })();

  const hasTrackA = currentDayData.tracks.track_a.length > 0;
  const hasTrackB = currentDayData.tracks.track_b.length > 0;
  const hasSplitTracks = hasTrackA || hasTrackB;

  const budgetCategories = [
    { label: 'Flights', spent: 1800, budget: trip.budgetBreakdown.flights, color: 'bg-blue-500' },
    { label: 'Hotel', spent: 800, budget: trip.budgetBreakdown.hotel, color: 'bg-violet-500' },
    { label: 'Food', spent: 380, budget: trip.budgetBreakdown.food, color: 'bg-orange-500' },
    { label: 'Activities', spent: 420, budget: trip.budgetBreakdown.experiences, color: 'bg-teal-500' },
    { label: 'Transport', spent: 210, budget: trip.budgetBreakdown.transport, color: 'bg-indigo-500' },
  ];
  const totalSpent = budgetCategories.reduce((s, c) => s + c.spent, 0);
  const totalBudget = budgetCategories.reduce((s, c) => s + c.budget, 0);
  const remainingBudget = totalBudget - totalSpent;

  const allActivities: Activity[] = [
    ...(currentDayData.tracks?.shared ?? []).map((a: Activity) => ({ ...a, track: 'shared' as const })),
    ...(currentDayData.tracks?.track_a ?? []).map((a: Activity) => ({ ...a, track: 'track_a' as const })),
    ...(currentDayData.tracks?.track_b ?? []).map((a: Activity) => ({ ...a, track: 'track_b' as const })),
  ];
  const sortedActivities = allActivities.sort((a, b) => {
    const getHour = (ts: string) => parseInt((ts ?? '').split(/–|—/)[0].trim().split(':')[0], 10);
    return getHour(a.timeSlot ?? '') - getHour(b.timeSlot ?? '');
  });

  // Merge activities + transport legs into a single sorted timeline
  type TimelineItem =
    | { kind: 'activity'; data: Activity; sortTime: number }
    | { kind: 'transport'; data: TransportLeg; sortTime: number };

  const parseTime = (t: string) => {
    const [h, m] = (t ?? '00:00').split(':').map(Number);
    return h * 60 + (m || 0);
  };

  const timelineItems: TimelineItem[] = [
    ...sortedActivities.map(a => ({
      kind: 'activity' as const,
      data: a,
      sortTime: parseTime(a.timeSlot?.split(/–|—/)[0]?.trim() ?? '00:00'),
    })),
    ...[...(currentDayData.transportLegs ?? []), ...(addedTransport[selectedDay] ?? [])].map((leg: TransportLeg) => ({
      kind: 'transport' as const,
      data: leg,
      // Sort by meet time if present, otherwise departure time
      sortTime: parseTime(leg.meetTime ?? leg.departureTime),
    })),
  ].sort((a, b) => a.sortTime - b.sortTime);

  const trackConfig = {
    shared: { badgeColor: 'bg-sky-500 text-white', label: 'Shared' },
    track_a: { badgeColor: 'bg-violet-500 text-white', label: currentDayData.trackALabel || 'Track A' },
    track_b: { badgeColor: 'bg-rose-500 text-white', label: currentDayData.trackBLabel || 'Track B' },
  };

  return (
    <div className="min-h-screen bg-parchment p-3 md:p-6">
      <div className="max-w-6xl mx-auto">

        {/* AI Generated Banner — demo only (not shown for real uploaded/generated trips) */}
        {showAiBanner && !aiMeta && (
          <div className="mb-6 flex items-center justify-between px-5 py-3.5 bg-sky-50 border border-sky-200 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-sky-800 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-bold">✦</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-sky-900">Built by AI, made for your crew ✦</p>
                <p className="text-xs text-sky-800">Demo itinerary · Iceland · Personalized just for you</p>
              </div>
            </div>
          </div>
        )}

        {/* Toasts */}
        {activityAdded && (
          <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-zinc-900 text-white px-5 py-3.5 rounded-2xl shadow-xl">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-semibold">{editingActivity ? 'Activity updated' : 'Activity added to itinerary'}</span>
          </div>
        )}
        {activityDeleted && (
          <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-zinc-900 text-white px-5 py-3.5 rounded-2xl shadow-xl">
            <Trash2 className="w-5 h-5 text-rose-400" />
            <span className="text-sm font-semibold">Activity removed</span>
          </div>
        )}
        {suggestError && (
          <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-rose-900 text-white px-5 py-3.5 rounded-2xl shadow-xl">
            <AlertCircle className="w-5 h-5 text-rose-300" />
            <span className="text-sm font-semibold">{suggestError}</span>
          </div>
        )}

        {/* Day Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-1">
              {trip.destination}
            </p>
            <h1 className="text-2xl font-script italic font-semibold text-zinc-900 mb-2">
              {new Date(currentDayData.date).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
              })}
            </h1>
            <p className="text-sm text-zinc-500">
              {sortedActivities.length} {sortedActivities.length === 1 ? 'activity' : 'activities'}
              {(() => {
                const total = (currentDayData.transportLegs?.length ?? 0) + (addedTransport[selectedDay]?.length ?? 0);
                return total > 0
                  ? <span className="text-zinc-400"> · {total} transport {total === 1 ? 'leg' : 'legs'}</span>
                  : null;
              })()}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-1 flex-wrap justify-end">
            <button
              onClick={() => setShowAddActivityModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 md:px-4 bg-sky-800 hover:bg-sky-900 text-white text-xs md:text-sm font-semibold rounded-full shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Activity
            </button>
            <button
              onClick={() => setShowMapView(!showMapView)}
              className={`flex items-center gap-1.5 px-3 py-2 md:px-4 border text-xs md:text-sm font-semibold rounded-full shadow-sm transition-all ${
                showMapView
                  ? 'bg-sky-700 border-sky-700 text-white'
                  : 'bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700'
              }`}
            >
              <Map className="w-4 h-4" />
              Map
            </button>
            <button
              onClick={() => hasTransportParser ? setShowParseModal(true) : setUpgradePromptKey('feature_locked')}
              className="flex items-center gap-1.5 px-3 py-2 md:px-4 bg-white border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs md:text-sm font-semibold rounded-full shadow-sm transition-all"
            >
              <Sparkles className="w-4 h-4 text-sky-600" />
              <span className="hidden sm:inline">Add </span>Transport
              {!hasTransportParser && <LockBadge />}
            </button>
          </div>
        </div>

        {/* Day Selector */}
        <div className="mb-8 overflow-x-auto pb-2">
          <div className="flex gap-2 min-w-min">
            {activeDays.map((day: { day: number; date: string }) => {
              const dayDateStr = new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              return (
                <button
                  key={day.day}
                  onClick={() => setSelectedDay(day.day)}
                  className={`px-5 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-all ${
                    selectedDay === day.day
                      ? 'bg-zinc-900 text-white shadow-sm'
                      : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300'
                  }`}
                >
                  Day {day.day} · {dayDateStr}
                </button>
              );
            })}
          </div>
        </div>

        {/* Map View */}
        {showMapView && (
          <div className="mb-6">
            <MapView
              activities={sortedActivities}
              transportLegs={[...(currentDayData.transportLegs ?? []), ...(addedTransport[selectedDay] ?? [])]}
              destination={trip.destination}
            />
          </div>
        )}

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Timeline */}
          <div className="flex-1 min-w-0">
            {timelineItems.length === 0 ? (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-12 text-center">
                <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center mx-auto mb-4">
                  <Plus className="w-6 h-6 text-zinc-400" />
                </div>
                <p className="text-zinc-500 font-medium mb-4">Nothing planned yet — add your first activity!</p>
                <button
                  onClick={() => setShowAddActivityModal(true)}
                  className="bg-sky-800 hover:bg-sky-900 text-white font-semibold px-5 py-2.5 rounded-full inline-flex items-center gap-2 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Add Something
                </button>
              </div>
            ) : (
              <div>
                {hasSplitTracks && (
                  <div className="mb-6 pb-4 border-b border-zinc-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Today&apos;s tracks</p>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { color: 'bg-sky-500', label: 'Shared' },
                        { color: 'bg-violet-500', label: currentDayData.trackALabel || 'Track A' },
                        { color: 'bg-rose-500', label: currentDayData.trackBLabel || 'Track B' },
                      ].map(t => (
                        <div key={t.label} className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${t.color}`} />
                          <span className="text-xs font-semibold text-zinc-600">{t.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Meetup time — only relevant for group trips, not solo/couple */}
                  {currentDayData.meetupTime && currentDayData.meetupLocation &&
                   aiMeta?.groupType !== 'solo' && aiMeta?.groupType !== 'couple' && (
                    <div className="flex gap-4">
                      <div className="w-20 flex-shrink-0 text-right pt-3.5">
                        <p className="text-xs font-semibold text-sky-600">{currentDayData.meetupTime}</p>
                      </div>
                      <div className="relative flex flex-col items-center pt-3.5">
                        <Flag className="w-3 h-3 text-sky-500 flex-shrink-0" />
                        <div className="w-px flex-1 bg-zinc-100 mt-1.5 min-h-[3rem]" />
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="bg-sky-50 border border-sky-100 rounded-2xl px-4 py-3 flex items-center gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-sky-500 mb-0.5">Group Meetup</p>
                            <p className="text-sm font-semibold text-sky-900">{currentDayData.meetupLocation}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {timelineItems.map((item, index) => {
                    const isLast = index === timelineItems.length - 1;

                    if (item.kind === 'transport') {
                      const leg = item.data;
                      const cfg = transportConfig[leg.type];
                      return (
                        <div key={leg.id} className="flex gap-4">
                          {/* Time column */}
                          <div className="w-20 flex-shrink-0 text-right pt-4">
                            <p className="text-xs font-semibold text-zinc-400">
                              {leg.meetTime ?? leg.departureTime}
                            </p>
                          </div>
                          {/* Center line */}
                          <div className="relative flex flex-col items-center pt-4">
                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dotColor}`} />
                            {!isLast && (
                              <div className="w-px flex-1 bg-zinc-100 mt-1.5 min-h-[4rem]" style={{ backgroundImage: 'repeating-linear-gradient(to bottom, #e4e4e7 0, #e4e4e7 4px, transparent 4px, transparent 8px)' }} />
                            )}
                          </div>
                          {/* Transport card */}
                          <div className="flex-1 pb-2">
                            <TransportCard leg={leg} />
                          </div>
                        </div>
                      );
                    }

                    // Activity item
                    const activity = item.data;
                    const config = trackConfig[activity.track as keyof typeof trackConfig];
                    const startTime = activity.timeSlot.split(/–|—/)[0]?.trim() || '';
                    const price = priceLevelLabel(activity.priceLevel);
                    const actName = activity.name || activity.title || '';
                    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(actName + (activity.address ? ' ' + activity.address : ' ' + trip.destination))}`;

                    return (
                      <div key={activity.id} className="flex gap-4">
                        {/* Time Column */}
                        <div className="w-20 flex-shrink-0 text-right pt-4">
                          <p className="text-xs font-semibold text-zinc-400">{startTime}</p>
                        </div>

                        {/* Center Line */}
                        <div className="relative flex flex-col items-center pt-4">
                          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            activity.track === 'track_a' ? 'bg-violet-400' :
                            activity.track === 'track_b' ? 'bg-rose-400' : 'bg-sky-400'
                          }`} />
                          {!isLast && (
                            <div className="w-px flex-1 bg-zinc-100 mt-1.5 min-h-[4rem]" />
                          )}
                        </div>

                        {/* Activity Card */}
                        <div className="flex-1 pb-2">
                          <div className={`bg-white rounded-2xl border shadow-sm p-4 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group/card ${activity.isPrivate ? 'border-amber-200 bg-amber-50/40' : 'border-zinc-100'}`}>
                            <div className="flex items-start justify-between mb-2 gap-2">
                              <h3 className="font-script italic font-semibold text-zinc-900 text-base leading-snug flex-1 flex items-center gap-1.5">
                                <a
                                  href={googleUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="hover:text-sky-700 transition-colors"
                                  title="Search on Google"
                                >
                                  {actName}
                                </a>
                                {activity.isPrivate && (
                                  <span title="Private — only visible to you" className="inline-flex items-center justify-center w-4 h-4 bg-amber-100 rounded-full flex-shrink-0">
                                    🔒
                                  </span>
                                )}
                              </h3>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {/* Edit button */}
                                <button
                                  onClick={() => handleEditActivity(activity)}
                                  title="Edit activity"
                                  className="opacity-0 group-hover/card:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                {/* Delete button */}
                                <button
                                  onClick={() => handleDeleteActivity(activity.id)}
                                  title="Remove activity"
                                  className="opacity-0 group-hover/card:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-rose-50 text-zinc-400 hover:text-rose-500"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${config.badgeColor}`}>
                                  {config.label}
                                </span>
                              </div>
                            </div>

                            {/* Rating + Price */}
                            {(activity.rating || price) && (
                              <div className="flex items-center gap-3 mb-2">
                                {activity.rating && (
                                  <StarRating rating={activity.rating} reviewCount={activity.reviewCount} />
                                )}
                                {price && (
                                  <span className="text-xs font-semibold text-zinc-500">{price}</span>
                                )}
                                {activity.googleVerified && (
                                  <span className="text-[10px] text-zinc-400 font-medium">via Google</span>
                                )}
                              </div>
                            )}

                            {/* Address */}
                            {activity.address && (
                              <div className="flex items-start gap-1.5 mb-2">
                                <MapPin className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-zinc-400">{activity.address}</p>
                              </div>
                            )}

                            {/* Time */}
                            <div className="flex items-center gap-1.5 mb-2">
                              <Clock className="w-3.5 h-3.5 text-zinc-300" />
                              <p className="text-xs font-medium text-zinc-400">{activity.timeSlot}</p>
                            </div>

                            {/* Tags + links row */}
                            <div className="flex items-center gap-2 flex-wrap mb-3">
                              {activity.isRestaurant && (
                                <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 text-xs font-medium px-2.5 py-1 rounded-full border border-sky-100">
                                  <Utensils className="w-3 h-3" />
                                  Restaurant
                                </span>
                              )}
                              <a
                                href={googleUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-800 text-xs font-medium transition-colors"
                                onClick={e => e.stopPropagation()}
                                title="Search on Google"
                              >
                                <Search className="w-3 h-3" />
                                Search Google
                              </a>
                            </div>

                            {/* Packing tips */}
                            {activity.packingTips && activity.packingTips.length > 0 && (
                              <div className="mt-2 mb-2 p-2.5 bg-amber-50 rounded-xl border border-amber-100">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <Backpack className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                  <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Bring</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {activity.packingTips.map((tip, i) => (
                                    <span key={i} className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                      {tip}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Voting row + Suggest another */}
                            {(() => {
                              const v = votes[activity.id] ?? { up: 0, down: 0, myVote: null };
                              const isSuggesting = suggestingActivityId === activity.id;
                              return (
                                <div className="flex items-center gap-2 pt-2 border-t border-zinc-50 flex-wrap">
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-300 mr-1">Yay/Nay</span>
                                  <button
                                    onClick={() => handleVote(activity.id, 'up')}
                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                                      v.myVote === 'up'
                                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                        : 'bg-zinc-50 text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600 border border-zinc-100'
                                    }`}
                                  >
                                    <ThumbsUp className="w-3 h-3" />
                                    <span>Yay{v.up > 0 ? ` ${v.up}` : ''}</span>
                                  </button>
                                  <button
                                    onClick={() => handleVote(activity.id, 'down')}
                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                                      v.myVote === 'down'
                                        ? 'bg-rose-100 text-rose-700 border border-rose-200'
                                        : 'bg-zinc-50 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 border border-zinc-100'
                                    }`}
                                  >
                                    <ThumbsDown className="w-3 h-3" />
                                    <span>Nay{v.down > 0 ? ` ${v.down}` : ''}</span>
                                  </button>
                                  {v.myVote && (
                                    <span className="text-[10px] text-zinc-300 ml-1">
                                      {v.myVote === 'up' ? "You're in ✓" : 'Not feeling it'}
                                    </span>
                                  )}
                                  {/* Suggest another — pushes to the right */}
                                  <button
                                    onClick={() => handleSuggestAnother(activity)}
                                    disabled={isSuggesting}
                                    title="Ask AI for a different suggestion"
                                    className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all bg-zinc-50 text-zinc-400 hover:bg-violet-50 hover:text-violet-600 border border-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {isSuggesting
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : <RefreshCw className="w-3 h-3" />
                                    }
                                    <span>{isSuggesting ? 'Finding…' : 'Suggest another'}</span>
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>

          {/* Sidebar */}
          <aside className="w-full lg:w-72 flex flex-col gap-5">
            {/* Weather Card */}
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-4">{weatherLabel}</p>
              <div className="text-center py-2">
                <p className="text-2xl mb-1">🌤️</p>
                <p className="text-sm font-medium text-zinc-700">
                  {(aiMeta?.destination ?? 'Your destination').split(',')[0]}
                </p>
                <p className="text-xs text-zinc-400 mt-1">Live weather coming soon</p>
              </div>
            </div>


            {/* Photo Spots Card */}
            {currentDayData.photoSpots && currentDayData.photoSpots.length > 0 && (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Camera className="w-4 h-4 text-violet-500" />
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Photo Spots</p>
                </div>
                <div className="space-y-3">
                  {currentDayData.photoSpots.map((spot, i) => (
                    <div key={i} className="p-3 bg-violet-50 rounded-xl border border-violet-100">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold text-violet-900 leading-snug">{spot.name}</p>
                        <span className="flex-shrink-0 text-[10px] font-semibold text-violet-500 bg-violet-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {spot.timeOfDay}
                        </span>
                      </div>
                      <p className="text-xs text-violet-700 leading-relaxed">{spot.tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Where to Stay Card — pre-booked hotels */}
            {aiMeta?.bookedHotels && aiMeta.bookedHotels.length > 0 && (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-base">🏨</span>
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Where to Stay</p>
                </div>
                <div className="space-y-3">
                  {aiMeta.bookedHotels.map((h, i) => (
                    <div key={i} className="p-3 bg-sky-50 rounded-xl border border-sky-100">
                      <p className="text-sm font-semibold text-sky-900 leading-snug">{h.name}</p>
                      {h.address && (
                        <p className="text-xs text-sky-600 mt-0.5 leading-relaxed">{h.address}</p>
                      )}
                      {(h.checkIn || h.checkOut) && (
                        <p className="text-[11px] text-zinc-400 mt-1.5">
                          {h.checkIn && new Date(h.checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {h.checkIn && h.checkOut && ' → '}
                          {h.checkOut && new Date(h.checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Where to Stay Card — AI hotel suggestions (only when no hotel pre-booked) */}
            {(!aiMeta?.bookedHotels || aiMeta.bookedHotels.length === 0) && aiMeta?.hotelSuggestions && aiMeta.hotelSuggestions.length > 0 && (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">🏨</span>
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Where to Stay</p>
                </div>
                <p className="text-[11px] text-zinc-400 mb-4">AI picks that fit your budget</p>
                <div className="space-y-3">
                  {aiMeta.hotelSuggestions.map((h, i) => (
                    <div key={i} className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-sm font-semibold text-amber-900 leading-snug">{h.name}</p>
                        {h.pricePerNight && (
                          <span className="flex-shrink-0 text-[10px] font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                            ${h.pricePerNight}/night
                          </span>
                        )}
                      </div>
                      {h.neighborhood && (
                        <p className="text-[11px] text-amber-600 mb-1">{h.neighborhood}</p>
                      )}
                      {h.whyRecommended && (
                        <p className="text-xs text-amber-700 leading-relaxed mb-2">{h.whyRecommended}</p>
                      )}
                      {h.bookingUrl && (
                        <a
                          href={h.bookingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:text-sky-900 transition-colors"
                        >
                          Book on Booking.com →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* ─── Add Activity Modal ─── */}
      {showAddActivityModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={handleCloseModal}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="px-6 pt-6 pb-4 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h2 className="font-script italic text-lg font-semibold text-zinc-900">
                  {editingActivity ? 'Edit Activity' : 'Add Activity'}
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {editingActivity ? 'Update the details for this activity' : 'Search for a place or enter manually'}
                </p>
              </div>
              <button onClick={handleCloseModal} className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors">
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

              {/* Place Search */}
              <div ref={searchRef} className="relative">
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wide mb-2">
                  Search Place
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    value={query || newActivityName}
                    onChange={e => {
                      setNewActivityName(e.target.value);
                      setQuery(e.target.value);
                      setShowSuggestions(true);
                      if (selectedPlace) setSelectedPlace(null);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="e.g., Eiffel Tower, Central Park…"
                    className="w-full pl-9 pr-10 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent"
                  />
                  {(searchLoading || loadingDetails) && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 animate-spin" />
                  )}
                </div>

                {/* Autocomplete Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-zinc-200 shadow-lg z-10 overflow-hidden">
                    {suggestions.map(s => (
                      <button
                        key={s.placeId}
                        onMouseDown={e => {
                          e.preventDefault();
                          handleSelectPlace(s.placeId, s.name);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-sky-50 transition-colors border-b border-zinc-50 last:border-0"
                      >
                        <div className="flex items-start gap-3">
                          <MapPin className="w-4 h-4 text-zinc-400 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-zinc-900 truncate">{s.name}</p>
                            <p className="text-xs text-zinc-400 truncate">{s.address}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Place Details Preview (when a place is selected) */}
              {selectedPlace && (
                <div className="bg-sky-50 rounded-xl border border-sky-100 p-4">
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-sky-700" />
                      <span className="text-xs font-semibold text-sky-800">Place verified via Google</span>
                    </div>
                    {selectedPlace.isOpen !== undefined && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        selectedPlace.isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {selectedPlace.isOpen ? 'Open now' : 'Closed'}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {selectedPlace.rating && (
                      <StarRating rating={selectedPlace.rating} reviewCount={selectedPlace.reviewCount} />
                    )}
                    {selectedPlace.priceLevel !== undefined && selectedPlace.priceLevel !== null && (
                      <span className="text-xs font-semibold text-zinc-600">
                        {priceLevelLabel(selectedPlace.priceLevel)}
                      </span>
                    )}
                    {selectedPlace.phone && (
                      <span className="text-xs text-zinc-500">{selectedPlace.phone}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Address */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wide mb-2">Address</label>
                <input
                  type="text"
                  value={newActivityAddress}
                  onChange={e => setNewActivityAddress(e.target.value)}
                  placeholder="Auto-filled from place search"
                  className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent"
                />
              </div>

              {/* Time Range */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wide mb-2">Time</label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <p className="text-xs text-zinc-400 mb-1.5">Start</p>
                    <input
                      type="time"
                      value={newActivityStartTime}
                      onChange={e => setNewActivityStartTime(e.target.value)}
                      className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-zinc-400 mb-1.5">End</p>
                    <input
                      type="time"
                      value={newActivityEndTime}
                      onChange={e => setNewActivityEndTime(e.target.value)}
                      className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Restaurant toggle */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium text-zinc-800">Mark as restaurant</p>
                  <p className="text-xs text-zinc-400">Shows dining icon on the itinerary</p>
                </div>
                <button
                  onClick={() => setNewActivityIsRestaurant(!newActivityIsRestaurant)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    newActivityIsRestaurant ? 'bg-sky-800' : 'bg-zinc-200'
                  }`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                    newActivityIsRestaurant ? 'left-6' : 'left-1'
                  }`} />
                </button>
              </div>

              {/* Private toggle */}
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium text-zinc-800">Private (only visible to me)</p>
                  <p className="text-xs text-zinc-400">Other group members won't see this activity</p>
                </div>
                <button
                  onClick={() => setNewActivityIsPrivate(!newActivityIsPrivate)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    newActivityIsPrivate ? 'bg-amber-500' : 'bg-zinc-200'
                  }`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
                    newActivityIsPrivate ? 'left-6' : 'left-1'
                  }`} />
                </button>
              </div>

              {/* Website */}
              {newActivityIsRestaurant && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wide mb-2">
                    Reservation Link
                  </label>
                  <input
                    type="url"
                    value={newActivityWebsite}
                    onChange={e => setNewActivityWebsite(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent"
                  />
                </div>
              )}

              {/* Day selector — only shown when editing an existing activity */}
              {editingActivity && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wide mb-2">
                    Day
                  </label>
                  <select
                    value={newActivityDay}
                    onChange={e => setNewActivityDay(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent bg-white"
                  >
                    {(activeDays as { day: number; date: string }[]).map(d => (
                      <option key={d.day} value={d.day}>
                        Day {d.day}{d.date ? ` — ${d.date}` : ''}
                      </option>
                    ))}
                  </select>
                  {newActivityDay !== editingActivity.dayNumber && (
                    <p className="mt-1.5 text-xs text-sky-600 font-medium">
                      Activity will be moved from Day {editingActivity.dayNumber} → Day {newActivityDay}
                    </p>
                  )}
                </div>
              )}

              {/* Track */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wide mb-2">
                  Track
                </label>
                <div className="flex gap-2">
                  {[
                    { id: 'shared' as const, label: 'Shared', active: 'bg-sky-500 text-white', dot: 'bg-sky-500' },
                    { id: 'track_a' as const, label: 'Track A', active: 'bg-violet-500 text-white', dot: 'bg-violet-500' },
                    { id: 'track_b' as const, label: 'Track B', active: 'bg-rose-500 text-white', dot: 'bg-rose-500' },
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setNewActivityTrack(t.id)}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        newActivityTrack === t.id ? t.active : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${newActivityTrack === t.id ? 'bg-white/70' : t.dot}`} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 pb-6 pt-4 border-t border-zinc-100 flex gap-3">
              <button
                onClick={handleCloseModal}
                className="flex-1 py-2.5 border border-zinc-200 rounded-full text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!newActivityName}
                className="flex-1 bg-sky-800 hover:bg-sky-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-full inline-flex items-center justify-center gap-2 transition-all"
              >
                {editingActivity ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {editingActivity ? 'Save Changes' : 'Add to Itinerary'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {upgradePromptKey && (
        <UpgradeModal
          prompt={getUpgradePrompt(upgradePromptKey)}
          onClose={() => setUpgradePromptKey(null)}
        />
      )}

      {/* Trip Story Modal */}
      {showStoryModal && (
        <TripStoryModal
          mode="trip"
          trip={trip}
          onClose={() => setShowStoryModal(false)}
        />
      )}

      {/* Parse Transport Modal */}
      {showParseModal && (
        <ParseTransportModal
          dayNumber={selectedDay}
          dayDate={currentDayData.date}
          onAdd={handleTransportAdded}
          onClose={() => setShowParseModal(false)}
        />
      )}
    </div>
  );
}
