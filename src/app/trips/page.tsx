'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/Sidebar';
import { TripCard } from '@/components/TripCard';
import { currentUser, trips } from '@/data/mock';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  MapPin,
  Calendar,
  Users,
  DollarSign,
} from 'lucide-react';

type StatusFilter = 'all' | 'planning' | 'active' | 'completed';
type ViewMode = 'grid' | 'list';

export default function TripsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const filteredTrips = trips.filter((trip) => {
    const matchesStatus = statusFilter === 'all' || trip.status === statusFilter;
    const matchesSearch =
      searchQuery === '' ||
      trip.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trip.destination.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const planningTrips = filteredTrips.filter((t) => t.status === 'planning');
  const activeTrips = filteredTrips.filter((t) => t.status === 'active');
  const completedTrips = filteredTrips.filter((t) => t.status === 'completed');

  const statusCounts = {
    all: trips.length,
    planning: trips.filter((t) => t.status === 'planning').length,
    active: trips.filter((t) => t.status === 'active').length,
    completed: trips.filter((t) => t.status === 'completed').length,
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="flex h-screen bg-stone-50">
      <Sidebar activePage="trips" user={currentUser} />

      <main className="flex-1 overflow-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-2">Your Collection</p>
          <div className="flex items-center justify-between">
            <h1 className="text-4xl font-display font-bold tracking-tight text-zinc-900">My Trips</h1>
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search trips by name or destination..."
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
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-all ${
                viewMode === 'grid'
                  ? 'bg-sky-100 text-sky-700'
                  : 'text-zinc-400 hover:text-zinc-600'
              }`}
              title="Grid view"
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-all ${
                viewMode === 'list'
                  ? 'bg-sky-100 text-sky-700'
                  : 'text-zinc-400 hover:text-zinc-600'
              }`}
              title="List view"
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* No results */}
        {filteredTrips.length === 0 && (
          <div className="text-center py-20">
            <MapPin className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
            <h3 className="text-2xl font-display font-bold text-zinc-900 mb-2">No trips here yet</h3>
            <p className="text-zinc-600 mb-6">
              {searchQuery ? "Try a different search term." : "Start planning your next adventure!"}
            </p>
            <Link
              href="/trip/new"
              className="bg-sky-800 hover:bg-sky-900 text-white font-semibold px-5 py-2.5 rounded-full inline-flex items-center gap-2 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Plan a Trip
            </Link>
          </div>
        )}

        {/* Grid view */}
        {viewMode === 'grid' && filteredTrips.length > 0 && (
          <div className="space-y-12">
            {activeTrips.length > 0 && (
              <section>
                <h2 className="text-lg font-display font-bold text-zinc-900 mb-6 flex items-center gap-3">
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
                <h2 className="text-lg font-display font-bold text-zinc-900 mb-6 flex items-center gap-3">
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
                <h2 className="text-lg font-display font-bold text-zinc-900 mb-6 flex items-center gap-3">
                  <span className="w-2 h-2 bg-zinc-400 rounded-full" />
                  Completed
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {completedTrips.map((trip) => (
                    <TripCard key={trip.id} trip={trip} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* List view */}
        {viewMode === 'list' && filteredTrips.length > 0 && (
          <div className="space-y-3">
            {filteredTrips.map((trip) => {
              const startDate = new Date(trip.startDate);
              const endDate = new Date(trip.endDate);
              const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
              const statusColors = {
                planning: 'bg-sky-100 text-sky-900',
                active: 'bg-emerald-100 text-emerald-800',
                completed: 'bg-zinc-100 text-zinc-600',
              };

              return (
                <Link
                  key={trip.id}
                  href={`/trip/${trip.id}/itinerary`}
                  className="bg-white rounded-2xl border border-zinc-100 shadow-sm hover:shadow-md transition-all p-5 flex items-center gap-6"
                >
                  {/* Thumbnail */}
                  <div
                    className="w-20 h-14 rounded-xl bg-cover bg-center flex-shrink-0"
                    style={{ backgroundImage: `url(${trip.coverImage})` }}
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-zinc-900 truncate">{trip.title}</h3>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColors[trip.status]} capitalize`}>
                        {trip.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-zinc-600">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" />
                        {trip.destination}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" />
                        {formatDate(trip.startDate)} — {formatDate(trip.endDate)} ({days}d)
                      </span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-8 flex-shrink-0">
                    <div className="flex items-center gap-1.5 text-sm text-zinc-600">
                      <Users className="w-4 h-4" />
                      <span>{trip.memberCount + trip.guestCount}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-bold text-sky-700">
                      <DollarSign className="w-4 h-4" />
                      <span>${trip.budgetTotal.toLocaleString()}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
