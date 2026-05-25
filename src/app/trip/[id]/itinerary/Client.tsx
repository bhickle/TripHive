'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { itineraryDays, trips, MOCK_TRIP_IDS } from '@/data/mock';
import { Activity, TransportLeg, ItineraryDay } from '@/lib/types';
import { normalizeVenueKey } from '@/lib/places/verifyVenues';
import { usePlacesSearch, PlaceDetails } from '@/hooks/usePlacesSearch';
import { parseGoogleMapsUrl, isGoogleMapsUrl } from '@/lib/google/parseMapsUrl';
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
  Camera,
  Music,
  ShoppingBag,
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
  Calendar,
  CalendarPlus,
  PlusSquare,
  Wand2,
  Globe2,
  Share2,
  type LucideIcon,
} from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { isFounderEmail } from '@/lib/founders';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { TripStoryModal } from '@/components/TripStoryModal';
import { ParseTransportModal } from '@/components/ParseTransportModal';
import { ShareTripModal } from '@/components/ShareTripModal';
import { MapView } from '@/components/MapView';
import { UpgradeModal, LockBadge } from '@/components/UpgradeModal';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useModalUX } from '@/hooks/useModalUX';
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

// ─── Per-priority sidebar block metadata ─────────────────────────────────────
// Drives the generic <PriorityHighlightsBlock> sidebar render. Each entry maps
// Visual identity for the unified "Day Highlights" sidebar items. Each item
// is colored by its category — these are the discovery add-ons that live
// in the sidebar (food / photo / nightlife / shopping). Activity-shaping
// priorities like nature, culture, beach, history, sports, etc. are
// woven into the daily activities themselves and intentionally do NOT
// appear here as separate sidebar lists.
type HighlightCategory = 'photo' | 'food' | 'nightlife' | 'shopping';
const HIGHLIGHT_CATEGORY_META: Record<HighlightCategory, {
  icon: LucideIcon; label: string;
  bg: string; border: string; text: string; textMuted: string; pill: string; tipText: string;
}> = {
  photo:     { icon: Camera,      label: 'Photo',     bg: 'bg-violet-50',   border: 'border-violet-100',   text: 'text-violet-900',   textMuted: 'text-violet-600',   pill: 'bg-violet-100 text-violet-700 border-violet-200',     tipText: 'text-violet-700' },
  food:      { icon: Utensils,    label: 'Food',      bg: 'bg-rose-50',     border: 'border-rose-100',     text: 'text-rose-900',     textMuted: 'text-rose-600',     pill: 'bg-rose-100 text-rose-700 border-rose-200',           tipText: 'text-rose-700' },
  nightlife: { icon: Music,       label: 'Nightlife', bg: 'bg-fuchsia-50',  border: 'border-fuchsia-100',  text: 'text-fuchsia-900',  textMuted: 'text-fuchsia-600',  pill: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',  tipText: 'text-fuchsia-700' },
  shopping:  { icon: ShoppingBag, label: 'Shopping',  bg: 'bg-emerald-50',  border: 'border-emerald-100',  text: 'text-emerald-900',  textMuted: 'text-emerald-600',  pill: 'bg-emerald-100 text-emerald-700 border-emerald-200',  tipText: 'text-emerald-700' },
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
  // Drag-and-drop state for the day-pill swap. swap-content-but-not-dates
  // model: dragging day A onto day B exchanges their activities/tracks/photo
  // spots/etc. but keeps each day's number, date, title, and practicalNotes
  // pinned to their original position. Day 1 and the last day are locked
  // (arrival / departure logistics live there), and cross-city swaps are
  // blocked (would break travel-day continuity on multi-city trips).
  const [draggingDay, setDraggingDay] = useState<number | null>(null);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  // Hover-tooltip state for the day pills (desktop). Rendered with
  // `position: fixed` so it escapes the day-tab scroll container's
  // overflow clipping — a CSS-only `absolute bottom-full` tooltip got
  // chopped off by the implicit `overflow-y: auto` that `overflow-x: auto`
  // promotes to (per the CSS spec).
  const [pillTooltip, setPillTooltip] = useState<{ top: number; left: number; text: string } | null>(null);
  const [activityAdded, setActivityAdded] = useState(false);
  const [activityDeleted, setActivityDeleted] = useState(false);
  const [bookingSaved, setBookingSaved] = useState<string | null>(null);
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
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [suggestingActivityId, setSuggestingActivityId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // Separate success toast — actionError styles red/rose which would
  // misrepresent a successful swap as an error.
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [showParseModal, setShowParseModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
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
  const [editTitle, setEditTitle] = useState('');
  const [editDest, setEditDest] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  // Escape-key dismiss for the two most-trafficked itinerary modals.
  // Other dialogs in this file (add-hotel/flight, transport parse,
  // upgrade prompt, etc.) still need wiring — tracked in PRE_LAUNCH_QA.
  useEscapeKey(() => setShowEditTripModal(false), showEditTripModal);
  useEscapeKey(() => setShowAddActivityModal(false), showAddActivityModal);
  const [editEndDate, setEditEndDate] = useState('');
  const [savingTripEdit, setSavingTripEdit] = useState(false);
  const [editTripError, setEditTripError] = useState<string | null>(null);

  // AI enrichment — generates the per-day sidebar arrays (photoSpots,
  // foodieTips, etc.) for a day that has activities but no highlights.
  // Used on manually-built trips and to refresh stale ones.
  // enrichingDay holds the day number currently being enriched so the
  // button can show a spinner; null means idle.
  const [enrichingDay, setEnrichingDay] = useState<number | null>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  // Add Day modal
  const [showAddDayModal, setShowAddDayModal] = useState(false);
  const [addDayPosition, setAddDayPosition] = useState<'before' | 'after' | 'end'>('end');
  const [addDayRelativeTo, setAddDayRelativeTo] = useState<number>(1); // day number to insert before/after
  const [addDayMode, setAddDayMode] = useState<'ai' | 'manual'>('ai');
  const [addDayGenerating, setAddDayGenerating] = useState(false);
  const [addDayError, setAddDayError] = useState<string | null>(null);

  // Add Hotel / Add Flight modals
  const [showAddHotelModal, setShowAddHotelModal] = useState(false);
  const [showAddFlightModal, setShowAddFlightModal] = useState(false);
  const [savingBooking, setSavingBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // ── Shared modal UX (Escape key + body scroll lock) ──────────────────────
  // Each call wires up Esc-to-close + page-scroll lock for a modal.
  // Inline arrow close handlers are fine; the hook re-registers cheaply
  // on render. State setters (set...) are stable per React's guarantee.
  useModalUX(showAddActivityModal, () => setShowAddActivityModal(false));
  useModalUX(showStoryModal, () => setShowStoryModal(false));
  useModalUX(showParseModal, () => setShowParseModal(false));
  useModalUX(showInviteModal, () => setShowInviteModal(false));
  useModalUX(showEditTripModal, () => setShowEditTripModal(false));
  useModalUX(showAddDayModal, () => { if (!addDayGenerating) { setShowAddDayModal(false); setAddDayError(null); } });
  useModalUX(showAddHotelModal, () => { setShowAddHotelModal(false); setBookingError(null); setEditingHotelIndex(null); });
  useModalUX(showAddFlightModal, () => { setShowAddFlightModal(false); setBookingError(null); });
  useModalUX(showRegenConfirm, () => setShowRegenConfirm(false));
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

  // isTripPassTrip drives the Trip Pass overlay in useEntitlements: true when
  // this trip has an active trip_passes purchase. Populated by the trip-load
  // effect once /api/trips/[id] returns. Explorer/Nomad organizers' personal
  // subscriptions do NOT trigger the overlay.
  const [isTripPassTrip, setIsTripPassTrip] = useState<boolean>(false);

  // viewerRole drives the "can this user edit the itinerary" gate. For trips
  // with 3+ travelers, only the organizer and co-organizer can edit, suggest
  // replacements, delete activities, or swap day content. Solo / couple trips
  // (groupSize <= 2) are unrestricted — both people on the trip can edit.
  // Voting / chat / photo upload remain open to all members regardless.
  const [viewerRole, setViewerRole] = useState<'organizer' | 'co_organizer' | 'member' | null>(null);
  // hasOriginal: backed by itineraries.original_days. true iff there's an
  // AI-baseline snapshot the user can revert to. Older trips (pre-migration)
  // have NULL — Revert button stays hidden in that case.
  const [hasOriginal, setHasOriginal] = useState<boolean>(false);
  const [showRevertConfirm, setShowRevertConfirm] = useState<boolean>(false);
  const [reverting, setReverting] = useState<boolean>(false);

  const { tier, tierResolved, hasTripStory, hasTransportParser, getUpgradePrompt } = useEntitlements(params.id, isTripPassTrip);
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
  // Public-to-community toggle saving flag (small spinner overlay on the
  // header globe button). The actual is_public_template value is read
  // directly from tripRow so it stays in sync with any other writes.
  const [communityToggleSaving, setCommunityToggleSaving] = useState(false);
  // Founder-only "Feature on Discover" toggle saving flag (sits next to the
  // community-share globe). Value read from tripRow.is_founder_featured.
  const [featuredToggleSaving, setFeaturedToggleSaving] = useState(false);
  const [newPrefsCount, setNewPrefsCount] = useState(0);
  // Members who joined but haven't filled preferences. Drives the confirm
  // dialog when the buyer clicks Regenerate so they're explicitly warned
  // that pending members will be treated as "no preferences" — the soft
  // 24h fallback rule from the Trip Pass design memo.
  const [pendingPrefsCount, setPendingPrefsCount] = useState(0);
  // showRegenConfirm is hoisted up next to the other show* states (above)
  // so useModalUX can reference it without a forward-reference TS error.

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
      })
        .then(res => {
          if (!res.ok) throw new Error(`save failed: ${res.status}`);
        })
        .catch(() => {
          // Rollback aiDays to pre-vote state on failure + surface the error
          syncAiDays(days);
          setActionError('Couldn’t save your vote. Try again in a moment.');
          setTimeout(() => setActionError(null), 4000);
        });
    }
    try { localStorage.setItem('generatedItinerary', JSON.stringify(updated)); } catch { /* ignore */ }

    // Persist vote to dedicated votes table (per-user, durable across sessions)
    if (tripId && /^[0-9a-f-]{36}$/i.test(tripId)) {
      fetch(`/api/votes/${tripId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId, vote: next.myVote }),
      }).then(async res => {
        if (!res.ok) throw new Error(`vote failed: ${res.status}`);
        // Merge server-fresh counts back in (handles multi-user scenarios)
        const { up, down } = await res.json();
        setVotes(prev => ({ ...prev, [activityId]: { ...prev[activityId], up, down } }));
      }).catch(() => {
        // Rollback vote indicator to pre-vote state on failure
        setVotes(prev => ({ ...prev, [activityId]: prevVoteState }));
        setActionError("Couldn't save your vote. Please try again.");
        setTimeout(() => setActionError(null), 4000);
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
          const v = d[key];
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
      const normalized: ItineraryDay[] = deduped.map(d => {
        const hasSplit = Array.isArray(d.tracks?.track_a) && d.tracks.track_a.length > 0;
        if (!hasSplit) return d;
        return {
          ...d,
          trackALabel: canonA ?? d.trackALabel,
          trackBLabel: canonB ?? d.trackBLabel,
        };
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
    title?: string;
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
      currency?: string;
      tipping?: string;
      customs?: string;
      entryRequirements?: string;
      /** AI sometimes emits these richer fields per the schema rules block;
       *  they're optional in the type so older trips render cleanly too. */
      safetyTips?: string;
      usefulPhrases?: string[];
    };
    /** Departure logistics — rendered on the TRIP'S LAST DAY in the UI even
     *  though the AI emits it on day 1 (lives in aiMeta so it survives day
     *  swaps). All fields optional; missing departure info = no card. */
    departureInfo?: {
      airport?: string | null;
      recommendedArrival?: string;
      transitTip?: string;
      lastDayTimingTip?: string;
      customsTips?: string;
      luggageStorageTip?: string;
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
    // Sidebar tip cards keyed by priority id (nature/history/sports/wellness/etc).
    // Food/nightlife/shopping/photography keep their own dedicated fields.
    priorityHighlights?: Record<string, Array<{
      name: string; type?: string; neighborhood?: string;
      description?: string; bestFor?: string; bestTime?: string; tip?: string;
    }>>;
    /** Post-gen venue verification — populated asynchronously by
     *  /api/trips/[id]/verify-venues after generation completes. Keyed by
     *  normalizeVenueKey(name). Used to surface "verify open" warning
     *  badges on activities whose named venue is flagged closed. */
    venueVerification?: {
      entries: Record<string, {
        status: 'operational' | 'closed_permanently' | 'closed_temporarily' | 'unknown';
        dayNumber?: number;
        category?: string;
        matchedName?: string;
        checkedAt: string;
      }>;
      lastRunAt: string;
      counts: {
        total: number; operational: number;
        closedPermanently: number; closedTemporarily: number; unknown: number;
      };
    };
  } | null>(null);

  // Rebuild the itinerary incorporating new member preferences (Explorer/Nomad)
  // Declared after aiMeta so it can reference it without a forward-reference error
  const handleRegenerate = useCallback(() => {
    if (!aiMeta && !tripRow) return;
    const destination = tripRow?.destination || aiMeta?.destination || '';
    // Lift the saved preferences blob into top-level fields the prompt builder
    // expects. The trip-builder original payload sends these at the top level;
    // the regenerate path was only sending the nested `preferences` object,
    // leaving the prompt to default everything to empty arrays / undefined.
    // budgetBreakdown specifically used to crash the route entirely (.hotel
    // access on undefined → 500 → "Generation failed" in the UI).
    const aiMetaPrefs = (aiMeta?.preferences as Record<string, unknown> | undefined) ?? {};
    const tripPrefs = (tripRow?.preferences as Record<string, unknown> | undefined) ?? {};
    const mergedPrefs: Record<string, unknown> = { ...tripPrefs, ...aiMetaPrefs };
    const pickArr = (key: string): string[] => {
      const v = mergedPrefs[key];
      return Array.isArray(v) ? (v as string[]) : [];
    };
    const pickBool = (key: string): boolean => mergedPrefs[key] === true;
    const pickStr = (key: string): string | undefined =>
      typeof mergedPrefs[key] === 'string' ? (mergedPrefs[key] as string) : undefined;
    const pickNum = (key: string): number | undefined =>
      typeof mergedPrefs[key] === 'number' ? (mergedPrefs[key] as number) : undefined;
    const modalityVal = mergedPrefs.modality;
    const modality = Array.isArray(modalityVal) ? (modalityVal as string[]).join(', ') : (typeof modalityVal === 'string' ? modalityVal : '');
    const accommodationTypeVal = mergedPrefs.accommodationType;
    const accommodationType = Array.isArray(accommodationTypeVal) ? (accommodationTypeVal as string[]).join(', ') : (typeof accommodationTypeVal === 'string' ? accommodationTypeVal : '');

    const payload = {
      destination,
      tripLength: aiDaysRef.current?.length || tripRow?.trip_length || 7,
      groupSize: tripRow?.group_size || 2,
      groupType: tripRow?.group_type || aiMeta?.groupType || 'friends',
      startDate: aiMeta?.startDate || tripRow?.start_date || null,
      endDate: aiMeta?.endDate || tripRow?.end_date || null,
      budget: aiMeta?.budget || tripRow?.budget_total || 0,
      // Top-level fields the prompt builder reads — derived from the merged
      // preferences blob so the regenerate prompt sees the same context the
      // original generation did.
      priorities: pickArr('priorities'),
      budgetBreakdown: aiMeta?.budgetBreakdown || tripRow?.budget_breakdown || {},
      ageRanges: pickArr('ageRanges'),
      accessibilityNeeds: pickArr('accessibilityNeeds'),
      mustHaves: pickArr('mustHaves'),
      additionalContext: pickStr('additionalContext'),
      localMode: pickBool('localMode'),
      dateNight: pickBool('dateNight'),
      curiosityLevel: pickNum('curiosityLevel'),
      organizerPace: pickStr('organizerPace'),
      modality,
      accommodationType,
      bookedHotels: aiMeta?.bookedHotels || tripRow?.booked_hotels || [],
      bookedFlight: tripRow?.booked_flight || null,
      preferences: mergedPrefs,
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
    // Route through the itinerary page's chunked live-build effect rather than
    // /trip/generating's single unchunked call. Long trips (11+ days) hit
    // Vercel's 300s maxDuration on a single call and truncate; chunking
    // requests each 3-day slice separately so every slice has its own budget.
    // fresh=1 tells the resume-detection logic to ignore previously persisted
    // days (this is a regenerate — start over, don't pick up where we left off).
    router.push(`/trip/${tripPageId}/itinerary?mode=generating&fresh=1`);
  }, [aiMeta, tripRow, tripPageId, router]);

  useEffect(() => {
    const load = async () => {
      // When arriving in generating mode, wipe any stale localStorage data immediately
      // so we never show a previous trip's Iceland/Reykjavik content during the new build.
      if (searchParams.get('mode') === 'generating') {
        try {
          localStorage.removeItem('generatedItinerary');
          localStorage.removeItem('generatedTripMeta');
          localStorage.removeItem('currentTripId');
        } catch { /* ignore */ }
        // Also reset React state — App Router can keep this component mounted
        // when navigating between trip IDs, so any aiDays/aiMeta from a
        // previously-viewed trip would otherwise leak into the new build view
        // until the stream replaces them. Force a clean slate so the hasDays
        // gate renders the loading state immediately.
        syncAiDays(null);
        setAiMeta(null);
        setTripRow(null);
        // Skip loading — the live-build effect will populate data as it streams in
        return;
      }

      // 1. Try Supabase first using the CURRENT PAGE's trip ID (from the URL)
      const looksLikeUuid = tripPageId && /^[0-9a-f-]{36}$/i.test(tripPageId);
      if (looksLikeUuid) {
        try {
          const res = await fetch(`/api/trips/${tripPageId}`);
          if (res.ok) {
            const { trip: tripData, itinerary, newPrefsCount: npc, pendingPrefsCount: ppc, isTripPassTrip: itp, viewerRole: vr, hasOriginal: ho } = await res.json();
            if (tripData) setTripRow(tripData);
            if (typeof npc === 'number') setNewPrefsCount(npc);
            if (typeof ppc === 'number') setPendingPrefsCount(ppc);
            if (typeof itp === 'boolean') setIsTripPassTrip(itp);
            if (vr === 'organizer' || vr === 'co_organizer' || vr === 'member') setViewerRole(vr);
            if (typeof ho === 'boolean') setHasOriginal(ho);
            if (itinerary && Array.isArray(itinerary.days) && itinerary.days.length > 0) {
              syncAiDays(itinerary.days);
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
            if (meta) setAiMeta(JSON.parse(meta));
            seedVotesFromActivities(parsed);
          }
        }
      } catch {
        // localStorage unavailable or invalid JSON — use mock data
      }
    };
    load();
  }, [tripPageId, seedVotesFromActivities, searchParams]);

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

      // 2. Build per-chunk segment list. Each segment is one HTTP request to
      //    /api/generate-itinerary, and each request gets its own 300s Vercel
      //    function budget. Long single-city trips (e.g. 10 days in Tampa)
      //    used to be one giant request that hit the timeout mid-stream and
      //    produced a truncated trip — chunking fixes that.
      //
      //    NOTE: daysPerDestination is Record<string, number> keyed by city
      //    name, NOT an array.
      type Segment = {
        cityName: string;
        dayStart: number;
        dayCount: number;
        sameCity: boolean; // true when chunk continues a city already entered
      };
      const destinations = payload.destinations as string[] | null | undefined;
      const daysPerDest  = payload.daysPerDestination as Record<string, number> | null | undefined;
      let segments: Segment[] = [];

      // Chunk size: each chunk = one HTTP call with its own 5-min budget.
      // 3 days is conservative for the per-day richness this app generates
      // (~10-13K output tokens/day on Sonnet 4.6). Worst case ~3.5 minutes.
      const CHUNK_SIZE = 3;

      if (destinations && destinations.length > 1 && daysPerDest) {
        // Multi-city: one (or more) chunks per city. A long city (>3 days)
        // gets sub-chunked the same way a long single-city trip does.
        let dayStart = 1;
        for (const cityName of destinations) {
          const cityDays = daysPerDest[cityName] ?? 0;
          if (cityDays <= 0) continue;
          let chunkStart = dayStart;
          let cityRemaining = cityDays;
          let chunkInCity = 0;
          while (cityRemaining > 0) {
            const cnt = Math.min(CHUNK_SIZE, cityRemaining);
            segments.push({
              cityName,
              dayStart: chunkStart,
              dayCount: cnt,
              // First chunk of a city gets the "arrival" framing; subsequent
              // chunks within the same city continue the stay.
              sameCity: chunkInCity > 0,
            });
            chunkStart += cnt;
            cityRemaining -= cnt;
            chunkInCity++;
          }
          dayStart += cityDays;
        }
      } else if (((payload.tripLength as number) || 0) > CHUNK_SIZE) {
        // Single-city long trip — chunk it into pieces of CHUNK_SIZE days.
        // Without this, the first chunk would be the entire trip and would
        // exceed the 5-min function timeout for trips >5 days.
        const cityName = (payload.destination as string) || 'destination';
        const totalDays = payload.tripLength as number;
        let chunkStart = 1;
        let remaining = totalDays;
        let chunkIdx = 0;
        while (remaining > 0) {
          const cnt = Math.min(CHUNK_SIZE, remaining);
          segments.push({
            cityName,
            dayStart: chunkStart,
            dayCount: cnt,
            sameCity: chunkIdx > 0,
          });
          chunkStart += cnt;
          remaining -= cnt;
          chunkIdx++;
        }
      }
      const totalDays = segments.reduce((s, c) => s + c.dayCount, 0)
        || (payload.tripLength as number) || 7;
      setLiveBuildTotal(totalDays);

      // ── Resume detection (Tier 1 build-durability) ────────────────────────
      // The server-side persistGenerationDays helper writes each day to
      // Supabase as it streams, so a refreshed/closed/slept tab no longer
      // loses prior progress. Before kicking off generation, fetch what's
      // already persisted: skip segments that are fully done and narrow the
      // segment that spans the resume boundary so we only request the
      // missing tail. If everything is already persisted (server finished
      // while the tab was gone), short-circuit and clean up.
      //
      // Regenerate flow (?fresh=1) bypasses resume detection: the user wants
      // to fully rebuild over the existing days, not resume an interrupted
      // build. Without this bypass, the persisted N days from the prior build
      // would make resumeStartFromDay > totalDays and exit immediately.
      const isFreshRebuild = searchParams.get('fresh') === '1';
      let resumeStartFromDay = 1;
      if (!isFreshRebuild && tripPageId && /^[0-9a-f-]{36}$/i.test(tripPageId)) {
        try {
          const res = await fetch(`/api/trips/${tripPageId}`);
          if (res.ok) {
            const data = await res.json();
            const persistedDays = (data?.itinerary?.days ?? []) as ItineraryDay[];
            const persistedMeta = data?.itinerary?.meta as Record<string, unknown> | null;
            if (Array.isArray(persistedDays) && persistedDays.length > 0) {
              // Seed the UI immediately so the user sees prior progress
              // instead of starting from a blank loading state.
              syncAiDays(persistedDays);
              if (persistedMeta) setAiMeta(persistedMeta as Parameters<typeof setAiMeta>[0]);
              setLiveBuildDone(persistedDays.length);
              const completed = new Set(
                persistedDays
                  .map(d => (typeof d.day === 'number' ? d.day : null))
                  .filter((n): n is number => n !== null),
              );
              // Find the lowest day number not yet persisted. Days complete
              // in order in the normal flow, so this is almost always the
              // contiguous tail; if a middle day is missing it'll be picked
              // up by the server's continuation/dedup loop.
              resumeStartFromDay = totalDays + 1;
              for (let i = 1; i <= totalDays; i++) {
                if (!completed.has(i)) { resumeStartFromDay = i; break; }
              }
            }
          }
        } catch {
          // Trip fetch failed — fall through and run a fresh build.
        }
      }

      if (resumeStartFromDay > totalDays) {
        // Everything is already persisted (server finished while tab was
        // away). Skip generation entirely; clean up the same way the
        // natural-completion path does at the end of this effect.
        setLiveBuildStatus('Resumed completed itinerary');
        setIsLiveBuilding(false);
        sessionStorage.removeItem('tripcoord_gen_payload');
        sessionStorage.removeItem('tripcoord_gen_meta');
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }

      if (resumeStartFromDay > 1) {
        // Narrow segments to the missing tail. A segment fully before the
        // boundary is dropped; one that spans it is shrunk to start at the
        // first missing day with sameCity:true (we're already "in" that city
        // from prior days). For the no-segments single-call path, synthesize
        // a one-chunk segment so the server gets a citySegment hint with
        // dayStart/dayCount instead of regenerating from day 1.
        if (segments.length === 0) {
          const cityName = (payload.destination as string) || 'destination';
          segments = [{
            cityName,
            dayStart: resumeStartFromDay,
            dayCount: totalDays - resumeStartFromDay + 1,
            sameCity: true,
          }];
        } else {
          const narrowed: Segment[] = [];
          for (const seg of segments) {
            const segEnd = seg.dayStart + seg.dayCount - 1;
            if (segEnd < resumeStartFromDay) continue;
            if (seg.dayStart >= resumeStartFromDay) {
              narrowed.push(seg);
            } else {
              narrowed.push({
                ...seg,
                dayStart: resumeStartFromDay,
                dayCount: segEnd - resumeStartFromDay + 1,
                sameCity: true,
              });
            }
          }
          segments = narrowed;
        }
        setLiveBuildStatus(`Resuming from day ${resumeStartFromDay}…`);
      }

      // Extract every venue / restaurant / activity / photo spot / food tip /
      // bar / shop name from a day. Used to build the cross-chunk dedup list
      // so the model in chunk N+1 doesn't re-suggest a venue from chunks 1..N.
      // Without this, each Anthropic call only knows its own chunk's prompt
      // and freely re-uses the same museum/cafe across days.
      const collectDayVenues = (d: ItineraryDay): string[] => {
        const names = new Set<string>();
        for (const trackKey of ['shared', 'track_a', 'track_b'] as const) {
          for (const a of (d.tracks?.[trackKey] ?? [])) {
            const n = (a as { name?: string; title?: string }).name
                  ?? (a as { name?: string; title?: string }).title;
            if (n) names.add(n);
          }
        }
        for (const s of (d.photoSpots ?? [])) {
          if (s.name) names.add(s.name);
        }
        for (const t of (d.foodieTips ?? [])) {
          if (t.name) names.add(t.name);
        }
        for (const s of (d.nightlifeHighlights ?? [])) {
          if (s.name) names.add(s.name);
        }
        for (const s of (d.shoppingGuide ?? [])) {
          if (s.name) names.add(s.name);
        }
        return Array.from(names);
      };

      // Restaurants are the most painful repeat — eating the same lunch spot
      // on day 4 that was on day 1 is jarring in a way that visiting a
      // gallery twice is not. Surface them as a separate list to the prompt
      // so the model treats restaurant repeats as a hard "never" rather
      // than a soft "avoid".
      const collectDayRestaurants = (d: ItineraryDay): string[] => {
        const names = new Set<string>();
        // Restaurant-shaped name heuristic — catches cases where the AI
        // returned isRestaurant: false but the activity is clearly a food
        // venue. Without this, "Café Tortoni" gets deduped only via the
        // generic excludeVenues block, which the model treats more loosely
        // than the explicit "NEVER REUSE THESE RESTAURANTS" block.
        const restaurantKeywords = /\b(restaurant|caf[eé]|bistro|brasserie|trattoria|osteria|tavern|tavola|pub|gastropub|eatery|kitchen|diner|bar|bakery|patisserie|p[âa]tisserie|boulangerie|coffee|izakaya|ramen|sushi|chophouse|steakhouse|grill|cantina|cevicheria|taqueria|pizzeria|food market|food hall)\b/i;
        for (const trackKey of ['shared', 'track_a', 'track_b'] as const) {
          for (const a of (d.tracks?.[trackKey] ?? [])) {
            const aa = a as { name?: string; title?: string; isRestaurant?: boolean };
            const n = aa.name ?? aa.title;
            if (!n) continue;
            if (aa.isRestaurant || restaurantKeywords.test(n)) {
              names.add(n);
            }
          }
        }
        for (const t of (d.foodieTips ?? [])) {
          if (t.name) names.add(t.name);
        }
        return Array.from(names);
      };

      // 3. Inner helper: stream one segment (or the full trip when no segments)
      const streamSegment = async (
        seg: Segment | null,
        prevContext: string | null,
      ): Promise<{ days: unknown[]; meta: Record<string, unknown> | null }> => {
        const body: Record<string, unknown> = { ...payload };
        if (seg) {
          // Build the cross-chunk "already used" list from every day already
          // in aiDaysRef — venues from chunks 1..(N-1) plus any gap-fill
          // retries within those chunks. Cap at 100 to keep the prompt lean
          // while preserving the most likely duplicates.
          const priorDays = (aiDaysRef.current ?? []).filter(d => {
            const dn = (d.day as number | undefined) ?? 0;
            return dn < seg.dayStart;
          });
          const excludeVenues = Array.from(
            new Set(priorDays.flatMap(collectDayVenues))
          ).slice(0, 100);
          const excludeRestaurants = Array.from(
            new Set(priorDays.flatMap(collectDayRestaurants))
          ).slice(0, 60);

          body.citySegment = {
            cityName: seg.cityName,
            dayStart: seg.dayStart,
            dayCount: seg.dayCount,
            // sameCity tells the server to skip arrival/check-in framing in
            // the continuity prompt; totalTripDays lets it know whether the
            // chunk's last day is the trip's final day (governs departure
            // logistics).
            sameCity: seg.sameCity,
            totalTripDays: totalDays,
            ...(prevContext ? { prevContext } : {}),
            ...(excludeVenues.length > 0 ? { excludeVenues } : {}),
            ...(excludeRestaurants.length > 0 ? { excludeRestaurants } : {}),
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
                  // SSE day payload — narrow to ItineraryDay since the
                  // server contract guarantees this shape on `data` for
                  // `type: 'day'` events. The two `as ItineraryDay` casts
                  // below were already paying the same toll.
                  const dayData = parsed.data as ItineraryDay;
                  collectedDays.push(dayData);

                  // Merge into live view — sort by day number
                  const current = aiDaysRef.current ?? [];
                  const merged  = [...current];
                  const dayNum  = typeof dayData.day === 'number' ? dayData.day : 0;
                  const existing = merged.findIndex(d => d.day === dayNum);
                  const isReEmit = existing >= 0;
                  if (isReEmit) merged[existing] = dayData as ItineraryDay;
                  else merged.push(dayData as ItineraryDay);
                  merged.sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
                  syncAiDays(merged);
                  // Only tick the "done" counter on NEW days. The AI can
                  // re-emit a day on a continuation pass to fill in
                  // sidebar arrays (foodieTips, photoSpots, etc.) that
                  // were missing on the first pass; without this guard,
                  // the progress bar ran past total and the status text
                  // showed earlier day numbers ("1 of 7" while day 7 was
                  // already on screen), making it look like the build was
                  // rebuilding earlier days.
                  if (!isReEmit) {
                    setLiveBuildDone(prev => prev + 1);
                    setLiveBuildStatus(`${dayNum} of ${totalDays} days built…`);
                  } else {
                    setLiveBuildStatus(`Polishing day ${dayNum}…`);
                  }
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

      // Track segments that throw outright (Anthropic 529, network blip, etc.)
      // so we can surface a partial-build warning at the end without aborting
      // the whole loop. A single chunk failure used to set liveBuildError and
      // bail — leaving the user with chunk 1's 3 days for what was supposed
      // to be a 10-day trip. Now we keep going and retry the failed chunks
      // once at the end.
      const failedSegments: Array<{ seg: Segment; prevContext: string | null }> = [];
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
            let days: unknown[];
            let meta: Record<string, unknown> | null;
            try {
              const result = await streamSegment(seg, prevContext);
              days = result.days;
              meta = result.meta;
            } catch (chunkErr) {
              // Don't abort the whole build — record the failure and move on.
              // The next chunk's prevContext will be stale but the user gets
              // every day we can reach. We'll retry failed segments at the end.
              console.warn('[live-build] chunk failed, continuing:', seg, chunkErr);
              failedSegments.push({ seg, prevContext });
              continue;
            }
            if (i === 0) firstMeta = meta;

            // Gap-fill: if the API's internal retry still came up short,
            // request the missing days before advancing to the next city.
            // Cap at 3 retries to avoid infinite loops on persistent
            // failures (bumped from 2 after a 10-day Dublin trip only
            // produced 2 days — the chunk fell short and gap-fill quit
            // before the model recovered).
            let segDaysReceived = days.length;
            const MAX_SEG_RETRIES = 3;
            let segRetry = 0;
            // Allow ONE zero-day retry before giving up — the model
            // occasionally returns nothing on a single call but recovers
            // on the next attempt. Two zero-day retries in a row is the
            // give-up signal.
            let consecutiveZeroRetries = 0;
            while (segDaysReceived < seg.dayCount && segRetry < MAX_SEG_RETRIES) {
              segRetry++;
              // Refresh prevContext from the LATEST day in aiDaysRef
              // before each retry. Previously prevContext was only
              // updated when retryDays.length > 0, so two consecutive
              // zero-day retries left it stale — the model in retry 3
              // saw whatever state we had before retry 1, missing any
              // server-side gap-fills that had landed via persist
              // since. Now every retry rebuilds prevContext from the
              // most recent saved day.
              {
                const all = (aiDaysRef.current ?? []) as unknown as Array<Record<string, unknown>>;
                const segPrior = all.filter(d => {
                  const dn = (d.day as number | undefined) ?? 0;
                  return dn >= seg.dayStart && dn < seg.dayStart + seg.dayCount;
                });
                const lastInChunk = segPrior[segPrior.length - 1];
                if (lastInChunk) {
                  const theme   = (lastInChunk.theme as string) || '';
                  const shared  = (lastInChunk.tracks as Record<string, unknown>)?.shared as Array<Record<string, unknown>> | undefined;
                  const firstAct = shared?.find(a => !(a.isRestaurant));
                  const actName  = firstAct ? ((firstAct.name as string) || (firstAct.title as string) || '') : '';
                  prevContext = [theme, actName].filter(Boolean).join(', ').slice(0, 80) || prevContext;
                }
              }
              const gapSeg: Segment = {
                cityName: seg.cityName,
                dayStart: seg.dayStart + segDaysReceived,
                dayCount: seg.dayCount - segDaysReceived,
                // A gap-fill is always a continuation within the same city
                // — the original chunk had already entered the city.
                sameCity: true,
              };
              const { days: retryDays } = await streamSegment(gapSeg, prevContext);
              if (retryDays.length === 0) {
                consecutiveZeroRetries++;
                console.warn(`[live-build] gap-fill retry ${segRetry} produced 0 days (consecutive zeros: ${consecutiveZeroRetries})`);
                if (consecutiveZeroRetries >= 2) break; // stuck — bail
                continue;
              }
              consecutiveZeroRetries = 0;
              segDaysReceived += retryDays.length;
              // Update prevContext from the last retry day
              const lastRetry = retryDays[retryDays.length - 1] as Record<string, unknown> | undefined;
              if (lastRetry) {
                const rTheme  = (lastRetry.theme as string) || '';
                const rShared = (lastRetry.tracks as Record<string, unknown>)?.shared as Array<Record<string, unknown>> | undefined;
                const rAct    = rShared?.find(a => !(a.isRestaurant));
                const rName   = rAct ? ((rAct.name as string) || (rAct.title as string) || '') : '';
                prevContext = [rTheme, rName].filter(Boolean).join(', ').slice(0, 80) || null;
              }
            }

            // Build prevContext from last received day for continuity handoff
            const allSegDays = (aiDaysRef.current ?? []).filter(d => {
              const dn = (d.day as number | undefined) ?? 0;
              return dn >= seg.dayStart && dn < seg.dayStart + seg.dayCount;
            });
            const lastDay = (allSegDays.length > 0 ? allSegDays[allSegDays.length - 1] : days[days.length - 1]) as Record<string, unknown> | undefined;
            if (lastDay) {
              const theme   = (lastDay.theme as string) || '';
              const shared  = (lastDay.tracks as Record<string, unknown>)?.shared as Array<Record<string, unknown>> | undefined;
              const firstAct = shared?.find(a => !(a.isRestaurant));
              const actName  = firstAct ? ((firstAct.name as string) || (firstAct.title as string) || '') : '';
              prevContext = [theme, actName].filter(Boolean).join(', ').slice(0, 80) || null;
            }

            // Partial-persist: PATCH Supabase after each city completes.
            // We surface failure via a soft toast: the final PATCH at the
            // end is authoritative, so a per-city failure isn't catastrophic,
            // but consistently failing partial saves can mean a stale cloud
            // copy if the user closes the tab mid-build — better to know.
            if (tripPageId && /^[0-9a-f-]{36}$/i.test(tripPageId)) {
              const currentDays = aiDaysRef.current ?? [];
              fetch(`/api/trips/${tripPageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days: currentDays }),
              })
                .then(res => {
                  if (!res.ok) throw new Error(`partial save failed: ${res.status}`);
                })
                .catch(err => {
                  console.warn('[live-build] partial PATCH failed:', err);
                  setActionError('Cloud save is lagging — your progress is safe locally.');
                  setTimeout(() => setActionError(null), 4000);
                });
            }
          }
        }
      } catch (e) {
        setLiveBuildError(e instanceof Error ? e.message : 'Something went wrong');
        setIsLiveBuilding(false);
        return;
      }

      // 4b. Retry any segments that threw mid-stream once. By this point the
      // surrounding chunks have completed and the user has SOMETHING on
      // screen, so a brief retry is much better UX than a fatal error.
      if (failedSegments.length > 0) {
        setLiveBuildStatus(`Retrying ${failedSegments.length} chunk${failedSegments.length === 1 ? '' : 's'}…`);
        for (const { seg, prevContext } of failedSegments) {
          try {
            await streamSegment(seg, prevContext);
          } catch (retryErr) {
            console.warn('[live-build] chunk retry failed:', seg, retryErr);
            // Still nothing for this segment — note it so the final toast
            // can prompt the user to regenerate the missing days.
          }
        }
      }

      // If after retries we still don't have every day the user asked for,
      // surface a soft warning. The trip page's regenerate button can fill
      // the gaps. Better than a hard "Generation failed" wall.
      const finalDayCount = (aiDaysRef.current ?? []).length;
      if (finalDayCount < totalDays) {
        const missing = totalDays - finalDayCount;
        setActionError(`We built ${finalDayCount} of ${totalDays} days. Tap Regenerate to fill the missing ${missing} ${missing === 1 ? 'day' : 'days'}.`);
        setTimeout(() => setActionError(null), 8000);
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
        priorityHighlights:  firstMeta?.priorityHighlights               || null,
      };
      if (firstMeta) {
        setAiMeta(metaFull);
      }

      if (tripPageId && /^[0-9a-f-]{36}$/i.test(tripPageId)) {
        // The user just spent AI credits — silently swallowing the
        // persistence error means the itinerary lives only in browser
        // memory and vanishes on refresh. Surface the failure clearly.
        // Days are kept in state either way so the user doesn't lose
        // visible progress; the error banner gives them a path to retry.
        let saveOk = false;
        try {
          const res = await fetch(`/api/trips/${tripPageId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              days:     finalDays,
              metaPatch: metaFull,
              tripPatch: { itinerary_generated_at: new Date().toISOString() },
            }),
          });
          saveOk = res.ok;
          if (!res.ok) {
            console.error('[live-build] final PATCH failed:', res.status, await res.text().catch(() => ''));
          }
        } catch (err) {
          console.error('[live-build] final PATCH threw:', err);
        }
        if (!saveOk) {
          setActionError(
            "We built your itinerary but couldn't save it to the cloud. " +
            "Don't refresh — copy or screenshot anything you want to keep, then try Regenerate."
          );
          // Sticky banner: don't auto-dismiss the way other actionErrors do.
        }
      }

      // 6. Cleanup: clear sessionStorage, strip ?mode=generating from URL
      sessionStorage.removeItem('tripcoord_gen_payload');
      sessionStorage.removeItem('tripcoord_gen_meta');
      setLiveBuildStatus('');
      setIsLiveBuilding(false);
      window.history.replaceState({}, '', window.location.pathname);

      // 7. Post-gen venue verification. Runs in its own serverless
      //    invocation (5-min budget); when it resolves we merge the
      //    verification map into aiMeta so "Verify open" badges appear
      //    in the same session without a page reload. If it fails or
      //    is slow, badges just appear on the next itinerary load —
      //    they're cosmetic, not blocking.
      if (tripPageId && /^[0-9a-f-]{36}$/i.test(tripPageId)) {
        fetch(`/api/trips/${tripPageId}/verify-venues`, { method: 'POST' })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!data) return;
            // The endpoint returns { ok, counts, flaggedVenues } but to
            // hydrate the UI we need the full entries map. Refetch the
            // trip — meta now includes venueVerification.
            return fetch(`/api/trips/${tripPageId}`).then(r => r.ok ? r.json() : null);
          })
          .then(fresh => {
            const meta = fresh?.itinerary?.meta as Record<string, unknown> | undefined;
            const vv = meta?.venueVerification;
            if (vv) {
              // Trust the server shape — verifyVenues writes it directly.
              setAiMeta(prev => prev ? ({ ...prev, venueVerification: vv as NonNullable<typeof prev>['venueVerification'] }) : prev);
            }
          })
          .catch(err => console.warn('[live-build] verify-venues failed:', err));
      }
    };

    run();
  }, [searchParams, tripPageId, syncAiDays]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: subscribe to itinerary updates for live vote sync.
  //
  // Cleanup pattern note: useEffect can only return a synchronous cleanup
  // function. Returning one from inside `import().then()` doesn't register —
  // React never sees it, so prior implementation leaked the channel on every
  // unmount/remount. Navigating between trips left stale subscriptions open
  // and vote updates from the old trip contaminated the new trip's state.
  // Fix: capture the cleanup target in closure variables and return cleanup
  // synchronously from the effect, while a `cancelled` flag prevents
  // late-arriving subscriptions if the effect is torn down before the
  // dynamic import resolves.
  useEffect(() => {
    if (!tripPageId || !/^[0-9a-f-]{36}$/i.test(tripPageId)) return;

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const { createClient: createBrowserClient } = await import('@/lib/supabase/client');
      if (cancelled) return;
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

      cleanup = () => { supabase.removeChannel(channel); };
    })();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
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
      // Mock trips (demo) get the mock Iceland days; real trips get an empty fallback.
      const isMockTrip = MOCK_TRIP_IDS.has(params.id);
      const days = aiDays ?? (isMockTrip ? itineraryDays : []);
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
              tripId: tripPageId,
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

  // Collapsible sidebar sections — priority panels start collapsed, utility panels open.
  // dayHighlights collapsed-by-default matches Hotel Recommendations; the
  // unified Day Highlights panel can otherwise dominate the sidebar before
  // the user has any context for what's in it.
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    foodie: true, nightlife: true, shopping: true,
    photoSpots: true, hotel: true, dayHighlights: true,
    // Trip Essentials (Day 1) + Heading Home (last day) default collapsed
    // so they don't dominate the top of the day's content. User can expand
    // either by tapping the header chevron; collapse state persists per-trip
    // in localStorage (same hook as the existing sections).
    tripEssentials: true, headingHome: true,
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
  // Google Maps URL paste state. Triggered when the user pastes a
  // google.com/maps/... or maps.app.goo.gl/... URL into the Search
  // Place field — we resolve + parse it, then run a Places Text Search
  // biased to the parsed lat/lon, and route the top result through the
  // existing handleSelectPlace flow so the rest of the form populates
  // identically to a manual autocomplete pick.
  const [urlResolving, setUrlResolving] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  // De-dupes resolve attempts so a user typing a URL character-by-character
  // doesn't fire a fresh Places Text Search (billable) on every keystroke.
  // Real paste fires onChange exactly once; this ref is the second-line
  // defense against the edge case.
  const lastResolvedUrlRef = useRef<string>('');

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

  // Pasted-Google-URL handler. Three steps:
  //   1. Resolve short URLs (maps.app.goo.gl/...) via the server endpoint.
  //   2. Parse the resolved URL into { name, lat, lon }.
  //   3. Run a Places Text Search biased to the lat/lon and route the
  //      top result through handleSelectPlace above.
  // Falls through to a user-readable error on any failure — the URL
  // stays in the input so the user can fix it without retyping.
  const handlePastedGoogleUrl = async (rawUrl: string) => {
    setUrlResolving(true);
    setUrlError(null);
    try {
      let parsed = parseGoogleMapsUrl(rawUrl);
      if (parsed?.shortUrl) {
        const resolveRes = await fetch('/api/google/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: rawUrl }),
        });
        if (!resolveRes.ok) {
          throw new Error("Couldn't open that Google link — try the full URL");
        }
        const { resolvedUrl } = (await resolveRes.json()) as { resolvedUrl: string };
        parsed = parseGoogleMapsUrl(resolvedUrl);
      }
      if (!parsed?.name) {
        throw new Error("Couldn't pull a place name out of that link");
      }
      const params = new URLSearchParams({ q: parsed.name });
      if (parsed.lat !== null && parsed.lon !== null) {
        params.set('location', `${parsed.lat},${parsed.lon}`);
      }
      const searchRes = await fetch(`/api/places/search?${params.toString()}`);
      if (!searchRes.ok) {
        throw new Error('Place lookup failed — try searching by name instead');
      }
      const data = (await searchRes.json()) as { results: Array<{ placeId: string; name: string }> };
      if (!data.results || data.results.length === 0) {
        throw new Error("Couldn't find that place — try searching by name");
      }
      await handleSelectPlace(data.results[0].placeId, data.results[0].name);
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setUrlResolving(false);
    }
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

  // Delete a booked hotel by index.
  // Optimistic update with rollback on failure — mirrors the handleCastVote
  // pattern in group/page.tsx. Without this, a failed PATCH leaves the UI
  // showing the hotel removed while Supabase still has it; refresh "resurrects"
  // the deleted entry, which reads as a save bug to users.
  const handleDeleteHotel = async (index: number) => {
    const prevAiMeta = aiMeta;
    const prevTripRow = tripRow;
    const updated = (aiMeta?.bookedHotels ?? []).filter((_, i) => i !== index);
    setAiMeta(prev => prev ? { ...prev, bookedHotels: updated } : prev);
    setTripRow(prev => prev ? { ...prev, booked_hotels: updated } : prev);

    const tripId = params.id;
    if (!tripId || !/^[0-9a-f-]{36}$/i.test(tripId)) return;

    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripPatch: { booked_hotels: updated } }),
      });
      if (!res.ok) throw new Error(`delete failed: ${res.status}`);
    } catch {
      setAiMeta(prevAiMeta);
      setTripRow(prevTripRow);
      setHotelGenError("Couldn't remove hotel. Please try again.");
      setTimeout(() => setHotelGenError(null), 4000);
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
  // Mock Iceland data is only for demo trip IDs (trip_1..trip_4). For real
  // trips, missing aiDays means "not loaded yet" — fall through to empty array
  // and let the hasDays gate below render an empty state.
  const isMockTrip = MOCK_TRIP_IDS.has(params.id);
  const activeDays = aiDays ?? (isMockTrip ? itineraryDays : []);

  // Build the `trip` object passed to TripStoryModal and read in a few places
  // for `destination`. Previously this spread `...trips[0]` (Iceland mock) for
  // EVERY trip with aiMeta set, then overrode destination/budget. That leaked
  // mock fields onto real trips:
  //   - trip.id stayed as 'trip_1', so MOCK_TRIP_IDS.has(trip.id) was true
  //     for real trips, which would have made TripStoryModal show the full
  //     Iceland slide deck instead of the "Coming soon" placeholder once the
  //     trip ended.
  //   - trip.coverImage / title / dates came from Iceland.
  // Now: mock trips get the full mock object (with aiMeta overrides on top
  // for the demo flow), real trips get a clean object built from tripRow +
  // aiMeta with neutral defaults — no mock leakage.
  const trip = (() => {
    if (isMockTrip) {
      const mockBase = trips.find(t => t.id === params.id) ?? trips[0];
      if (!aiMeta) return mockBase;
      return {
        ...mockBase,
        destination: aiMeta.destination || mockBase.destination,
        budgetBreakdown: (aiMeta.budgetBreakdown as unknown as typeof mockBase.budgetBreakdown) ?? mockBase.budgetBreakdown,
        budgetTotal: aiMeta.budget ?? mockBase.budgetTotal,
      };
    }
    // Real trip — build from aiMeta + tripRow with neutral defaults. Never
    // spread Iceland mock data over a real user's trip.
    const aiMetaAny = aiMeta as Record<string, unknown> | null;
    return {
      id: params.id,
      creatorId: '',
      title: (aiMetaAny?.title as string | undefined) ?? (tripRow?.title as string) ?? '',
      destination: aiMeta?.destination ?? (tripRow?.destination as string) ?? '',
      coverImage: (tripRow?.cover_image as string) ?? '',
      startDate: aiMeta?.startDate ?? (tripRow?.start_date as string) ?? '',
      endDate: aiMeta?.endDate ?? (tripRow?.end_date as string) ?? '',
      tripLength: (tripRow?.trip_length as number) ?? 0,
      status: ((tripRow?.status as string) ?? 'planning') as 'planning' | 'active' | 'completed',
      budgetTotal: aiMeta?.budget ?? (tripRow?.budget_total as number) ?? 0,
      budgetBreakdown: (aiMeta?.budgetBreakdown as unknown as typeof trips[0]['budgetBreakdown'])
        ?? (tripRow?.budget_breakdown as typeof trips[0]['budgetBreakdown'])
        ?? { flights: 0, hotel: 0, food: 0, experiences: 0, transport: 0 },
      memberCount: (tripRow?.group_size as number) ?? 1,
      guestCount: 0,
      // User-tagged cities feed the new CitiesMapSlide in TripStoryModal.
      // Falls back to []; the slide drops out of the deck when empty.
      visitedCities: (tripRow?.visited_cities as string[] | undefined) ?? [],
    };
  })();

  // ── Revert to original itinerary ─────────────────────────────────────────
  const handleRevertToOriginal = useCallback(async () => {
    if (!tripPageId || !/^[0-9a-f-]{36}$/i.test(tripPageId)) return;
    setReverting(true);
    try {
      const res = await fetch(`/api/trips/${tripPageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revert: true }),
      });
      if (!res.ok) throw new Error(`revert failed: ${res.status}`);
      const { days: restoredDays } = await res.json();
      if (Array.isArray(restoredDays)) {
        syncAiDays(restoredDays as ItineraryDay[]);
      }
      setShowRevertConfirm(false);
    } catch {
      setActionError("Couldn't revert the itinerary. Try again in a moment.");
      setTimeout(() => setActionError(null), 4000);
    } finally {
      setReverting(false);
    }
  }, [tripPageId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Edit permission gate ─────────────────────────────────────────────────
  // Solo/couple trips (groupSize ≤ 2): anyone with access can edit.
  // 3+ trips: only the organizer and co-organizer can edit. Voting, chat,
  // and photo upload stay open to all members regardless. While auth or
  // viewerRole are still loading, default to permissive — false-locking
  // an organizer's own UI is worse than briefly showing edit affordances.
  const groupSizeForGate = (tripRow?.group_size as number | undefined)
    ?? ((aiMeta as Record<string, unknown> | null)?.groupSize as number | undefined)
    ?? 2;
  const isSmallGroupTrip = groupSizeForGate <= 2;
  // Demo / mock trips render before viewerRole is fetched — treat them as
  // editable so the demo experience isn't broken.
  const canEditItinerary = isMockTrip
    || isSmallGroupTrip
    || viewerRole === null
    || viewerRole === 'organizer'
    || viewerRole === 'co_organizer';

  // Stricter gate for AI-spending actions (regenerate, Suggest Another,
  // add-day-with-AI, enrich-day). Per Brandon's 2026-05-16 product call,
  // only organizer / co-organizer can burn AI credits — even on small-group
  // trips. Members can still vote, chat, upload photos, submit preferences,
  // and add manual activities; they just can't trigger anything that costs
  // credits. The server-side `requireTripAiRole` enforces the same rule;
  // this client flag just hides the buttons so members don't see a dead
  // affordance.
  const canTriggerAi = isMockTrip
    || viewerRole === 'organizer'
    || viewerRole === 'co_organizer';
  // Guard: if activeDays is empty, currentDayData will never be rendered (the
  // "no itinerary" empty state gate below returns early before any access).
  // Hardened fallback: rather than `{} as ItineraryDay` (which would let a
  // future caller silently access undefined fields), provide a real
  // empty-day shape. If we ever land in this branch unguarded, accessors
  // like `currentDayData.tracks.shared.length` resolve to 0 instead of
  // throwing, and any visible "Day 0" is a clear signal that something
  // upstream skipped the activeDays.length > 0 gate.
  const EMPTY_DAY: ItineraryDay = {
    day: 0,
    date: '',
    theme: '',
    tracks: { shared: [], track_a: [], track_b: [] },
  };
  const currentDayData: ItineraryDay =
    activeDays.find((d: { day: number }) => d.day === selectedDay) ?? activeDays[0] ?? EMPTY_DAY;

  // ─── Persist updated days to state + localStorage + Supabase ─────────────────
  const persistDays = useCallback((updated: ItineraryDay[]) => {
    syncAiDays(updated);
    try { localStorage.setItem('generatedItinerary', JSON.stringify(updated)); } catch { /* ignore */ }

    // Sync to Supabase — use the URL trip ID directly so this works regardless
    // of whether localStorage has 'currentTripId' set (e.g. on direct
    // navigation via bookmark or dashboard link). Surface failures via the
    // existing toast — localStorage still has the change so the user's edit
    // isn't lost on refresh, but they should know the cloud copy is stale.
    const tripId = params.id;
    if (tripId && /^[0-9a-f-]{36}$/i.test(tripId)) {
      fetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: updated }),
      })
        .then(res => {
          if (!res.ok) throw new Error(`save failed: ${res.status}`);
        })
        .catch(() => {
          setActionError('Couldn’t save your changes to the cloud. They’re still on this device.');
          setTimeout(() => setActionError(null), 4000);
        });
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
    // Defensive: dayData should always exist when this fires (user clicked
    // delete on a rendered card), but if activeDays is mid-update or the
    // selectedDay was just removed, bail out instead of writing an empty
    // tracks update that wipes the day.
    if (!dayData) return;
    let deletedAct: Activity | undefined;
    let deletedTrack: 'shared' | 'track_a' | 'track_b' = 'shared';
    for (const track of ['shared', 'track_a', 'track_b'] as const) {
      const found = dayData.tracks?.[track]?.find((a: Activity) => a.id === activityId);
      if (found) { deletedAct = found; deletedTrack = track; break; }
    }
    if (!deletedAct) return;

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
    setActionError(null);
    try {
      // Collect every activity name across the WHOLE trip (all days, all
      // tracks). Without this, the model freely re-suggests venues from
      // other days — Brandon flagged "Suggest another just pulls a
      // suggestion from another day" in QA 5/10.
      const excludeNames: string[] = [];
      const seen = new Set<string>();
      for (const d of (activeDays as ItineraryDay[])) {
        for (const tr of ['shared', 'track_a', 'track_b'] as const) {
          for (const a of (d.tracks?.[tr] ?? [])) {
            const name = (a.name || a.title || '').trim();
            if (!name) continue;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            excludeNames.push(name);
          }
        }
      }

      const res = await fetch('/api/suggest-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId: tripPageId,
          destination: currentDayData?.city ?? trip.destination,
          dayNumber: selectedDay,
          date: currentDayData?.date ?? '',
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
          excludeNames,
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
      setActionError(err instanceof Error ? err.message : 'Could not get suggestion');
      setTimeout(() => setActionError(null), 3000);
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
    setEditTitle((tripRow?.title as string) ?? '');
    setEditDest(aiMeta?.destination ?? trip.destination);
    // For forked-without-dates trips, aiMeta.startDate is empty but the
    // days array still carries the source's dates. Pre-fill the modal's
    // start/end inputs as blank (so the user picks fresh) — the save
    // handler will rebase from the first day's date as the anchor.
    setEditStartDate(aiMeta?.startDate ?? '');
    setEditEndDate(aiMeta?.endDate ?? '');
    setEditTripError(null);
    setShowEditTripModal(true);
  }, [aiMeta, trip.destination, tripRow]);

  const handleSaveTripEdit = useCallback(async () => {
    if (!editDest.trim()) return;
    setSavingTripEdit(true);
    setEditTripError(null);
    try {
      const city = editDest.split(',')[0].trim();
      // Use the name the user typed; fall back to a city-derived default only
      // when they've cleared it. (Previously the title was always force-set to
      // "{city} Adventure", so renames never stuck — e.g. a forked trip kept
      // its long auto-name and couldn't be changed.)
      const newTitle = editTitle.trim() || `${city} Adventure`;

      // Shift day dates if the start date changed.
      // Anchor:
      //   1. aiMeta.startDate (existing trip-wide start) if set
      //   2. else first day's existing date — handles forked trips that
      //      were created with "Skip — I'll pick dates later" (trip.start_date
      //      is null but the copied days still carry the source's dates,
      //      which need to be rebased to the user's chosen start)
      // Noon-pad every YYYY-MM-DD parse so timezone-west-of-UTC users don't
      // get an off-by-one when toISOString() converts back.
      let updatedDays: ItineraryDay[] | null = null;
      if (editStartDate) {
        const anchor = aiMeta?.startDate
          ?? ((activeDays as ItineraryDay[])[0]?.date);
        if (anchor && anchor !== editStartDate) {
          const oldStart = new Date(anchor + 'T12:00:00');
          const newStart = new Date(editStartDate + 'T12:00:00');
          const diffDays = Math.round((newStart.getTime() - oldStart.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays !== 0) {
            updatedDays = (activeDays as ItineraryDay[]).map(day => {
              const d = new Date(day.date + 'T12:00:00');
              d.setDate(d.getDate() + diffDays);
              return { ...day, date: d.toISOString().split('T')[0] };
            });
          }
        }
      }

      const tripId = params.id;
      const isUuid = tripId && /^[0-9a-f-]{36}$/i.test(tripId);
      if (isUuid) {
        // Without the explicit res.ok check below, a 4xx/5xx response would
        // resolve normally, local state would update as if saved, and the
        // user would think the edit succeeded — until refresh resurrected
        // the old values.
        const res = await fetch(`/api/trips/${tripId}`, {
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
              // Keep meta.title in sync with trips.title — export + Trip Story
              // read the title from meta first, so without this a rename would
              // show everywhere except those two surfaces.
              title: newTitle,
              destination: editDest.trim(),
              ...(editStartDate ? { startDate: editStartDate } : {}),
              ...(editEndDate   ? { endDate:   editEndDate   } : {}),
            },
            ...(updatedDays ? { days: updatedDays } : {}),
          }),
        });
        if (!res.ok) throw new Error(`save failed: ${res.status}`);
      }

      // Update local state immediately. Both aiMeta AND tripRow have to be
      // updated — the header reads `trip.destination` which is computed as
      // `tripRow?.destination || aiMeta?.destination`, so updating only
      // aiMeta leaves the stale tripRow.destination winning and the change
      // appears not to have applied (QA 5/11: "Trip Edit works for dates
      // but not for the destination").
      setAiMeta(prev => prev ? {
        ...prev,
        title: newTitle,
        destination: editDest.trim(),
        ...(editStartDate ? { startDate: editStartDate } : {}),
        ...(editEndDate   ? { endDate:   editEndDate   } : {}),
      } : {
        title: newTitle,
        destination: editDest.trim(),
        startDate: editStartDate || undefined,
        endDate: editEndDate || undefined,
      });
      setTripRow(prev => prev ? {
        ...prev,
        destination: editDest.trim(),
        title: newTitle,
        ...(editStartDate ? { start_date: editStartDate } : {}),
        ...(editEndDate   ? { end_date:   editEndDate   } : {}),
      } : prev);

      if (updatedDays) persistDays(updatedDays as ItineraryDay[]);

      setShowEditTripModal(false);
      // Success indicator — without this the modal just closes silently
      // and the user has no confirmation their edit actually saved.
      setActionSuccess('Trip details saved');
      setTimeout(() => setActionSuccess(null), 2500);
    } catch (err) {
      console.error('Failed to save trip edit:', err);
      setEditTripError("Couldn't save your changes. Please try again.");
    } finally {
      setSavingTripEdit(false);
    }
  }, [editTitle, editDest, editStartDate, editEndDate, aiMeta, activeDays, params.id, persistDays]);

  // activeDays / trip / currentDayData declared earlier (above persistDays) so callbacks can use them

  // ─── AI enrichment handler ───────────────────────────────────────────────────
  // Calls /api/enrich-itinerary to fill in a day's sidebar arrays
  // (photoSpots / foodieTips / nightlifeHighlights / shoppingGuide /
  // priorityHighlights / destinationTip). When `includeRestaurants` is
  // set, also asks the AI to suggest breakfast/lunch/dinner restaurants
  // — used on parsed uploads where the source plan didn't include meals.
  const handleEnrichDay = useCallback(async (dayNum: number, includeRestaurants = false) => {
    if (enrichingDay !== null) return;
    setEnrichingDay(dayNum);
    setEnrichError(null);
    try {
      const res = await fetch('/api/enrich-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripId: params.id, dayNumbers: [dayNum], includeRestaurants }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setEnrichError(data?.message || data?.error || "Couldn't generate highlights. Please try again.");
        return;
      }
      if (Array.isArray(data?.days)) {
        // Server returned the full updated days array — sync to local state.
        // persistDays writes both to localStorage and to the local React
        // state used for rendering, but doesn't re-PATCH the server
        // (which already persisted via the enrich route).
        persistDays(data.days as ItineraryDay[]);
      }
    } catch (err) {
      console.error('[enrich-itinerary] failed:', err);
      setEnrichError("Couldn't generate highlights. Please try again.");
    } finally {
      setEnrichingDay(null);
    }
  }, [enrichingDay, params.id, persistDays]);

  // ─── Add Day handler ─────────────────────────────────────────────────────────
  const handleAddDay = useCallback(async () => {
    setAddDayGenerating(true);
    setAddDayError(null);

    const days = activeDays as import('@/lib/types').ItineraryDay[];
    const totalDays = days.length;

    // Determine insert index (0-based into the sorted array)
    let insertIndex: number;
    if (addDayPosition === 'end') {
      insertIndex = totalDays;
    } else if (addDayPosition === 'before') {
      insertIndex = Math.max(0, addDayRelativeTo - 1);
    } else {
      // 'after'
      insertIndex = Math.min(totalDays, addDayRelativeTo);
    }

    const newDayNumber = insertIndex + 1; // 1-based day number at insertion point

    // Compute new day's date by offsetting from the day before (if any)
    const sortedDays = [...days].sort((a, b) => a.day - b.day);
    let newDate = '';
    if (sortedDays.length > 0) {
      if (insertIndex === 0) {
        // Before day 1 — subtract 1 day from day 1's date
        const d = new Date(sortedDays[0].date + 'T12:00:00');
        d.setDate(d.getDate() - 1);
        newDate = d.toISOString().slice(0, 10);
      } else {
        // After insertIndex-1 — add 1 day to that day's date
        const prevDay = sortedDays[Math.min(insertIndex - 1, sortedDays.length - 1)];
        const d = new Date(prevDay.date + 'T12:00:00');
        d.setDate(d.getDate() + 1);
        newDate = d.toISOString().slice(0, 10);
      }
    }

    // Shift all days at or after newDayNumber up by 1 (day number + date)
    const shiftedDays = sortedDays.map(d => {
      if (d.day >= newDayNumber) {
        const oldDate = new Date(d.date + 'T12:00:00');
        oldDate.setDate(oldDate.getDate() + 1);
        return { ...d, day: d.day + 1, date: oldDate.toISOString().slice(0, 10) };
      }
      return d;
    });

    const destination = aiMeta?.destination || trip.destination || 'the destination';
    const existingThemes = sortedDays.map(d => d.theme).filter(Boolean);
    const priorities = (aiMeta?.preferences?.priorities as string[] | undefined) || [];

    if (addDayMode === 'manual') {
      // Insert a blank day
      const blankDay: import('@/lib/types').ItineraryDay = {
        day: newDayNumber,
        date: newDate,
        city: destination,
        theme: 'Free Day',
        tracks: { shared: [], track_a: [], track_b: [] },
        meetupTime: '7:00 PM',
        meetupLocation: 'Hotel lobby',
      };
      shiftedDays.splice(insertIndex, 0, blankDay);
      const finalDays = shiftedDays.sort((a, b) => a.day - b.day);
      persistDays(finalDays);
      setSelectedDay(newDayNumber);
      setShowAddDayModal(false);
      setAddDayGenerating(false);
      return;
    }

    // AI mode — call the add-day API
    try {
      const res = await fetch(`/api/trips/${params.id}/add-day`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination, dayNumber: newDayNumber, date: newDate, existingThemes, priorities }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const { day: generatedDay } = await res.json() as { day: import('@/lib/types').ItineraryDay };
      // Normalise the AI's day so missing optional fields don't crash render
      // paths that assume they're set. Multiple components read these fields
      // (sidebar Day Highlights, MapView, Weather, etc.) and an unguarded
      // .split() on a missing string field reproducibly broke this flow.
      const normalisedDay: import('@/lib/types').ItineraryDay = {
        ...generatedDay,
        day: newDayNumber,
        date: newDate,
        theme: generatedDay.theme ?? 'Free Day',
        city: generatedDay.city ?? destination,
        tracks: {
          shared: generatedDay.tracks?.shared ?? [],
          track_a: generatedDay.tracks?.track_a ?? [],
          track_b: generatedDay.tracks?.track_b ?? [],
        },
        meetupTime: generatedDay.meetupTime ?? '',
        meetupLocation: generatedDay.meetupLocation ?? '',
        photoSpots: generatedDay.photoSpots ?? [],
        foodieTips: generatedDay.foodieTips ?? [],
        transportLegs: generatedDay.transportLegs ?? [],
      };
      // Backfill any missing string fields on each activity so downstream
      // .split() / display code never hits undefined.
      for (const track of ['shared', 'track_a', 'track_b'] as const) {
        const acts = (normalisedDay.tracks as Record<string, import('@/lib/types').Activity[]>)[track];
        if (!Array.isArray(acts)) continue;
        for (const a of acts) {
          a.timeSlot = a.timeSlot ?? '';
          a.title = a.title ?? a.name ?? 'Activity';
          a.description = a.description ?? '';
          a.address = a.address ?? '';
          a.track = (a.track as 'shared' | 'track_a' | 'track_b') ?? track;
        }
      }
      shiftedDays.splice(insertIndex, 0, normalisedDay);
      const finalDays = shiftedDays.sort((a, b) => a.day - b.day);
      persistDays(finalDays);
      setSelectedDay(newDayNumber);
      setShowAddDayModal(false);
    } catch {
      setAddDayError('Could not generate day. Please try again or use Manual mode.');
    } finally {
      setAddDayGenerating(false);
    }
  }, [activeDays, addDayPosition, addDayRelativeTo, addDayMode, aiMeta, trip, params.id, persistDays, setSelectedDay]);

  const hasTrackA = (currentDayData.tracks?.track_a?.length ?? 0) > 0;
  const hasTrackB = (currentDayData.tracks?.track_b?.length ?? 0) > 0;

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

  // ─── Empty-state gate ────────────────────────────────────────────────────────
  // currentDayData is `{} as ItineraryDay` when activeDays is empty (Supabase
  // returned no days yet, generation failed, etc.). Touching .date / .tracks
  // / .transportLegs in render or handlers throws "cannot read property of
  // undefined". Render a graceful state instead.
  const hasDays = activeDays.length > 0;
  if (!hasDays) {
    return (
      <div className="min-h-screen bg-parchment p-3 md:p-6 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          {isLiveBuilding ? (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-sky-600 mx-auto mb-4" />
              <h1 className="text-xl font-script italic font-semibold text-zinc-900 mb-2">
                {liveBuildStatus || 'Building your itinerary…'}
              </h1>
              <p className="text-sm text-zinc-500">Days will appear as they finish generating.</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-script italic font-semibold text-zinc-900 mb-2">
                No itinerary yet
              </h1>
              <p className="text-sm text-zinc-500 mb-6">
                This trip doesn&apos;t have any generated days. Try refreshing — if the issue persists, the generation may have failed.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-800 hover:bg-sky-900 text-white text-sm font-bold rounded-full transition-colors"
              >
                Refresh
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

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

        {/* Missing-dates banner — shown when the trip has no start_date
            (e.g. forked from a community template with "Skip — I'll pick
            dates later"). The day pills still render whatever dates were
            copied from the source, which is confusing. Surface a clear
            CTA that opens the edit-trip modal with the date inputs
            pre-anchored on the first existing day. */}
        {aiDays && canEditItinerary && !tripRow?.start_date && !aiMeta?.startDate && !isLiveBuilding && (
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 bg-sky-50 border border-sky-200 rounded-2xl">
            <div className="flex items-center gap-3 min-w-0">
              <Calendar className="w-5 h-5 flex-shrink-0 text-sky-700" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900">Add your travel dates</p>
                <p className="text-xs text-zinc-500">Your itinerary is showing dates from the original template — pick yours and we&apos;ll shift every day.</p>
              </div>
            </div>
            <button
              onClick={handleOpenEditTrip}
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-sky-800 hover:bg-sky-900 text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
            >
              <Pencil className="w-3.5 h-3.5" /> Set dates
            </button>
          </div>
        )}

        {/* Toasts */}
        {activityAdded && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:top-6 md:bottom-auto md:translate-x-0 z-50 flex items-center gap-3 bg-zinc-900 text-white px-5 py-3.5 rounded-2xl shadow-xl">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-semibold">{editingActivity ? 'Activity updated' : 'Activity added to itinerary'}</span>
          </div>
        )}
        {activityDeleted && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:top-6 md:bottom-auto md:translate-x-0 z-50 flex items-center gap-3 bg-zinc-900 text-white px-5 py-3.5 rounded-2xl shadow-xl">
            <Trash2 className="w-5 h-5 text-rose-400" />
            <span className="text-sm font-semibold">Activity removed</span>
          </div>
        )}
        {actionSuccess && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:top-6 md:bottom-auto md:translate-x-0 z-50 flex items-center gap-3 bg-zinc-900 text-white px-5 py-3.5 rounded-2xl shadow-xl">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-semibold">{actionSuccess}</span>
          </div>
        )}
        {actionError && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:top-6 md:bottom-auto md:translate-x-0 z-50 flex items-center gap-3 bg-rose-900 text-white px-5 py-3.5 rounded-2xl shadow-xl">
            <AlertCircle className="w-5 h-5 text-rose-300" />
            <span className="text-sm font-semibold">{actionError}</span>
          </div>
        )}
        {bookingSaved && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:top-6 md:bottom-auto md:translate-x-0 z-50 flex items-center gap-3 bg-zinc-900 text-white px-5 py-3.5 rounded-2xl shadow-xl">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-semibold">{bookingSaved}</span>
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
              {aiDays && canEditItinerary && (
                // Always-visible edit affordance (was opacity-0 + hover-only,
                // hard to discover per QA 5/10). Subtle but persistent: soft
                // border + muted color so it doesn't dominate the destination
                // text but is always reachable. Hidden for non-org/co-org
                // viewers on 3+ trips per the edit-permission gate.
                <button
                  onClick={handleOpenEditTrip}
                  title="Edit trip name, destination & dates"
                  aria-label="Edit trip name, destination, and dates"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-400 hover:text-zinc-700 hover:border-zinc-300 transition-colors"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
              {/* Community-share toggle — organizer only. Small icon button
                  with hover tooltip; explicit on/off colour swap so state is
                  glanceable. is_public_template is opt-in, default off. */}
              {currentUser.id && tripRow?.organizer_id === currentUser.id && (() => {
                const isPublic = !!tripRow?.is_public_template;
                return (
                  <button
                    onClick={async () => {
                      if (communityToggleSaving) return;
                      const next = !isPublic;
                      setCommunityToggleSaving(true);
                      // Optimistic
                      setTripRow(prev => prev ? { ...prev, is_public_template: next } : prev);
                      try {
                        const res = await fetch(`/api/trips/${trip.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ tripPatch: { is_public_template: next } }),
                        });
                        if (!res.ok) throw new Error();
                      } catch {
                        setTripRow(prev => prev ? { ...prev, is_public_template: !next } : prev);
                      } finally {
                        setCommunityToggleSaving(false);
                      }
                    }}
                    disabled={communityToggleSaving}
                    title={isPublic
                      ? 'Shared to Discover community — click to unshare. Group chat & expenses stay private either way.'
                      : 'Click to share this itinerary publicly on Discover. Anyone can like or fork it as a starting point. Group chat & expenses stay private.'}
                    aria-label={isPublic ? 'Stop sharing publicly' : 'Share publicly to community'}
                    // Always-visible chip so the share affordance is
                    // discoverable (QA 5/10 — was hard to find next to the
                    // pencil). Border + label-friendly hover colors.
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors ${
                      isPublic
                        ? 'border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100'
                        : 'border-zinc-200 bg-white text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300'
                    } ${communityToggleSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <Globe2 className="w-3 h-3" />
                  </button>
                );
              })()}
              {/* Founder-only "Feature on Discover" toggle — publishes this trip
                  to the Founder Itineraries rail. Shown only to the organizer
                  when they're a founder; the API also enforces both server-side.
                  Featuring also flips the public-share flag on. */}
              {currentUser.id && tripRow?.organizer_id === currentUser.id && isFounderEmail(currentUser.email) && (() => {
                const isFeatured = !!tripRow?.is_founder_featured;
                return (
                  <button
                    onClick={async () => {
                      if (featuredToggleSaving) return;
                      const next = !isFeatured;
                      setFeaturedToggleSaving(true);
                      // Optimistic — featuring also makes the trip public.
                      setTripRow(prev => prev
                        ? { ...prev, is_founder_featured: next, ...(next ? { is_public_template: true } : {}) }
                        : prev);
                      try {
                        const res = await fetch(`/api/trips/${trip.id}/feature`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ featured: next }),
                        });
                        if (!res.ok) throw new Error();
                      } catch {
                        setTripRow(prev => prev ? { ...prev, is_founder_featured: !next } : prev);
                      } finally {
                        setFeaturedToggleSaving(false);
                      }
                    }}
                    disabled={featuredToggleSaving}
                    title={isFeatured
                      ? 'Featured on Discover → Founder Itineraries. Click to remove.'
                      : 'Founder action: feature this trip on Discover → Founder Itineraries (also shares it publicly).'}
                    aria-label={isFeatured ? 'Remove from Founder Itineraries' : 'Feature on Founder Itineraries'}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors ${
                      isFeatured
                        ? 'border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100'
                        : 'border-zinc-200 bg-white text-zinc-400 hover:text-amber-600 hover:bg-amber-50 hover:border-amber-300'
                    } ${featuredToggleSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    <Star className={`w-3 h-3 ${isFeatured ? 'fill-current' : ''}`} />
                  </button>
                );
              })()}
            </div>
            <h1 className="text-2xl font-script italic font-semibold text-zinc-900 mb-2">
              {new Date(currentDayData.date + 'T12:00:00').toLocaleDateString('en-US', {
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
          {/* Add menu is disabled once the trip is completed AND hidden
              entirely for non-org/co-org viewers on 3+ trips (per the
              edit-permission gate). Members can still see the activities,
              vote, and chat — they just can't add/edit/parse. */}
          {(() => {
            const isTripCompleted = tripRow?.status === 'completed';
            if (!canEditItinerary) return null;
            return (
          <div className="flex items-center gap-2 flex-shrink-0 mt-1 flex-wrap justify-end">
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
                <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-lg border border-zinc-100 py-1.5 min-w-[200px] z-30">
                  {/* Invite someone — moved from standalone toolbar button */}
                  <button
                    onClick={() => { setInviteSent(false); setInviteError(null); setShowInviteModal(true); setShowAddMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 flex items-center gap-2.5"
                  >
                    <UserPlus className="w-4 h-4 text-sky-600" /> Invite Someone
                  </button>
                  <div className="my-1 border-t border-zinc-100" />
                  <button
                    onClick={() => { setShowAddActivityModal(true); setShowAddMenu(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 flex items-center gap-2.5"
                  >
                    <CalendarPlus className="w-4 h-4 text-sky-600" /> Activity
                  </button>
                  <button
                    onClick={() => {
                      // Plain members can only insert blank days — pre-set
                      // the mode so they don't open into a disabled AI tab.
                      if (!canTriggerAi) setAddDayMode('manual');
                      setShowAddDayModal(true);
                      setShowAddMenu(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 flex items-center gap-2.5"
                  >
                    <PlusSquare className="w-4 h-4 text-sky-600" /> Day
                  </button>
                  <button
                    onClick={() => {
                      // Parse-transport spends AI credits, so it's also gated
                      // by canTriggerAi (org/co-org). Plain members can't add
                      // transport this way — they can ask the organizer.
                      if (!hasTransportParser) { setUpgradePromptKey('feature_locked'); setShowAddMenu(false); return; }
                      if (!canTriggerAi) { setShowAddMenu(false); return; }
                      setShowParseModal(true);
                      setShowAddMenu(false);
                    }}
                    disabled={hasTransportParser && !canTriggerAi}
                    title={hasTransportParser && !canTriggerAi ? 'Only the organizer or co-organizer can parse transport confirmations.' : ''}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 flex items-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
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
                  {/* Revert to original — destructive, shown only when an AI
                      baseline snapshot exists. Separated by a divider and
                      colored rose to signal "this undoes things". */}
                  {hasOriginal && (
                    <>
                      <div className="my-1 border-t border-zinc-100" />
                      <button
                        onClick={() => { setShowRevertConfirm(true); setShowAddMenu(false); }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-50 flex items-center gap-2.5"
                      >
                        <RefreshCw className="w-4 h-4 text-rose-600" /> Revert to AI original
                      </button>
                    </>
                  )}
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

            {/* Share — opens a quick-share modal with copy-link + social.
                 Only rendered on real (non-mock) trips since mock trips
                 don't have a real /join URL. */}
            {!isMockTrip && (
              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 md:px-4 bg-white border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs md:text-sm font-semibold rounded-full shadow-sm transition-all"
              >
                <Share2 className="w-4 h-4" />
                <span className="hidden sm:inline">Share</span>
              </button>
            )}

            {(() => {
              // Trip Story is hidden entirely until the trip has ended. Brandon's
              // concern: showing the button on active/planning trips invites
              // exploratory clicks that could trigger AI-generated content costs
              // in the future. The button only renders the day after the trip's
              // end date — by which point the story is meaningful and the AI
              // (when wired up) is generating something concrete to consume.
              const endDateStr = tripRow?.end_date || aiMeta?.endDate;
              const tripEnded = endDateStr
                ? new Date() > new Date(new Date(endDateStr).getTime() + 24 * 60 * 60 * 1000)
                : false;
              if (!tripEnded) return null;
              if (!hasTripStory) {
                // Tier-gated but trip ended: still render so users can see the
                // upgrade nudge. Disabled appearance with the lock badge.
                return (
                  <button
                    onClick={() => setUpgradePromptKey('feature_locked')}
                    className="flex items-center gap-1.5 px-3 py-2 md:px-4 border bg-white border-zinc-200 text-zinc-400 text-xs md:text-sm font-semibold rounded-full shadow-sm transition-all"
                  >
                    <BookOpen className="w-4 h-4 text-zinc-300" />
                    <span className="hidden sm:inline">Trip </span>Story
                    <LockBadge />
                  </button>
                );
              }
              return (
                <button
                  onClick={() => setShowStoryModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 md:px-4 border bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs md:text-sm font-semibold rounded-full shadow-sm transition-all"
                >
                  <BookOpen className="w-4 h-4 text-sky-600" />
                  <span className="hidden sm:inline">Trip </span>Story
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

        {/* Regenerate with group input banner — paid tiers only,
             organizer / co-organizer only. Trip Pass is the primary use
             case (per-member preferences mini-wizard drives this);
             Explorer/Nomad keep access for legacy behaviour. */}
        {newPrefsCount > 0
          && tierResolved
          && (tier === 'trip_pass' || tier === 'explorer' || tier === 'nomad')
          && currentUser.id
          && canTriggerAi
          && (
          <div className="mb-5 flex items-center gap-3 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
            <Users className="w-4 h-4 text-sky-600 flex-shrink-0" />
            <p className="flex-1 text-sm text-sky-800">
              <span className="font-semibold">{newPrefsCount} new {newPrefsCount === 1 ? 'traveler has' : 'travelers have'} added their preferences</span>
              {' '}since this itinerary was built.
            </p>
            <button
              onClick={() => {
                if (pendingPrefsCount > 0) {
                  setShowRegenConfirm(true);
                } else {
                  handleRegenerate();
                }
              }}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-sky-800 hover:bg-sky-900 text-white text-xs font-bold rounded-full transition-all whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Regenerate
            </button>
          </div>
        )}

        {/* Regenerate confirm — fires the "pending members default to no
            preferences" warning from the Trip Pass design. The buyer can
            wait or generate anyway; we never block. */}
        {showRevertConfirm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !reverting && setShowRevertConfirm(false)}>
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
              <h3 className="font-script italic text-2xl font-semibold text-zinc-900 mb-2">Revert to AI original?</h3>
              <p className="text-sm text-zinc-700 mb-3">
                This will restore the itinerary to exactly what the AI generated when this trip was first built. <span className="font-semibold text-zinc-900">Every change made since</span> — added activities, swapped days, replaced suggestions, removed items — will be lost.
              </p>
              <p className="text-xs text-zinc-500 mb-6">Hotel bookings, photos, votes, and chat are untouched.</p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowRevertConfirm(false)}
                  disabled={reverting}
                  className="px-4 py-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRevertToOriginal}
                  disabled={reverting}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-60 inline-flex items-center gap-2"
                >
                  {reverting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reverting…</> : 'Yes, revert'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showRegenConfirm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowRegenConfirm(false)}>
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
              <h3 className="font-script italic text-2xl font-semibold text-zinc-900 mb-2">Generate now?</h3>
              <p className="text-sm text-zinc-700 mb-5">
                <span className="font-semibold text-zinc-900">{pendingPrefsCount}</span> {pendingPrefsCount === 1 ? 'member hasn\'t' : 'members haven\'t'} shared preferences yet. If you generate now, {pendingPrefsCount === 1 ? 'their answers' : 'their answers'} won&apos;t be factored in — the AI will use only the input it has.
              </p>
              <p className="text-xs text-zinc-500 mb-6">You can always regenerate later when more answers come in.</p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowRegenConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-700 hover:text-zinc-900"
                >
                  Wait
                </button>
                <button
                  onClick={() => { setShowRegenConfirm(false); handleRegenerate(); }}
                  className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold rounded-full transition-colors"
                >
                  Generate now
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View-only banner for non-org/co-org viewers on 3+ trips. Subtle —
            no scary lock icon — just explains why their edit affordances are
            hidden. Hidden on solo/couple trips and for organizers/co-orgs. */}
        {!canEditItinerary && (
          <div className="mb-4 flex items-center gap-2.5 px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl">
            <span className="text-base flex-shrink-0">👀</span>
            <p className="text-xs text-zinc-600 leading-snug">
              <span className="font-semibold text-zinc-700">View only.</span>{' '}
              Only the organizer and co-organizers can edit this itinerary. You can still vote on activities, chat, and upload photos.
            </p>
          </div>
        )}

        {/* Day Selector — arrow navigation when overflow + drag-and-drop swap */}
        {(() => {
          // ── Swap-content-but-not-dates: drag a day pill onto another to
          // exchange their activities/tracks/photoSpots/foodieTips/etc.
          // Day numbers, dates, title, and practicalNotes stay pinned to
          // their original position. Locks: Day 1 (arrival framing baked
          // in), the last day (departure framing baked in), and cross-city
          // pairs (would break travel-day continuity on multi-city trips).
          const lastDayNumber = activeDays.length > 0 ? activeDays[activeDays.length - 1].day : null;
          const isLocked = (n: number) => n === 1 || (lastDayNumber !== null && n === lastDayNumber);
          const canSwap = (a: number, b: number): boolean => {
            // Permission gate: 3+ trips lock day-swap to organizer/co-org.
            if (!canEditItinerary) return false;
            if (a === b) return false;
            if (isLocked(a) || isLocked(b)) return false;
            const dayA = activeDays.find((d: { day: number }) => d.day === a) as ItineraryDay | undefined;
            const dayB = activeDays.find((d: { day: number }) => d.day === b) as ItineraryDay | undefined;
            if (!dayA || !dayB) return false;
            if (dayA.city && dayB.city && dayA.city !== dayB.city) return false;
            return true;
          };
          const swapDayContent = (a: number, b: number) => {
            console.log('[day-swap] requested', { a, b, canSwap: canSwap(a, b) });
            if (!canSwap(a, b)) return;
            // Swap-safe fields — everything that conceptually describes "what
            // happens on this day" rather than "which calendar day this is".
            // timeSlot lives on each activity, so it travels naturally with
            // the tracks. Each activity keeps its own start/end time —
            // nothing gets reset by the swap.
            const SWAP_FIELDS = [
              'tracks', 'theme', 'photoSpots', 'foodieTips',
              'nightlifeHighlights', 'shoppingGuide', 'transportLegs',
              'destinationTip', 'dinnerMeetupLocation',
              'meetupTime', 'meetupLocation', 'trackALabel', 'trackBLabel',
              'priorityHighlights',
            ] as const;
            const dayA = (activeDays as ItineraryDay[]).find(d => d.day === a);
            const dayB = (activeDays as ItineraryDay[]).find(d => d.day === b);
            if (!dayA || !dayB) return;
            const swapped = (activeDays as ItineraryDay[]).map(d => {
              if (d.day !== a && d.day !== b) return d;
              const other = d.day === a ? dayB : dayA;
              const next: Record<string, unknown> = { ...d };
              for (const k of SWAP_FIELDS) {
                next[k] = (other as unknown as Record<string, unknown>)[k];
              }
              return next as unknown as ItineraryDay;
            });
            syncAiDays(swapped);
            // Jump to the lower-numbered of the two swapped days so the user
            // sees the result immediately. Without this, if you click Day 3's
            // left chevron from a different day (e.g. viewing Day 1), the
            // swap happens but you see no change because you're not looking
            // at either affected day.
            const focusDay = Math.min(a, b);
            setSelectedDay(focusDay);
            // Success toast — without explicit feedback the swap LOOKS like
            // a no-op since day numbers + dates stay anchored. Only the
            // theme + activities under the pill change.
            setActionSuccess(`Swapped Day ${Math.min(a, b)} and Day ${Math.max(a, b)}`);
            setTimeout(() => setActionSuccess(null), 2500);
            if (tripPageId && /^[0-9a-f-]{36}$/i.test(tripPageId)) {
              fetch(`/api/trips/${tripPageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days: swapped }),
              })
                .then(res => {
                  if (!res.ok) throw new Error(`save failed: ${res.status}`);
                })
                .catch(() => {
                  // Roll back on failure
                  syncAiDays(activeDays as ItineraryDay[]);
                  setActionError("Couldn't save the day swap. Try again in a moment.");
                  setTimeout(() => setActionError(null), 4000);
                });
            }
          };

          return (
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
            // Dismiss the fixed-position pill tooltip on horizontal scroll
            // — the tooltip's coords were captured at mouseenter via
            // getBoundingClientRect and don't follow the pill as it moves.
            // Easier to dismiss than to keep re-positioning every scroll
            // tick (the user reacquires the hover after scrolling stops).
            onScroll={() => {
              updateDayTabScroll();
              if (pillTooltip) setPillTooltip(null);
            }}
            className={`flex gap-2 overflow-x-auto pb-1 flex-1 ${dayTabCanScrollLeft ? 'pl-10' : ''} ${dayTabCanScrollRight ? 'pr-10' : ''}`}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {activeDays.map((day: { day: number; date: string }, idx: number) => {
              const dayDateStr = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const locked = isLocked(day.day);
              const isDragging = draggingDay === day.day;
              const isValidDropTarget = draggingDay !== null && draggingDay !== day.day && canSwap(draggingDay, day.day);
              const isHoverTarget = dragOverDay === day.day && isValidDropTarget;
              // Adjacent-swap chevrons: tap-friendly alternative to drag-and-
              // drop. Resolve the day immediately before/after by index and
              // check canSwap on the pair — same locks (Day 1, last day,
              // cross-city) apply because we reuse the swap function below.
              const prevDayNum = idx > 0 ? (activeDays[idx - 1] as { day: number }).day : null;
              const nextDayNum = idx < activeDays.length - 1 ? (activeDays[idx + 1] as { day: number }).day : null;
              const canMoveEarlier = prevDayNum !== null && canSwap(day.day, prevDayNum);
              const canMoveLater   = nextDayNum !== null && canSwap(day.day, nextDayNum);
              // Tooltip copy is shared across the native `title=` attr (mobile
              // fallback when the chevrons are visible) AND the custom desktop
              // hover bubble below. Drag-only copy on desktop because chevrons
              // are hidden there; mobile still sees the chevrons + native tip.
              const tooltip = !canEditItinerary
                ? 'Only the organizer or co-organizer can rearrange days'
                : locked
                  ? (day.day === 1 ? 'Day 1 stays first (trip arrival)' : 'Last day stays last (trip departure)')
                  : 'Drag to swap with another day';
              return (
                // Wrap each pill in a 1-cell flex row so the chevrons sit
                // tightly against it. The pill itself keeps its click +
                // drag handlers — chevrons stay on mobile/tablet only
                // (md:hidden) where touch-drag is unreliable and keyboard
                // users need a tap target. `group` + `relative` enable the
                // desktop hover tooltip below.
                <div key={day.day} className="flex items-center gap-0.5 flex-shrink-0 group relative">
                  {canEditItinerary && !locked && (
                    <button
                      onClick={(e) => { e.stopPropagation(); if (canMoveEarlier && prevDayNum !== null) swapDayContent(day.day, prevDayNum); }}
                      disabled={!canMoveEarlier}
                      title={canMoveEarlier ? `Swap with Day ${prevDayNum}` : 'Cannot move earlier'}
                      aria-label={`Move Day ${day.day} earlier`}
                      className="md:hidden w-6 h-6 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    draggable={canEditItinerary && !locked}
                    onDragStart={(e) => {
                      if (locked) { e.preventDefault(); return; }
                      setDraggingDay(day.day);
                      try { e.dataTransfer.effectAllowed = 'move'; } catch { /* ignore */ }
                    }}
                    onDragEnd={() => { setDraggingDay(null); setDragOverDay(null); }}
                    onDragOver={(e) => {
                      if (isValidDropTarget) {
                        e.preventDefault();
                        try { e.dataTransfer.dropEffect = 'move'; } catch { /* ignore */ }
                        if (dragOverDay !== day.day) setDragOverDay(day.day);
                      }
                    }}
                    onDragLeave={() => {
                      setDragOverDay(prev => prev === day.day ? null : prev);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingDay !== null && canSwap(draggingDay, day.day)) {
                        swapDayContent(draggingDay, day.day);
                      }
                      setDraggingDay(null);
                      setDragOverDay(null);
                    }}
                    // Mouse-only — touch devices don't get the desktop
                    // tooltip; they get the chevrons instead (md:hidden
                    // on the buttons, see above).
                    onMouseEnter={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setPillTooltip({
                        // 8px gap above the pill — tooltip height (~28px)
                        // is subtracted via translate(-100%) on the y axis
                        // in the render below.
                        top: r.top - 8,
                        left: r.left + r.width / 2,
                        text: tooltip,
                      });
                    }}
                    onMouseLeave={() => setPillTooltip(null)}
                    onClick={() => setSelectedDay(day.day)}
                    aria-label={`Day ${day.day}${tooltip ? `. ${tooltip}` : ''}`}
                    className={`px-5 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-all ${
                      locked ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
                    } ${
                      isDragging ? 'opacity-50' : ''
                    } ${
                      isHoverTarget ? 'ring-2 ring-sky-400 ring-offset-1' : ''
                    } ${
                      selectedDay === day.day
                        ? 'bg-zinc-900 text-white shadow-sm'
                        : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300'
                    }`}
                  >
                    Day {day.day} · {dayDateStr}
                  </button>
                  {canEditItinerary && !locked && (
                    <button
                      onClick={(e) => { e.stopPropagation(); if (canMoveLater && nextDayNum !== null) swapDayContent(day.day, nextDayNum); }}
                      disabled={!canMoveLater}
                      title={canMoveLater ? `Swap with Day ${nextDayNum}` : 'Cannot move later'}
                      aria-label={`Move Day ${day.day} later`}
                      className="md:hidden w-6 h-6 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
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
          {/* Desktop pill hover tooltip — `position: fixed` escapes the
              day-tab scroll container's overflow clipping. Rendered once
              per row (not per pill) and repositioned via mouseenter on
              each pill. Hidden on mobile via `hidden md:block`. */}
          {pillTooltip && (
            // Visual hint only — accessibility info travels via the pill
            // button's aria-label, not this overlay. role="tooltip" was
            // removed because there's no aria-describedby connecting the
            // pill to this element, so the role was misleading to AT.
            <div
              aria-hidden
              className="hidden md:block fixed z-50 px-2.5 py-1.5 bg-zinc-900 text-white text-xs font-medium rounded-md whitespace-nowrap pointer-events-none shadow-lg"
              style={{
                top: pillTooltip.top,
                left: pillTooltip.left,
                transform: 'translate(-50%, -100%)',
              }}
            >
              {pillTooltip.text}
              <span
                aria-hidden
                className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-zinc-900 rotate-45"
              />
            </div>
          )}
        </div>
          );
        })()}

        {/* Map View */}
        {showMapView && (
          <div className="mb-6">
            <MapView
              activities={sortedActivities}
              transportLegs={[...(currentDayData.transportLegs ?? []), ...(addedTransport[selectedDay] ?? [])]}
              hotels={(aiMeta?.bookedHotels ?? []).map(h => ({ name: h.name, address: h.address ?? undefined }))}
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
                    {/* "Shared" only means something on 3+ traveler trips with
                        split tracks — a solo/couple trip has no tracks to share,
                        so hide the whole legend unless there's a real Track A/B. */}
                    {(!isSmallGroupTrip || hasTrackA || hasTrackB) && (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Today&apos;s tracks</p>
                        <div className="flex flex-wrap gap-3">
                          {[
                            { color: 'bg-sky-500', label: 'Shared', show: !isSmallGroupTrip },
                            { color: 'bg-violet-500', label: currentDayData.trackALabel || 'Track A', show: hasTrackA },
                            { color: 'bg-rose-500', label: currentDayData.trackBLabel || 'Track B', show: hasTrackB },
                          ].filter(t => t.show).map(t => (
                            <div key={t.label} className="flex items-center gap-2">
                              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${t.color}`} />
                              <span className="text-xs font-semibold text-zinc-600">{t.label}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
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
                  {/* Trip Essentials — Day 1 only. Surfaces practicalNotes
                      (currency / tipping / customs / entry requirements +
                      optional safety + useful phrases) that the AI generates
                      but had never been rendered. */}
                  {selectedDay === 1 && aiMeta?.practicalNotes && (() => {
                    const pn = aiMeta.practicalNotes;
                    const fieldsPresent: string[] = [];
                    if (pn.currency) fieldsPresent.push('Currency');
                    if (pn.tipping) fieldsPresent.push('Tipping');
                    if (pn.customs) fieldsPresent.push('Customs');
                    if (pn.entryRequirements) fieldsPresent.push('Entry');
                    if (pn.safetyTips) fieldsPresent.push('Safety');
                    if (pn.usefulPhrases && pn.usefulPhrases.length > 0) fieldsPresent.push('Phrases');
                    if (fieldsPresent.length === 0) return null;
                    const isCollapsed = collapsedSections.tripEssentials ?? true;
                    return (
                      <div className="bg-white border border-sky-100 rounded-2xl overflow-hidden">
                        <button
                          onClick={() => toggleSidebarSection('tripEssentials')}
                          className="w-full px-4 py-3 bg-gradient-to-r from-sky-50 to-sky-100 border-b border-sky-100 flex items-center gap-2 hover:from-sky-100 hover:to-sky-200 transition-colors"
                        >
                          <span className="text-base flex-shrink-0">🧭</span>
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-widest text-sky-900">Trip Essentials</p>
                            {isCollapsed && (
                              <p className="text-[11px] text-sky-700/70 mt-0.5 truncate">
                                {fieldsPresent.join(' · ')} · tap to expand
                              </p>
                            )}
                          </div>
                          <ChevronDown className={`w-4 h-4 text-sky-700 flex-shrink-0 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`} />
                        </button>
                        {!isCollapsed && (
                          <dl className="divide-y divide-zinc-100">
                            {pn.currency && (
                              <div className="px-4 py-3">
                                <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-0.5">Currency</dt>
                                <dd className="text-sm text-zinc-800 leading-snug">{pn.currency}</dd>
                              </div>
                            )}
                            {pn.tipping && (
                              <div className="px-4 py-3">
                                <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-0.5">Tipping</dt>
                                <dd className="text-sm text-zinc-800 leading-snug">{pn.tipping}</dd>
                              </div>
                            )}
                            {pn.customs && (
                              <div className="px-4 py-3">
                                <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-0.5">Customs & Etiquette</dt>
                                <dd className="text-sm text-zinc-800 leading-snug">{pn.customs}</dd>
                              </div>
                            )}
                            {pn.entryRequirements && (
                              <div className="px-4 py-3">
                                <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-0.5">Entry Requirements</dt>
                                <dd className="text-sm text-zinc-800 leading-snug">{pn.entryRequirements}</dd>
                              </div>
                            )}
                            {pn.safetyTips && (
                              <div className="px-4 py-3">
                                <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-0.5">Safety</dt>
                                <dd className="text-sm text-zinc-800 leading-snug">{pn.safetyTips}</dd>
                              </div>
                            )}
                            {pn.usefulPhrases && pn.usefulPhrases.length > 0 && (
                              <div className="px-4 py-3">
                                <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5">Useful Phrases</dt>
                                <dd>
                                  <ul className="space-y-1">
                                    {pn.usefulPhrases.map((phrase, i) => (
                                      <li key={`${phrase}-${i}`} className="text-sm text-zinc-800 leading-snug">{phrase}</li>
                                    ))}
                                  </ul>
                                </dd>
                              </div>
                            )}
                          </dl>
                        )}
                      </div>
                    );
                  })()}

                  {/* Heading Home — last day only. Departure logistics generated
                      by the AI (airport + recommended arrival + transit + last-
                      day timing + customs + luggage). Drops out if no
                      departureInfo (older trips, road trips with no flight, etc.). */}
                  {(() => {
                    const lastDayNum = activeDays.length > 0 ? activeDays[activeDays.length - 1].day : null;
                    if (lastDayNum === null || selectedDay !== lastDayNum) return null;
                    const di = aiMeta?.departureInfo;
                    if (!di) return null;
                    const fieldsPresent: string[] = [];
                    if (di.airport) fieldsPresent.push('Airport');
                    if (di.recommendedArrival) fieldsPresent.push('Arrival');
                    if (di.lastDayTimingTip) fieldsPresent.push('Timing');
                    if (di.transitTip) fieldsPresent.push('Transit');
                    if (di.luggageStorageTip) fieldsPresent.push('Luggage');
                    if (di.customsTips) fieldsPresent.push('Customs');
                    if (fieldsPresent.length === 0) return null;
                    const isCollapsed = collapsedSections.headingHome ?? true;
                    return (
                      <div className="bg-white border border-rose-100 rounded-2xl overflow-hidden">
                        <button
                          onClick={() => toggleSidebarSection('headingHome')}
                          className="w-full px-4 py-3 bg-gradient-to-r from-rose-50 to-rose-100 border-b border-rose-100 flex items-center gap-2 hover:from-rose-100 hover:to-rose-200 transition-colors"
                        >
                          <span className="text-base flex-shrink-0">✈️</span>
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-widest text-rose-900">Heading Home</p>
                            {isCollapsed && (
                              <p className="text-[11px] text-rose-700/70 mt-0.5 truncate">
                                {fieldsPresent.join(' · ')} · tap to expand
                              </p>
                            )}
                          </div>
                          <ChevronDown className={`w-4 h-4 text-rose-700 flex-shrink-0 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`} />
                        </button>
                        {!isCollapsed && (
                          <dl className="divide-y divide-zinc-100">
                            {di.airport && (
                              <div className="px-4 py-3">
                                <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-0.5">Airport</dt>
                                <dd className="text-sm text-zinc-800 leading-snug">{di.airport}</dd>
                              </div>
                            )}
                            {di.recommendedArrival && (
                              <div className="px-4 py-3">
                                <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-0.5">When to Arrive</dt>
                                <dd className="text-sm text-zinc-800 leading-snug">{di.recommendedArrival}</dd>
                              </div>
                            )}
                            {di.lastDayTimingTip && (
                              <div className="px-4 py-3">
                                <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-0.5">Plan Your Day</dt>
                                <dd className="text-sm text-zinc-800 leading-snug">{di.lastDayTimingTip}</dd>
                              </div>
                            )}
                            {di.transitTip && (
                              <div className="px-4 py-3">
                                <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-0.5">Getting There</dt>
                                <dd className="text-sm text-zinc-800 leading-snug">{di.transitTip}</dd>
                              </div>
                            )}
                            {di.luggageStorageTip && (
                              <div className="px-4 py-3">
                                <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-0.5">Luggage Storage</dt>
                                <dd className="text-sm text-zinc-800 leading-snug">{di.luggageStorageTip}</dd>
                              </div>
                            )}
                            {di.customsTips && (
                              <div className="px-4 py-3">
                                <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-0.5">Customs & Duty-Free</dt>
                                <dd className="text-sm text-zinc-800 leading-snug">{di.customsTips}</dd>
                              </div>
                            )}
                          </dl>
                        )}
                      </div>
                    );
                  })()}

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
                      <div className="w-16 flex-shrink-0 pt-3.5">
                        <p className="text-xs font-semibold text-sky-600 tabular-nums">{effectiveMeetupTime}</p>
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
                          {/* Time column — matches the activity card layout
                              above (w-16, left-aligned, tabular-nums). */}
                          <div className="w-16 flex-shrink-0 pt-4">
                            <p className="text-xs font-semibold text-zinc-400 tabular-nums">
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
                    const startTime = (activity.timeSlot ?? '').split(/–|—/)[0]?.trim() || '';
                    const price = priceLevelLabel(activity.priceLevel);
                    const actName = activity.name || activity.title || '';
                    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(actName + (activity.address ? ' ' + activity.address : ' ' + trip.destination))}`;
                    // Post-gen verification lookup. If the AI's named venue
                    // matches a flagged entry, we'll show a small "verify
                    // open" badge. Entries with status 'unknown' don't show
                    // anything — we only nudge when we're confident the
                    // venue is closed.
                    const verifyKey = actName ? normalizeVenueKey(actName) : '';
                    const verifyEntry = verifyKey ? aiMeta?.venueVerification?.entries?.[verifyKey] : undefined;
                    const verifyClosed = verifyEntry?.status === 'closed_permanently' || verifyEntry?.status === 'closed_temporarily';

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
                          {canEditItinerary && (
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
                          )}
                        </div>
                      );
                    }

                    return (
                      <React.Fragment key={activity.id}>
                      <div className="flex gap-4">
                        {/* Time Column — left-aligned in a w-16 column so
                            times like "9:00 AM" and "12:00 PM" share a
                            consistent left edge rather than the variable
                            offset that text-right produced. Narrower
                            column also nets ~16px back to the card. */}
                        <div className="w-16 flex-shrink-0 pt-4">
                          <p className="text-xs font-semibold text-zinc-400 tabular-nums">{startTime}</p>
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
                          <div className={`bg-white rounded-xl border shadow-sm p-3.5 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group/card ${activity.isPrivate ? 'border-amber-200 bg-amber-50/40' : 'border-zinc-100'}`}>
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
                                {/* Post-gen verification flag — shown when the
                                     named venue matched Google Places but the
                                     business is currently closed (permanently
                                     or temporarily). Title attribute reveals
                                     the matched name in case the user wants
                                     to investigate. */}
                                {verifyClosed && (
                                  <span
                                    title={`Google Places reports this venue as ${verifyEntry?.status === 'closed_permanently' ? 'permanently closed' : 'temporarily closed'}${verifyEntry?.matchedName ? ` (matched "${verifyEntry.matchedName}")` : ''}. Verify current status before relying on it.`}
                                    className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap flex items-center gap-1"
                                  >
                                    ⚠ Verify open
                                  </span>
                                )}
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
                                {/* Edit + Delete — gated to organizer / co-organizer on 3+ trips */}
                                {canEditItinerary && (
                                  <>
                                    <button
                                      onClick={() => handleEditActivity(activity)}
                                      title="Edit activity"
                                      className="opacity-0 group-hover/card:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteActivity(activity.id)}
                                      title="Remove activity"
                                      className="opacity-0 group-hover/card:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-rose-50 text-zinc-400 hover:text-rose-500"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
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
                                    <span key={`${tip}-${i}`} className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
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
                                  {/* Majority-Nay nudge banner — replace is an AI action,
                                       so gate to organizer / co-organizer only. Plain
                                       members still see the activity got Nayed via the
                                       vote tallies; they just can't trigger the swap. */}
                                  {isMajorityNay && canTriggerAi && (
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
                                    {/* Suggest another — AI-spending action. Gated to
                                        organizer / co-organizer only (stricter than
                                        canEditItinerary, which allows small-group members).
                                        Hidden when the majority-Nay banner is showing. */}
                                    {!isMajorityNay && canTriggerAi && (
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
                      <div key={`${h.name}-${i}`} className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-100 rounded-2xl">
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


            {/* ── Day Highlights — unified discovery sidebar ──
                Single section per day combining the four discovery
                categories (food / photo / nightlife / shopping) into one
                mixed list, color-coded by category. Replaces the four
                previous separate dropdowns. Activity-shaping priorities
                like nature, culture, beach, history etc. don't appear
                here — those are woven into the daily activities themselves
                by the prompt's priority guidance blocks.
                Backward compat: each source falls back to aiMeta for old
                trips that stored the data trip-wide. */}
            {(() => {
              type Highlight = {
                category: HighlightCategory;
                name: string;
                neighborhood?: string;
                description?: string;
                tip?: string;
                badges?: string[];
                addToDayHandler?: () => void;
              };
              const userPriorities = aiMeta?.preferences?.priorities ?? [];
              const items: Highlight[] = [];

              // Photos — required by the prompt regardless of priority,
              // so include whenever the day has them.
              for (const spot of currentDayData.photoSpots ?? []) {
                items.push({
                  category: 'photo',
                  name: spot.name,
                  tip: spot.tip,
                  badges: spot.timeOfDay ? [spot.timeOfDay] : undefined,
                });
              }

              // Food — gated on food priority. Filter out tips already
              // promoted to the itinerary this session so the sidebar
              // doesn't show duplicates of activities the user added.
              if (userPriorities.includes('food')) {
                const rawFoodieTips = (currentDayData?.foodieTips && currentDayData.foodieTips.length > 0)
                  ? currentDayData.foodieTips
                  : (selectedDay === 1 && aiMeta?.foodieTips && aiMeta.foodieTips.length > 0 ? aiMeta.foodieTips : []);
                const dayFoodieTips = rawFoodieTips.filter(t => !addedFoodieTipNames.has(t.name));
                for (const tip of dayFoodieTips) {
                  const badges: string[] = [];
                  if (tip.priceRange) badges.push(tip.priceRange);
                  if (tip.timeOfDay && tip.timeOfDay !== 'any') badges.push(tip.timeOfDay);
                  items.push({
                    category: 'food',
                    name: tip.name,
                    neighborhood: tip.neighborhood,
                    description: tip.why || tip.orderThis,
                    tip: tip.tip,
                    badges: badges.length > 0 ? badges : undefined,
                    addToDayHandler: () => handleAddFoodieToItinerary(tip),
                  });
                }
              }

              // Nightlife — gated on nightlife priority.
              if (userPriorities.includes('nightlife')) {
                const nightlife = (currentDayData?.nightlifeHighlights && currentDayData.nightlifeHighlights.length > 0)
                  ? currentDayData.nightlifeHighlights
                  : (aiMeta?.nightlifeHighlights ?? []);
                for (const spot of nightlife) {
                  items.push({
                    category: 'nightlife',
                    name: spot.name,
                    neighborhood: spot.neighborhood,
                    description: spot.vibe,
                    tip: spot.tip,
                    badges: spot.openFrom ? [spot.openFrom] : undefined,
                  });
                }
              }

              // Shopping — gated on shopping priority.
              if (userPriorities.includes('shopping')) {
                const shopping = (currentDayData?.shoppingGuide && currentDayData.shoppingGuide.length > 0)
                  ? currentDayData.shoppingGuide
                  : (aiMeta?.shoppingGuide ?? []);
                for (const spot of shopping) {
                  items.push({
                    category: 'shopping',
                    name: spot.name,
                    neighborhood: spot.neighborhood,
                    description: spot.what,
                    tip: spot.tip,
                    badges: spot.openDays ? [spot.openDays] : undefined,
                  });
                }
              }

              const isCollapsed = collapsedSections.dayHighlights ?? false;

              // Empty state — day has activities but no highlights yet.
              // Offer the AI enrichment CTA so users on manual trips (and
              // AI builds where highlights got dropped) can fill in
              // photo/food/nightlife/etc. picks on demand. Hidden when:
              //   - no activities exist yet (AI has nothing to anchor to)
              //   - user can't edit (3+ trip viewer)
              //   - day is for a mock/demo trip
              //
              // Restaurant backfill: if the day has activities but ZERO
              // restaurants (typical of parsed uploads where the source
              // plan didn't include meals), the button also offers to
              // fill in breakfast/lunch/dinner suggestions anchored to
              // the day's neighborhoods. Same 1-credit cost — Haiku
              // absorbs the slightly larger output.
              if (items.length === 0) {
                const allActs = [
                  ...(currentDayData.tracks?.shared ?? []),
                  ...(currentDayData.tracks?.track_a ?? []),
                  ...(currentDayData.tracks?.track_b ?? []),
                ];
                const dayHasActivities = allActs.length > 0;
                // Enrich-day spends AI credits, so it's gated by canTriggerAi
                // (org/co-org only) rather than the broader canEditItinerary.
                if (!dayHasActivities || !canTriggerAi || isMockTrip) return null;
                const dayHasRestaurants = allActs.some(a => (a as { isRestaurant?: boolean }).isRestaurant === true);
                const isEnriching = enrichingDay === currentDayData.day;
                return (
                  <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-5">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base flex-shrink-0">✨</span>
                        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Day Highlights</p>
                      </div>
                      <p className="text-[11px] text-zinc-400 mb-4">
                        {dayHasRestaurants
                          ? 'Use AI to surface photo spots, food picks, and local tips anchored to this day’s neighborhoods.'
                          : 'No meals on this day yet — use AI to add breakfast/lunch/dinner suggestions plus photo + local highlights, anchored to your planned stops.'}
                      </p>
                      <button
                        onClick={() => handleEnrichDay(currentDayData.day, !dayHasRestaurants)}
                        disabled={isEnriching}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-300 text-white text-xs font-semibold rounded-xl transition-colors"
                      >
                        {isEnriching ? (
                          <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {dayHasRestaurants ? 'Generating highlights…' : 'Adding restaurants & highlights…'}</>
                        ) : dayHasRestaurants ? (
                          <><Sparkles className="w-3.5 h-3.5" /> Generate highlights (1 credit)</>
                        ) : (
                          <><Sparkles className="w-3.5 h-3.5" /> Add restaurants & highlights (1 credit)</>
                        )}
                      </button>
                      {enrichError && enrichingDay === null && (
                        <p className="text-[11px] text-rose-600 mt-2">{enrichError}</p>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  <button
                    onClick={() => toggleSidebarSection('dayHighlights')}
                    className="w-full flex items-center gap-2 px-5 py-4 hover:bg-zinc-50 transition-colors"
                  >
                    <span className="text-base flex-shrink-0">✨</span>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Day Highlights</p>
                      {isCollapsed && (
                        <p className="text-[11px] text-zinc-300 mt-0.5">
                          {items.length} pick{items.length !== 1 ? 's' : ''} · tap to expand
                        </p>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`} />
                  </button>
                  {!isCollapsed && (
                    <div className="px-5 pb-5">
                      <p className="text-[11px] text-zinc-400 mb-4 -mt-1">Discoveries beyond the planned activities</p>
                      <div className="space-y-3">
                        {items.map((item, idx) => {
                          const meta = HIGHLIGHT_CATEGORY_META[item.category];
                          const CatIcon = meta.icon;
                          const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.name} ${item.neighborhood ?? ''} ${aiMeta?.destination ?? ''}`.trim())}`;
                          // Verify-open lookup for sidebar items. Hit on
                          // food/nightlife/shopping/photo categories which are
                          // all extracted by extractNamedVenues. Photo-spot
                          // closures are rare (viewpoints don't close) but
                          // food/nightlife/shopping have real risk.
                          const iKey = item.name ? normalizeVenueKey(item.name) : '';
                          const iVerify = iKey ? aiMeta?.venueVerification?.entries?.[iKey] : undefined;
                          const iClosed = iVerify?.status === 'closed_permanently' || iVerify?.status === 'closed_temporarily';
                          return (
                            <div key={`${item.name}-${idx}`} className={`p-3 ${meta.bg} rounded-xl border ${meta.border} min-w-0 overflow-hidden`}>
                              {/* Name row + badges row are deliberately stacked
                                  (not flex-row sharing). Earlier layout used
                                  flex-wrap + flex-1 on name vs. flex-shrink-0
                                  on badges; AI-generated badges like "4pm Until
                                  Midnight Most Nights" with whitespace-nowrap
                                  squeezed the name container down to ~60px,
                                  and [overflow-wrap:anywhere] on long names
                                  ("Kelvingrove", "Glasgow Green & People's
                                  Palace Glasshouse") then broke them mid-character
                                  into one-letter-per-line columns. Stacking
                                  guarantees the name always has full row width. */}
                              <div className="flex items-start gap-1.5 mb-1 min-w-0">
                                <CatIcon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${meta.textMuted}`} aria-label={meta.label} />
                                <p className={`text-sm font-semibold ${meta.text} leading-snug break-words min-w-0 flex-1 [overflow-wrap:anywhere]`}>{item.name}</p>
                                {iClosed && (
                                  <span
                                    title={`Google Places reports this venue as ${iVerify?.status === 'closed_permanently' ? 'permanently closed' : 'temporarily closed'}${iVerify?.matchedName ? ` (matched "${iVerify.matchedName}")` : ''}. Verify before going.`}
                                    className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 whitespace-nowrap"
                                  >
                                    ⚠
                                  </span>
                                )}
                                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" title="View on Google Maps"
                                  className={`flex-shrink-0 ${meta.textMuted} hover:opacity-70 transition-opacity mt-0.5`} onClick={e => e.stopPropagation()}>
                                  <MapPin className="w-3 h-3" />
                                </a>
                              </div>
                              {item.badges && item.badges.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1 mb-1.5">
                                  {item.badges.map((b, i) => (
                                    <span key={`${b}-${i}`} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize ${meta.pill} max-w-full break-words`}>
                                      {b}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {item.neighborhood && <p className={`text-[11px] ${meta.textMuted} mb-1 break-words [overflow-wrap:anywhere]`}>{item.neighborhood}</p>}
                              {item.description && <p className={`text-xs ${meta.text} leading-relaxed mb-1 break-words [overflow-wrap:anywhere]`}>{item.description}</p>}
                              {item.tip && (
                                <div className={`flex items-start gap-1.5 mt-2 pt-2 border-t ${meta.border}`}>
                                  <span className="text-xs flex-shrink-0">💡</span>
                                  <p className={`text-[11px] ${meta.tipText} leading-relaxed italic break-words min-w-0 flex-1 [overflow-wrap:anywhere]`}>{item.tip}</p>
                                </div>
                              )}
                              {item.addToDayHandler && (
                                <button
                                  onClick={item.addToDayHandler}
                                  className={`mt-2.5 w-full flex items-center justify-center gap-1.5 py-1.5 ${meta.pill} text-[11px] font-semibold rounded-lg transition-opacity hover:opacity-90`}
                                >
                                  <Plus className="w-3 h-3" />
                                  Add to Day
                                </button>
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
                    <div key={`${h.name}-${i}`} className="p-3 bg-sky-50 rounded-xl border border-sky-100">
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
                            // Verify-open badge for hotels: same lookup as
                            // activity cards. Hotels are AI-suggested (not
                            // from Places list), so the post-gen verify
                            // pass is the only thing protecting against
                            // recommending a closed/rebranded property.
                            const hKey = h.name ? normalizeVenueKey(h.name) : '';
                            const hVerify = hKey ? aiMeta?.venueVerification?.entries?.[hKey] : undefined;
                            const hClosed = hVerify?.status === 'closed_permanently' || hVerify?.status === 'closed_temporarily';
                            return (
                              <div key={`${h.name}-${i}`} className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-amber-900 leading-snug">{h.name}</p>
                                    <a href={hotelMapsUrl} target="_blank" rel="noopener noreferrer" title="View on Google Maps"
                                      className="flex-shrink-0 text-amber-400 hover:text-amber-600 transition-colors">
                                      <MapPin className="w-3 h-3" />
                                    </a>
                                    {hClosed && (
                                      <span
                                        title={`Google Places reports this hotel as ${hVerify?.status === 'closed_permanently' ? 'permanently closed' : 'temporarily closed'}${hVerify?.matchedName ? ` (matched "${hVerify.matchedName}")` : ''}. Verify before booking.`}
                                        className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 whitespace-nowrap"
                                      >
                                        ⚠ Verify
                                      </span>
                                    )}
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
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={editingActivity ? 'Edit activity' : 'Add activity'} onClick={handleCloseModal}>
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
              <button onClick={handleCloseModal} aria-label="Close" className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors">
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">

              {/* Place Search — accepts either a place name (autocomplete)
                  OR a pasted Google Maps URL (resolved + looked up via
                  Places Text Search, then routed through the same
                  handleSelectPlace flow). One input, smarter behavior. */}
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
                      const val = e.target.value;
                      if (isGoogleMapsUrl(val)) {
                        // URL detected — suppress autocomplete and run
                        // the paste-link flow. Keep the URL visible in
                        // the input until handleSelectPlace overwrites
                        // it with the resolved place name on success.
                        setNewActivityName(val);
                        setQuery('');
                        setShowSuggestions(false);
                        if (selectedPlace) setSelectedPlace(null);
                        // Skip if we already resolved this exact URL —
                        // avoids hammering /api/places/search if the
                        // user types the URL out instead of pasting it
                        // in one event.
                        if (val !== lastResolvedUrlRef.current) {
                          lastResolvedUrlRef.current = val;
                          handlePastedGoogleUrl(val);
                        }
                      } else {
                        setNewActivityName(val);
                        setQuery(val);
                        setShowSuggestions(true);
                        if (selectedPlace) setSelectedPlace(null);
                        if (urlError) setUrlError(null);
                      }
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="Eiffel Tower, or paste a Google Maps link"
                    className="w-full pl-9 pr-10 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent"
                  />
                  {(searchLoading || loadingDetails || urlResolving) && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 animate-spin" />
                  )}
                </div>
                {/* Inline error for failed URL resolution. Doesn't block
                    the rest of the form — the user can still type a name
                    or paste a different URL. */}
                {urlError && (
                  <p className="mt-1.5 text-xs text-rose-600">{urlError}</p>
                )}

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

      {/* Upgrade Modal — pass tripId + group size so the modal can offer
          the Trip Pass purchase CTA in addition to the generic /pricing link.
          Per design memo: Trip Pass is bought in context of a specific trip,
          never as a generic standalone purchase. */}
      {upgradePromptKey && (
        <UpgradeModal
          prompt={getUpgradePrompt(upgradePromptKey)}
          onClose={() => setUpgradePromptKey(null)}
          tripId={tripPageId ?? undefined}
          tripGroupSize={tripRow?.group_size ?? undefined}
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
              <button onClick={() => { setShowAddHotelModal(false); setBookingError(null); setEditingHotelIndex(null); }} aria-label="Close" className="p-1.5 rounded-full hover:bg-zinc-100">
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
                    setBookingError("Couldn't save. Please try again.");
                  } finally {
                    setSavingBooking(false);
                  }
                }}
                className="w-full py-2.5 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-200 disabled:text-zinc-400 text-white font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
              >
                {savingBooking ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : editingHotelIndex !== null ? 'Update Hotel' : 'Save Hotel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Add Day Modal ─── */}
      {showAddDayModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => { if (!addDayGenerating) { setShowAddDayModal(false); setAddDayError(null); } }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <PlusSquare className="w-5 h-5 text-sky-600" /> Add a Day
              </h2>
              <button
                onClick={() => { if (!addDayGenerating) { setShowAddDayModal(false); setAddDayError(null); } }}
                className="p-1.5 rounded-full hover:bg-zinc-100"
              >
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Placement picker */}
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-2">Where to insert</label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" name="addDayPos" value="end" checked={addDayPosition === 'end'}
                      onChange={() => setAddDayPosition('end')}
                      className="accent-sky-600" />
                    <span className="text-sm text-zinc-700">At the end (Day {(activeDays as {day:number}[]).length + 1})</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" name="addDayPos" value="before" checked={addDayPosition === 'before'}
                      onChange={() => setAddDayPosition('before')}
                      className="accent-sky-600" />
                    <span className="text-sm text-zinc-700 flex items-center gap-2">
                      Before Day
                      <select
                        value={addDayRelativeTo}
                        onChange={e => { setAddDayPosition('before'); setAddDayRelativeTo(Number(e.target.value)); }}
                        className="border border-zinc-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-sky-400"
                      >
                        {(activeDays as {day:number}[]).map(d => (
                          <option key={d.day} value={d.day}>{d.day}</option>
                        ))}
                      </select>
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" name="addDayPos" value="after" checked={addDayPosition === 'after'}
                      onChange={() => setAddDayPosition('after')}
                      className="accent-sky-600" />
                    <span className="text-sm text-zinc-700 flex items-center gap-2">
                      After Day
                      <select
                        value={addDayRelativeTo}
                        onChange={e => { setAddDayPosition('after'); setAddDayRelativeTo(Number(e.target.value)); }}
                        className="border border-zinc-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-sky-400"
                      >
                        {(activeDays as {day:number}[]).map(d => (
                          <option key={d.day} value={d.day}>{d.day}</option>
                        ))}
                      </select>
                    </span>
                  </label>
                </div>
              </div>

              {/* AI vs Manual toggle. AI mode is restricted to organizer /
                   co-organizer; plain members can only insert a blank day
                   (they can still add activities manually afterwards). */}
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-2">Content</label>
                <div className="flex rounded-xl overflow-hidden border border-zinc-200">
                  <button
                    onClick={() => { if (canTriggerAi) setAddDayMode('ai'); }}
                    disabled={!canTriggerAi}
                    title={canTriggerAi ? '' : 'Only the organizer or co-organizer can trigger AI builds.'}
                    className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                      addDayMode === 'ai' ? 'bg-sky-700 text-white' : 'bg-white text-zinc-600 hover:bg-zinc-50'
                    } ${!canTriggerAi ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Wand2 className="w-4 h-4" /> AI-generated
                  </button>
                  <button
                    onClick={() => setAddDayMode('manual')}
                    className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                      addDayMode === 'manual' ? 'bg-sky-700 text-white' : 'bg-white text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    <CalendarPlus className="w-4 h-4" /> Blank day
                  </button>
                </div>
                <p className="text-xs text-zinc-400 mt-2">
                  {addDayMode === 'ai'
                    ? 'Claude will generate a full day of activities, a theme, and photo spots for this destination.'
                    : canTriggerAi
                      ? 'Insert an empty day — add activities manually afterwards.'
                      : 'Insert an empty day. Only the organizer or co-organizer can trigger AI-generated days.'}
                </p>
              </div>

              {addDayError && (
                <p className="text-xs text-rose-600 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{addDayError}
                </p>
              )}

              <button
                disabled={addDayGenerating}
                onClick={handleAddDay}
                className="w-full py-2.5 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-200 disabled:text-zinc-400 text-white font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
              >
                {addDayGenerating
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating day…</>
                  : addDayMode === 'ai'
                    ? <><Wand2 className="w-4 h-4" /> Generate Day</>
                    : <><CalendarPlus className="w-4 h-4" /> Insert Blank Day</>
                }
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
                    // Reconcile against the server's canonical row — covers any
                    // future normalization (default fields, validation triggers)
                    // that would otherwise drift the UI vs the persisted state.
                    const data = await res.json().catch(() => null);
                    const serverFlight = data?.trip?.booked_flight ?? newFlight;
                    setTripRow(prev => prev ? { ...prev, booked_flight: serverFlight } : prev);
                    setShowAddFlightModal(false);
                    setFlightFormAirline(''); setFlightFormNumber(''); setFlightFormDep(''); setFlightFormArr(''); setFlightFormDepTime(''); setFlightFormArrTime(''); setFlightFormRetDepTime(''); setFlightFormRetArrTime('');
                    setBookingSaved('Flight saved ✓');
                    setTimeout(() => setBookingSaved(null), 2500);
                  } catch {
                    setBookingError("Couldn't save. Please try again.");
                  } finally {
                    setSavingBooking(false);
                  }
                }}
                className="w-full py-2.5 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-200 disabled:text-zinc-400 text-white font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
              >
                {savingBooking ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save Flight'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trip Story Modal — pass the actual itinerary days so data-driven
          slides (Top Picks, Numbers, Day Highlights) reflect the trip
          being recapped instead of falling back to demo mock data. */}
      {showStoryModal && (
        <TripStoryModal
          mode="trip"
          trip={trip}
          onClose={() => setShowStoryModal(false)}
          itineraryDays={activeDays as import('@/lib/types').ItineraryDay[]}
        />
      )}

      {/* ─── Edit Trip Modal ─── */}
      {showEditTripModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Edit trip details"
          onClick={() => setShowEditTripModal(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => {
              // Enter submits the form (matches the Save Changes button).
              // Skips when inside a textarea so multi-line inputs still work,
              // and respects the disabled state by not firing on empty dest.
              if (e.key === 'Enter' && !e.shiftKey && !(e.target instanceof HTMLTextAreaElement)) {
                if (editDest.trim() && !savingTripEdit) {
                  e.preventDefault();
                  handleSaveTripEdit();
                }
              }
            }}
          >
            <div className="px-6 pt-6 pb-4 border-b border-zinc-100 flex items-center justify-between">
              <div>
                <h2 className="font-script italic text-lg font-semibold text-zinc-900">Edit Trip Details</h2>
                <p className="text-xs text-zinc-400 mt-0.5">Update the name, destination, or travel dates</p>
              </div>
              <button
                onClick={() => setShowEditTripModal(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <X className="w-4 h-4 text-zinc-500" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Trip Name — editable so forked trips (which inherit a long
                  auto-generated name) can be renamed. Blank falls back to a
                  "{city} Adventure" default on save. */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wide mb-2">
                  Trip Name
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  placeholder="e.g., Our Rome Getaway"
                  className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-700 focus:border-transparent"
                />
              </div>

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

              {/* Start Date — also auto-shifts the End Date by the trip's
                  current length so the user doesn't have to retype it.
                  QA 5/11: "auto set the new end date by the previously entered
                  trip length and the newly edited start date." */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wide mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={editStartDate}
                  onChange={e => {
                    const newStart = e.target.value;
                    setEditStartDate(newStart);
                    // Auto-shift the end date to preserve trip length.
                    // Length source priority:
                    //   1. Current edit-form delta (if user already changed end)
                    //   2. Original aiMeta start→end span
                    //   3. tripRow.trip_length (builder-selected)
                    if (newStart) {
                      const lengthDays = (() => {
                        if (editStartDate && editEndDate) {
                          const a = new Date(editStartDate + 'T12:00:00');
                          const b = new Date(editEndDate + 'T12:00:00');
                          const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
                          if (diff > 0) return diff;
                        }
                        if (aiMeta?.startDate && aiMeta?.endDate) {
                          const a = new Date(aiMeta.startDate + 'T12:00:00');
                          const b = new Date(aiMeta.endDate + 'T12:00:00');
                          const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
                          if (diff > 0) return diff;
                        }
                        const tl = (tripRow?.trip_length as number | undefined) ?? 0;
                        return tl > 0 ? tl - 1 : 0;
                      })();
                      if (lengthDays > 0) {
                        const d = new Date(newStart + 'T12:00:00');
                        d.setDate(d.getDate() + lengthDays);
                        setEditEndDate(d.toISOString().slice(0, 10));
                      }
                    }
                  }}
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

              {/* Hint: dates will shift. Fires either when an existing
                  start is being changed, or when the trip had no start
                  yet but the user is now setting one (rebasing the
                  copied source dates from a fork-without-dates flow). */}
              {editStartDate && (() => {
                const anchor = aiMeta?.startDate ?? (activeDays as ItineraryDay[])[0]?.date;
                return anchor && anchor !== editStartDate;
              })() && (
                <p className="flex items-center gap-1.5 text-xs text-sky-600 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  Day dates will shift to match the new start date.
                </p>
              )}

              {editTripError && (
                <p className="flex items-center gap-1.5 text-xs text-rose-600 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  {editTripError}
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
                        const channel = inviteMethod === 'email' ? 'Email' : 'SMS';
                        setInviteError(`${channel} isn't set up yet — invite link copied to clipboard!`);
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
          tripId={tripPageId}
          onAdd={handleTransportAdded}
          onClose={() => setShowParseModal(false)}
        />
      )}

      {/* Share Trip Modal */}
      {showShareModal && tripPageId && (
        <ShareTripModal
          tripId={tripPageId}
          tripName={tripRow?.title || aiMeta?.destination || trip.destination || 'My trip'}
          destination={tripRow?.destination || aiMeta?.destination}
          onClose={() => setShowShareModal(false)}
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
