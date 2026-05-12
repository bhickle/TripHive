'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { TripCard } from '@/components/TripCard';
import { Avatar } from '@/components/Avatar';
import { UploadItineraryModal } from '@/components/UploadItineraryModal';
import { TripStoryModal } from '@/components/TripStoryModal';
import { UpgradeModal } from '@/components/UpgradeModal';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { trips } from '@/data/mock';
import {
  PlusCircle,
  TrendingUp,
  Globe,
  Calendar,
  Star,
  Upload,
  Plane,
  MapPin,
  Camera,
  ChevronRight,
  Bell,
  UserPlus,
  X,
  MessageSquare,
  Users,
  Sparkles,
  Copy,
} from 'lucide-react';

interface Notification {
  id: string;
  type: 'activity' | 'chat' | 'expense' | 'vote' | 'member' | 'ai' | 'prep' | 'trip_invite';
  title: string;
  message: string;
  trip: string;
  trip_id?: string;
  time: string;
  read: boolean;
  icon: string;
}


export default function DashboardPage() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [userTrips, setUserTrips] = useState<any[]>([]);
  const [tripsLoadError, setTripsLoadError] = useState(false);
  // Start in loading state so we never flash the "no trips" empty state before the fetch resolves
  const [tripsLoading, setTripsLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [wishlistPreview, setWishlistPreview] = useState<any[]>([]);

  /** Derive trip status from dates so the counter stays accurate without
   *  relying on the stored DB column (which may lag behind reality). */
  function computeStatus(startDate?: string, endDate?: string): 'planning' | 'active' | 'completed' {
    if (!startDate) return 'planning';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    if (today < start) return 'planning';
    if (!endDate) return 'active';
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    return today <= end ? 'active' : 'completed';
  }

  const loadTrips = () => {
    if (!currentUser.id || currentUser.isDemo) return;
    setTripsLoading(true);
    setTripsLoadError(false);
    // 15s timeout so a stalled fetch can't leave the dashboard sitting
    // on a loading skeleton forever (reported as a refresh-freeze on
    // mobile). On timeout the catch flips tripsLoadError so the user
    // gets a Retry banner instead of an indefinite spinner.
    const timeoutCtrl = new AbortController();
    const timeoutId = setTimeout(() => timeoutCtrl.abort(), 15000);
    fetch('/api/trips', { signal: timeoutCtrl.signal })
      .then(async r => {
        // 401 means the browser still has a stale session but the server
        // rejected it (e.g. token expired between auth resolve and this fetch).
        // Bounce to login so the user can re-auth instead of staring at a
        // blank dashboard.
        if (r.status === 401) {
          router.replace('/auth/login');
          throw new Error('unauthorized');
        }
        if (!r.ok) throw new Error('Failed to load trips');
        return r.json();
      })
      .then(({ trips }) => {
        if (Array.isArray(trips)) {
          // Inbound row shape from /api/auth/me trips list — Supabase
          // column names (snake_case). Mapped to the camelCased UI Trip
          // shape consumed by setUserTrips below.
          type TripRow = {
            id: string;
            title: string;
            destination: string;
            start_date: string | null;
            end_date: string | null;
            trip_length?: number;
            group_type?: string;
            group_size?: number;
            cover_image?: string | null;
            cover_image_meta?: { photographer?: string | null; photographerUrl?: string | null; photoUrl?: string | null; downloadLocation?: string | null } | null;
            budget_total?: number;
            cities?: string[];
            visited_cities?: string[];
          };
          const rows: TripRow[] = trips;
          setUserTrips(rows.map(t => ({
            id: t.id,
            title: t.title,
            destination: t.destination,
            startDate: t.start_date,
            endDate: t.end_date,
            tripLength: t.trip_length,
            // Compute status from dates — don't trust the stored column which
            // can lag and cause completed trips to be missed in totalDays.
            status: computeStatus(t.start_date ?? undefined, t.end_date ?? undefined),
            groupType: t.group_type,
            groupSize: Math.max(1, t.group_size ?? 1),
            coverImage: t.cover_image ?? null,
            coverImageMeta: t.cover_image_meta ?? null,
            budgetTotal: t.budget_total ?? 0,
            // Use group_size from the trip builder as the traveler count
            memberCount: Math.max(1, t.group_size ?? 1),
            guestCount: 0,
            cities: t.cities ?? [],
            visitedCities: t.visited_cities ?? [],
          })));
        }
      })
      .catch(err => { if (err?.message !== 'unauthorized') setTripsLoadError(true); })
      .finally(() => {
        clearTimeout(timeoutId);
        setTripsLoading(false);
      });
  };

  // Redirect to login if auth resolves with no user
  useEffect(() => {
    if (!currentUser.isLoading && !currentUser.id && !currentUser.isDemo) {
      router.replace('/auth/login');
    }
  }, [currentUser.isLoading, currentUser.id, currentUser.isDemo, router]);

  // For real (non-demo) logged-in users, load trips from Supabase.
  // Fall back to localStorage for demo / unauthenticated visitors.
  useEffect(() => {
    if (currentUser.isLoading) return;

    if (!currentUser.isDemo && currentUser.id) {
      loadTrips();
    } else {
      // Demo or unauthenticated — show empty userTrips; mock trips come from baseTripData
      setTripsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.isLoading, currentUser.isDemo, currentUser.id]);
  // Load real wishlist for "Where to Next?" section (non-demo users)
  useEffect(() => {
    if (currentUser.isLoading || currentUser.isDemo) return;
    fetch('/api/wishlist')
      .then(r => r.ok ? r.json() : { items: [] })
      .then(({ items }) => { if (Array.isArray(items) && items.length > 0) setWishlistPreview(items.slice(0, 3)); })
      .catch(() => {});
  }, [currentUser.isLoading, currentUser.isDemo]);

  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // Load notifications from DB for authenticated users
  useEffect(() => {
    if (currentUser.isLoading || currentUser.isDemo) return;
    // Real user — fetch from DB
    fetch('/api/notifications')
      .then(r => r.ok ? r.json() : { notifications: [] })
      .then(({ notifications: rows }) => {
        if (!Array.isArray(rows)) return;
        const mapped: Notification[] = rows.map((n: {
          id: string; type: string; trip_id?: string; trip_name?: string;
          inviter_name?: string; message?: string; read: boolean; created_at: string;
        }) => ({
          id: n.id,
          type: (n.type as Notification['type']) || 'trip_invite',
          title: n.type === 'trip_invite'
            ? `${n.inviter_name || 'Someone'} invited you to a trip`
            : 'Notification',
          message: n.message || (n.trip_name ? `You've been invited to join ${n.trip_name}.` : 'You have a new notification.'),
          trip: n.trip_name || '',
          trip_id: n.trip_id,
          time: new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          read: n.read,
          icon: n.type === 'trip_invite' ? '✈️' : '🔔',
        }));
        setNotifications(mapped);
      })
      .catch(() => {});
  }, [currentUser.isLoading, currentUser.isDemo]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteTripId, setInviteTripId] = useState<string | null>(null);

  // Bind Escape on the two dashboard dialogs so keyboard-only users
  // can dismiss without a mouse.
  useEscapeKey(() => setShowNotifications(false), showNotifications);
  useEscapeKey(() => { setShowInviteModal(false); setInviteSent(false); setInviteError(null); setInviteContact(''); }, showInviteModal);
  const [inviteMethod, setInviteMethod] = useState<'email' | 'text' | 'link'>('email');
  const [inviteContact, setInviteContact] = useState('');
  const [inviteSent, setInviteSent] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showYearlyReview, setShowYearlyReview] = useState(false);
  const [showYearInReviewUpgrade, setShowYearInReviewUpgrade] = useState(false);
  const { hasYearInReview, getUpgradePrompt } = useEntitlements();

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    if (!currentUser.isDemo) {
      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      }).catch(() => {});
    }
  };

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    if (!currentUser.isDemo) {
      fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      }).catch(() => {});
    }
  };

  const notifTypeColors: Record<string, string> = {
    activity: 'bg-blue-100 text-blue-700',
    chat: 'bg-violet-100 text-violet-700',
    expense: 'bg-emerald-100 text-emerald-700',
    vote: 'bg-sky-100 text-sky-900',
    member: 'bg-sky-100 text-sky-700',
    ai: 'bg-pink-100 text-pink-700',
    prep: 'bg-rose-100 text-rose-700',
    trip_invite: 'bg-amber-100 text-amber-700',
  };
  const notifTypeLabel: Record<string, string> = {
    trip_invite: 'invite',
    NEW_MESSAGE: 'new message',
    new_message: 'new message',
    new_vote: 'new vote',
    member_joined: 'new member',
    badge_earned: 'badge earned',
    chat: 'chat',
    vote: 'vote',
    activity: 'activity',
    expense: 'expense',
    prep: 'prep',
    member: 'member',
    ai: 'AI',
  };

  // Map each notification to a deep link so the row is clickable straight to
  // the message / vote / trip page it refers to. Home Base QA: "Wish the
  // notifications were clickable and would take you to where the messages or
  // whatever are." Falls back to the trip's itinerary when the type isn't
  // recognised; returns null when there's no trip_id at all (in which case
  // we leave the row click → markRead-only behaviour intact).
  const notifTarget = (notif: { type?: string; trip_id?: string | null }): string | null => {
    const t = (notif.type ?? '').toLowerCase();
    // badge_earned has no trip_id — always routes to /world
    if (t === 'badge_earned') return '/world';
    if (!notif.trip_id) return null;
    const tripId = notif.trip_id;
    if (t === 'new_message' || t === 'chat' || t === 'message') return `/trip/${tripId}/group?tab=chat`;
    if (t === 'vote' || t === 'vote_result') return `/trip/${tripId}/group?tab=yayNay`;
    if (t === 'expense') return `/trip/${tripId}/group?tab=expenses`;
    if (t === 'member' || t === 'crew') return `/trip/${tripId}/group?tab=crew`;
    if (t === 'prep') return `/trip/${tripId}/prep`;
    if (t === 'trip_invite' || t === 'ai' || t === 'activity' || t === 'trip_update' || t === '') return `/trip/${tripId}/itinerary`;
    return `/trip/${tripId}/itinerary`;
  };

  // Destination photo library - curated high-quality images per destination
  const destinationPhotos: Record<string, string[]> = {
    'iceland': [
      'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=1600&h=600&fit=crop',
      'https://images.unsplash.com/photo-1509225770129-c9654483efb5?w=1600&h=600&fit=crop',
      'https://images.unsplash.com/photo-1476610182048-b716b8515aaa?w=1600&h=600&fit=crop',
      'https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=1600&h=600&fit=crop',
      'https://images.unsplash.com/photo-1520769669658-f07657f5a307?w=1600&h=600&fit=crop',
      'https://images.unsplash.com/photo-1504893524553-b855bce32c67?w=1600&h=600&fit=crop',
    ],
    'tokyo': [
      'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1600&h=600&fit=crop',
      'https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?w=1600&h=600&fit=crop',
      'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=1600&h=600&fit=crop',
      'https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=1600&h=600&fit=crop',
      'https://images.unsplash.com/photo-1480796927426-f609979314bd?w=1600&h=600&fit=crop',
    ],
    'barcelona': [
      'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=1600&h=600&fit=crop',
      'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=1600&h=600&fit=crop',
      'https://images.unsplash.com/photo-1523531294919-4bcd7c65e216?w=1600&h=600&fit=crop',
      'https://images.unsplash.com/photo-1562883676-8c7feb83f09b?w=1600&h=600&fit=crop',
    ],
    'default': [
      'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1600&h=600&fit=crop',
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&h=600&fit=crop',
      'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1600&h=600&fit=crop',
    ],
  };

  // Demo account sees mock data; real users see only their own trips
  const baseTripData = currentUser.isDemo ? trips : [];

  const mockActiveSoon = baseTripData.filter(
    (t) => t.status === 'planning' || t.status === 'active'
  );
  // Merge user-uploaded trips (from localStorage) with base trips, then sort
  // chronologically. Active/upcoming sort soonest-first so the next trip lands
  // at the top of the grid; completed sort most-recent-first so The Archives
  // reads like a reverse-chronological scrapbook. Trips missing a startDate
  // (still being planned) drop to the end of either list.
  const parseTripTime = (d?: string) => {
    if (!d) return null;
    const t = new Date(d).getTime();
    return isNaN(t) ? null : t;
  };
  const activeSoon = [
    ...userTrips.filter((t) => t.status === 'planning' || t.status === 'active'),
    ...mockActiveSoon,
  ].sort((a, b) => {
    const aTime = parseTripTime(a.startDate);
    const bTime = parseTripTime(b.startDate);
    if (aTime === null && bTime === null) return 0;
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return aTime - bTime;
  });
  const allTrips = [...userTrips, ...baseTripData];
  const completedTrips = allTrips
    .filter((t) => t.status === 'completed')
    .sort((a, b) => {
      const aTime = parseTripTime(a.startDate);
      const bTime = parseTripTime(b.startDate);
      if (aTime === null && bTime === null) return 0;
      if (aTime === null) return 1;
      if (bTime === null) return -1;
      return bTime - aTime;
    });

  const totalTrips = allTrips.length;
  // "Places Visited" reflects every distinct city the user has been to on
  // completed trips. Source preference (truth → fallback):
  //   1. visitedCities — user-tagged "where we actually went," highest signal.
  //      Wins over the AI plan because trips can deviate from the itinerary.
  //   2. cities — AI-planned per-day city tags, captures multi-city legs and
  //      side-trips (Versailles day from a Paris trip, Florence leg of a
  //      Rome trip) that the parent destination string can't express.
  //   3. destination.split(',')[0] — last-resort fallback for trips without
  //      an itinerary or user-tagged data ("Pittsburgh, PA, USA" → "Pittsburgh").
  //      Single-segment freeform entries ("Pacific Northwest") count as themselves.
  //
  // No home-country exclusion — places celebrate where you've been, including
  // domestic trips. The home_country profile field is preserved for other uses.
  const placesVisited = new Set<string>();
  for (const t of allTrips) {
    if (t.status !== 'completed') continue;
    const userTagged: string[] = Array.isArray(t.visitedCities) ? t.visitedCities : [];
    const aiPlanned: string[] = Array.isArray(t.cities) ? t.cities : [];
    const source = userTagged.length > 0 ? userTagged : aiPlanned;
    if (source.length > 0) {
      for (const c of source) {
        const trimmed = (c ?? '').trim();
        if (trimmed) placesVisited.add(trimmed);
      }
    } else {
      const fallback = ((t.destination as string) ?? '').split(',')[0]?.trim();
      if (fallback) placesVisited.add(fallback);
    }
  }
  const placesVisitedCount = placesVisited.size;
  // Only count days from trips you've actually completed — not planning/future trips.
  // Prefer the builder-selected trip length over date-diff: for flexible-date trips
  // the stored dates span the availability window, not the actual trip duration.
  const totalDays = allTrips
    .filter(t => t.status === 'completed')
    .reduce((sum, trip) => {
      // Use the canonical trip length first (set in Step 3 of the builder)
      if (trip.tripLength && trip.tripLength > 0) return sum + trip.tripLength;
      // Fall back to date-diff for older trips that pre-date the tripLength field
      if (!trip.startDate || !trip.endDate) return sum;
      const start = new Date(trip.startDate);
      const end = new Date(trip.endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return sum;
      return sum + Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    }, 0);

  const today = new Date();
  const dateString = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Find next upcoming trip (soonest future start date)
  const now = new Date();
  const upcomingTrips = allTrips
    .filter(t => new Date(t.startDate) > now && (t.status === 'planning' || t.status === 'active'))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  const nextTrip = upcomingTrips[0] || activeSoon[0];

  // Pick a photo based on destination
  const getDestinationKey = (destination: string): string => {
    const lower = destination.toLowerCase();
    for (const key of Object.keys(destinationPhotos)) {
      if (key !== 'default' && lower.includes(key)) return key;
    }
    return 'default';
  };

  const destKey = nextTrip ? getDestinationKey(nextTrip.destination) : 'default';
  const photos = destinationPhotos[destKey] || destinationPhotos['default'];

  // Use a seeded random based on the current date so it changes daily but stays consistent within a session
  const dailySeed = new Date().toDateString();
  const hashCode = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash);
  };
  const heroPhoto = photos[hashCode(dailySeed) % photos.length];

  const calculateDaysUntil = (startDate: string) => {
    const start = new Date(startDate);
    const today = new Date();
    const days = Math.ceil((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  return (
    <div className="flex h-screen bg-parchment">
      <Sidebar
        activePage="dashboard"
        user={{
          name: currentUser.name,
          avatarUrl: currentUser.avatarUrl,
          subscriptionTier: currentUser.subscriptionTier,
        }}
      />

      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Welcome Header */}
          <div className="mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">
              {dateString}
            </p>
            <div className="flex items-center justify-between">
              <h1 className="text-5xl font-script italic font-semibold text-zinc-900">
                {currentUser.isLoading ? (
                  <span className="inline-block h-10 w-48 rounded-lg bg-zinc-100 animate-pulse align-middle" />
                ) : (
                  <>Hey, {currentUser.name} 👋</>
                )}
              </h1>
              <div className="flex items-center gap-3">
                {/* Add Someone Button — disabled until the user has at
                    least one trip. Without a trip, the invite modal would
                    open with inviteTripId=null and the SMS/email/copy-link
                    flows would have nothing to attach to. */}
                <button
                  onClick={() => { setInviteTripId(userTrips[0]?.id ?? null); setShowInviteModal(true); }}
                  disabled={userTrips.length === 0}
                  title={userTrips.length === 0 ? 'Create a trip first to invite travelers' : undefined}
                  className="inline-flex items-center gap-2 bg-sky-800 hover:bg-sky-900 text-white rounded-full px-4 py-2 text-sm font-semibold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-sky-800"
                >
                  <UserPlus className="w-4 h-4" />
                  Add Someone
                </button>
                {/* Notification Bell */}
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2.5 rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-all"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Notification Panel */}
          {showNotifications && (
            <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Notifications" onClick={() => setShowNotifications(false)}>
              <div
                className="absolute top-20 right-2 md:right-8 w-[calc(100vw-16px)] md:w-[420px] max-h-[560px] bg-white rounded-2xl shadow-2xl border border-zinc-100 overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Panel Header */}
                <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-script italic text-lg font-semibold text-zinc-900">Notifications</h3>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllRead}
                        className="text-xs text-sky-700 hover:text-sky-900 font-medium"
                      >
                        Mark all read
                      </button>
                    )}
                    <button
                      onClick={() => setShowNotifications(false)}
                      aria-label="Close notifications"
                      className="p-1 hover:bg-zinc-100 rounded-full transition-colors"
                    >
                      <X className="w-4 h-4 text-zinc-500" />
                    </button>
                  </div>
                </div>

                {/* Notification List */}
                <div className="flex-1 overflow-y-auto divide-y divide-zinc-100">
                  {notifications.length === 0 && (
                    <div className="px-5 py-10 text-center">
                      <p className="text-sm text-zinc-400">No notifications yet</p>
                    </div>
                  )}
                  {notifications.map((notif) => {
                    const target = notifTarget(notif);
                    const handleClick = () => {
                      markRead(notif.id);
                      setShowNotifications(false);
                    };
                    const body = (
                      <div className="flex items-start gap-3">
                        <span className="text-xl flex-shrink-0 mt-0.5">{notif.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${notifTypeColors[notif.type] ?? 'bg-zinc-100 text-zinc-600'}`}>
                              {notifTypeLabel[notif.type] ?? notif.type}
                            </span>
                            {!notif.read && (
                              <span className="w-2 h-2 bg-sky-800 rounded-full flex-shrink-0" />
                            )}
                          </div>
                          <p className={`text-sm ${!notif.read ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-700'}`}>
                            {notif.title}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{notif.message}</p>
                          <p className="text-[11px] text-zinc-400 mt-1">{notif.trip}{notif.trip ? ' · ' : ''}{notif.time}</p>
                        </div>
                      </div>
                    );
                    const baseClass = `w-full text-left px-5 py-4 hover:bg-parchment-dark transition-colors cursor-pointer block ${!notif.read ? 'bg-sky-50/30' : ''}`;
                    // Notifications with a target deep-link to the relevant
                    // page (chat tab, vote, expense, itinerary…). Notifications
                    // without a trip_id stay click-to-mark-read only.
                    return target ? (
                      <Link key={notif.id} href={target} onClick={handleClick} className={baseClass}>
                        {body}
                      </Link>
                    ) : (
                      <div
                        key={notif.id}
                        onClick={() => markRead(notif.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); markRead(notif.id); } }}
                        className={baseClass}
                      >
                        {body}
                      </div>
                    );
                  })}
                </div>

                {/* Panel Footer */}
                <div className="px-5 py-3 border-t border-zinc-100">
                  <Link
                    href="/notifications"
                    onClick={() => setShowNotifications(false)}
                    className="block w-full text-center text-sm font-medium text-sky-700 hover:text-sky-900 transition-colors"
                  >
                    View All Notifications
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Hero Banner - Next Trip */}
          {nextTrip && (
            <div className="mb-12 relative rounded-3xl overflow-hidden shadow-sm group">
              <div
                className="h-48 md:h-72 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                style={{ backgroundImage: `url(${heroPhoto})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/80 via-zinc-900/30 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sky-300 text-xs font-semibold uppercase tracking-widest mb-1 md:mb-2">
                      {nextTrip.destination.split(',')[0]?.trim().toUpperCase()}
                    </p>
                    <h2 className="text-2xl md:text-4xl font-script italic font-semibold text-white mb-1 md:mb-3 truncate">
                      {nextTrip.title}
                    </h2>
                    <p className="text-white/80 text-xs md:text-sm flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                      {new Date(nextTrip.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(nextTrip.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 md:gap-3 flex-shrink-0">
                    <div className="px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-full text-zinc-900 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap">
                      {calculateDaysUntil(nextTrip.startDate)} days away
                    </div>
                    <Link
                      href={`/trip/${nextTrip.id}/itinerary`}
                      className="flex items-center gap-2 px-4 py-2 md:px-5 md:py-2.5 bg-sky-800 hover:bg-sky-900 text-white font-semibold text-xs md:text-sm rounded-full transition-all shadow-sm whitespace-nowrap"
                    >
                      See The Plan
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CTA Buttons — above stats bar */}
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <Link
              href="/trip/new"
              className="inline-flex items-center gap-2 bg-sky-800 hover:bg-sky-900 text-white font-semibold px-5 py-2.5 rounded-full shadow-sm transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              Let's Go →
            </Link>
            <button
              onClick={() => setShowUploadModal(true)}
              className="inline-flex items-center gap-2 bg-white border border-zinc-200 hover:border-sky-300 hover:text-sky-800 text-zinc-800 font-semibold px-5 py-2.5 rounded-full shadow-sm transition-all"
            >
              <Upload className="w-4 h-4" />
              Already Planned?
            </button>
            <Link
              href="/layover"
              className="inline-flex items-center gap-2 bg-white border border-zinc-200 hover:border-zinc-300 text-zinc-800 font-semibold px-5 py-2.5 rounded-full shadow-sm transition-all"
            >
              <Plane className="w-4 h-4" />
              Layover Planner
            </Link>
          </div>

          {/* Stats Bar — all three cards now clickable per Home Base QA.
              Adventures → My Trips; Places → My Trips filtered to completed
              (since each completed trip is a place visited); Days → same
              completed-filter view plus a playful "≈ N hours" subtitle so the
              number reads as something tangible rather than abstract. */}
          <div className="grid grid-cols-3 gap-3 md:gap-6 mb-12">
            <Link
              href="/trips"
              title="See all your trips"
              className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 md:p-6 flex-1 text-center hover:shadow-xl hover:-translate-y-1 hover:border-sky-200 transition-all duration-300 block"
            >
              <div className="flex justify-center mb-2 md:mb-3">
                <TrendingUp className="w-6 h-6 md:w-8 md:h-8 text-sky-700" />
              </div>
              <p className="text-2xl md:text-4xl font-script italic font-semibold text-zinc-900">
                {totalTrips}
              </p>
              <p className="text-xs md:text-sm text-zinc-500 mt-1 leading-tight">Adventures Planned</p>
            </Link>

            <Link
              href="/trips?status=completed"
              title={placesVisited.size > 0
                ? `Places: ${Array.from(placesVisited).slice(0, 8).join(', ')}${placesVisited.size > 8 ? `, +${placesVisited.size - 8} more` : ''}`
                : 'No completed trips yet — once a trip ends, the places you visited show up here.'}
              className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 md:p-6 flex-1 text-center hover:shadow-xl hover:-translate-y-1 hover:border-sky-200 transition-all duration-300 block"
            >
              <div className="flex justify-center mb-2 md:mb-3">
                <Globe className="w-6 h-6 md:w-8 md:h-8 text-sky-700" />
              </div>
              <p className="text-2xl md:text-4xl font-script italic font-semibold text-zinc-900">
                {placesVisitedCount}
              </p>
              <p className="text-xs md:text-sm text-zinc-500 mt-1 leading-tight">Places Visited</p>
            </Link>

            <Link
              href="/world"
              title={totalDays > 0 ? `≈ ${(totalDays * 24).toLocaleString()} hours of memories — see your travel map` : 'Open your travel map.'}
              className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 md:p-6 flex-1 text-center hover:shadow-xl hover:-translate-y-1 hover:border-sky-200 transition-all duration-300 block"
            >
              <div className="flex justify-center mb-2 md:mb-3">
                <Calendar className="w-6 h-6 md:w-8 md:h-8 text-sky-700" />
              </div>
              <p className="text-2xl md:text-4xl font-script italic font-semibold text-zinc-900">
                {totalDays}
              </p>
              <p className="text-xs md:text-sm text-zinc-500 mt-1 leading-tight">Days Out There</p>
              {totalDays > 0 && (
                <p className="text-[10px] text-zinc-400 mt-1 leading-tight">
                  ≈ {(totalDays * 24).toLocaleString()} hours
                </p>
              )}
            </Link>
          </div>

          {/* Trips load error banner */}
          {tripsLoadError && (
            <div className="mb-6 flex items-center justify-between gap-4 px-5 py-4 bg-rose-50 border border-rose-200 rounded-2xl">
              <p className="text-sm text-rose-800 font-medium">Couldn't load your trips — check your connection and try again.</p>
              <button
                onClick={loadTrips}
                disabled={tripsLoading}
                className="flex-shrink-0 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {tripsLoading ? 'Retrying…' : 'Retry'}
              </button>
            </div>
          )}

          {/* Active Trips Section */}
          <section className="mb-12">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-1">
                What's Happening
              </p>
              <h2 className="text-2xl font-script italic font-semibold text-zinc-900">
                In Progress
              </h2>
            </div>

            {tripsLoading ? (
              /* Skeleton cards while Supabase fetch is in flight */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2].map(i => (
                  <div key={i} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6 animate-pulse">
                    <div className="h-4 bg-zinc-100 rounded w-2/3 mb-3" />
                    <div className="h-3 bg-zinc-100 rounded w-1/2 mb-6" />
                    <div className="h-3 bg-zinc-100 rounded w-full mb-2" />
                    <div className="h-3 bg-zinc-100 rounded w-3/4" />
                  </div>
                ))}
              </div>
            ) : activeSoon.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeSoon.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    onCardClick={setSelectedTrip}
                    onDelete={(id) => setUserTrips(prev => prev.filter(t => t.id !== id))}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-12 text-center">
                <p className="text-3xl mb-3">🌍</p>
                <p className="text-zinc-600 mb-1 font-semibold">Tumbleweeds...</p>
                <p className="text-zinc-400 text-sm mb-5">No trips in progress. That needs to change.</p>
                <Link
                  href="/trip/new"
                  className="inline-flex items-center gap-2 bg-sky-800 hover:bg-sky-900 text-white font-semibold px-5 py-2.5 rounded-full shadow-sm"
                >
                  Let's Go →
                </Link>
              </div>
            )}
          </section>

          {/* Year in Review Banner — disabled until the cross-trip
              aggregation pipeline ships. The TripStoryModal yearly mode
              currently shows only a "Coming soon" placeholder, so
              clicking the banner in December would have led to a dead
              end. The original December gate (`getMonth() === 11`) +
              the pipeline-build flag (`false &&`) keeps the JSX in the
              tree for easy revival but suppresses rendering. */}
          {false && new Date().getMonth() === 11 && (
            <div
              className="mb-12 relative overflow-hidden rounded-2xl cursor-pointer group shadow-sm"
              onClick={() => hasYearInReview ? setShowYearlyReview(true) : setShowYearInReviewUpgrade(true)}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-sky-900 via-sky-800 to-green-800" />
              <div className="absolute inset-0 opacity-10"
                style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }}
              />
              <div className="relative px-4 md:px-8 py-5 md:py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4 md:gap-5">
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center flex-shrink-0 group-hover:bg-white/20 transition-colors">
                    <span className="text-xl md:text-2xl">✦</span>
                  </div>
                  <div>
                    <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">
                      Your {new Date().getFullYear()} Wrapped
                    </p>
                    <h3 className="font-script italic text-lg md:text-2xl font-semibold text-white">
                      Year in Review
                    </h3>
                    <p className="text-white/70 text-xs md:text-sm mt-0.5">
                      {allTrips.length} trips · {totalDays} days · your travel personality revealed
                    </p>
                  </div>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 md:px-5 md:py-2.5 bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white font-semibold text-sm rounded-full transition-all border border-white/20 group-hover:border-white/40 flex-shrink-0 self-start sm:self-auto">
                  <Sparkles className="w-4 h-4" />
                  {hasYearInReview ? 'See Your Year' : 'Explorer+'}
                </button>
                {!hasYearInReview && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 bg-amber-400/90 text-amber-900 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide">
                    <span>🔒</span> Explorer+
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Where to Next — from On My Radar */}
          <section className="mb-12">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-sky-700" />
                <h2 className="text-2xl font-script italic font-semibold text-zinc-900">
                  Where to next?
                </h2>
              </div>
              <Link href="/wishlist" className="text-sm text-sky-700 hover:text-sky-900 font-semibold transition-colors">
                View all On My Radar →
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {wishlistPreview.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group"
                >
                  {/* Image */}
                  <div
                    className="h-48 bg-cover bg-center relative"
                    style={{ backgroundImage: `url(${item.coverImage})` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/60 via-zinc-900/10 to-transparent" />
                    <p className="absolute bottom-0 left-0 right-0 p-4 font-script italic text-xl text-white/90 leading-tight drop-shadow-sm">
                      {item.destination}, {item.country}
                    </p>
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                      {(item.tags as string[]).slice(0, 3).map((tag: string) => (
                        <span key={tag} className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2.5 py-1 rounded-full">{tag}</span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-xs text-zinc-400 mb-4">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> {item.bestSeason}
                      </span>
                      <span className="font-script italic text-base text-zinc-900 font-semibold">
                        ~${item.estimatedCost.toLocaleString()}
                        <span className="text-xs text-zinc-400 font-normal ml-1">est.</span>
                      </span>
                    </div>
                    <Link
                      href={`/trip/new?destination=${encodeURIComponent(`${item.destination}, ${item.country}`)}`}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold rounded-full transition-all"
                    >
                      <Plane className="w-3.5 h-3.5" />
                      Plan This Trip
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Past Trips Section */}
          {completedTrips.length > 0 && (
            <section>
              <h2 className="text-2xl font-script italic font-semibold text-zinc-400 mb-6 opacity-75">
                The Archives
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {completedTrips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    onCardClick={setSelectedTrip}
                    onDelete={(id) => setUserTrips(prev => prev.filter(t => t.id !== id))}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Invite someone" onClick={() => { setShowInviteModal(false); setInviteSent(false); setInviteError(null); setInviteContact(''); }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-script italic text-2xl font-semibold text-zinc-900 mb-6">Add Someone</h3>

            {userTrips.length === 0 ? (
              <p className="text-sm text-zinc-400 mb-4 text-center py-4">Create a trip first, then invite your crew.</p>
            ) : (
              <>
                {/* Trip selector */}
                {userTrips.length > 1 && (
                  <select
                    value={inviteTripId ?? ''}
                    onChange={e => { setInviteTripId(e.target.value); setInviteSent(false); setInviteError(null); }}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl text-sm text-zinc-700 mb-4 focus:outline-none focus:ring-2 focus:ring-sky-700"
                  >
                    {userTrips.map(t => (
                      <option key={t.id} value={t.id}>{t.title} — {t.destination}</option>
                    ))}
                  </select>
                )}

                {/* Method toggle */}
                <div className="flex gap-2 mb-4">
                  {(['email', 'text', 'link'] as const).map(method => (
                    <button
                      key={method}
                      onClick={() => { setInviteMethod(method); setInviteSent(false); setInviteError(null); }}
                      className={`flex-1 py-2 rounded-lg font-medium text-sm transition-colors ${
                        inviteMethod === method ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                      }`}
                    >
                      {method === 'email' ? 'Email' : method === 'text' ? 'Text' : 'Copy Link'}
                    </button>
                  ))}
                </div>

                {inviteMethod === 'link' ? (
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-zinc-700 mb-2">Invite Link</label>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={inviteTripId ? `${typeof window !== 'undefined' ? window.location.origin : 'https://www.tripcoord.ai'}/join/${inviteTripId}` : ''}
                        className="flex-1 px-3 py-2.5 border border-zinc-200 rounded-lg text-sm text-zinc-600 bg-zinc-50 focus:outline-none"
                      />
                      <button
                        onClick={async () => {
                          if (!inviteTripId) return;
                          const url = `${window.location.origin}/join/${inviteTripId}`;
                          await navigator.clipboard.writeText(url);
                          setInviteCopied(true);
                          setTimeout(() => setInviteCopied(false), 2000);
                        }}
                        className="px-4 py-2.5 bg-sky-800 hover:bg-sky-900 text-white rounded-lg font-medium text-sm transition-colors whitespace-nowrap"
                      >
                        {inviteCopied ? '✓ Copied!' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-xs text-zinc-500 mt-2">Anyone with this link can join the trip.</p>
                  </div>
                ) : (
                  <div className="mb-4">
                    <label className="block text-sm font-semibold text-zinc-700 mb-2">
                      {inviteMethod === 'email' ? 'Email Address' : 'Phone Number'}
                    </label>
                    <input
                      type={inviteMethod === 'email' ? 'email' : 'tel'}
                      placeholder={inviteMethod === 'email' ? 'friend@example.com' : '+1 (555) 123-4567'}
                      value={inviteContact}
                      onChange={(e) => setInviteContact(e.target.value)}
                      className="w-full px-4 py-3 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                    />
                  </div>
                )}

                {inviteMethod !== 'link' && (
                  <div className="mb-4 p-3 bg-parchment rounded-lg border border-zinc-200">
                    <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-1">Preview</p>
                    <p className="text-sm text-zinc-700">
                      {inviteMethod === 'email'
                        ? `Hey! You're invited to join our trip on TripCoord. Click the link to join the group and start planning together!`
                        : `You're invited to join a trip on TripCoord! Join here: ${typeof window !== 'undefined' ? window.location.origin : 'https://www.tripcoord.ai'}/join/${inviteTripId ?? ''}`}
                    </p>
                  </div>
                )}

                {inviteSent && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center mb-4">
                    <p className="text-sm font-semibold text-emerald-700">
                      {inviteMethod === 'email' ? '✓ Invite sent! They\'ll see it in their email or TripCoord dashboard.' : `✓ Invite sent via ${inviteMethod}!`}
                    </p>
                  </div>
                )}

                {inviteError && (
                  <div className={`p-3 rounded-lg text-center mb-4 border ${inviteError.includes('copied') ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
                    <p className={`text-sm font-semibold ${inviteError.includes('copied') ? 'text-amber-700' : 'text-rose-700'}`}>
                      {inviteError}
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setShowInviteModal(false); setInviteSent(false); setInviteError(null); setInviteContact(''); }}
                className="flex-1 px-4 py-2.5 border border-zinc-200 text-zinc-700 rounded-lg font-medium text-sm hover:bg-zinc-50"
              >
                {inviteMethod === 'link' ? 'Done' : 'Cancel'}
              </button>
              {inviteMethod !== 'link' && userTrips.length > 0 && (
                <button
                  onClick={async () => {
                    if (!inviteContact.trim() || !inviteTripId) return;
                    setIsSendingInvite(true);
                    setInviteError(null);
                    try {
                      const selectedTrip = userTrips.find(t => t.id === inviteTripId);
                      const endpoint = inviteMethod === 'email' ? '/api/invite/email' : '/api/invite/sms';
                      const payload = inviteMethod === 'email'
                        ? { email: inviteContact, tripId: inviteTripId, tripName: selectedTrip?.title, inviterName: currentUser.name }
                        : { phone: inviteContact, tripId: inviteTripId, tripName: selectedTrip?.title, inviterName: currentUser.name };
                      const res = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                      });
                      if (!res.ok) throw new Error('Failed to send invite');
                      const data = await res.json();
                      if (data.noService) {
                        const url = `${window.location.origin}/join/${inviteTripId}`;
                        await navigator.clipboard.writeText(url).catch(() => {});
                        setInviteMethod('link');
                        setInviteError('Email isn\'t set up yet — invite link copied! Paste it to your guest.');
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
                  disabled={isSendingInvite}
                  className="flex-1 px-4 py-2.5 bg-sky-800 hover:bg-sky-900 disabled:bg-sky-600 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  {isSendingInvite ? 'Sending...' : 'Send Invite'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upload Itinerary Modal */}
      {showUploadModal && (
        <UploadItineraryModal onClose={() => setShowUploadModal(false)} />
      )}

      {/* Year in Review / Yearly Story Modal */}
      {showYearlyReview && (
        <TripStoryModal
          mode="yearly"
          onClose={() => setShowYearlyReview(false)}
        />
      )}

      {/* Year in Review upgrade prompt */}
      {showYearInReviewUpgrade && (
        <UpgradeModal
          prompt={getUpgradePrompt('feature_locked')}
          onClose={() => setShowYearInReviewUpgrade(false)}
        />
      )}
    </div>
  );
}
