'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { TripCard } from '@/components/TripCard';
import { TagCitiesBanner, shouldShowTagCitiesBanner, rememberTagCitiesBannerDismissed } from '@/components/TagCitiesBanner';
import { TagCitiesModal } from '@/components/TagCitiesModal';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { trips } from '@/data/mock';
import { destinationToCountry, countryToContinent } from '@/lib/world/countryLookup';
import { computeStatus } from '@/lib/tripDates';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  MapPin,
  Calendar,
  Users,
  X,
} from 'lucide-react';

type StatusFilter = 'all' | 'planning' | 'active' | 'completed';
type ShareFilter = 'all' | 'mine' | 'shared_with_me';
type ViewMode = 'grid' | 'list';

/** Compute trip status from dates rather than the stored column.
 *  Noon-pad so YYYY-MM-DD doesn't parse as UTC midnight (which is the
 *  previous day in any timezone west of UTC, causing 'active' to flip
 *  one day early). */
export default function TripsPage() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  // Honor ?status= query param so the dashboard stat cards can deep-link
  // straight into a filtered view (Places / Days Out There → completed trips).
  const searchParams = useSearchParams();
  const initialStatus = (() => {
    const v = searchParams?.get('status');
    if (v === 'planning' || v === 'active' || v === 'completed' || v === 'all') return v;
    return 'all' as StatusFilter;
  })();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatus);
  // ?continent= deep-link from /world's continent strip. Lives in URL state
  // so the back button restores it; cleared via the chip's × button.
  const initialContinent = searchParams?.get('continent') ?? null;
  const [continentFilter, setContinentFilter] = useState<string | null>(initialContinent);
  // Re-sync from URL when searchParams changes (e.g. user clicks Sidebar
  // "My Adventures" from a filtered /trips?continent=Asia view — the URL
  // strips the param but the state wouldn't update without this effect,
  // leaving the filter visually applied with no chip to clear it).
  useEffect(() => {
    setContinentFilter(searchParams?.get('continent') ?? null);
  }, [searchParams]);
  const [shareFilter, setShareFilter] = useState<ShareFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [userTrips, setUserTrips] = useState<any[]>([]);
  // Start in loading state so we never flash "No trips here yet" before fetch resolves
  const [tripsLoading, setTripsLoading] = useState(true);
  // Distinguish "no trips yet" from "fetch failed" — without this, a
  // network failure showed the same empty state as a brand-new user,
  // which is misleading.
  const [tripsLoadError, setTripsLoadError] = useState(false);

  // ── Tag-cities prompt state ────────────────────────────────────────────────
  // Banner lives above each completed trip with empty visited_cities.
  // Dismiss persists per-trip in localStorage (see TagCitiesBanner helpers).
  // `dismissedBanners` is the in-memory mirror so dismissing updates UI without
  // a re-render-from-storage round trip.
  const [taggingTripId, setTaggingTripId] = useState<string | null>(null);
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set());
  // Hydrate dismiss state for the trips we just loaded so the banner doesn't
  // flash on for trips the user already silenced.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const dismissed = new Set<string>();
    for (const t of userTrips) {
      if (!shouldShowTagCitiesBanner(t.id)) dismissed.add(t.id);
    }
    setDismissedBanners(dismissed);
  }, [userTrips]);

  // Redirect to login if auth resolves with no user
  useEffect(() => {
    if (!currentUser.isLoading && !currentUser.id && !currentUser.isDemo) {
      router.replace('/auth/login');
    }
  }, [currentUser.isLoading, currentUser.id, currentUser.isDemo, router]);

  useEffect(() => {
    if (currentUser.isLoading) return;
    if (!currentUser.isDemo && currentUser.id) {
      setTripsLoading(true);
      fetch('/api/trips')
        .then(r => r.ok ? r.json() : { trips: [] })
        .then(({ trips: supaTrips }) => {
          if (Array.isArray(supaTrips)) {
            // Inbound row shape from /api/trips. Mix of Supabase column
            // names (snake_case) for the trip row plus a few computed
            // fields the API joins in (role, organizerName, memberNames).
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
              role?: 'organizer' | 'co_organizer' | 'member';
              organizerName?: string | null;
              memberNames?: string;
              cities?: string[];
              visited_cities?: string[];
              hasTripPass?: boolean;
            };
            const rows: TripRow[] = supaTrips;
            setUserTrips(rows.map(t => ({
              id: t.id,
              title: t.title,
              destination: t.destination,
              startDate: t.start_date,
              endDate: t.end_date,
              tripLength: t.trip_length,
              status: computeStatus(t.start_date ?? undefined, t.end_date ?? undefined),
              groupType: t.group_type,
              groupSize: t.group_size ?? 1,
              coverImage: t.cover_image ?? null,
              coverImageMeta: t.cover_image_meta ?? null,
              budgetTotal: t.budget_total ?? 0,
              memberCount: t.group_size ?? 1,
              guestCount: 0,
              role: t.role ?? 'organizer',
              organizerName: t.organizerName ?? null,
              memberNames: t.memberNames ?? '',
              cities: t.cities ?? [],
              visitedCities: t.visited_cities ?? [],
              hasTripPass: t.hasTripPass ?? false,
            })));
          }
        })
        .catch(() => setTripsLoadError(true))
        .finally(() => setTripsLoading(false));
    } else {
      try {
        const stored = localStorage.getItem('tripcoord_user_trips');
        if (stored) setUserTrips(JSON.parse(stored));
      } catch { /* ignore */ }
      setTripsLoading(false);
    }
  }, [currentUser.isLoading, currentUser.isDemo, currentUser.id]);

  // Demo account sees mock data; real users see only their own trips
  const allTrips = currentUser.isDemo
    ? [...userTrips, ...trips]
    : userTrips;

  // destination → continent for the ?continent= filter. Falls back to
  // null when the destination string doesn't map cleanly (rare cities,
  // typos) — those trips drop out of a filtered view but still show up
  // when no continent filter is set.
  const tripContinent = (destination: string): string | null => {
    const country = destinationToCountry(destination);
    return country ? countryToContinent(country) : null;
  };

  const filteredTrips = allTrips.filter((trip) => {
    const matchesStatus = statusFilter === 'all' || trip.status === statusFilter;
    const matchesContinent = !continentFilter || tripContinent(trip.destination) === continentFilter;
    const matchesShare =
      shareFilter === 'all' ||
      (shareFilter === 'mine' && trip.role === 'organizer') ||
      (shareFilter === 'shared_with_me' && trip.role && trip.role !== 'organizer');
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      searchQuery === '' ||
      trip.title.toLowerCase().includes(q) ||
      trip.destination.toLowerCase().includes(q) ||
      // People search — match against member names AND the organizer's name so
      // "all trips with Luke" works whether Luke is a member or the organizer.
      (trip.memberNames ?? '').toLowerCase().includes(q) ||
      (trip.organizerName ?? '').toLowerCase().includes(q);
    return matchesStatus && matchesContinent && matchesShare && matchesSearch;
  });

  // Clear-filter helper: also strips ?continent= from the URL so the back
  // button + a refresh both honor the clear.
  const clearContinentFilter = () => {
    setContinentFilter(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('continent');
    router.replace(url.pathname + (url.search ? url.search : ''));
  };

  const sortByDate = (a: { startDate?: string }, b: { startDate?: string }) => {
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
  };
  const statusOrder: Record<string, number> = { active: 0, planning: 1, completed: 2 };
  const sortedFilteredTrips = [...filteredTrips].sort((a, b) => {
    const sA = statusOrder[a.status as string] ?? 1;
    const sB = statusOrder[b.status as string] ?? 1;
    if (sA !== sB) return sA - sB;
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
  });
  const planningTrips = filteredTrips.filter((t) => t.status === 'planning').sort(sortByDate);
  const activeTrips = filteredTrips.filter((t) => t.status === 'active').sort(sortByDate);
  const completedTrips = filteredTrips.filter((t) => t.status === 'completed').sort(sortByDate);

  const statusCounts = {
    all: allTrips.length,
    planning: allTrips.filter((t) => t.status === 'planning').length,
    active: allTrips.filter((t) => t.status === 'active').length,
    completed: allTrips.filter((t) => t.status === 'completed').length,
  };

  // Noon-pad so YYYY-MM-DD strings parse as LOCAL noon, not UTC midnight.
  // Without this, "2026-05-06" rendered as "May 5" in any timezone west of UTC.
  // Returns null for empty/missing dates so callers can render a friendly
  // "no dates" hint instead of JS's "Invalid Date" output.
  const formatDate = (dateStr: string | null | undefined) =>
    dateStr ? new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  return (
    <div className="flex h-dvh bg-parchment">
      <Sidebar activePage="trips" user={currentUser} />

      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">Your Collection</p>
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-script italic font-semibold tracking-tight text-zinc-900">My Trips</h1>
            <Link
              href="/trip/new"
              className="bg-sky-800 hover:bg-sky-900 text-white font-semibold px-5 py-2.5 rounded-full inline-flex items-center gap-2 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Plan a New Trip
            </Link>
          </div>
        </div>

        {/* Search + Filters bar */}
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search by trip, destination, or person..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 pl-10 focus:ring-2 focus:ring-sky-700 focus:border-transparent transition-all text-zinc-900 placeholder-zinc-400"
              />
            </div>

            {/* Status filter pills */}
            <div className="flex items-center gap-2 flex-wrap">
              {(['all', 'planning', 'active', 'completed'] as StatusFilter[]).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                    statusFilter === status
                      ? 'bg-sky-800 text-white'
                      : 'bg-white border border-zinc-200 text-zinc-700 hover:border-sky-400'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
              {/* Continent chip — only visible when the user deep-linked
                  in from /world's continent strip. × clears it and the
                  URL param together so the back button still works. */}
              {continentFilter && (
                <button
                  onClick={clearContinentFilter}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold bg-sky-100 text-sky-800 border border-sky-200 hover:bg-sky-200 transition-colors"
                  aria-label={`Clear ${continentFilter} filter`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {continentFilter}
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* View mode toggle — single render, repositioned via flex.
                Was duplicated in the DOM (`hidden sm:flex` here, `flex
                sm:hidden` below) which doubled tab targets for keyboard
                + screen-reader users. Now hidden on mobile and rendered
                separately below for that breakpoint. */}
            <div className="hidden sm:flex items-center gap-2 bg-white border border-zinc-200 rounded-lg p-1 ml-auto">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-all ${
                  viewMode === 'grid' ? 'bg-sky-100 text-sky-700' : 'text-zinc-500 hover:text-zinc-600'
                }`}
                title="Grid view"
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-md transition-all ${
                  viewMode === 'list' ? 'bg-sky-100 text-sky-700' : 'text-zinc-500 hover:text-zinc-600'
                }`}
                title="List view"
                aria-label="List view"
                aria-pressed={viewMode === 'list'}
              >
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Share filter row — shows owned vs invited trips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mr-1">Show</span>
            {([
              { value: 'all', label: 'All trips' },
              { value: 'mine', label: 'Shared by me' },
              { value: 'shared_with_me', label: 'Shared with me' },
            ] as Array<{ value: ShareFilter; label: string }>).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setShareFilter(value)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                  shareFilter === value
                    ? 'bg-sky-800 text-white'
                    : 'bg-white border border-zinc-200 text-zinc-600 hover:border-sky-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* View mode toggle — mobile only (desktop has it inline above).
              Same toggle controls the same state; visually relocated
              for the smaller layout but a11y attributes match. */}
          <div className="flex sm:hidden items-center gap-2 bg-white border border-zinc-200 rounded-lg p-1 self-start">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-all ${
                viewMode === 'grid'
                  ? 'bg-sky-100 text-sky-700'
                  : 'text-zinc-500 hover:text-zinc-600'
              }`}
              title="Grid view"
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-all ${
                viewMode === 'list'
                  ? 'bg-sky-100 text-sky-700'
                  : 'text-zinc-500 hover:text-zinc-600'
              }`}
              title="List view"
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Loading skeleton — shown while trips are being fetched */}
        {tripsLoading && (
          <div className="space-y-12">
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-2 h-2 bg-zinc-200 rounded-full animate-pulse" />
                <div className="h-5 w-28 bg-zinc-200 rounded animate-pulse" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden animate-pulse">
                    <div className="h-44 bg-zinc-200" />
                    <div className="p-5 space-y-3">
                      <div className="h-4 w-3/4 bg-zinc-200 rounded" />
                      <div className="h-3 w-1/2 bg-zinc-100 rounded" />
                      <div className="h-3 w-2/3 bg-zinc-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Fetch failure — distinguish from empty state. */}
        {tripsLoadError && filteredTrips.length === 0 && !tripsLoading && (
          <div className="mb-6 flex items-center justify-between px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl">
            <p className="text-sm text-rose-700">⚠️ Couldn't load your trips. Check your connection and try again.</p>
            <button
              onClick={() => { setTripsLoadError(false); window.location.reload(); }}
              className="ml-4 text-xs font-semibold text-rose-600 hover:text-rose-800 underline underline-offset-2 whitespace-nowrap"
            >
              Retry
            </button>
          </div>
        )}

        {/* No results */}
        {filteredTrips.length === 0 && !tripsLoading && !tripsLoadError && (
          <div className="text-center py-20">
            <MapPin className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
            <h3 className="text-2xl font-script italic font-semibold text-zinc-900 mb-2">
              {continentFilter ? `No trips in ${continentFilter} yet` : 'No trips here yet'}
            </h3>
            <p className="text-zinc-600 mb-6">
              {continentFilter
                ? 'Clear the filter to see all your trips, or plan something new there.'
                : searchQuery ? 'Try a different search term.' : 'Start planning your next adventure!'}
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              {continentFilter && (
                <button
                  onClick={clearContinentFilter}
                  className="border border-zinc-300 text-zinc-700 hover:border-sky-400 font-semibold px-5 py-2.5 rounded-full inline-flex items-center gap-2 transition-colors"
                >
                  Clear filter
                </button>
              )}
              <Link
                href="/trip/new"
                className="bg-sky-800 hover:bg-sky-900 text-white font-semibold px-5 py-2.5 rounded-full inline-flex items-center gap-2 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Plan a Trip
              </Link>
            </div>
          </div>
        )}

        {/* Grid view */}
        {!tripsLoading && viewMode === 'grid' && filteredTrips.length > 0 && (
          <div className="space-y-12">
            {activeTrips.length > 0 && (
              <section>
                <h2 className="font-script italic text-xl font-semibold text-zinc-900 mb-6 flex items-center gap-3">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full" />
                  Active Now
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {activeTrips.map((trip) => (
                    <TripCard key={trip.id} trip={trip} />
                  ))}
                </div>
              </section>
            )}

            {planningTrips.length > 0 && (
              <section>
                <h2 className="font-script italic text-xl font-semibold text-zinc-900 mb-6 flex items-center gap-3">
                  <span className="w-2 h-2 bg-sky-800 rounded-full" />
                  Planning
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {planningTrips.map((trip) => (
                    <TripCard key={trip.id} trip={trip} />
                  ))}
                </div>
              </section>
            )}

            {completedTrips.length > 0 && (
              <section>
                <h2 className="font-script italic text-xl font-semibold text-zinc-900 mb-6 flex items-center gap-3">
                  <span className="w-2 h-2 bg-zinc-400 rounded-full" />
                  Completed
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {completedTrips.map((trip) => {
                    const hasTagged = Array.isArray(trip.visitedCities) && trip.visitedCities.length > 0;
                    const showBanner = !hasTagged && !dismissedBanners.has(trip.id);
                    return (
                      <div key={trip.id}>
                        {showBanner && (
                          <TagCitiesBanner
                            tripId={trip.id}
                            visible={true}
                            onTagClick={() => setTaggingTripId(trip.id)}
                            onDismiss={() => {
                              rememberTagCitiesBannerDismissed(trip.id);
                              setDismissedBanners(prev => new Set(prev).add(trip.id));
                            }}
                          />
                        )}
                        <TripCard trip={trip} />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}

        {/* List view */}
        {!tripsLoading && viewMode === 'list' && filteredTrips.length > 0 && (
          <div className="space-y-3">
            {sortedFilteredTrips.map((trip) => {
              // Trips without dates set use 0 as days fallback; the TripCard
              // (used in the grid view) shows a "Dates not set yet" hint
              // in that case. The list view below shows the trip length
              // from tripLength field when available.
              const hasDates = !!trip.startDate && !!trip.endDate;
              const startDate = hasDates ? new Date(trip.startDate + 'T12:00:00') : null;
              const endDate = hasDates ? new Date(trip.endDate + 'T12:00:00') : null;
              const dateDiff = startDate && endDate
                ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
                : 0;
              // Prefer the builder-selected length (matches the grid TripCard
              // badge); date-diff alone disagreed with it (e.g. list "3d" vs
              // grid "4d" for the same trip).
              const days = (trip.tripLength && trip.tripLength > 0) ? trip.tripLength : dateDiff;
              // Flexible-date trip → stored dates are a wide window, not the
              // actual trip. Lead with the length ("N-day trip · flexible
              // dates") so the length and the dates don't look like a
              // contradiction.
              const isFlexibleWindow = hasDates && !!trip.tripLength && trip.tripLength > 0 && dateDiff > trip.tripLength + 3;
              const status = (trip.status as string) in { planning: 1, active: 1, completed: 1 }
                ? (trip.status as 'planning' | 'active' | 'completed')
                : 'planning';
              const statusColors = {
                planning: 'bg-sky-100 text-sky-900',
                active: 'bg-emerald-100 text-emerald-800',
                completed: 'bg-zinc-100 text-zinc-600',
              };

              return (
                <Link
                  key={trip.id}
                  href={`/trip/${trip.id}/itinerary`}
                  className="bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 p-5 flex items-center gap-3 sm:gap-6"
                >
                  {/* Thumbnail */}
                  <div
                    className="w-16 h-12 sm:w-20 sm:h-14 rounded-xl bg-cover bg-center flex-shrink-0"
                    style={{ backgroundImage: `url(${trip.coverImage})` }}
                  />

                  {/* Info — destination/date/traveler row wraps on mobile so
                      the long date string + traveler count don't crash into
                      each other. Travelers live inside Info on mobile and
                      get hoisted to a separate Stats column at sm+ where
                      there's horizontal room. */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 sm:mb-2 flex-wrap">
                      <h3 className="font-semibold text-zinc-900 truncate">{trip.title}</h3>
                      <span className={`rounded-full px-2 sm:px-3 py-0.5 sm:py-1 text-xs font-semibold ${statusColors[status]} capitalize flex-shrink-0`}>
                        {status}
                      </span>
                    </div>
                    <div className="flex items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-zinc-600 flex-wrap">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                        <span className="truncate">{trip.destination}</span>
                      </span>
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        {trip.startDate && trip.endDate
                          ? (isFlexibleWindow
                              ? <>{days}-day trip · flexible dates</>
                              : <>{formatDate(trip.startDate)} — {formatDate(trip.endDate)} ({days}d)</>)
                          : <span className="italic text-sky-700">Dates not set yet</span>}
                      </span>
                      {/* Mobile-only travelers chip — desktop hoists it to
                          its own Stats column on the right. */}
                      <span className="flex sm:hidden items-center gap-1.5 whitespace-nowrap">
                        <Users className="w-3.5 h-3.5" />
                        {trip.memberCount + trip.guestCount} {trip.memberCount + trip.guestCount === 1 ? 'traveler' : 'travelers'}
                      </span>
                    </div>
                  </div>

                  {/* Stats — desktop only */}
                  <div className="hidden sm:flex items-center gap-8 flex-shrink-0">
                    <div className="flex items-center gap-1.5 text-sm text-zinc-600">
                      <Users className="w-4 h-4" />
                      <span>{trip.memberCount + trip.guestCount} {trip.memberCount + trip.guestCount === 1 ? 'traveler' : 'travelers'}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        </div>
      </main>

      {/* Tag-cities modal — opens from the per-completed-trip banner */}
      {taggingTripId && (() => {
        const targetTrip = userTrips.find(t => t.id === taggingTripId);
        if (!targetTrip) return null;
        return (
          <TagCitiesModal
            isOpen={!!taggingTripId}
            tripId={taggingTripId}
            aiCities={targetTrip.cities ?? []}
            initialCities={targetTrip.visitedCities ?? []}
            onClose={() => setTaggingTripId(null)}
            onSaved={(cities) => {
              // Update local trip state so the banner disappears immediately
              // without re-fetching the whole list.
              setUserTrips(prev => prev.map(t =>
                t.id === taggingTripId ? { ...t, visitedCities: cities } : t,
              ));
            }}
          />
        );
      })()}
    </div>
  );
}
