'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { TripCard } from '@/components/TripCard';
import { Avatar } from '@/components/Avatar';
import { UploadItineraryModal } from '@/components/UploadItineraryModal';
import { TripStoryModal } from '@/components/TripStoryModal';
import { UpgradeModal } from '@/components/UpgradeModal';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { trips, wishlistItems } from '@/data/mock';
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
  Route,
  DollarSign,
  Vote,
  AlertCircle,
  CheckCircle2,
  Users,
  Sparkles,
  Copy,
} from 'lucide-react';

interface Notification {
  id: string;
  type: 'activity' | 'chat' | 'expense' | 'vote' | 'member' | 'ai' | 'prep';
  title: string;
  message: string;
  trip: string;
  time: string;
  read: boolean;
  icon: string;
}

const mockNotifications: Notification[] = [
  { id: 'n1', type: 'activity', title: 'Itinerary Updated', message: 'Sarah Chen added "Hot Spring Visit" to Day 3 of Iceland Adventure.', trip: 'Iceland Adventure', time: '12 min ago', read: false, icon: '🗺️' },
  { id: 'n2', type: 'chat', title: 'New Message', message: 'Marcus Johnson: "Should we book the Northern Lights tour now? Spots are filling up."', trip: 'Iceland Adventure', time: '34 min ago', read: false, icon: '💬' },
  { id: 'n3', type: 'expense', title: 'Expense Added', message: 'Emily Park added "Whale Watching Tickets — $340" and split it equally.', trip: 'Iceland Adventure', time: '1 hr ago', read: false, icon: '💰' },
  { id: 'n4', type: 'vote', title: 'Vote Closing Soon', message: '"Restaurant for Day 4 dinner?" closes tomorrow. 5 of 6 members have voted.', trip: 'Iceland Adventure', time: '2 hrs ago', read: false, icon: '🗳️' },
  { id: 'n5', type: 'member', title: 'New Member Joined', message: 'Jordan accepted the invite and joined Iceland Adventure.', trip: 'Iceland Adventure', time: '3 hrs ago', read: true, icon: '👋' },
  { id: 'n6', type: 'ai', title: 'Price Drop Alert', message: 'Blue Lagoon premium tickets dropped 15% ($85 → $72). Book before Sep 1!', trip: 'Iceland Adventure', time: '5 hrs ago', read: true, icon: '📉' },
  { id: 'n7', type: 'prep', title: 'Deadline Approaching', message: 'Travel insurance purchase is due in 5 days for Iceland Adventure.', trip: 'Iceland Adventure', time: '6 hrs ago', read: true, icon: '⏰' },
  { id: 'n8', type: 'activity', title: 'Activity Uploaded', message: 'Alex Rivera uploaded a PDF itinerary for review in Iceland Adventure.', trip: 'Iceland Adventure', time: '1 day ago', read: true, icon: '📄' },
  { id: 'n9', type: 'ai', title: 'Weather Advisory', message: 'Rain expected Sep 17 in South Iceland. Consider packing extra waterproof layers.', trip: 'Iceland Adventure', time: '1 day ago', read: true, icon: '🌧️' },
  { id: 'n10', type: 'vote', title: 'Vote Result', message: '"Skip Blue Lagoon for Sky Lagoon?" — Blue Lagoon wins with 4 votes.', trip: 'Iceland Adventure', time: '2 days ago', read: true, icon: '✅' },
];

export default function DashboardPage() {
  const currentUser = useCurrentUser();
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [userTrips, setUserTrips] = useState<any[]>([]);

  // For real (non-demo) logged-in users, load trips from Supabase.
  // Fall back to localStorage for demo / unauthenticated visitors.
  useEffect(() => {
    if (currentUser.isLoading) return;

    if (!currentUser.isDemo && currentUser.id) {
      // Authenticated real user — fetch from Supabase
      fetch('/api/trips')
        .then(r => r.ok ? r.json() : { trips: [] })
        .then(({ trips }) => {
          if (Array.isArray(trips) && trips.length > 0) {
            // Normalize Supabase column names to the shape the rest of the dashboard expects
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const normalized = trips.map((t: any) => ({
              id: t.id,
              title: t.title,
              destination: t.destination,
              startDate: t.start_date,
              endDate: t.end_date,
              tripLength: t.trip_length,
              status: t.status ?? 'planning',
              groupType: t.group_type,
              groupSize: t.group_size ?? 1,
              coverImage: t.cover_image ?? null,
              budgetTotal: t.budget_total ?? 0,
              memberCount: 1,
              guestCount: 0,
            }));
            setUserTrips(normalized);
          }
        })
        .catch(() => { /* silently fall back to empty list */ });
    } else {
      // Demo or unauthenticated — fall back to localStorage
      try {
        const stored = localStorage.getItem('tripcoord_user_trips');
        if (stored) setUserTrips(JSON.parse(stored));
      } catch { /* ignore */ }
    }
  }, [currentUser.isLoading, currentUser.isDemo, currentUser.id]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  // Load notifications only for demo account; real users start with an empty inbox
  useEffect(() => {
    if (!currentUser.isLoading) {
      setNotifications(currentUser.isDemo ? mockNotifications : []);
    }
  }, [currentUser.isLoading, currentUser.isDemo]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showYearlyReview, setShowYearlyReview] = useState(false);
  const [showYearInReviewUpgrade, setShowYearInReviewUpgrade] = useState(false);
  const { hasYearInReview, getUpgradePrompt } = useEntitlements();

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const notifTypeColors: Record<string, string> = {
    activity: 'bg-blue-100 text-blue-700',
    chat: 'bg-violet-100 text-violet-700',
    expense: 'bg-emerald-100 text-emerald-700',
    vote: 'bg-sky-100 text-sky-900',
    member: 'bg-sky-100 text-sky-700',
    ai: 'bg-pink-100 text-pink-700',
    prep: 'bg-rose-100 text-rose-700',
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
  // Merge user-uploaded trips (from localStorage) with base trips — user trips first
  const activeSoon = [
    ...userTrips.filter((t) => t.status === 'planning' || t.status === 'active'),
    ...mockActiveSoon,
  ];
  const completedTrips = baseTripData.filter((t) => t.status === 'completed');

  const allTrips = [...userTrips, ...baseTripData];
  const totalTrips = allTrips.length;
  const countriesVisited = new Set(allTrips.map((t) => t.destination.split(',')[1]?.trim() || '')).size;
  const totalDays = allTrips.reduce((sum, trip) => {
    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);
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
                Hey, {currentUser.name} 👋
              </h1>
              <div className="flex items-center gap-3">
                {/* Invite Button */}
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="inline-flex items-center gap-2 bg-sky-800 hover:bg-sky-900 text-white rounded-full px-4 py-2 text-sm font-semibold transition-all shadow-sm"
                >
                  <UserPlus className="w-4 h-4" />
                  Invite
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
            <div className="fixed inset-0 z-50" onClick={() => setShowNotifications(false)}>
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
                      className="p-1 hover:bg-zinc-100 rounded-full transition-colors"
                    >
                      <X className="w-4 h-4 text-zinc-500" />
                    </button>
                  </div>
                </div>

                {/* Notification List */}
                <div className="flex-1 overflow-y-auto divide-y divide-zinc-100">
                  {notifications.map((notif) => (
                    <button
                      key={notif.id}
                      onClick={() => markRead(notif.id)}
                      className={`w-full text-left px-5 py-4 hover:bg-parchment-dark transition-colors ${
                        !notif.read ? 'bg-sky-50/30' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xl flex-shrink-0 mt-0.5">{notif.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${notifTypeColors[notif.type]}`}>
                              {notif.type}
                            </span>
                            {!notif.read && (
                              <span className="w-2 h-2 bg-sky-800 rounded-full flex-shrink-0" />
                            )}
                          </div>
                          <p className={`text-sm ${!notif.read ? 'font-semibold text-zinc-900' : 'font-medium text-zinc-700'}`}>
                            {notif.title}
                          </p>
                          <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{notif.message}</p>
                          <p className="text-[11px] text-zinc-400 mt-1">{notif.trip} · {notif.time}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Panel Footer */}
                <div className="px-5 py-3 border-t border-zinc-100">
                  <button className="w-full text-center text-sm font-medium text-sky-700 hover:text-sky-900 transition-colors">
                    View All Notifications
                  </button>
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

          {/* Stats Bar - Clean horizontal row */}
          <div className="grid grid-cols-3 gap-3 md:gap-6 mb-12">
            {/* Trips Card */}
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 md:p-6 flex-1 text-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="flex justify-center mb-2 md:mb-3">
                <TrendingUp className="w-6 h-6 md:w-8 md:h-8 text-sky-700" />
              </div>
              <p className="text-2xl md:text-4xl font-script italic font-semibold text-zinc-900">
                {totalTrips}
              </p>
              <p className="text-xs md:text-sm text-zinc-500 mt-1 leading-tight">Adventures Planned</p>
            </div>

            {/* Countries Card */}
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 md:p-6 flex-1 text-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="flex justify-center mb-2 md:mb-3">
                <Globe className="w-6 h-6 md:w-8 md:h-8 text-sky-700" />
              </div>
              <p className="text-2xl md:text-4xl font-script italic font-semibold text-zinc-900">
                {countriesVisited}
              </p>
              <p className="text-xs md:text-sm text-zinc-500 mt-1 leading-tight">Countries Visited</p>
            </div>

            {/* Days Card */}
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 md:p-6 flex-1 text-center hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="flex justify-center mb-2 md:mb-3">
                <Calendar className="w-6 h-6 md:w-8 md:h-8 text-sky-700" />
              </div>
              <p className="text-2xl md:text-4xl font-script italic font-semibold text-zinc-900">
                {totalDays}
              </p>
              <p className="text-xs md:text-sm text-zinc-500 mt-1 leading-tight">Days Out There</p>
            </div>
          </div>

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

            {activeSoon.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeSoon.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    onCardClick={setSelectedTrip}
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

          {/* Year in Review Banner — December only */}
          {new Date().getMonth() === 11 && (
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
                      {trips.length} trips · {trips.reduce((s, t) => s + Math.ceil((new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) / 86400000), 0)} days · your travel personality revealed
                    </p>
                  </div>
                </div>
                <button className="flex items-center gap-2 px-4 py-2 md:px-5 md:py-2.5 bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white font-semibold text-sm rounded-full transition-all border border-white/20 group-hover:border-white/40 flex-shrink-0 self-start sm:self-auto">
                  <Sparkles className="w-4 h-4" />
                  {hasYearInReview ? 'See Your Year' : 'Nomad Only'}
                </button>
                {!hasYearInReview && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 bg-amber-400/90 text-amber-900 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide">
                    <span>🔒</span> Nomad
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
                  Where To Next?
                </h2>
              </div>
              <Link href="/wishlist" className="text-sm text-sky-700 hover:text-sky-900 font-semibold transition-colors">
                View all On My Radar →
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {wishlistItems.slice(0, 3).map((item) => (
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
                      {item.tags.slice(0, 3).map(tag => (
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
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowInviteModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-script italic text-xl font-semibold text-zinc-900 mb-2">Get the Crew Together</h3>
            <p className="text-sm text-zinc-500 mb-5">Send this link and they're in. Easy.</p>
            <div className="flex gap-2 mb-4">
              <input type="text" readOnly value="https://tripcoord.app/join/trip_1" className="flex-1 px-4 py-2.5 bg-parchment border border-zinc-200 rounded-xl text-sm text-zinc-600 focus:outline-none" />
              <button onClick={() => { navigator.clipboard.writeText('https://tripcoord.app/join/trip_1'); setInviteCopied(true); setTimeout(() => setInviteCopied(false), 2000); }} className="px-4 py-2.5 bg-sky-800 hover:bg-sky-900 text-white font-semibold rounded-xl text-sm transition-all">
                {inviteCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button onClick={() => setShowInviteModal(false)} className="w-full py-2.5 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-600 hover:bg-parchment-dark transition-all">Close</button>
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
