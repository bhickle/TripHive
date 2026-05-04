'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { itineraryDays, trips } from '@/data/mock';
import { Activity, TransportLeg, ItineraryDay } from '@/lib/types';
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
  BookOpen,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
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
  PersonStanding,
  Ship,
  Navigation,
  FileDown,
  Map,
  AlignJustify,
  UserPlus,
} from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { TripStoryModal } from '@/components/TripStoryModal';
import { ParseTransportModal } from '@/components/ParseTransportModal';
import { MapView } from '@/components/MapView';
import { UpgradeModal, LockBadge } from '@/components/UpgradeModal';
import { useEntitlements } from '@/hooks/useEntitlements';
import { WeatherWidget } from '@/components/WeatherWidget';

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

// ─── transportToNext helpers ──────────────────────────────────────────────────

const TRANSPORT_NEXT_CONFIG: Record<string, {
  icon: React.ReactNode;
  label: string;
  bg: string;
  border: string;
  text: string;
  mapsMode: string;
}> = {
  walk:        { icon: <PersonStanding className="w-3.5 h-3.5" />, label: 'Walk',        bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700', mapsMode: 'walking'  },
  rideshare:   { icon: <Car className="w-3.5 h-3.5" />,            label: 'Rideshare',   bg: 'bg-amber-50',   border: 'border-amber-100',   text: 'text-amber-700',   mapsMode: 'driving'  },
  car_rental:  { icon: <Car className="w-3.5 h-3.5" />,            label: 'Car Rental',  bg: 'bg-sky-50',     border: 'border-sky-100',     text: 'text-sky-700',     mapsMode: 'driving'  },
  taxi:        { icon: <Car className="w-3.5 h-3.5" />,            label: 'Taxi',        bg: 'bg-amber-50',   border: 'border-amber-100',   text: 'text-amber-700',   mapsMode: 'driving'  },
  metro:       { icon: <TrainFront className="w-3.5 h-3.5" />,     label: 'Metro',       bg: 'bg-sky-50',     border: 'border-sky-100',     text: 'text-sky-700',     mapsMode: 'transit'  },
  bus:         { icon: <Bus className="w-3.5 h-3.5" />,            label: 'Bus',         bg: 'bg-sky-50',     border: 'border-sky-100',     text: 'text-sky-700',     mapsMode: 'transit'  },
  train:       { icon: <TrainFront className="w-3.5 h-3.5" />,     label: 'Train',       bg: 'bg-sky-50',     border: 'border-sky-100',     text: 'text-sky-700',     mapsMode: 'transit'  },
  tram:        { icon: <TrainFront className="w-3.5 h-3.5" />,     label: 'Tram',        bg: 'bg-sky-50',     border: 'border-sky-100',     text: 'text-sky-700',     mapsMode: 'transit'  },
  ferry:       { icon: <Ship className="w-3.5 h-3.5" />,           label: 'Ferry',       bg: 'bg-cyan-50',    border: 'border-cyan-100',    text: 'text-cyan-700',    mapsMode: 'transit'  },
  'water-taxi':{ icon: <Ship className="w-3.5 h-3.5" />,           label: 'Water Taxi',  bg: 'bg-cyan-50',    border: 'border-cyan-100',    text: 'text-cyan-700',    mapsMode: 'transit'  },
  'tuk-tuk':   { icon: <Car className="w-3.5 h-3.5" />,            label: 'Tuk-tuk',     bg: 'bg-amber-50',   border: 'border-amber-100',   text: 'text-amber-700',   mapsMode: 'driving'  },
  'cable-car': { icon: <Compass className="w-3.5 h-3.5" />,        label: 'Cable Car',   bg: 'bg-violet-50',  border: 'border-violet-100',  text: 'text-violet-700',  mapsMode: 'transit'  },
};

function buildMapsUrl(mode: string, from?: string, to?: string): string {
  const cfg = TRANSPORT_NEXT_CONFIG[mode];
  const travelmode = cfg?.mapsMode ?? 'driving';
  const base = 'https://www.google.com/maps/dir/?api=1';
  const p = new URLSearchParams({ travelmode });
  if (from) p.set('origin', from);
  if (to)   p.set('destination', to);
  return `${base}&${p.toString()}`;
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function TransportCard({ leg }: { leg: TransportLeg }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = transportConfig[leg.type] ?? transportConfig['car_rental'];
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

function ItineraryPageContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const tripPageId = params?.id ?? '';
  const [selectedDay, setSelectedDay] = useState(1);
  const [activityAdded, setActivityAdded] = useState(false);
  const [activityDeleted, setActivityDeleted] = useState(false);
  const [bookingSaved, setBookingSaved] = useState<string | null>(null);
  const [storyLocked, setStoryLocked] = useState(false);
  // Undo delete
  const [undoSnapshot, setUndoSnapshot] = useState<{ activity: Activity; dayNumber: number; track: 'shared' | 'track_a' | 'track_b'; label: string } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hotel edit
  const [editingHotelIndex, setEditingHotelIndex] = useState<number | null>(null);
  // Invite modal (ported from group page — trip ID already known, no selector needed)
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteMethod, setInviteMethod] = useState<'email' | 'text' | 'link'>('email');
  const [inviteContact, setInviteContact] = useState('');
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [showAddActivityModal, setShowAddActivityModal] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [suggestingActivityId, setSuggestingActivityId] = useState<string | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [showParseModal, setShowParseModal] = useState(false);
  const [showMapView, setShowMapView] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const dayTabScrollRef = useRef<HTMLDivElement>(null);
  const [dayTabCanScrollLeft, setDayTabCanScrollLeft] = useState(false);
  const [dayTabCanScrollRight, setDayTabCanScrollRight] = useState(false);
  // Keep a ref to the latest aiDays so the vote handler can read current state
  // without causing stale-closure issues or side effects inside state updaters
  const aiDaysRef = useRef<ItineraryDay[] | null>(null);
  const [upgradePromptKey, setUpgradePromptKey] = useState<'feature_locked' | 'no_ai' | null>(null);

  // Edit destination / dates modal
  const [showEditTripModal, setShowEditTripModal] = useState(false);
  const [editDest, setEditDest] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [savingTripEdit, setSavingTripEdit] = useState(false);

  // Add Hotel / Add Flight modals
  const [showAddHotelModal, setShowAddHotelModal] = useState(false);
  const [showAddFlightModal, setShowAddFlightModal] = useState(false);
  const [savingBooking, setSavingBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  // Hotel form state
  const [hotelFormName, setHotelFormName] = useState('');
  const [hotelFormCity, setHotelFormCity] = useState('');
  const [hotelFormAddress, setHotelFormAddress] = useState('');
  const [hotelFormCheckIn, setHotelFormCheckIn] = useState('');
  const [hotelFormCheckOut, setHotelFormCheckOut] = useState('');
  // Flight form state
  const [flightFormAirline, setFlightFormAirline] = useState('');
  const [flightFormNumber, setFlightFormNumber] = useState('');
  const [flightFormDep, setFlightFormDep] = useState('');
  const [flightFormArr, setFlightFormArr] = useState('');
  const [flightFormDepTime, setFlightFormDepTime] = useState('');
  const [flightFormArrTime, setFlightFormArrTime] = useState('');
  const [flightFormRetDepTime, setFlightFormRetDepTime] = useState('');
  const [flightFormRetArrTime, setFlightFormRetArrTime] = useState('');

  const { tier, hasTripStory, hasTransportParser, getUpgradePrompt } = useEntitlements();
  const currentUser = useCurrentUser();
  const router = useRouter();

  // ── Live-build state (used when arriving with ?mode=generating) ─────────────
  const [isLiveBuilding, setIsLiveBuilding]       = useState(false);
  const [liveBuildStatus, setLiveBuildStatus]     = useState('');
  const [liveBuildDone, setLiveBuildDone]         = useState(0);   // days generated so far
  const [liveBuildTotal, setLiveBuildTotal]       = useState(0);   // total expected days
  const [liveBuildError, setLiveBuildError]       = useState<string | null>(null);
  const liveBuildStarted                          = useRef(false);  // prevent double-run in StrictMode

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

  // Replacement history: stores the previous activity before AI replacement, keyed by activity id
  // Used for the Undo button. Entries auto-expire after 60s.
  const [replacementHistory, setReplacementHistory] = useState<Record<string, Activity>>({});
  // Set of activity IDs that were replaced by AI (shows the "AI Replaced" badge)
  const [replacedActivityIds, setReplacedActivityIds] = useState<Set<string>>(new Set());

  // Hotel generation state
  const [generatingHotels, setGeneratingHotels] = useState(false);
  const [hotelGenError, setHotelGenError] = useState<string | null>(null);

  // Group input / regenerate state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tripRow, setTripRow] = useState<Record<string, any> | null>(null);
  const [newPrefsCount, setNewPrefsCount] = useState(0);

  const handleVote = useCallback((activityId: string, direction: 'up' | 'down') => {
    // Compute new vote counts using the current votes state via functional updater
    // (captures prev synchronously so next is available immediately after)
    let next: { up: number; down: number; myVote: 'up' | 'down' | null } = { up: 0, down: 0, myVote: null };
    let prevVoteState: { up: number; down: number; myVote: 'up' | 'down' | null } = { up: 0, down: 0, myVote: null };

    setVotes(prev => {
      const current = prev[activityId] ?? { up: 0, down: 0, myVote: null };
      prevVoteState = current; // capture before update for rollback
      if (current.myVote === direction) {
        // Toggle off
        next = {
          up: direction === 'up' ? current.up - 1 : current.up,
          down: direction === 'down' ? current.down - 1 : current.down,
          myVote: null,
        };
      } else {
        // Switch or fresh vote
        next = {
          up: direction === 'up' ? current.up + 1 : (current.myVote === 'up' ? current.up - 1 : current.up),
          down: direction === 'down' ? current.down + 1 : (current.myVote === 'down' ? current.down - 1 : current.down),
          myVote: direction,
        };
      }
      return { ...prev, [activityId]: next };
    });

    // Persist vote counts to aiDays + Supabase outside the state updater (no side effects in updaters)
    // Read from ref so we always have the latest value without stale closure issues
    const days = aiDaysRef.current;
    if (!days) return;
    const updated = days.map(day => ({
      ...day,
      tracks: {
        shared:  (day.tracks.shared as Activity[]).map(a =>
          a.id === activityId ? { ...a, upVotes: next.up, downVotes: next.down } : a
        ),
        track_a: (day.tracks.track_a as Activity[]).map(a =>
          a.id === activityId ? { ...a, upVotes: next.up, downVotes: next.down } : a
        ),
        track_b: (day.tracks.track_b as Activity[]).map(a =>
          a.id === activityId ? { ...a, upVotes: next.up, downVotes: next.down } : a
        ),
      },
    }));
    syncAiDays(updated);
    const tripId = params.id;
    if (tripId && /^[0-9a-f-]{36}$/i.test(tripId)) {
      fetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: updated }),
      }).catch(() => {
        // Rollback aiDays to pre-vote state on failure
        syncAiDays(days);
      });
    }
    try { localStorage.setItem('generatedItinerary', JSON.stringify(updated)); } catch { /* ignore */ }

    // Fire-and-forget vote to dedicated votes table (persists per-user across sessions)
    if (tripId && /^[0-9a-f-]{36}$/i.test(tripId)) {
      fetch(`/api/votes/${tripId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId, vote: next.myVote }),
      }).then(async res => {
        if (res.ok) {
          // Merge server-fresh counts back in (handles multi-user scenarios)
          const { up, down } = await res.json();
          setVotes(prev => ({ ...prev, [activityId]: { ...prev[activityId], up, down } }));
        }
      }).catch(() => {
        // Rollback vote indicator to pre-vote state on failure
        setVotes(prev => ({ ...prev, [activityId]: prevVoteState }));
      });
    }
  }, [params.id]);

  // Seed votes from activity upVotes/downVotes when itinerary loads
  const seedVotesFromActivities = useCallback((days: ItineraryDay[]) => {
    const seeded: Record<string, { up: number; down: number; myVote: 'up' | 'down' | null }> = {};
    for (const day of days) {
      for (const track of ['shared', 'track_a', 'track_b'] as const) {
        for (const act of (day.tracks[track] as Activity[])) {
          if ((act.upVotes ?? 0) > 0 || (act.downVotes ?? 0) > 0) {
            seeded[act.id] = {
              up: act.upVotes ?? 0,
              down: act.downVotes ?? 0,
              myVote: null, // current session vote unknown — don't re-apply
            };
          }
        }
      }
    }
    if (Object.keys(seeded).length > 0) {
      setVotes(prev => ({ ...seeded, ...prev })); // don't overwrite current session votes
    }
  }, []);

  // AI-generated itinerary (loaded from localStorage if available)
  const [aiDays, setAiDays] = useState<ItineraryDay[] | null>(null);
  // Keep ref in sync so vote handler can read latest value without stale closures
  const syncAiDays = (days: ItineraryDay[] | null) => {
    if (days) {
      // Deduplicate by day number — AI occasionally emits duplicate day objects
      // on multi-city trips when a transition straddles two cities. Keep the
      // last occurrence so any richer data wins, then re-sort by day number.
      const byDay: Record<number, ItineraryDay> = {};
      for (const d of days) byDay[d.day] = d;
      const deduped = (Object.values(byDay) as ItineraryDay[]).sort((a, b) => a.day - b.day);

      // Normalize track labels — the AI sometimes renames tracks between days
      // despite prompt instructions. Pick the most-common non-null label pair
      // across all split days and enforce it everywhere.
      const countLabels = (key: 'trackALabel' | 'trackBLabel'): string | null => {
        const freq: Record<string, number> = {};
        for (const d of deduped) {
          const v = (d as unknown as Record<string, unknown>)[key];
          if (typeof v === 'string' && v.trim()) {
            freq[v] = (freq[v] ?? 0) + 1;
          }
        }
        const entries = Object.entries(freq);
        if (!entries.length) return null;
        return entries.reduce((best, cur) => cur[1] > best[1] ? cur : best)[0];
      };
      const canonA = countLabels('trackALabel');
      const canonB = countLabels('trackBLabel');
      const normalized = deduped.map(d => {
        const da = d as unknown as Record<string, unknown>;
        const hasSplit = Array.isArray(da.track_a) && (da.track_a as unknown[]).length > 0;
        if (!hasSplit) return d;
        return {
          ...d,
          trackALabel: canonA ?? da.trackALabel,
          trackBLabel: canonB ?? da.trackBLabel,
        } as ItineraryDay;
      });

      aiDaysRef.current = normalized;
      setAiDays(normalized);
    } else {
      aiDaysRef.current = null;
      setAiDays(null);
    }
  };
  // ⚠️  SYNC WARNING: aiMeta and tripRow are two separate state trees.
  // tripRow mirrors the Supabase `trips` row; aiMeta holds AI/itinerary metadata.
  // When you PATCH trips.booked_hotels (or any field that aiMeta also tracks),
  // you MUST call setAiMeta() in the same handler to keep the UI in sync —
  // the sidebar, "Tonight's Stay" card, and other UI components read from aiMeta,
  // not directly from tripRow. Forgetting this causes stale UI until page reload.
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
      /** Set when trip has multiple cities — used to group suggestions under city headers. */
      city?: string;
    }>;
    practicalNotes?: {
      currency?: string; tipping?: string; customs?: string; entryRequirements?: string;
    };
    preferences?: { priorities?: string[] };
    foodieTips?: Array<{
      name: string; type?: string; neighborhood?: string;
      why?: string; bestFor?: string; orderThis?: string; priceRange?: string;
      timeOfDay?: string; tip?: string;
    }>;
    nightlifeHighlights?: Array<{
      name: string; type?: string; neighborhood?: string;
      vibe?: string; bestNight?: string; openFrom?: string; tip?: string;
    }>;
    shoppingGuide?: Array<{
      name: string; type?: string; neighborhood?: string;
      what?: string; bestFor?: string; openDays?: string; tip?: string;
    }>;
  } | null>(null);
  const [showAiBanner, setShowAiBanner] = useState(false);

  // Rebuild the itinerary incorporating new member preferences (Explorer/Nomad)
  // Declared after aiMeta so it can reference it without a forward-reference error
  const handleRegenerate = useCallback(() => {
    if (!aiMeta && !tripRow) return;
    const destination = tripRow?.destination || aiMeta?.destination || '';
    const payload = {
      destination,
      tripLength: aiDaysRef.current?.length || tripRow?.trip_length || 7,
      groupSize: tripRow?.group_size || 2,
      groupType: tripRow?.group_type || aiMeta?.groupType || 'friends',
      startDate: aiMeta?.startDate || tripRow?.start_date || null,
      endDate: aiMeta?.endDate || tripRow?.end_date || null,
      budget: aiMeta?.budget || tripRow?.budget_total || 0,
      preferences: {
        ...(tripRow?.preferences as object || {}),
        ...(aiMeta?.preferences as object || {}),
      },
      tripId: tripPageId,
      existingTripId: tripPageId,
    };
    const meta = {
      destination,
      title: aiMeta?.destination ? `${aiMeta.destination} Trip` : (tripRow?.title || 'My Trip'),
      startDate: payload.startDate,
      endDate: payload.endDate,
      budget: payload.budget,
      budgetBreakdown: aiMeta?.budgetBreakdown || tripRow?.budget_breakdown || {},
      bookedHotels: aiMeta?.bookedHotels || tripRow?.booked_hotels || [],
      bookedFlight: tripRow?.booked_flight || null,
      groupType: payload.groupType,
      groupSize: payload.groupSize,
      preferences: payload.preferences,
    };
    sessionStorage.setItem('tripcoord_gen_payload', JSON.stringify(payload));
    sessionStorage.setItem('tripcoord_gen_meta', JSON.stringify(meta));
    router.push('/trip/generating');
  }, [aiMeta, tripRow, tripPageId, router]);

  useEffect(() => {
    const load = async () => {
      // 1. Try Supabase first using the CURRENT PAGE's trip ID (from the URL)
      const looksLikeUuid = tripPageId && /^[0-9a-f-]{36}$/i.test(tripPageId);
      if (looksLikeUuid) {
        try {
          const res = await fetch(`/api/trips/${tripPageId}`);
          if (res.ok) {
            const { trip: tripData, itinerary, newPrefsCount: npc } = await res.json();
            if (tripData) setTripRow(tripData);
            if (typeof npc === 'number') setNewPrefsCount(npc);
            if (itinerary && Array.isArray(itinerary.days) && itinerary.days.length > 0) {
              syncAiDays(itinerary.days);
              setShowAiBanner(true);
              if (itinerary.meta) {
                // Merge tripRow.preferences into meta if missing — backward compat for trips
                // saved before preferences was included in itinerary.meta
                const metaWithPrefs = itinerary.meta.preferences
                  ? itinerary.meta
                  : { ...itinerary.meta, preferences: tripData?.preferences ?? {} };
                setAiMeta(metaWithPrefs);
              }
              seedVotesFromActivities(itinerary.days);

              // Load per-user votes from dedicated table
              if (/^[0-9a-f-]{36}$/i.test(tripPageId)) {
                fetch(`/api/votes/${tripPageId}`)
                  .then(r => r.ok ? r.json() : null)
                  .then(data => {
                    if (!data?.votes) return;
                    setVotes(prev => {
                      const merged = { ...prev };
                      for (const [actId, v] of Object.entries(data.votes as Record<string, 'up' | 'down'>)) {
                        merged[actId] = { ...(merged[actId] ?? { up: 0, down: 0 }), myVote: v };
                      }
                      return merged;
                    });
                  })
                  .catch(() => {});
              }

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
            syncAiDays(parsed);
            setShowAiBanner(true);
            if (meta) setAiMeta(JSON.parse(meta));
            seedVotesFromActivities(parsed);
          }
        }
      } catch {
        // localStorage unavailable or invalid JSON — use mock data
      }
    };
    load();
  }, [tripPageId, seedVotesFromActivities]);

  // ── Live-build: drive city-by-city SSE generation when arriving with ?mode=generating ──
  useEffect(() => {
    if (searchParams.get('mode') !== 'generating') return;
    if (liveBuildStarted.current) return;
    liveBuildStarted.current = true;

    const run = async () => {
      setIsLiveBuilding(true);
      setLiveBuildError(null);

      // 1. Read generation params from sessionStorage
      let payload: Record<string, unknown>;
      let metaBase: Record<string, unknown>;
      try {
        const raw     = sessionStorage.getItem('tripcoord_gen_payload');
        const rawMeta = sessionStorage.getItem('tripcoord_gen_meta');
        if (!raw || !rawMeta) throw new Error('Session expired');
        payload  = JSON.parse(raw);
        metaBase = JSON.parse(rawMeta);
      } catch {
        setLiveBuildError('Generation session expired — please go back and try again.');
        setIsLiveBuilding(false);
        return;
      }

      // 2. Build per-city segment list (multi-city) or empty list (single-city)
      // NOTE: daysPerDestination is Record<string, number> keyed by city name, NOT an array
      type Segment = { cityName: string; dayStart: number; dayCount: number };
      const destinations = payload.destinations as string[] | null | undefined;
      const daysPerDest  = payload.daysPerDestination as Record<string, number> | null | undefined;
      const segments: Segment[] = [];
      if (destinations && destinations.length > 1 && daysPerDest) {
        let dayStart = 1;
        for (const cityName of destinations) {
          const dayCount = daysPerDest[cityName] ?? 0;
          if (dayCount > 0) {
            segments.push({ cityName, dayStart, dayCount });
            dayStart += dayCount;
          }
        }
      }
      const totalDays = segments.reduce((s, c) => s + c.dayCount, 0)
        || (payload.tripLength as number) || 7;
      setLiveBuildTotal(totalDays);

      // 3. Inner helper: stream one segment (or the full trip when no segments)
      const streamSegment = async (
        seg: Segment | null,
        prevContext: string | null,
      ): Promise<{ days: unknown[]; meta: Record<string, unknown> | null }> => {
        const body: Record<string, unknown> = { ...payload };
        if (seg) {
          body.citySegment = {
            cityName: seg.cityName,
            dayStart: seg.dayStart,
            dayCount: seg.dayCount,
            ...(prevContext ? { prevContext } : {}),
          };
        }

        const res = await fetch('/api/generate-itinerary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok || !res.body) {
          let msg = `Generation failed (${res.status})`;
          try { const d = await res.json(); msg = d.message || d.error || msg; } catch { /* ignore */ }
          throw new Error(msg);
        }

        const reader    = res.body.getReader();
        const decoder   = new TextDecoder();
        let sseBuffer   = '';
        const collectedDays: unknown[] = [];
        let meta: Record<string, unknown> | null = null;

        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          sseBuffer += decoder.decode(value, { stream: true });
          const events = sseBuffer.split('\n\n');
          sseBuffer = events.pop() ?? '';

          for (const rawEvent of events) {
            for (const line of rawEvent.split('\n')) {
              if (!line.startsWith('data: ')) continue;
              let parsed: Record<string, unknown>;
              try { parsed = JSON.parse(line.slice(6)); } catch { continue; }

              switch (parsed.type) {
                case 'meta':
                  meta = parsed;
                  break;

                case 'day': {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const dayData = parsed.data as any;
                  collectedDays.push(dayData);

                  // Merge into live view — sort by day number
                  const current = aiDaysRef.current ?? [];
                  const merged  = [...current];
                  const dayNum  = typeof dayData.day === 'number' ? dayData.day : 0;
                  const existing = merged.findIndex(d => d.day === dayNum);
                  if (existing >= 0) merged[existing] = dayData as ItineraryDay;
                  else merged.push(dayData as ItineraryDay);
                  merged.sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
                  syncAiDays(merged);
                  setShowAiBanner(true);
                  setLiveBuildDone(prev => prev + 1);
                  setLiveBuildStatus(
                    seg ? `Building ${seg.cityName}…` : `Building day ${dayNum}…`
                  );
                  break;
                }

                case 'done':
                  break outer;

                case 'error':
                  throw new Error((parsed.message as string) || 'Generation failed');
              }
            }
          }
        }

        return { days: collectedDays, meta };
      };

      // 4. Run all segments (or single call for single-city trips)
      let firstMeta: Record<string, unknown> | null = null;

      try {
        if (segments.length === 0) {
          // Single-city or unspecified: one full call, no citySegment
          setLiveBuildStatus('Building your itinerary…');
          const { meta } = await streamSegment(null, null);
          firstMeta = meta;
        } else {
          let prevContext: string | null = null;
          for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const { days, meta } = await streamSegment(seg, prevContext);
            if (i === 0) firstMeta = meta;

            // Build prevContext from last received day for continuity handoff
            const lastDay = days[days.length - 1] as Record<string, unknown> | undefined;
            if (lastDay) {
              const theme   = (lastDay.theme as string) || '';
              const shared  = (lastDay.tracks as Record<string, unknown>)?.shared as Array<Record<string, unknown>> | undefined;
              const firstAct = shared?.find(a => !(a.isRestaurant));
              const actName  = firstAct ? ((firstAct.name as string) || (firstAct.title as string) || '') : '';
              prevContext = [theme, actName].filter(Boolean).join(', ').slice(0, 80) || null;
            }

            // Partial-persist: PATCH Supabase after each city completes
            if (tripPageId && /^[0-9a-f-]{36}$/i.test(tripPageId)) {
              const currentDays = aiDaysRef.current ?? [];
              fetch(`/api/trips/${tripPageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days: currentDays }),
              }).catch(() => { /* silent — final PATCH below is authoritative */ });
            }
          }
        }
      } catch (e) {
        setLiveBuildError(e instanceof Error ? e.message : 'Something went wrong');
        setIsLiveBuilding(false);
        return;
      }

      // 5. Final PATCH — complete days + meta + stamp itinerary_generated_at
      setLiveBuildStatus('Saving your trip…');
      const finalDays = aiDaysRef.current ?? [];
      const metaFull: Record<string, unknown> = {
        ...metaBase,
        title:               (firstMeta?.title as string)               || null,
        practicalNotes:      firstMeta?.practicalNotes                   || null,
        hotelSuggestions:    firstMeta?.hotelSuggestions                 || null,
        foodieTips:          firstMeta?.foodieTips                       || null,
        nightlifeHighlights: firstMeta?.nightlifeHighlights              || null,
        shoppingGuide:       firstMeta?.shoppingGuide                    || null,
      };
      if (firstMeta) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAiMeta(metaFull as any);
      }

      if (tripPageId && /^[0-9a-f-]{36}$/i.test(tripPageId)) {
        try {
          await fetch(`/api/trips/${tripPageId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              days:     finalDays,
              metaPatch: metaFull,
              tripPatch: { itinerary_generated_at: new Date().toISOString() },
            }),
          });
        } catch { /* silent */ }
      }

      // 6. Cleanup: clear sessionStorage, strip ?mode=generating from URL
      sessionStorage.removeItem('tripcoord_gen_payload');
      sessionStorage.removeItem('tripcoord_gen_meta');
      setLiveBuildStatus('');
      setIsLiveBuilding(false);
      window.history.replaceState({}, '', window.location.pathname);
    };

    run();
  }, [searchParams, tripPageId, syncAiDays]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: subscribe to itinerary updates for live vote sync
  useEffect(() => {
    if (!tripPageId || !/^[0-9a-f-]{36}$/i.test(tripPageId)) return;

    // Dynamically import to avoid SSR issues
    import('@/lib/supabase/client').then(({ createClient: createBrowserClient }) => {
      const supabase = createBrowserClient();

      const channel = supabase
        .channel(`itinerary:${tripPageId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'itineraries', filter: `trip_id=eq.${tripPageId}` },
          (payload) => {
            const newDays = (payload.new as { days?: ItineraryDay[] }).days;
            if (!Array.isArray(newDays)) return;
            // Merge: update vote counts from server but preserve current session's myVote
            setVotes(prev => {
              const merged = { ...prev };
              for (const day of newDays) {
                for (const track of ['shared', 'track_a', 'track_b'] as const) {
                  for (const act of (day.tracks[track] as Activity[])) {
                    if ((act as { upVotes?: number; downVotes?: number }).upVotes !== undefined) {
                      const id = (act as { id: string }).id;
                      merged[id] = {
                        up: (act as { upVotes?: number }).upVotes ?? 0,
                        down: (act as { downVotes?: number }).downVotes ?? 0,
                        myVote: prev[id]?.myVote ?? null,
                      };
                    }
                  }
                }
              }
              return merged;
            });
          }
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    });
  }, [tripPageId]);

  // ── Day-tab arrow scroll helpers ─────────────────────────────────────────────
  const updateDayTabScroll = useCallback(() => {
    const el = dayTabScrollRef.current;
    if (!el) return;
    setDayTabCanScrollLeft(el.scrollLeft > 4);
    setDayTabCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  // Re-check overflow whenever AI days load or on resize
  useEffect(() => {
    const timer = setTimeout(updateDayTabScroll, 50);
    window.addEventListener('resize', updateDayTabScroll);
    return () => { clearTimeout(timer); window.removeEventListener('resize', updateDayTabScroll); };
  }, [aiDays, updateDayTabScroll]);
  // ─────────────────────────────────────────────────────────────────────────────

  const clearAiItinerary = useCallback(() => {
    localStorage.removeItem('generatedItinerary');
    localStorage.removeItem('generatedTripMeta');
    localStorage.removeItem('currentTripId');
    syncAiDays(null);
    setAiMeta(null);
    setShowAiBanner(false);
    setSelectedDay(1);
  }, []);

  const handleGenerateHotels = useCallback(async () => {
    const destination = aiMeta?.destination;
    if (!destination) {
      setHotelGenError('Trip destination not loaded yet — please refresh the page and try again.');
      return;
    }
    setGeneratingHotels(true);
    setHotelGenError(null);
    try {
      // Derive unique cities from itinerary days; fall back to the trip destination.
      // Use aiDays directly (activeDays is derived from aiDays but declared after this callback).
      const days = aiDays ?? itineraryDays;
      const citiesInOrder: string[] = [];
      for (const d of days) {
        const c = d.city?.trim();
        if (c && !citiesInOrder.includes(c)) citiesInOrder.push(c);
      }
      const targetCities = citiesInOrder.length > 0 ? citiesInOrder : [destination];

      // Fetch hotel suggestions for every city in parallel.
      const results = await Promise.all(
        targetCities.map(async (city) => {
          const res = await fetch('/api/generate-hotels', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              destination: city,
              startDate: aiMeta?.startDate,
              endDate: aiMeta?.endDate,
              budget: aiMeta?.budget,
              budgetBreakdown: aiMeta?.budgetBreakdown,
            }),
          });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData?.error || `Server error ${res.status}`);
          }
          const { hotelSuggestions } = await res.json();
          // Tag each suggestion with its city so the UI can group them.
          return ((hotelSuggestions ?? []) as Array<Record<string, unknown>>).map(
            (h) => ({ ...h, city: targetCities.length > 1 ? city : undefined })
          );
        })
      );

      const allSuggestions = results.flat();
      if (allSuggestions.length > 0) {
        setAiMeta(prev => prev ? { ...prev, hotelSuggestions: allSuggestions as typeof prev.hotelSuggestions } : prev);
      } else {
        setHotelGenError('No hotel suggestions returned. Try again.');
      }
    } catch (err) {
      setHotelGenError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setGeneratingHotels(false);
    }
  }, [aiMeta, aiDays]);

  // Form state
  const [newActivityName, setNewActivityName] = useState('');
  const [newActivityAddress, setNewActivityAddress] = useState('');
  const [newActivityWebsite, setNewActivityWebsite] = useState('');
  const [newActivityStartTime, setNewActivityStartTime] = useState('');
  const [newActivityEndTime, setNewActivityEndTime] = useState('');
  const [newActivityTimeError, setNewActivityTimeError] = useState<string | null>(null);
  const [newActivityTrack, setNewActivityTrack] = useState<'shared' | 'track_a' | 'track_b'>('shared');
  const [newActivityIsRestaurant, setNewActivityIsRestaurant] = useState(false);
  const [newActivityIsPrivate, setNewActivityIsPrivate] = useState(false);
  const [newActivityDay, setNewActivityDay] = useState(1);

  // Sidebar-add: tracks Foodie tips added to itinerary this session so they disappear
  const [isSidebarAdd, setIsSidebarAdd] = useState(false);
  const [addedFoodieTipNames, setAddedFoodieTipNames] = useState<Set<string>>(new Set());

  // Collapsible sidebar sections — priority panels start collapsed, utility panels open
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    foodie: true, nightlife: true, shopping: true,
    photoSpots: false, hotel: false,
  });
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`sidebarSections_${params.id}`);
      if (stored) setCollapsedSections(JSON.parse(stored));
    } catch {}
  }, [params.id]);

  // Compact View — slim agenda rows instead of full cards
  const [isCompactView, setIsCompactView] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`compactView_${params.id}`);
      if (stored !== null) setIsCompactView(stored === 'true');
    } catch {}
  }, [params.id]);

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

  // Close the + add menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false);
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
    setIsSidebarAdd(false);
    clearSearch();
    setShowSuggestions(false);
  };

  const handleCloseModal = () => {
    setShowAddActivityModal(false);
    setEditingActivity(null);
    resetModal();
  };

  // Toggle a sidebar section open/closed and persist to localStorage
  const toggleSidebarSection = (key: string) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(`sidebarSections_${params.id}`, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Open the Add Activity modal pre-filled from a Foodie Finds tip
  const handleAddFoodieToItinerary = (tip: { name: string; neighborhood?: string; timeOfDay?: string }) => {
    resetModal();
    setNewActivityName(tip.name);
    setNewActivityAddress(tip.neighborhood ?? '');
    setNewActivityIsRestaurant(true);
    // Suggest a sensible time based on the tip's timeOfDay field
    const startTime = tip.timeOfDay === 'morning' ? '09:00' : tip.timeOfDay === 'afternoon' ? '13:00' : '19:00';
    const endTime   = tip.timeOfDay === 'morning' ? '10:30' : tip.timeOfDay === 'afternoon' ? '14:30' : '21:00';
    setNewActivityStartTime(startTime);
    setNewActivityEndTime(endTime);
    setNewActivityDay(selectedDay);
    setIsSidebarAdd(true);
    setShowAddActivityModal(true);
  };

  // "I Booked This" on AI suggestions — opens Add Hotel modal pre-filled so user can confirm dates
  const handleBookHotel = (hotel: { name: string; neighborhood?: string; city?: string }) => {
    const tripStart = tripRow?.start_date ?? aiMeta?.startDate ?? '';
    const tripEnd = tripRow?.end_date ?? aiMeta?.endDate ?? '';
    setHotelFormName(hotel.name);
    setHotelFormCity(hotel.city ?? '');
    setHotelFormAddress(hotel.neighborhood ?? '');
    setHotelFormCheckIn(tripStart);
    setHotelFormCheckOut(tripEnd);
    setEditingHotelIndex(null); // new booking, not an edit
    setShowAddHotelModal(true);
  };

  // Delete a booked hotel by index
  const handleDeleteHotel = (index: number) => {
    const updated = (aiMeta?.bookedHotels ?? []).filter((_, i) => i !== index);
    setAiMeta(prev => prev ? { ...prev, bookedHotels: updated } : prev);
    setTripRow(prev => prev ? { ...prev, booked_hotels: updated } : prev);
    const tripId = params.id;
    if (tripId && /^[0-9a-f-]{36}$/i.test(tripId)) {
      fetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripPatch: { booked_hotels: updated } }),
      }).catch(() => {});
    }
  };

  // Edit a booked hotel — opens Add Hotel modal pre-filled at the given index
  const handleEditHotel = (hotel: { name: string; city?: string; address?: string; checkIn?: string; checkOut?: string }, index: number) => {
    setHotelFormName(hotel.name);
    setHotelFormCity(hotel.city ?? '');
    setHotelFormAddress(hotel.address ?? '');
    setHotelFormCheckIn(hotel.checkIn ?? '');
    setHotelFormCheckOut(hotel.checkOut ?? '');
    setEditingHotelIndex(index);
    setShowAddHotelModal(true);
  };

  // ─── Derived state — declared early so callbacks below can reference them ────
  const activeDays = aiDays ?? itineraryDays;
  const trip = aiMeta
    ? { ...trips[0], destination: aiMeta.destination || trips[0].destination,
        budgetBreakdown: (aiMeta.budgetBreakdown as unknown as typeof trips[0]['budgetBreakdown']) ?? trips[0].budgetBreakdown,
        budgetTotal: aiMeta.budget ?? trips[0].budgetTotal }
    : (trips.find(t => t.id === 'trip_1') || trips[0]);
  // Guard: if activeDays is empty, currentDayData will never be rendered (the
  // "no itinerary" empty state gate below returns early before any access).
  // Cast is safe because every render path that uses currentDayData is gated on
  // activeDays.length > 0 via the hasDays check.
  const currentDayData: ItineraryDay = (
    activeDays.find((d: { day: number }) => d.day === selectedDay) || activeDays[0] || {}
  ) as ItineraryDay;

  // ─── Persist updated days to state + localStorage + Supabase ─────────────────
  const persistDays = useCallback((updated: ItineraryDay[]) => {
    syncAiDays(updated);
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
    // Validate time ordering
    if (newActivityStartTime && newActivityEndTime && newActivityEndTime <= newActivityStartTime) {
      setNewActivityTimeError('End time must be after start time');
      return;
    }
    setNewActivityTimeError(null);

    const timeSlot = newActivityStartTime && newActivityEndTime
      ? `${newActivityStartTime}–${newActivityEndTime}`
      : newActivityStartTime
      ? `${newActivityStartTime}–${newActivityStartTime}`
      : '12:00–13:00';

    const targetDay = (editingActivity || isSidebarAdd) ? newActivityDay : selectedDay;

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

    const updatedDays = (activeDays as ItineraryDay[]).map(day => {
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

    persistDays(updatedDays as ItineraryDay[]);
    // If this add came from a Foodie Finds tip, mark the tip as added so it disappears
    if (isSidebarAdd && newActivityName) {
      setAddedFoodieTipNames(prev => new Set(Array.from(prev).concat(newActivityName)));
    }
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

  // ─── Delete activity (with 5-second undo) ────────────────────────────────────
  const handleDeleteActivity = useCallback((activityId: string) => {
    // Find the activity and which track it lives in
    const dayData = (activeDays as ItineraryDay[]).find(d => d.day === selectedDay);
    let deletedAct: Activity | undefined;
    let deletedTrack: 'shared' | 'track_a' | 'track_b' = 'shared';
    for (const track of ['shared', 'track_a', 'track_b'] as const) {
      const found = dayData?.tracks?.[track]?.find((a: Activity) => a.id === activityId);
      if (found) { deletedAct = found; deletedTrack = track; break; }
    }

    const updatedDays = (activeDays as ItineraryDay[]).map(day => {
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

    // Optimistically update display immediately (no Supabase yet)
    syncAiDays(updatedDays as ItineraryDay[]);

    // Store only the deleted activity so undo re-inserts into the live state
    // (avoids clobbering any edits made during the 5-second undo window)
    if (deletedAct) {
      setUndoSnapshot({ activity: deletedAct, dayNumber: selectedDay, track: deletedTrack, label: deletedAct.name ?? deletedAct.title ?? 'Activity' });
    }

    // Cancel any existing undo timer
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    // Persist to Supabase + localStorage after 5s (if not undone)
    undoTimerRef.current = setTimeout(() => {
      persistDays(updatedDays as ItineraryDay[]);
      setUndoSnapshot(null);
      undoTimerRef.current = null;
    }, 5000);
  }, [activeDays, selectedDay, persistDays]);

  const handleUndoDelete = useCallback(() => {
    if (!undoSnapshot) return;
    if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
    // Re-insert the deleted activity into the current live state
    const restoredDays = (activeDays as ItineraryDay[]).map(day => {
      if (day.day !== undoSnapshot.dayNumber) return day;
      return {
        ...day,
        tracks: {
          ...day.tracks,
          [undoSnapshot.track]: [...(day.tracks[undoSnapshot.track] ?? []), undoSnapshot.activity],
        },
      };
    });
    syncAiDays(restoredDays as ItineraryDay[]);
    setUndoSnapshot(null);
  }, [undoSnapshot, activeDays]);

  // ─── AI: suggest a replacement activity ──────────────────────────────────────
  const handleSuggestAnother = useCallback(async (activity: Activity) => {
    setSuggestingActivityId(activity.id);
    setSuggestError(null);
    try {
      const res = await fetch('/api/suggest-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: currentDayData?.city ?? trip.destination,
          dayNumber: selectedDay,
          date: currentDayData.date,
          mealType: (activity as Activity & { mealType?: string }).mealType ?? null,
          isRestaurant: activity.isRestaurant ?? false,
          existingActivityName: activity.name || activity.title,
          timeSlot: activity.timeSlot,
          track: activity.track,
          priorities: aiMeta?.preferences?.priorities ?? [],
          budget: aiMeta?.budget,
          budgetBreakdown: aiMeta?.budgetBreakdown,
          isCruise: aiMeta?.isCruise ?? false,
          cruiseLine: aiMeta?.cruiseLine ?? '',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.activity) throw new Error(data.message || 'No suggestion returned');

      const replacement: Activity = { ...data.activity, id: activity.id, track: activity.track, wasReplaced: true };

      // Save previous activity to history for undo
      setReplacementHistory(prev => ({ ...prev, [activity.id]: activity }));
      // Mark as replaced (shows badge)
      setReplacedActivityIds(prev => new Set(Array.from(prev).concat(activity.id)));
      // Clear votes for this slot — new suggestion starts fresh
      setVotes(prev => {
        const { [activity.id]: _dropped, ...rest } = prev;
        return rest;
      });
      // Auto-expire undo after 60 seconds
      setTimeout(() => {
        setReplacementHistory(prev => {
          const { [activity.id]: _expired, ...rest } = prev;
          return rest;
        });
      }, 60000);

      const updatedDays = (activeDays as ItineraryDay[]).map(day => {
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
      persistDays(updatedDays as ItineraryDay[]);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : 'Could not get suggestion');
      setTimeout(() => setSuggestError(null), 3000);
    } finally {
      setSuggestingActivityId(null);
    }
  }, [activeDays, selectedDay, currentDayData, trip, aiMeta, persistDays]);

  // ─── Undo AI replacement ──────────────────────────────────────────────────────
  const handleUndoReplacement = useCallback((activityId: string) => {
    const original = replacementHistory[activityId];
    if (!original) return;
    const restoredDays = (activeDays as ItineraryDay[]).map(day => {
      if (day.day !== selectedDay) return day;
      return {
        ...day,
        tracks: {
          shared:  day.tracks.shared.map((a: Activity)  => a.id === activityId ? original : a),
          track_a: day.tracks.track_a.map((a: Activity) => a.id === activityId ? original : a),
          track_b: day.tracks.track_b.map((a: Activity) => a.id === activityId ? original : a),
        },
      };
    });
    persistDays(restoredDays as ItineraryDay[]);
    // Clear history + badge for this activity
    setReplacementHistory(prev => { const { [activityId]: _, ...rest } = prev; return rest; });
    setReplacedActivityIds(prev => { const next = new Set(prev); next.delete(activityId); return next; });
    // Restore old votes if any were persisted on the original
    if ((original.upVotes ?? 0) > 0 || (original.downVotes ?? 0) > 0) {
      setVotes(prev => ({ ...prev, [activityId]: { up: original.upVotes ?? 0, down: original.downVotes ?? 0, myVote: null } }));
    }
  }, [activeDays, selectedDay, replacementHistory, persistDays]);

  // ─── Edit trip destination / dates ───────────────────────────────────────────
  const handleOpenEditTrip = useCallback(() => {
    setEditDest(aiMeta?.destination ?? trip.destination);
    setEditStartDate(aiMeta?.startDate ?? '');
    setEditEndDate(aiMeta?.endDate ?? '');
    setShowEditTripModal(true);
  }, [aiMeta, trip.destination]);

  const handleSaveTripEdit = useCallback(async () => {
    if (!editDest.trim()) return;
    setSavingTripEdit(true);
    try {
      const city = editDest.split(',')[0].trim();
      const newTitle = `${city} Adventure`;

      // Shift day dates if the start date changed
      let updatedDays: ItineraryDay[] | null = null;
      if (editStartDate && aiMeta?.startDate && editStartDate !== aiMeta.startDate) {
        const oldStart = new Date(aiMeta.startDate);
        const newStart = new Date(editStartDate);
        const diffDays = Math.round((newStart.getTime() - oldStart.getTime()) / (1000 * 60 * 60 * 24));
        updatedDays = (activeDays as ItineraryDay[]).map(day => {
          const d = new Date(day.date);
          d.setDate(d.getDate() + diffDays);
          return { ...day, date: d.toISOString().split('T')[0] };
        });
      }

      const tripId = params.id;
      const isUuid = tripId && /^[0-9a-f-]{36}$/i.test(tripId);
      if (isUuid) {
        await fetch(`/api/trips/${tripId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tripPatch: {
              destination: editDest.trim(),
              title: newTitle,
              ...(editStartDate ? { start_date: editStartDate } : {}),
              ...(editEndDate   ? { end_date:   editEndDate   } : {}),
            },
            metaPatch: {
              destination: editDest.trim(),
              ...(editStartDate ? { startDate: editStartDate } : {}),
              ...(editEndDate   ? { endDate:   editEndDate   } : {}),
            },
            ...(updatedDays ? { days: updatedDays } : {}),
          }),
        });
      }

      // Update local state immediately
      setAiMeta(prev => prev ? {
        ...prev,
        destination: editDest.trim(),
        ...(editStartDate ? { startDate: editStartDate } : {}),
        ...(editEndDate   ? { endDate:   editEndDate   } : {}),
      } : {
        destination: editDest.trim(),
        startDate: editStartDate || undefined,
        endDate: editEndDate || undefined,
      });

      if (updatedDays) persistDays(updatedDays as ItineraryDay[]);

      setShowEditTripModal(false);
    } catch (err) {
      console.error('Failed to save trip edit:', err);
    } finally {
      setSavingTripEdit(false);
    }
  }, [editDest, editStartDate, editEndDate, aiMeta, activeDays, params.id, persistDays]);

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

  const hasTrackA = (currentDayData.tracks?.track_a?.length ?? 0) > 0;
  const hasTrackB = (currentDayData.tracks?.track_b?.length ?? 0) > 0;
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

  // If the day has a dinnerMeetupLocation but no dinner restaurant in the shared track,
  // synthesize a virtual dinner card so the meetup restaurant actually appears on the timeline.
  const sharedActivities: Activity[] = (currentDayData.tracks?.shared ?? []) as Activity[];
  // Use mealType='dinner' as the authoritative check — the old regex on timeSlot never matched
  // since "19:00–21:00" contains no keyword, causing false negatives and missing cards.
  const hasDinnerInShared = sharedActivities.some(
    (a: Activity) => a.isRestaurant && a.mealType === 'dinner'
  );
  const virtualDinnerActivity: Activity | null =
    currentDayData.dinnerMeetupLocation && !hasDinnerInShared
      ? {
          id: `virtual-dinner-${currentDayData.day}`,
          title: currentDayData.dinnerMeetupLocation,
          description: 'Both tracks reconvene here for dinner.',
          timeSlot: '19:00–21:00',
          address: '',
          website: '',
          isRestaurant: true,
          mealType: 'dinner' as const,
          track: 'shared' as const,
          dayNumber: currentDayData.day,
          costEstimate: 0,
          confidence: 1,
          verified: false,
          upVotes: 0,
          downVotes: 0,
        }
      : null;

  const allActivities: Activity[] = [
    ...sharedActivities.map((a: Activity) => ({ ...a, track: 'shared' as const })),
    ...(virtualDinnerActivity ? [virtualDinnerActivity] : []),
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

  // Detect a "Group Meetup" activity embedded inline in tracks (older generated trips that
  // set it as an activity instead of meetupTime/meetupLocation). Extract it so we can render
  // it in the dedicated meetup block and exclude it from the normal timeline.
  const inlineMeetupActivity = !currentDayData.meetupTime
    ? sortedActivities.find(a => /group\s*meetup|morning\s*meetup/i.test(a.title ?? ''))
    : null;

  // Effective meetup fields — prefer structured data, fall back to inline activity
  const effectiveMeetupTime = currentDayData.meetupTime ?? inlineMeetupActivity?.timeSlot?.split(/–|—/)[0]?.trim();
  const effectiveMeetupLocation = currentDayData.meetupLocation ?? inlineMeetupActivity?.address ?? inlineMeetupActivity?.description?.split('.')[0] ?? inlineMeetupActivity?.title;

  // If the meetup location mentions "Hotel Lobby" generically, substitute the actual hotel name
  // for today so the card reads "Lobby of The Marriott" instead of just "Hotel Lobby".
  const todayHotelForMeetup = (aiMeta?.bookedHotels ?? []).find(h => {
    if (!h.checkIn && !h.checkOut) return true;
    const dayDate = currentDayData.date;
    if (!dayDate) return true;
    const checkIn = h.checkIn ?? null;
    const checkOut = h.checkOut ?? null;
    if (checkIn && dayDate < checkIn) return false;
    if (checkOut && dayDate >= checkOut) return false;
    return true;
  });
  const meetupDisplayLocation = (() => {
    if (!effectiveMeetupLocation) return effectiveMeetupLocation;
    const isGenericLobby = /^hotel\s+lobby$/i.test(effectiveMeetupLocation.trim());
    if (isGenericLobby && todayHotelForMeetup) {
      return `Lobby of ${todayHotelForMeetup.name}`;
    }
    return effectiveMeetupLocation;
  })();

  const timelineItems: TimelineItem[] = [
    ...sortedActivities
      // Exclude the inline meetup activity — it's shown in the dedicated meetup block
      .filter(a => !inlineMeetupActivity || a.id !== inlineMeetupActivity.id)
      .map(a => ({
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
      <div className="max-w-5xl mx-auto">

        {/* Live-build progress banner — shown while city-by-city generation is running */}
        {isLiveBuilding && (
          <div className="mb-4 flex items-center justify-between px-5 py-3 bg-sky-700 text-white rounded-2xl shadow-md">
            <div className="flex items-center gap-3 min-w-0">
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
              <span className="text-sm font-medium truncate">
                {liveBuildStatus || 'Building your itinerary…'}
              </span>
            </div>
            {liveBuildTotal > 0 && (
              <span className="text-xs font-semibold opacity-80 flex-shrink-0 ml-4">
                {liveBuildDone}/{liveBuildTotal} days
              </span>
            )}
          </div>
        )}
        {liveBuildError && (
          <div className="mb-4 flex items-center gap-3 px-5 py-3 bg-red-50 border border-red-200 text-red-800 rounded-2xl">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500" />
            <span className="text-sm font-medium">{liveBuildError}</span>
          </div>
        )}

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
        {bookingSaved && (
          <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-zinc-900 text-white px-5 py-3.5 rounded-2xl shadow-xl">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-semibold">{bookingSaved}</span>
          </div>
        )}
        {storyLocked && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-zinc-800 text-white px-4 py-2.5 rounded-full shadow-lg text-sm font-medium">
            <BookOpen className="w-4 h-4 text-zinc-400" />
            Available the day after your trip ends
          </div>
        )}

        {/* Undo delete toast — shown for 5s after an activity is deleted */}
        {undoSnapshot && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-zinc-900 text-white px-5 py-3 rounded-full shadow-xl">
            <Trash2 className="w-4 h-4 text-zinc-400 flex-shrink-0" />
            <span className="text-sm font-medium">
              <span className="text-zinc-300">{undoSnapshot.label}</span> removed
            </span>
            <button
              onClick={handleUndoDelete}
              className="ml-1 text-sm font-bold text-sky-400 hover:text-sky-300 transition-colors underline underline-offset-2"
            >
              Undo
            </button>
          </div>
        )}

        {/* Day Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 group/dest">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                {currentDayData?.city || aiMeta?.destination || trip.destination}
              </p>
              {aiDays && (
                <button
                  onClick={handleOpenEditTrip}
                  title="Edit destination & dates"
                  className="opacity-0 group-hover/dest:opacity-100 transition-opacity p-0.5 rounded hover:bg-zinc-100 text-zinc-300 hover:text-zinc-500"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
            <h1 className="text-2xl font-script italic font-semibold text-zinc-900 mb-2">
              {new Date(currentDayData.date + 'T00:00:00').toLocaleDateString('en-US', {
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
          {/* Add menu is disabled once the trip is completed */}
          {(() => {
            const isTripCompleted = tripRow?.status === 'completed';
            return (
          <div className="flex items-center gap-2 flex-shrink-0 mt-1 flex-wrap justify-end">
            {/* Add Someone button — opens invite modal (trip ID already in context, no selector needed) */}
            <button
              onClick={() => { setInviteSent(false); setInviteError(null); setShowInviteModal(true); }}
              title="Invite someone to this trip"
              className="flex items-center gap-1.5 px-3 py-2 md:px-4 bg-white border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs md:text-sm font-semibold rounded-full shadow-sm transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Add</span>
            </button>

            {/* Combined + Add dropdown */}
            <div className="relative" ref={addMenuRef}>
              <button
                onClick={() => !isTripCompleted && setShowAddMenu(v => !v)}
                title={isTripCompleted ? 'Trip is completed — viewing only' : undefined}
                className={`flex items-center gap-1.5 px-3 py-2 md:px-4 text-xs md:text-sm font-semibold rounded-full shadow-sm transition-all ${
                  isTripCompleted
                    ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                    : 'bg-sky-800 hover:bg-sky-900 text-white'
                }`}
              >
                <Plus className="w-4 h-4" />
                Add
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAddMenu ? 'rotate-180' : ''}`} />
              </button>
              {showAddMenu && !isTripCompleted && (
                <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-zinc-100 py-1.5 min-w-[190px] z-30">
                  <button
                    onClick={() => { setShowAddActivityModal(true); setShowAddMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 flex items-center gap-2.5"
                  >
                    <Plus className="w-4 h-4 text-sky-600" /> Activity
                  </button>
                  <button
                    onClick={() => { hasTransportParser ? setShowParseModal(true) : setUpgradePromptKey('feature_locked'); setShowAddMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 flex items-center gap-2.5"
                  >
                    <Sparkles className="w-4 h-4 text-sky-600" /> Transportation
                    {!hasTransportParser && <LockBadge />}
                  </button>
                  <div className="my-1 border-t border-zinc-100" />
                  <button
                    onClick={() => {
                      // Pre-fill dates from trip start/end so users don't have to type them
                      const tripStart = tripRow?.start_date ?? aiMeta?.startDate ?? '';
                      const tripEnd = tripRow?.end_date ?? aiMeta?.endDate ?? '';
                      setHotelFormCheckIn(tripStart);
                      setHotelFormCheckOut(tripEnd);
                      setShowAddHotelModal(true);
                      setShowAddMenu(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 flex items-center gap-2.5"
                  >
                    <span className="text-base leading-none">🏨</span> Hotel
                  </button>
                  <button
                    onClick={() => { setShowAddFlightModal(true); setShowAddMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 flex items-center gap-2.5"
                  >
                    <span className="text-base leading-none">✈️</span> Flight
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                const next = !isCompactView;
                setIsCompactView(next);
                try { localStorage.setItem(`compactView_${params.id}`, String(next)); } catch {}
              }}
              title={isCompactView ? 'Switch to full view' : 'Switch to compact view'}
              className={`flex items-center gap-1.5 px-3 py-2 md:px-4 border text-xs md:text-sm font-semibold rounded-full shadow-sm transition-all ${
                isCompactView
                  ? 'bg-zinc-900 border-zinc-900 text-white'
                  : 'bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700'
              }`}
            >
              <AlignJustify className="w-4 h-4" />
              <span className="hidden sm:inline">Compact</span>
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

            {/* Open day route in Google Maps */}
            {sortedActivities.length > 0 && (
              <a
                href={(() => {
                  const addrs = sortedActivities
                    .map(a => a.address)
                    .filter(Boolean)
                    .slice(0, 10); // Google Maps supports up to 10 waypoints
                  if (addrs.length === 0) return '#';
                  if (addrs.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrs[0]!)}`;
                  const origin = encodeURIComponent(addrs[0]!);
                  const dest = encodeURIComponent(addrs[addrs.length - 1]!);
                  const waypoints = addrs.slice(1, -1).map(a => encodeURIComponent(a!)).join('|');
                  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}`;
                })()}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 md:px-4 bg-white border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs md:text-sm font-semibold rounded-full shadow-sm transition-all"
              >
                <Navigation className="w-4 h-4" />
                <span className="hidden sm:inline">Route</span>
              </a>
            )}

            {/* Export PDF */}
            <a
              href={`/trip/${params.id}/print`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 md:px-4 bg-white border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs md:text-sm font-semibold rounded-full shadow-sm transition-all"
            >
              <FileDown className="w-4 h-4" />
              <span className="hidden sm:inline">Export</span>
            </a>

            {(() => {
              // Trip Story is available only after the trip's end date has passed (next day)
              const endDateStr = tripRow?.end_date || aiMeta?.endDate;
              const tripEnded = endDateStr
                ? new Date() > new Date(new Date(endDateStr).getTime() + 24 * 60 * 60 * 1000)
                : false;
              const storyAvailable = hasTripStory && tripEnded;
              return (
                <button
                  onClick={() => {
                    if (!hasTripStory) { setUpgradePromptKey('feature_locked'); return; }
                    if (!tripEnded) {
                      setStoryLocked(true);
                      setTimeout(() => setStoryLocked(false), 2500);
                      return;
                    }
                    setShowStoryModal(true);
                  }}
                  title={hasTripStory && !tripEnded ? 'Available the day after your trip ends' : undefined}
                  className={`flex items-center gap-1.5 px-3 py-2 md:px-4 border text-xs md:text-sm font-semibold rounded-full shadow-sm transition-all ${
                    storyAvailable
                      ? 'bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700'
                      : 'bg-white border-zinc-200 text-zinc-400 cursor-not-allowed'
                  }`}
                >
                  <BookOpen className={`w-4 h-4 ${storyAvailable ? 'text-sky-600' : 'text-zinc-300'}`} />
                  <span className="hidden sm:inline">Trip </span>Story
                  {!hasTripStory && <LockBadge />}
                </button>
              );
            })()}
          </div>
          );
        })()}
        </div>

        {/* AI accuracy disclaimer — shown on AI-generated itineraries */}
        {aiDays && (
          <p className="flex items-center gap-1.5 text-[11px] text-zinc-400 mb-5 -mt-2">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            AI-generated content may contain errors. Always verify opening hours, prices, and bookings directly.
          </p>
        )}

        {/* Regenerate with group input banner — Explorer/Nomad only, organizer only */}
        {newPrefsCount > 0
          && (tier === 'explorer' || tier === 'nomad')
          && currentUser.id
          && tripRow?.organizer_id === currentUser.id
          && (
          <div className="mb-5 flex items-center gap-3 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
            <Users className="w-4 h-4 text-sky-600 flex-shrink-0" />
            <p className="flex-1 text-sm text-sky-800">
              <span className="font-semibold">{newPrefsCount} new {newPrefsCount === 1 ? 'traveler has' : 'travelers have'} added their preferences</span>
              {' '}since this itinerary was built.
            </p>
            <button
              onClick={handleRegenerate}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-full transition-all whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Regenerate
            </button>
          </div>
        )}

        {/* Day Selector — arrow navigation when overflow */}
        <div className="mb-8 relative flex items-center">
          {dayTabCanScrollLeft && (
            <button
              onClick={() => dayTabScrollRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}
              className="absolute left-0 z-10 w-8 h-8 flex items-center justify-center bg-white border border-zinc-200 rounded-full shadow-sm hover:bg-zinc-50 transition-colors flex-shrink-0"
              aria-label="Scroll days left"
            >
              <ChevronLeft className="w-4 h-4 text-zinc-600" />
            </button>
          )}
          <div
            ref={dayTabScrollRef}
            onScroll={updateDayTabScroll}
            className={`flex gap-2 overflow-x-auto pb-1 flex-1 ${dayTabCanScrollLeft ? 'pl-10' : ''} ${dayTabCanScrollRight ? 'pr-10' : ''}`}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {activeDays.map((day: { day: number; date: string }) => {
              const dayDateStr = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              return (
                <button
                  key={day.day}
                  onClick={() => setSelectedDay(day.day)}
                  className={`px-5 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-all flex-shrink-0 ${
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
          {dayTabCanScrollRight && (
            <button
              onClick={() => dayTabScrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}
              className="absolute right-0 z-10 w-8 h-8 flex items-center justify-center bg-white border border-zinc-200 rounded-full shadow-sm hover:bg-zinc-50 transition-colors flex-shrink-0"
              aria-label="Scroll days right"
            >
              <ChevronRight className="w-4 h-4 text-zinc-600" />
            </button>
          )}
        </div>

        {/* Map View */}
        {showMapView && (
          <div className="mb-6">
            <MapView
              activities={sortedActivities}
              transportLegs={[...(currentDayData.transportLegs ?? []), ...(addedTransport[selectedDay] ?? [])]}
              destination={currentDayData?.city ?? trip.destination}
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
                {/* Track legend + trip priorities — always visible on AI days */}
                {aiDays && (
                  <div className="mb-6 pb-4 border-b border-zinc-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Today&apos;s tracks</p>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { color: 'bg-sky-500', label: 'Shared', show: true },
                        { color: 'bg-violet-500', label: currentDayData.trackALabel || 'Track A', show: hasTrackA },
                        { color: 'bg-rose-500', label: currentDayData.trackBLabel || 'Track B', show: hasTrackB },
                      ].filter(t => t.show).map(t => (
                        <div key={t.label} className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${t.color}`} />
                          <span className="text-xs font-semibold text-zinc-600">{t.label}</span>
                        </div>
                      ))}
                    </div>
                    {/* Trip priorities from the Builder */}
                    {aiMeta?.preferences?.priorities && aiMeta.preferences.priorities.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Trip priorities</p>
                        <div className="flex flex-wrap gap-2">
                          {aiMeta.preferences.priorities.map((p: string) => {
                            const PRIORITY_MAP: Record<string, { icon: string; label: string }> = {
                              // Canonical 15 priorities — keep in sync with trip/new/page.tsx
                              nature:        { icon: '🌿', label: 'Nature' },
                              food:          { icon: '🍽️', label: 'Food' },
                              nightlife:     { icon: '🎶', label: 'Nightlife' },
                              history:       { icon: '📜', label: 'History' },
                              sports:        { icon: '⛹️', label: 'Sports' },
                              photography:   { icon: '📷', label: 'Photography' },
                              wellness:      { icon: '💆', label: 'Wellness' },
                              shopping:      { icon: '🛍️', label: 'Shopping' },
                              adventure:     { icon: '⚡', label: 'Adventure' },
                              culture:       { icon: '🏛️', label: 'Culture' },
                              beach:         { icon: '🏖️', label: 'Beach' },
                              themepark:     { icon: '🎢', label: 'Theme Parks' },
                              family:        { icon: '👨‍👩‍👧', label: 'Family/Kids' },
                              budget:        { icon: '💰', label: 'Budget' },
                              accessibility: { icon: '♿', label: 'Accessibility' },
                              // Legacy aliases — kept for backward compatibility with older stored trips
                              beaches:       { icon: '🏖️', label: 'Beach' },
                              hiking:        { icon: '🥾', label: 'Hiking' },
                              relaxation:    { icon: '🧘', label: 'Wellness' },
                              art:           { icon: '🎨', label: 'Art' },
                              music:         { icon: '🎵', label: 'Music' },
                              romance:       { icon: '❤️', label: 'Romance' },
                            };
                            const entry = PRIORITY_MAP[p.toLowerCase()];
                            return (
                              <span key={p} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 text-xs font-semibold">
                                {entry ? <><span>{entry.icon}</span>{entry.label}</> : `✦ ${p.charAt(0).toUpperCase() + p.slice(1)}`}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-4">
                  {/* Destination Tip — insider fact about this city/day */}
                  {currentDayData.destinationTip && (
                    <div className="flex items-start gap-2.5 px-4 py-3 bg-amber-50 border border-amber-100 rounded-2xl">
                      <span className="text-base flex-shrink-0 mt-0.5">💡</span>
                      <p className="text-xs text-amber-800 font-medium leading-relaxed">{currentDayData.destinationTip}</p>
                    </div>
                  )}

                  {/* Meetup — shown for group trips; handles both structured meetupTime and legacy inline "Group Meetup" activities */}
                  {effectiveMeetupTime && meetupDisplayLocation &&
                   aiMeta?.groupType !== 'solo' && aiMeta?.groupType !== 'couple' && (
                    <div className="flex gap-4">
                      <div className="w-20 flex-shrink-0 text-right pt-3.5">
                        <p className="text-xs font-semibold text-sky-600">{effectiveMeetupTime}</p>
                      </div>
                      <div className="relative flex flex-col items-center pt-3.5">
                        <Flag className="w-3 h-3 text-sky-500 flex-shrink-0" />
                        <div className="w-px flex-1 bg-zinc-100 mt-1.5 min-h-[3rem]" />
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="bg-sky-50 border border-sky-100 rounded-2xl px-4 py-3 flex items-center gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-sky-500 mb-0.5">Group Meetup</p>
                            <p className="text-sm font-semibold text-sky-900">{meetupDisplayLocation}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {timelineItems.map((item, index) => {
                    const isLast = index === timelineItems.length - 1;

                    if (item.kind === 'transport') {
                      // Hide transport legs in compact view
                      if (isCompactView) return null;
                      const leg = item.data;
                      const cfg = transportConfig[leg.type] ?? transportConfig['car_rental'];
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

                    // Look ahead for the next activity's address (for Maps deep links)
                    const nextActItem = timelineItems.slice(index + 1).find(i => i.kind === 'activity');
                    const nextActAddress = (nextActItem?.data as Activity | undefined)?.address;

                    // ── Compact View — slim agenda row ──────────────────────────
                    if (isCompactView) {
                      const trackDot =
                        activity.track === 'track_a' ? 'bg-violet-400' :
                        activity.track === 'track_b' ? 'bg-rose-400' :
                        (aiMeta?.groupType === 'solo' || aiMeta?.groupType === 'couple') ? 'bg-zinc-300' : 'bg-sky-400';
                      return (
                        <div
                          key={activity.id}
                          className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-zinc-50 transition-colors group/compact"
                        >
                          <span className="text-xs font-semibold text-zinc-400 w-16 text-right flex-shrink-0 tabular-nums">
                            {startTime}
                          </span>
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${trackDot}`} />
                          {activity.isRestaurant
                            ? <Utensils className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0" />
                            : <div className="w-3.5 flex-shrink-0" />
                          }
                          <a
                            href={googleUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex-1 text-sm font-semibold text-zinc-800 hover:text-sky-700 transition-colors truncate"
                            title={actName}
                          >
                            {actName}
                          </a>
                          {activity.isPrivate && (
                            <span title="Private — only visible to you" className="text-xs flex-shrink-0">🔒</span>
                          )}
                          <div className="opacity-0 group-hover/compact:opacity-100 flex items-center gap-0.5 transition-opacity flex-shrink-0">
                            <button
                              onClick={() => handleEditActivity(activity)}
                              title="Edit"
                              className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteActivity(activity.id)}
                              title="Remove"
                              className="p-1 rounded-lg hover:bg-rose-50 text-zinc-400 hover:text-rose-500"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <React.Fragment key={activity.id}>
                      <div className="flex gap-4">
                        {/* Time Column */}
                        <div className="w-20 flex-shrink-0 text-right pt-4">
                          <p className="text-xs font-semibold text-zinc-400">{startTime}</p>
                        </div>

                        {/* Center Line */}
                        <div className="relative flex flex-col items-center pt-4">
                          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            activity.track === 'track_a' ? 'bg-violet-400' :
                            activity.track === 'track_b' ? 'bg-rose-400' :
                            // Solo/couple trips: neutral dot — "Shared" concept doesn't apply
                            (aiMeta?.groupType === 'solo' || aiMeta?.groupType === 'couple') ? 'bg-zinc-300' : 'bg-sky-400'
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
                                {/* AI Replaced badge */}
                                {replacedActivityIds.has(activity.id) && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 whitespace-nowrap flex items-center gap-1">
                                    <Sparkles className="w-2.5 h-2.5" />
                                    AI Pick
                                  </span>
                                )}
                                {/* Undo replacement button (shown for 60s after replace) */}
                                {replacementHistory[activity.id] && (
                                  <button
                                    onClick={() => handleUndoReplacement(activity.id)}
                                    title="Undo — restore original"
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-all whitespace-nowrap"
                                  >
                                    ← Undo
                                  </button>
                                )}
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
                                {/* Hide "Shared" badge for solo/couple — only show Track A/B labels */}
                                {(activity.track !== 'shared' || (aiMeta?.groupType !== 'solo' && aiMeta?.groupType !== 'couple')) && (
                                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${config.badgeColor}`}>
                                    {config.label}
                                  </span>
                                )}
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
                              {/* Evening Meetup badge — shown on the dinner card that is the reconvene point */}
                              {currentDayData.dinnerMeetupLocation && activity.mealType === 'dinner' && activity.track === 'shared' && (
                                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-600 text-xs font-semibold px-2.5 py-1 rounded-full border border-rose-100">
                                  🌙 Evening Meetup
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
                              const isMajorityNay = v.down > 0 && v.down > v.up;
                              return (
                                <>
                                  {/* Majority-Nay nudge banner */}
                                  {isMajorityNay && (
                                    <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                                      <span className="text-sm">😬</span>
                                      <p className="text-xs font-semibold text-amber-800 flex-1">Not the crowd favourite — want AI to find something better?</p>
                                      <button
                                        onClick={() => handleSuggestAnother(activity)}
                                        disabled={isSuggesting}
                                        className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800 disabled:opacity-50 transition-all"
                                      >
                                        {isSuggesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                        {isSuggesting ? 'Finding…' : 'Replace'}
                                      </button>
                                    </div>
                                  )}
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
                                    {/* Suggest another — pushes to the right (hidden when majority-Nay banner is showing) */}
                                    {!isMajorityNay && (
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
                                    )}
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* transportToNext connector — shown between consecutive AI activities */}
                      {!isLast && activity.transportToNext?.mode && (() => {
                        const t = activity.transportToNext!;
                        const cfg = TRANSPORT_NEXT_CONFIG[t.mode] ?? TRANSPORT_NEXT_CONFIG['rideshare'];
                        const mapsUrl = buildMapsUrl(t.mode, activity.address, nextActAddress);
                        const isRideshare = t.mode === 'rideshare' || t.mode === 'taxi' || t.mode === 'tuk-tuk';
                        const isCarRental = t.mode === 'car_rental';
                        const uberUrl = isRideshare && nextActAddress
                          ? `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=${encodeURIComponent(nextActAddress)}`
                          : null;
                        return (
                          <div className="flex gap-4 -mt-1 mb-1">
                            {/* Spacer aligns with time column */}
                            <div className="w-20 flex-shrink-0" />
                            {/* Dashed continuation line */}
                            <div className="flex flex-col items-center">
                              <div className="w-px flex-1 bg-zinc-100" style={{ backgroundImage: 'repeating-linear-gradient(to bottom, #e4e4e7 0, #e4e4e7 4px, transparent 4px, transparent 8px)' }} />
                            </div>
                            {/* Connector pill */}
                            <div className="flex-1 py-1">
                              <div className={`flex items-center gap-2 flex-wrap px-3 py-2 rounded-xl border ${cfg.border} ${cfg.bg}`}>
                                <span className={`flex items-center gap-1.5 text-xs font-semibold ${cfg.text}`}>
                                  {cfg.icon}
                                  {cfg.label}
                                </span>
                                <span className="text-zinc-300 text-xs">·</span>
                                <span className="text-xs text-zinc-500 font-medium">{formatDuration(t.durationMins)}</span>
                                {t.distanceMiles > 0 && (
                                  <>
                                    <span className="text-zinc-300 text-xs">·</span>
                                    <span className="text-xs text-zinc-500">{t.distanceMiles.toFixed(1)} mi</span>
                                  </>
                                )}
                                {t.notes && (
                                  <span className="text-xs text-zinc-400 italic w-full">{t.notes}</span>
                                )}
                                {/* Deep links */}
                                <div className="ml-auto flex items-center gap-3">
                                  <a
                                    href={mapsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`text-[10px] font-semibold ${cfg.text} hover:underline flex items-center gap-1`}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <ExternalLink className="w-2.5 h-2.5" />
                                    Google Maps
                                  </a>
                                  {isRideshare && uberUrl && (
                                    <a
                                      href={uberUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] font-semibold text-zinc-600 hover:underline flex items-center gap-1"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <ExternalLink className="w-2.5 h-2.5" />
                                      Uber
                                    </a>
                                  )}
                                  {isCarRental && (
                                    <a
                                      href="https://www.kayak.com/cars"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] font-semibold text-sky-700 hover:underline flex items-center gap-1"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <ExternalLink className="w-2.5 h-2.5" />
                                      Find Rental
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dinner meetup location — shown on split-track days so both groups know where to reconvene */}
            {currentDayData.dinnerMeetupLocation && (
              <div className="flex items-start gap-2.5 px-4 py-3 bg-rose-50 border border-rose-100 rounded-2xl mt-2">
                <Utensils className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-rose-400 mb-0.5">Evening Meetup</p>
                  <p className="text-xs text-rose-800 font-medium leading-relaxed">Both tracks reconvene for dinner at <span className="font-semibold">{currentDayData.dinnerMeetupLocation}</span></p>
                </div>
              </div>
            )}

            {/* Tonight's Stay — shown when a booked hotel covers this day */}
            {(() => {
              const todaysHotels = (aiMeta?.bookedHotels ?? []).filter(h => {
                // No dates = show on every day
                if (!h.checkIn && !h.checkOut) return true;
                const dayDate = currentDayData.date
                  ? new Date(currentDayData.date.length === 10 ? currentDayData.date + 'T00:00:00' : currentDayData.date)
                  : null;
                if (!dayDate) return true;
                const checkIn = h.checkIn ? new Date(h.checkIn.length === 10 ? h.checkIn + 'T00:00:00' : h.checkIn) : null;
                const checkOut = h.checkOut ? new Date(h.checkOut.length === 10 ? h.checkOut + 'T00:00:00' : h.checkOut) : null;
                if (checkIn && dayDate < checkIn) return false;
                if (checkOut && dayDate >= checkOut) return false; // checkout day — already departed
                return true;
              });
              if (todaysHotels.length === 0) return null;
              return (
                <div className="mt-4 space-y-2">
                  {todaysHotels.map((h, i) => {
                    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.name} ${h.address ?? aiMeta?.destination ?? ''}`.trim())}`;
                    return (
                      <div key={i} className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-100 rounded-2xl">
                        <span className="text-base flex-shrink-0 mt-0.5">🛏️</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-500 mb-0.5">Tonight's Stay</p>
                          <p className="text-sm font-semibold text-amber-900 leading-snug">{h.name}</p>
                          {h.address && <p className="text-xs text-amber-600 mt-0.5">{h.address}</p>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                            title="View on Google Maps"
                            className="p-1 rounded-lg text-amber-400 hover:text-amber-600 transition-colors">
                            <MapPin className="w-3.5 h-3.5" />
                          </a>
                          {/* Find the real index of this hotel in bookedHotels so edits/deletes target the right entry */}
                          {(() => {
                            const realIdx = (aiMeta?.bookedHotels ?? []).findIndex((bh, bi) => {
                              // Match by name + checkIn; fall back to positional index within todaysHotels
                              return bh.name === h.name && bh.checkIn === h.checkIn;
                            });
                            const idx = realIdx >= 0 ? realIdx : i;
                            return (
                              <>
                                <button
                                  onClick={() => handleEditHotel(h, idx)}
                                  title="Edit hotel"
                                  className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteHotel(idx)}
                                  title="Remove hotel"
                                  className="p-1 rounded-lg hover:bg-rose-50 text-zinc-400 hover:text-rose-500 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Sidebar */}
          <aside className="w-full lg:w-72 flex flex-col gap-5">
            {/* Weather Card — scoped to the day's city, falls back to trip destination */}
            <WeatherWidget
              destination={
                currentDayData.city
                ?? aiMeta?.destination?.split(/[,&\/]|\s+and\s+/i)[0]?.trim()
                ?? 'your destination'
              }
              startDate={currentDayData.date}
              endDate={currentDayData.date}
              showPackingTip={false}
            />


            {/* Photo Spots Card — collapsible */}
            {currentDayData.photoSpots && currentDayData.photoSpots.length > 0 && (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleSidebarSection('photoSpots')}
                  className="w-full flex items-center gap-2 px-5 py-4 hover:bg-zinc-50 transition-colors"
                >
                  <Camera className="w-4 h-4 text-violet-500 flex-shrink-0" />
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Photo Spots</p>
                    {collapsedSections.photoSpots && (
                      <p className="text-[11px] text-zinc-300 mt-0.5">
                        {currentDayData.photoSpots.length} spot{currentDayData.photoSpots.length !== 1 ? 's' : ''} · tap to expand
                      </p>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform duration-200 ${collapsedSections.photoSpots ? '' : 'rotate-180'}`} />
                </button>
                {!collapsedSections.photoSpots && (
                  <div className="px-5 pb-5 space-y-3">
                    {currentDayData.photoSpots.map((spot, i) => (
                      <div key={i} className="p-3 bg-violet-50 rounded-xl border border-violet-100">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold text-violet-900 leading-snug min-w-0 break-words">{spot.name}</p>
                          <span className="flex-shrink-0 text-[10px] font-semibold text-violet-500 bg-violet-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                            {spot.timeOfDay}
                          </span>
                        </div>
                        <p className="text-xs text-violet-700 leading-relaxed break-words">{spot.tip}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Foodie Finds — collapsible, shown when Food priority + tips present ── */}
            {(() => {
              // New trips: foodieTips live on each day. Old trips: Day 1 only in aiMeta (backward compat).
              const rawFoodieTips = currentDayData?.foodieTips && currentDayData.foodieTips.length > 0
                ? currentDayData.foodieTips
                : (selectedDay === 1 && aiMeta?.foodieTips && aiMeta.foodieTips.length > 0 ? aiMeta.foodieTips : null);
              // Filter out tips already added to the itinerary this session
              const dayFoodieTips = rawFoodieTips?.filter(t => !addedFoodieTipNames.has(t.name)) ?? null;
              const hasAnyTips = !!rawFoodieTips && rawFoodieTips.length > 0;
              if (!aiMeta?.preferences?.priorities?.includes('food') || !hasAnyTips) return null;
              const isCollapsed = collapsedSections.foodie;
              return (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  {/* Collapsible header */}
                  <button
                    onClick={() => toggleSidebarSection('foodie')}
                    className="w-full flex items-center gap-2 px-5 py-4 hover:bg-zinc-50 transition-colors"
                  >
                    <span className="text-base flex-shrink-0">🍜</span>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Foodie Finds</p>
                      {isCollapsed && (
                        <p className="text-[11px] text-zinc-300 mt-0.5">
                          {rawFoodieTips!.length} spot{rawFoodieTips!.length !== 1 ? 's' : ''} · tap to expand
                        </p>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`} />
                  </button>

                  {!isCollapsed && (
                    <div className="px-5 pb-5">
                      <p className="text-[11px] text-zinc-400 mb-4 -mt-1">Off the beaten path · Locals only</p>

                      {dayFoodieTips && dayFoodieTips.length > 0 ? (
                        <div className="space-y-3">
                          {dayFoodieTips.map((tip, idx) => {
                            const timeColor =
                              tip.timeOfDay === 'morning'   ? 'bg-amber-50  text-amber-700  border-amber-100'  :
                              tip.timeOfDay === 'afternoon' ? 'bg-sky-50    text-sky-700    border-sky-100'    :
                              tip.timeOfDay === 'evening'   ? 'bg-violet-50 text-violet-700 border-violet-100' :
                                                              'bg-zinc-50   text-zinc-600   border-zinc-100';
                            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${tip.name} ${tip.neighborhood ?? ''} ${aiMeta?.destination ?? ''}`.trim())}`;
                            return (
                              <div key={idx} className="p-3 bg-orange-50 rounded-xl border border-orange-100">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-orange-900 leading-snug">{tip.name}</p>
                                    <a
                                      href={mapsUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="View on Google Maps"
                                      className="flex-shrink-0 text-orange-400 hover:text-orange-600 transition-colors"
                                      onClick={e => e.stopPropagation()}
                                    >
                                      <MapPin className="w-3 h-3" />
                                    </a>
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {tip.priceRange && (
                                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-orange-100 text-orange-600 border-orange-200">
                                        {tip.priceRange}
                                      </span>
                                    )}
                                    {tip.timeOfDay && tip.timeOfDay !== 'any' && (
                                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap capitalize ${timeColor}`}>
                                        {tip.timeOfDay}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {tip.type && (
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-orange-400 mb-1">{tip.type}</p>
                                )}
                                {tip.neighborhood && (
                                  <p className="text-[11px] text-orange-600 mb-1">{tip.neighborhood}</p>
                                )}
                                {tip.why && (
                                  <p className="text-xs text-orange-800 leading-relaxed mb-1">{tip.why}</p>
                                )}
                                {(tip.orderThis || tip.bestFor) && (
                                  <p className="text-[11px] text-orange-700 font-medium mb-1">
                                    <span className="text-orange-400 mr-1">{tip.orderThis ? 'Order:' : 'Best for:'}</span>
                                    {tip.orderThis ?? tip.bestFor}
                                  </p>
                                )}
                                {tip.tip && (
                                  <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-orange-100">
                                    <span className="text-xs flex-shrink-0">💡</span>
                                    <p className="text-[11px] text-orange-700 leading-relaxed italic">{tip.tip}</p>
                                  </div>
                                )}
                                {/* Add to Day button */}
                                <button
                                  onClick={() => handleAddFoodieToItinerary(tip)}
                                  className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-800 text-[11px] font-semibold rounded-lg transition-colors"
                                >
                                  <Plus className="w-3 h-3" />
                                  Add to Day
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-400 text-center py-2">All tips added to your itinerary ✓</p>
                      )}

                      {aiMeta.practicalNotes?.tipping && (
                        <div className="mt-3 pt-3 border-t border-zinc-100 flex items-start gap-2">
                          <span className="text-xs flex-shrink-0 mt-0.5">💸</span>
                          <p className="text-[11px] text-zinc-500 leading-relaxed">{aiMeta.practicalNotes.tipping}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Nightlife Highlights — collapsible, shown when nightlife priority ── */}
            {aiMeta?.preferences?.priorities?.includes('nightlife') && aiMeta?.nightlifeHighlights && aiMeta.nightlifeHighlights.length > 0 && (() => {
              const isCollapsed = collapsedSections.nightlife;
              return (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  <button
                    onClick={() => toggleSidebarSection('nightlife')}
                    className="w-full flex items-center gap-2 px-5 py-4 hover:bg-zinc-50 transition-colors"
                  >
                    <span className="text-base flex-shrink-0">🎶</span>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Nightlife Guide</p>
                      {isCollapsed && (
                        <p className="text-[11px] text-zinc-300 mt-0.5">
                          {aiMeta.nightlifeHighlights!.length} spot{aiMeta.nightlifeHighlights!.length !== 1 ? 's' : ''} · tap to expand
                        </p>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`} />
                  </button>
                  {!isCollapsed && (
                    <div className="px-5 pb-5">
                      <p className="text-[11px] text-zinc-400 mb-4 -mt-1">Local spots · After dark</p>
                      <div className="space-y-3">
                        {aiMeta.nightlifeHighlights.map((spot, idx) => {
                          const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spot.name} ${spot.neighborhood ?? ''} ${aiMeta?.destination ?? ''}`.trim())}`;
                          return (
                            <div key={idx} className="p-3 bg-violet-50 rounded-xl border border-violet-100">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-violet-900 leading-snug">{spot.name}</p>
                                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" title="View on Google Maps"
                                    className="flex-shrink-0 text-violet-400 hover:text-violet-600 transition-colors" onClick={e => e.stopPropagation()}>
                                    <MapPin className="w-3 h-3" />
                                  </a>
                                </div>
                                {spot.openFrom && (
                                  <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-violet-100 text-violet-600 border-violet-200 whitespace-nowrap">
                                    {spot.openFrom}
                                  </span>
                                )}
                              </div>
                              {spot.type && <p className="text-[10px] font-bold uppercase tracking-wide text-violet-400 mb-1">{spot.type}</p>}
                              {spot.neighborhood && <p className="text-[11px] text-violet-600 mb-1">{spot.neighborhood}</p>}
                              {spot.vibe && <p className="text-xs text-violet-800 leading-relaxed mb-1">{spot.vibe}</p>}
                              {spot.bestNight && (
                                <p className="text-[11px] text-violet-700 font-medium mb-1">
                                  <span className="text-violet-400 mr-1">Best:</span>{spot.bestNight}
                                </p>
                              )}
                              {spot.tip && (
                                <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-violet-100">
                                  <span className="text-xs flex-shrink-0">💡</span>
                                  <p className="text-[11px] text-violet-700 leading-relaxed italic">{spot.tip}</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Shopping Guide — collapsible, shown when shopping priority ── */}
            {aiMeta?.preferences?.priorities?.includes('shopping') && aiMeta?.shoppingGuide && aiMeta.shoppingGuide.length > 0 && (() => {
              const isCollapsed = collapsedSections.shopping;
              return (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  <button
                    onClick={() => toggleSidebarSection('shopping')}
                    className="w-full flex items-center gap-2 px-5 py-4 hover:bg-zinc-50 transition-colors"
                  >
                    <span className="text-base flex-shrink-0">🛍️</span>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Shopping Guide</p>
                      {isCollapsed && (
                        <p className="text-[11px] text-zinc-300 mt-0.5">
                          {aiMeta.shoppingGuide!.length} spot{aiMeta.shoppingGuide!.length !== 1 ? 's' : ''} · tap to expand
                        </p>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`} />
                  </button>
                  {!isCollapsed && (
                    <div className="px-5 pb-5">
                      <p className="text-[11px] text-zinc-400 mb-4 -mt-1">Markets · Boutiques · Local finds</p>
                      <div className="space-y-3">
                        {aiMeta.shoppingGuide.map((spot, idx) => {
                          const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spot.name} ${spot.neighborhood ?? ''} ${aiMeta?.destination ?? ''}`.trim())}`;
                          return (
                            <div key={idx} className="p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-emerald-900 leading-snug">{spot.name}</p>
                                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" title="View on Google Maps"
                                    className="flex-shrink-0 text-emerald-400 hover:text-emerald-600 transition-colors" onClick={e => e.stopPropagation()}>
                                    <MapPin className="w-3 h-3" />
                                  </a>
                                </div>
                                {spot.openDays && (
                                  <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-100 text-emerald-600 border-emerald-200 whitespace-nowrap">
                                    {spot.openDays}
                                  </span>
                                )}
                              </div>
                              {spot.type && <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-400 mb-1">{spot.type}</p>}
                              {spot.neighborhood && <p className="text-[11px] text-emerald-600 mb-1">{spot.neighborhood}</p>}
                              {spot.what && <p className="text-xs text-emerald-800 leading-relaxed mb-1">{spot.what}</p>}
                              {spot.bestFor && (
                                <p className="text-[11px] text-emerald-700 font-medium mb-1">
                                  <span className="text-emerald-400 mr-1">Best for:</span>{spot.bestFor}
                                </p>
                              )}
                              {spot.tip && (
                                <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-emerald-100">
                                  <span className="text-xs flex-shrink-0">💡</span>
                                  <p className="text-[11px] text-emerald-700 leading-relaxed italic">{spot.tip}</p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Where to Stay — collapsible wrapper. Hidden once hotels are booked (they show inline on the day timeline instead). */}
            {aiMeta?.destination && (aiMeta?.bookedHotels ?? []).length === 0 && (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
              <button
                onClick={() => toggleSidebarSection('hotel')}
                className="w-full flex items-center gap-2 px-5 py-4 hover:bg-zinc-50 transition-colors"
              >
                <span className="text-base flex-shrink-0">🏨</span>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                    {(aiMeta?.bookedHotels ?? []).length > 0 ? "Where We're Crashing 🛏️" : "Where to Stay"}
                  </p>
                  {collapsedSections.hotel && (
                    <p className="text-[11px] text-zinc-300 mt-0.5">
                      {aiMeta?.bookedHotels && aiMeta.bookedHotels.length > 0
                        ? `${aiMeta.bookedHotels.length} hotel${aiMeta.bookedHotels.length !== 1 ? 's' : ''} booked`
                        : aiMeta?.hotelSuggestions && aiMeta.hotelSuggestions.length > 0
                        ? 'AI suggestions available'
                        : 'tap to view options'} · tap to expand
                    </p>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform duration-200 ${collapsedSections.hotel ? '' : 'rotate-180'}`} />
              </button>
              {!collapsedSections.hotel && (
              <div className="px-5 pb-5 space-y-4">

            {/* ── Booked hotels ── */}
            {aiMeta?.bookedHotels && aiMeta.bookedHotels.length > 0 && (
              <div className="space-y-3">
                {aiMeta.bookedHotels.map((h, i) => {
                  const hotelMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.name} ${h.address ?? aiMeta?.destination ?? ''}`.trim())}`;
                  return (
                    <div key={i} className="p-3 bg-sky-50 rounded-xl border border-sky-100">
                      <div className="flex items-start gap-1.5">
                        <p className="text-sm font-semibold text-sky-900 leading-snug flex-1">{h.name}</p>
                        <a href={hotelMapsUrl} target="_blank" rel="noopener noreferrer" title="View on Google Maps"
                          className="flex-shrink-0 text-sky-400 hover:text-sky-600 transition-colors mt-0.5">
                          <MapPin className="w-3.5 h-3.5" />
                        </a>
                      </div>
                      {h.address && (
                        <p className="text-xs text-sky-600 mt-0.5 leading-relaxed">{h.address}</p>
                      )}
                      {(h.checkIn || h.checkOut) && (
                        <p className="text-[11px] text-zinc-400 mt-1.5">
                          {h.checkIn && new Date(h.checkIn.length === 10 ? h.checkIn + 'T00:00:00' : h.checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {h.checkIn && h.checkOut && ' → '}
                          {h.checkOut && new Date(h.checkOut.length === 10 ? h.checkOut + 'T00:00:00' : h.checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── AI hotel suggestions ── */}
            {(!aiMeta?.bookedHotels || aiMeta.bookedHotels.length === 0) && aiMeta?.hotelSuggestions && aiMeta.hotelSuggestions.length > 0 && (() => {
              const suggestions = aiMeta.hotelSuggestions!;
              const isMultiCity = suggestions.some(h => h.city);
              const groups: { city?: string; hotels: typeof suggestions }[] = isMultiCity
                ? Array.from(new Set(suggestions.map(h => h.city))).map(city => ({
                    city,
                    hotels: suggestions.filter(h => h.city === city),
                  }))
                : [{ hotels: suggestions }];
              return (
                <div>
                  <p className="text-[11px] text-zinc-400 mb-3">AI lodging suggestions for your trip</p>
                  <div className="space-y-4">
                    {groups.map((group, gi) => (
                      <div key={gi}>
                        {isMultiCity && group.city && (
                          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2 mt-1">{group.city}</p>
                        )}
                        <div className="space-y-3">
                          {group.hotels.map((h, i) => {
                            const hotelMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.name} ${h.neighborhood ?? ''} ${group.city ?? aiMeta?.destination ?? ''}`.trim())}`;
                            return (
                              <div key={i} className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-amber-900 leading-snug">{h.name}</p>
                                    <a href={hotelMapsUrl} target="_blank" rel="noopener noreferrer" title="View on Google Maps"
                                      className="flex-shrink-0 text-amber-400 hover:text-amber-600 transition-colors">
                                      <MapPin className="w-3 h-3" />
                                    </a>
                                  </div>
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
                                <div className="flex items-center gap-3 mt-1">
                                  {h.bookingUrl && (
                                    <a href={h.bookingUrl} target="_blank" rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700 hover:text-sky-900 transition-colors">
                                      Book on Booking.com →
                                    </a>
                                  )}
                                  <button
                                    onClick={() => handleBookHotel(h)}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 transition-colors"
                                  >
                                    <CheckCircle2 className="w-3 h-3" />
                                    I Booked This
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-3 pt-2 border-t border-zinc-100">
                    AI suggestions · May include affiliate links
                  </p>
                </div>
              );
            })()}

            {/* ── Hotel fallback — no pre-booked hotels AND no AI suggestions ── */}
            {(!aiMeta?.bookedHotels || aiMeta.bookedHotels.length === 0) &&
             (!aiMeta?.hotelSuggestions || aiMeta.hotelSuggestions.length === 0) && (
              <div className="space-y-2">
                <p className="text-[11px] text-zinc-400 mb-3">No hotel booked yet — search for options</p>
                <a
                  href={`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(aiMeta?.destination ?? '')}${aiMeta?.startDate ? `&checkin=${aiMeta.startDate}` : ''}${aiMeta?.endDate ? `&checkout=${aiMeta.endDate}` : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-sky-800 hover:bg-sky-900 text-white text-xs font-semibold rounded-xl transition-all"
                >
                  Browse Hotels on Booking.com →
                </a>
                <button
                  onClick={handleGenerateHotels}
                  disabled={generatingHotels}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 text-xs font-semibold rounded-xl transition-all disabled:opacity-50"
                >
                  {generatingHotels ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {generatingHotels ? 'Finding hotels…' : 'Get AI Suggestions'}
                </button>
                {hotelGenError && (
                  <p className="text-xs text-rose-600 mt-2 text-center">{hotelGenError}</p>
                )}
              </div>
            )}

              </div>
              )}
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
                      onChange={e => { setNewActivityEndTime(e.target.value); setNewActivityTimeError(null); }}
                      className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent ${newActivityTimeError ? 'border-red-400' : 'border-zinc-200'}`}
                    />
                  </div>
                </div>
                {newActivityTimeError && (
                  <p className="mt-1.5 text-xs text-red-600 font-medium">{newActivityTimeError}</p>
                )}
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

              {/* Day selector — shown when editing OR adding from sidebar */}
              {(editingActivity || isSidebarAdd) && (
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
                  {editingActivity && newActivityDay !== editingActivity.dayNumber && (
                    <p className="mt-1.5 text-xs text-sky-600 font-medium">
                      Activity will be moved from Day {editingActivity.dayNumber} → Day {newActivityDay}
                    </p>
                  )}
                </div>
              )}

              {/* Track — hidden for solo/couple trips (split tracks don't apply) */}
              {aiMeta?.groupType !== 'solo' && aiMeta?.groupType !== 'couple' && (
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
              )}
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

      {/* ─── Add Hotel Modal ─── */}
      {showAddHotelModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => { setShowAddHotelModal(false); setBookingError(null); setEditingHotelIndex(null); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <span className="text-2xl">🏨</span> {editingHotelIndex !== null ? 'Edit Hotel' : 'Add Hotel'}
              </h2>
              <button onClick={() => { setShowAddHotelModal(false); setBookingError(null); setEditingHotelIndex(null); }} className="p-1.5 rounded-full hover:bg-zinc-100">
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Hotel Name</label>
                <input type="text" placeholder="e.g. Marriott Downtown" value={hotelFormName}
                  onChange={e => setHotelFormName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">City</label>
                  <input type="text" placeholder="e.g. Vienna" value={hotelFormCity}
                    onChange={e => setHotelFormCity(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Address (optional)</label>
                  <input type="text" placeholder="e.g. 44 Main St" value={hotelFormAddress}
                    onChange={e => setHotelFormAddress(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Check-in</label>
                  <input type="date" value={hotelFormCheckIn}
                    onChange={e => setHotelFormCheckIn(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Check-out</label>
                  <input type="date" value={hotelFormCheckOut}
                    onChange={e => setHotelFormCheckOut(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100" />
                </div>
              </div>
              {bookingError && (
                <p className="text-xs text-rose-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{bookingError}</p>
              )}
              <button
                disabled={savingBooking || !hotelFormName.trim()}
                onClick={async () => {
                  if (!hotelFormName.trim()) return;
                  setSavingBooking(true); setBookingError(null);
                  try {
                    const currentHotels: { name: string; city?: string; address?: string; checkIn?: string; checkOut?: string }[] =
                      Array.isArray(aiMeta?.bookedHotels) ? aiMeta.bookedHotels : [];
                    const newHotel = { name: hotelFormName.trim(), city: hotelFormCity.trim(), address: hotelFormAddress.trim(), checkIn: hotelFormCheckIn, checkOut: hotelFormCheckOut };
                    // Replace at index for edits, append for new
                    const updatedHotels = editingHotelIndex !== null
                      ? currentHotels.map((h, i) => i === editingHotelIndex ? newHotel : h)
                      : [...currentHotels, newHotel];
                    const res = await fetch(`/api/trips/${tripPageId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ tripPatch: { booked_hotels: updatedHotels } }),
                    });
                    if (!res.ok) throw new Error('Save failed');
                    // Update local tripRow AND aiMeta so Tonight's Stay card reflects immediately
                    setTripRow(prev => prev ? { ...prev, booked_hotels: updatedHotels } : prev);
                    setAiMeta(prev => prev ? { ...prev, bookedHotels: updatedHotels } : prev);
                    setShowAddHotelModal(false);
                    setEditingHotelIndex(null);
                    setHotelFormName(''); setHotelFormCity(''); setHotelFormAddress(''); setHotelFormCheckIn(''); setHotelFormCheckOut('');
                    setBookingSaved(editingHotelIndex !== null ? 'Hotel updated ✓' : 'Hotel saved ✓');
                    setTimeout(() => setBookingSaved(null), 2500);
                  } catch {
                    setBookingError('Could not save. Please try again.');
                  } finally {
                    setSavingBooking(false);
                  }
                }}
                className="w-full py-2.5 bg-sky-700 hover:bg-sky-800 disabled:bg-zinc-200 disabled:text-zinc-400 text-white font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
              >
                {savingBooking ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : editingHotelIndex !== null ? 'Update Hotel' : 'Save Hotel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Add Flight Modal ─── */}
      {showAddFlightModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => { setShowAddFlightModal(false); setBookingError(null); }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <span className="text-2xl">✈️</span> Add Flight
              </h2>
              <button onClick={() => { setShowAddFlightModal(false); setBookingError(null); }} className="p-1.5 rounded-full hover:bg-zinc-100">
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Airline</label>
                  <input type="text" placeholder="e.g. Delta, United" value={flightFormAirline}
                    onChange={e => setFlightFormAirline(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Flight #</label>
                  <input type="text" placeholder="e.g. DL1234" value={flightFormNumber}
                    onChange={e => setFlightFormNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">From Airport</label>
                  <input type="text" placeholder="e.g. JFK" value={flightFormDep}
                    onChange={e => setFlightFormDep(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">To Airport</label>
                  <input type="text" placeholder="e.g. CDG" value={flightFormArr}
                    onChange={e => setFlightFormArr(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Outbound Departure</label>
                  <input type="datetime-local" value={flightFormDepTime}
                    onChange={e => setFlightFormDepTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Outbound Arrival</label>
                  <input type="datetime-local" value={flightFormArrTime}
                    onChange={e => setFlightFormArrTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Return Departure</label>
                  <input type="datetime-local" value={flightFormRetDepTime}
                    onChange={e => setFlightFormRetDepTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Return Arrival</label>
                  <input type="datetime-local" value={flightFormRetArrTime}
                    onChange={e => setFlightFormRetArrTime(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-100" />
                </div>
              </div>
              {bookingError && (
                <p className="text-xs text-rose-600 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{bookingError}</p>
              )}
              <button
                disabled={savingBooking || !flightFormAirline.trim()}
                onClick={async () => {
                  if (!flightFormAirline.trim()) return;
                  setSavingBooking(true); setBookingError(null);
                  try {
                    const newFlight = {
                      airline: flightFormAirline.trim(), flightNumber: flightFormNumber.trim(),
                      departureAirport: flightFormDep.trim(), arrivalAirport: flightFormArr.trim(),
                      departureTime: flightFormDepTime, arrivalTime: flightFormArrTime,
                      returnDepartureTime: flightFormRetDepTime, returnArrivalTime: flightFormRetArrTime,
                    };
                    const res = await fetch(`/api/trips/${tripPageId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ tripPatch: { booked_flight: newFlight } }),
                    });
                    if (!res.ok) throw new Error('Save failed');
                    setTripRow(prev => prev ? { ...prev, booked_flight: newFlight } : prev);
                    setShowAddFlightModal(false);
                    setFlightFormAirline(''); setFlightFormNumber(''); setFlightFormDep(''); setFlightFormArr(''); setFlightFormDepTime(''); setFlightFormArrTime(''); setFlightFormRetDepTime(''); setFlightFormRetArrTime('');
                    setBookingSaved('Flight saved ✓');
                    setTimeout(() => setBookingSaved(null), 2500);
                  } catch {
                    setBookingError('Could not save. Please try again.');
                  } finally {
                    setSavingBooking(false);
                  }
                }}
                className="w-full py-2.5 bg-sky-700 hover:bg-sky-800 disabled:bg-zinc-200 disabled:text-zinc-400 text-white font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
              >
                {savingBooking ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Flight'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trip Story Modal */}
      {showStoryModal && (
        <TripStoryModal
          mode="trip"
          trip={trip}
          onClose={() => setShowStoryModal(false)}
        />
      )}

      {/* ─── Edit Trip Modal ─── */}
      {showEditTripModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowEditTripModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h2 className="font-script italic text-lg font-semibold text-zinc-900">Edit Trip Details</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Update destination or travel dates</p>
              </div>
              <button
                onClick={() => setShowEditTripModal(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Destination */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wide mb-2">
                  Destination
                </label>
                <input
                  type="text"
                  value={editDest}
                  onChange={e => setEditDest(e.target.value)}
                  placeholder="e.g., Paris, France"
                  className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent"
                />
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wide mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={editStartDate}
                  onChange={e => setEditStartDate(e.target.value)}
                  className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wide mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={editEndDate}
                  onChange={e => setEditEndDate(e.target.value)}
                  className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent"
                />
              </div>

              {/* Hint: dates will shift */}
              {editStartDate && aiMeta?.startDate && editStartDate !== aiMeta.startDate && (
                <p className="flex items-center gap-1.5 text-xs text-sky-600 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  Day dates will shift to match the new start date.
                </p>
              )}
            </div>

            <div className="px-6 pb-6 pt-4 border-t border-zinc-100 flex gap-3">
              <button
                onClick={() => setShowEditTripModal(false)}
                className="flex-1 py-2.5 border border-zinc-200 rounded-full text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTripEdit}
                disabled={!editDest.trim() || savingTripEdit}
                className="flex-1 bg-sky-800 hover:bg-sky-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-full inline-flex items-center justify-center gap-2 transition-all"
              >
                {savingTripEdit
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Pencil className="w-4 h-4" />
                }
                {savingTripEdit ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Invite Modal — ported from group page, trip ID already known ─── */}
      {showInviteModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => { setShowInviteModal(false); setInviteContact(''); setInviteSent(false); setInviteError(null); }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-zinc-900">Invite Someone</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {aiMeta?.destination || trip.destination} trip
                </p>
              </div>
              <button
                onClick={() => { setShowInviteModal(false); setInviteContact(''); setInviteSent(false); setInviteError(null); }}
                className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>

            {/* Method tabs */}
            <div className="flex gap-2 mb-5">
              {(['email', 'text', 'link'] as const).map(method => (
                <button
                  key={method}
                  onClick={() => setInviteMethod(method)}
                  className={`flex-1 py-2 rounded-lg font-medium text-sm transition-colors capitalize ${
                    inviteMethod === method ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                  }`}
                >
                  {method === 'link' ? 'Copy Link' : method.charAt(0).toUpperCase() + method.slice(1)}
                </button>
              ))}
            </div>

            {inviteMethod === 'link' ? (
              /* Copy Link UI */
              <div className="mb-4">
                <div className="flex items-center gap-2 p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                  <p className="flex-1 text-xs font-mono text-zinc-600 truncate">
                    {typeof window !== 'undefined' ? window.location.origin : 'tripcoord.ai'}/join/{tripPageId}
                  </p>
                  <button
                    onClick={async () => {
                      const link = `${window.location.origin}/join/${tripPageId}`;
                      try {
                        await navigator.clipboard.writeText(link);
                        setInviteLinkCopied(true);
                        setTimeout(() => setInviteLinkCopied(false), 2000);
                      } catch {
                        setInviteError('Could not copy — please copy the link manually.');
                      }
                    }}
                    className="px-3 py-1.5 bg-zinc-900 text-white rounded-lg text-xs font-semibold whitespace-nowrap hover:bg-zinc-800 transition-colors"
                  >
                    {inviteLinkCopied ? '✓ Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            ) : (
              /* Email / SMS input */
              <div className="mb-4">
                <label className="block text-sm font-semibold text-zinc-700 mb-2">
                  {inviteMethod === 'email' ? 'Email Address' : 'Phone Number'}
                </label>
                <input
                  type={inviteMethod === 'email' ? 'email' : 'tel'}
                  placeholder={inviteMethod === 'email' ? 'friend@example.com' : '+1 (555) 123-4567'}
                  value={inviteContact}
                  onChange={e => setInviteContact(e.target.value)}
                  className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent"
                />
              </div>
            )}

            {/* Preview */}
            {inviteMethod !== 'link' && (
              <div className="mb-4 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-1">Preview</p>
                <p className="text-sm text-zinc-700">
                  {inviteMethod === 'email'
                    ? `Hey! You're invited to join our ${aiMeta?.destination || trip.destination} trip on tripcoord. Click the link to join the group and start planning together!`
                    : `You're invited to ${aiMeta?.destination || trip.destination} on tripcoord! Join here: ${typeof window !== 'undefined' ? window.location.origin : 'tripcoord.ai'}/join/${tripPageId}`
                  }
                </p>
              </div>
            )}

            {/* Success */}
            {inviteSent && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center mb-4">
                <p className="text-sm font-semibold text-emerald-700">
                  {inviteMethod === 'email' ? '✓ Invite sent! They\'ll see it in their email or tripcoord dashboard.' : `✓ Invite sent via ${inviteMethod}!`}
                </p>
              </div>
            )}

            {/* Error */}
            {inviteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg mb-4">
                <p className="text-sm text-rose-700">{inviteError}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowInviteModal(false); setInviteContact(''); setInviteSent(false); setInviteError(null); }}
                className="flex-1 px-4 py-2.5 border border-zinc-200 text-zinc-700 rounded-lg font-medium text-sm hover:bg-zinc-50 transition-colors"
              >
                {inviteMethod === 'link' ? 'Done' : 'Cancel'}
              </button>
              {inviteMethod !== 'link' && (
                <button
                  onClick={async () => {
                    if (!inviteContact.trim()) return;
                    setIsSendingInvite(true);
                    setInviteError(null);
                    const tripName = aiMeta?.destination || trip.destination;
                    const inviterName = currentUser?.name || currentUser?.email || 'Your friend';
                    try {
                      const endpoint = inviteMethod === 'email' ? '/api/invite/email' : '/api/invite/sms';
                      const payload = inviteMethod === 'email'
                        ? { email: inviteContact, tripId: tripPageId, tripName, inviterName }
                        : { phone: inviteContact, tripId: tripPageId, tripName, inviterName };
                      const res = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                      });
                      if (!res.ok) throw new Error('Failed to send invite');
                      const data = await res.json();
                      if (data.noService) {
                        const link = `${window.location.origin}/join/${tripPageId}`;
                        await navigator.clipboard.writeText(link).catch(() => {});
                        setInviteMethod('link');
                        setInviteError('Email isn\'t set up yet — invite link copied to clipboard!');
                        return;
                      }
                      setInviteSent(true);
                      setTimeout(() => {
                        setShowInviteModal(false);
                        setInviteSent(false);
                        setInviteContact('');
                      }, 2000);
                    } catch {
                      setInviteError('Failed to send invite. Please try again.');
                    } finally {
                      setIsSendingInvite(false);
                    }
                  }}
                  disabled={isSendingInvite || !inviteContact.trim()}
                  className="flex-1 px-4 py-2.5 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-200 disabled:text-zinc-400 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  {isSendingInvite ? 'Sending…' : 'Send Invite'}
                </button>
              )}
            </div>
          </div>
        </div>
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

export default function ItineraryPage() {
  return (
    <ErrorBoundary context="itinerary">
      <ItineraryPageContent />
    </ErrorBoundary>
  );
}
