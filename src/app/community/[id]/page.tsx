'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, Calendar, Users, ArrowLeft, Sparkles, MapPin, ChevronDown, ChevronRight } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { ForkTripModal } from '@/components/ForkTripModal';

interface CommunityActivity {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  time?: string;
  timeSlot?: string;
}

interface CommunityDay {
  day?: number;
  date?: string;
  theme?: string;
  city?: string;
  tracks?: {
    shared?: CommunityActivity[];
    track_a?: CommunityActivity[];
    track_b?: CommunityActivity[];
  };
}

interface CommunityTripData {
  trip: {
    id: string;
    title: string;
    destination: string;
    startDate: string | null;
    endDate: string | null;
    tripLength: number;
    groupSize: number;
    coverImage: string | null;
    coverImageMeta: {
      photographer?: string | null;
      photographerUrl?: string | null;
      photoUrl?: string | null;
    } | null;
    organizer: { name: string | null; avatarUrl: string | null } | null;
  };
  itinerary: { days: CommunityDay[]; meta: unknown };
  likes: {
    itineraryCount: number;
    viewerLiked: boolean;
    activityCounts: Record<string, number>;
    viewerLikedActivities: string[];
  };
}

const UTM = '?utm_source=tripcoord&utm_medium=referral';

export default function CommunityTripPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const [data, setData] = useState<CommunityTripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [forking, setForking] = useState(false);
  const [forkModalOpen, setForkModalOpen] = useState(false);
  // Surfaced when the fork API call returns a non-ok response or throws —
  // shown as a temporary banner so the user knows their click failed
  // rather than silently watching the modal close.
  const [forkError, setForkError] = useState<string | null>(null);
  const [activityLikes, setActivityLikes] = useState<Record<string, number>>({});
  const [viewerLikedActivities, setViewerLikedActivities] = useState<Set<string>>(new Set());
  const [itineraryLikeCount, setItineraryLikeCount] = useState(0);
  const [viewerLikedItinerary, setViewerLikedItinerary] = useState(false);
  // Day accordion — Day 1 expanded by default so the user sees something
  // immediately; everything else collapsed so a 14-day plan doesn't dump a
  // five-screen wall of activities. Index-based since CommunityDay.day is
  // optional. Set rather than per-day toggles to keep "Expand all" trivial.
  const [expandedDays, setExpandedDays] = useState<Set<number>>(() => new Set([0]));
  const toggleDay = (idx: number) => setExpandedDays(prev => {
    const next = new Set(prev);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    return next;
  });

  useEffect(() => {
    fetch(`/api/community/${params.id}`)
      .then(async r => {
        if (r.status === 404 || r.status === 403) { setNotFound(true); return null; }
        return r.ok ? r.json() : null;
      })
      .then(d => {
        if (d?.trip) {
          setData(d);
          setActivityLikes(d.likes.activityCounts ?? {});
          setViewerLikedActivities(new Set(d.likes.viewerLikedActivities ?? []));
          setItineraryLikeCount(d.likes.itineraryCount ?? 0);
          setViewerLikedItinerary(!!d.likes.viewerLiked);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [params.id]);

  const requireAuth = (): boolean => {
    // Auth state resolves async — if the user clicks before useCurrentUser
    // has populated, we used to redirect to login despite a valid cookie.
    // Now we treat "still loading" as a no-op rather than a failed auth;
    // the click silently dropped is better than a phantom redirect.
    if (currentUser.isLoading) return false;
    if (!currentUser.id || currentUser.isDemo) {
      // Round-trip back to this page after login so the user lands on the
      // same trip they were trying to like / fork instead of being dropped
      // on /dashboard (which had its own load issue).
      const returnTo = typeof window !== 'undefined' ? window.location.pathname : `/community/${params.id}`;
      router.push(`/auth/login?redirect=${encodeURIComponent(returnTo)}`);
      return false;
    }
    return true;
  };

  const toggleItineraryLike = async () => {
    if (!requireAuth()) return;
    const wasLiked = viewerLikedItinerary;
    setViewerLikedItinerary(!wasLiked);
    setItineraryLikeCount(c => Math.max(0, c + (wasLiked ? -1 : 1)));
    try {
      const res = await fetch(`/api/trips/${params.id}/like`, { method: wasLiked ? 'DELETE' : 'POST' });
      if (!res.ok) throw new Error();
      const out = await res.json();
      setItineraryLikeCount(out.count ?? itineraryLikeCount);
    } catch {
      setViewerLikedItinerary(wasLiked);
      setItineraryLikeCount(c => Math.max(0, c + (wasLiked ? 1 : -1)));
    }
  };

  const toggleActivityLike = async (activityId: string) => {
    if (!requireAuth()) return;
    const wasLiked = viewerLikedActivities.has(activityId);
    setViewerLikedActivities(prev => {
      const next = new Set(prev);
      wasLiked ? next.delete(activityId) : next.add(activityId);
      return next;
    });
    setActivityLikes(prev => ({
      ...prev,
      [activityId]: Math.max(0, (prev[activityId] ?? 0) + (wasLiked ? -1 : 1)),
    }));
    try {
      const res = await fetch(`/api/trips/${params.id}/activities/${activityId}/like`, {
        method: wasLiked ? 'DELETE' : 'POST',
      });
      if (!res.ok) throw new Error();
      const out = await res.json();
      setActivityLikes(prev => ({ ...prev, [activityId]: out.count ?? prev[activityId] ?? 0 }));
    } catch {
      setViewerLikedActivities(prev => {
        const next = new Set(prev);
        wasLiked ? next.add(activityId) : next.delete(activityId);
        return next;
      });
      setActivityLikes(prev => ({
        ...prev,
        [activityId]: Math.max(0, (prev[activityId] ?? 0) + (wasLiked ? 1 : -1)),
      }));
    }
  };

  const handleFork = () => {
    if (!requireAuth()) return;
    if (forking) return;
    setForkModalOpen(true);
  };

  const handleForkSubmit = async (
    dates: { startDate: string | null; endDate: string | null }
  ) => {
    setForking(true);
    try {
      const res = await fetch(`/api/trips/${params.id}/fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dates),
      });
      const out = await res.json().catch(() => null);
      if (res.ok && out?.tripId) {
        router.push(`/trip/${out.tripId}/itinerary`);
      } else {
        // Surface the failure rather than silently dismissing — previous
        // behavior left the user staring at a blank page wondering if
        // their click had worked.
        setForking(false);
        setForkModalOpen(false);
        setForkError(out?.error ?? "Couldn't copy this trip. Please try again.");
        setTimeout(() => setForkError(null), 4000);
      }
    } catch {
      setForking(false);
      setForkModalOpen(false);
      setForkError("Couldn't copy this trip. Please try again.");
      setTimeout(() => setForkError(null), 4000);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen bg-parchment">
        <Sidebar />
        <main className="flex-1 p-8">
          <div className="max-w-4xl mx-auto animate-pulse">
            <div className="h-64 bg-zinc-200 rounded-2xl mb-6" />
            <div className="h-8 w-2/3 bg-zinc-200 rounded mb-3" />
            <div className="h-4 w-1/3 bg-zinc-100 rounded mb-8" />
            <div className="h-32 bg-zinc-100 rounded-2xl mb-4" />
            <div className="h-32 bg-zinc-100 rounded-2xl" />
          </div>
        </main>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex min-h-screen bg-parchment">
        <Sidebar />
        <main className="flex-1 p-8">
          <div className="max-w-2xl mx-auto text-center py-20">
            <h1 className="font-script italic text-3xl font-semibold text-zinc-900 mb-2">Itinerary not found</h1>
            <p className="text-zinc-500 mb-6">
              This trip isn&apos;t public, or it doesn&apos;t exist anymore.
            </p>
            <Link href="/discover" className="inline-flex items-center gap-2 px-5 py-2.5 bg-sky-800 hover:bg-sky-900 text-white text-sm font-semibold rounded-full">
              <ArrowLeft className="w-4 h-4" /> Back to Discover
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { trip, itinerary } = data;
  const meta = trip.coverImageMeta;

  return (
    <div className="flex min-h-screen bg-parchment">
      <Sidebar />
      <main className="flex-1 p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Link href="/discover" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-800 mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Discover
          </Link>

          {/* Hero */}
          <div className="relative h-72 rounded-2xl overflow-hidden bg-gradient-to-br from-ocean-700 via-ocean-800 to-earth-700 mb-6">
            {trip.coverImage && (
              <Image
                src={trip.coverImage}
                alt={trip.destination}
                fill
                className="object-cover"
                priority
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            {meta?.photographer && meta?.photographerUrl && (
              <div className="absolute bottom-2 right-3 text-[10px] text-white/70 z-10">
                Photo by{' '}
                <a
                  href={`${meta.photographerUrl}${UTM}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-2 hover:underline hover:text-white"
                >{meta.photographer}</a>
                {' '}on{' '}
                <a
                  href={`${meta.photoUrl ?? 'https://unsplash.com'}${UTM}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-2 hover:underline hover:text-white"
                >Unsplash</a>
              </div>
            )}
            <div className="absolute bottom-6 left-6 right-6">
              <h1 className="font-script italic text-4xl md:text-5xl font-semibold text-white drop-shadow mb-2">
                {trip.destination}
              </h1>
              <div className="flex items-center gap-4 text-sm text-white/85">
                {trip.tripLength > 0 && (
                  <span className="inline-flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {trip.tripLength} days</span>
                )}
                {trip.groupSize > 0 && (
                  <span className="inline-flex items-center gap-1.5"><Users className="w-4 h-4" /> {trip.groupSize} travelers</span>
                )}
                {trip.organizer?.name && (
                  <span>by {trip.organizer.name.split(/\s+/)[0]}</span>
                )}
              </div>
            </div>
          </div>

          {/* Fork failure banner */}
          {forkError && (
            <div className="mb-4 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800">
              {forkError}
            </div>
          )}

          {/* Action bar */}
          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-8">
            <button
              onClick={toggleItineraryLike}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all ${
                viewerLikedItinerary
                  ? 'bg-rose-50 text-rose-600 border border-rose-200'
                  : 'bg-zinc-50 text-zinc-700 border border-zinc-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200'
              }`}
            >
              <Heart className={`w-4 h-4 ${viewerLikedItinerary ? 'fill-current' : ''}`} />
              {viewerLikedItinerary ? 'Liked' : 'Like'} {itineraryLikeCount > 0 && <span className="text-zinc-400 font-normal">· {itineraryLikeCount}</span>}
            </button>
            <button
              onClick={handleFork}
              disabled={forking}
              className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-800 hover:bg-sky-900 disabled:bg-zinc-300 text-white text-sm font-semibold rounded-full transition-all"
            >
              <Sparkles className="w-4 h-4" />
              {forking ? 'Copying itinerary…' : 'Use as starting point'}
            </button>
          </div>

          {/* Itinerary days */}
          {itinerary.days.length > 1 && (
            <div className="flex items-center justify-end mb-3">
              <button
                type="button"
                onClick={() => setExpandedDays(
                  expandedDays.size === itinerary.days.length
                    ? new Set([0])
                    : new Set(itinerary.days.map((_, i) => i))
                )}
                className="text-xs font-semibold text-sky-800 hover:text-sky-900 underline"
              >
                {expandedDays.size === itinerary.days.length ? 'Collapse all' : 'Expand all'}
              </button>
            </div>
          )}
          <div className="space-y-4">
            {itinerary.days.length === 0 && (
              <div className="bg-white rounded-2xl border border-zinc-100 p-8 text-center text-zinc-500 text-sm">
                This itinerary doesn&apos;t have any days saved yet.
              </div>
            )}
            {itinerary.days.map((day, dayIdx) => {
              const allActivities = [
                ...(day.tracks?.shared ?? []),
                ...(day.tracks?.track_a ?? []),
                ...(day.tracks?.track_b ?? []),
              ];
              const isExpanded = expandedDays.has(dayIdx);
              return (
                <div key={dayIdx} className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleDay(dayIdx)}
                    aria-expanded={isExpanded}
                    aria-controls={`community-day-${dayIdx}`}
                    className={`w-full text-left px-6 py-4 flex items-start gap-3 hover:bg-zinc-50 transition-colors ${isExpanded ? 'border-b border-zinc-100' : ''}`}
                  >
                    <span className="mt-1.5 flex-shrink-0 text-zinc-400">
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-script italic text-2xl font-semibold text-zinc-900">
                        Day {day.day ?? dayIdx + 1}
                        {day.theme && <span className="text-zinc-500 text-lg italic"> — {day.theme}</span>}
                      </h2>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-sm text-zinc-500">
                        {day.city && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" /> {day.city}
                          </span>
                        )}
                        {!isExpanded && allActivities.length > 0 && (
                          <span className="text-xs text-zinc-400">{allActivities.length} {allActivities.length === 1 ? 'activity' : 'activities'}</span>
                        )}
                      </div>
                    </div>
                  </button>
                  {isExpanded && (
                  <div id={`community-day-${dayIdx}`} className="divide-y divide-zinc-100">
                    {allActivities.length === 0 && (
                      <div className="px-6 py-4 text-sm text-zinc-400">No activities planned.</div>
                    )}
                    {allActivities.map((act, actIdx) => {
                      const actId = act.id || `${dayIdx}-${actIdx}`;
                      const liked = viewerLikedActivities.has(actId);
                      const count = activityLikes[actId] ?? 0;
                      const title = act.title || act.name || 'Activity';
                      return (
                        <div key={actId} className="px-6 py-4 flex items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-zinc-900">{title}</p>
                            {act.description && (
                              <p className="text-sm text-zinc-600 mt-1">{act.description}</p>
                            )}
                            {(act.time || act.timeSlot) && (
                              <p className="text-xs text-zinc-400 mt-1.5 capitalize">{act.time || act.timeSlot}</p>
                            )}
                          </div>
                          <button
                            onClick={() => toggleActivityLike(actId)}
                            className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                              liked
                                ? 'bg-rose-50 text-rose-600 border border-rose-200'
                                : 'bg-zinc-50 text-zinc-500 border border-zinc-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200'
                            }`}
                            aria-label={liked ? 'Unlike activity' : 'Like activity'}
                          >
                            <Heart className={`w-3 h-3 ${liked ? 'fill-current' : ''}`} />
                            {count > 0 ? count : ''}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Date-picker confirmation before /fork runs */}
      <ForkTripModal
        open={forkModalOpen}
        destination={trip.destination}
        tripLength={trip.tripLength}
        forking={forking}
        onClose={() => { if (!forking) setForkModalOpen(false); }}
        onSubmit={handleForkSubmit}
      />
    </div>
  );
}
