'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { trips, MOCK_TRIP_IDS } from '@/data/mock';
import { ChevronRight, MapPin, Users, Calendar, Heart, ArrowRight, Download, Lock, Loader, Sparkles } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { PaceLevel, TripMemberPreferences } from '@/lib/types';

type JoinStep = 'intro' | 'preferences' | 'confirmation';

interface GuestJoinData {
  name: string;
  email: string;
  priorities: string[];
  accommodation: string;
  curiosity: string;
}

// Map the join page's existing curiosity copy to the canonical PaceLevel
// values so guest joiners' answers slot into TripMemberPreferences cleanly.
// The standalone mini-wizard at /trip/[id]/preferences uses the same shape.
const CURIOSITY_TO_PACE: Record<string, PaceLevel> = {
  'Exploring casually': 'relaxed',
  'Moderate pace':       'balanced',
  'Packed schedule':     'packed',
};

interface TripData {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelerCount: number;
  organizerName: string;
  coverImage: string;
  itineraryPreview: Array<{
    day: number;
    date?: string;
    theme: string;
    activities: string[];
  }>;
}

// Keep in sync with trip/new/page.tsx priorityOptions
const priorityOptions = [
  { id: 'nature',        label: 'Nature',        icon: '🌿' },
  { id: 'food',          label: 'Food',          icon: '🍽️' },
  { id: 'nightlife',     label: 'Nightlife',     icon: '🎶' },
  { id: 'history',       label: 'History',       icon: '📜' },
  { id: 'sports',        label: 'Sports',        icon: '⛹️' },
  { id: 'photography',   label: 'Photography',   icon: '📷' },
  { id: 'wellness',      label: 'Wellness',      icon: '💆' },
  { id: 'shopping',      label: 'Shopping',      icon: '🛍️' },
  { id: 'adventure',     label: 'Adventure',     icon: '⚡' },
  { id: 'culture',       label: 'Culture',       icon: '🏛️' },
  { id: 'beach',         label: 'Beach',         icon: '🏖️' },
  { id: 'themepark',     label: 'Theme Parks',   icon: '🎢' },
  { id: 'family',        label: 'Family/Kids',   icon: '👨‍👩‍👧' },
  // 'budget' + 'accessibility' chips removed — both are collected elsewhere
  // (budget-tier slider in Trip Builder, accessibilityNeeds question).
];
const accommodationOptions = ['Luxury Hotels', 'Mid-Range Hotels', 'Boutique Stays', 'Hostels', 'Airbnb/Vacation Rentals'];
const curiosityLevels = ['Exploring casually', 'Moderate pace', 'Packed schedule'];

// MOCK_TRIP_IDS imported from @/data/mock

export default function JoinTripPage({ params }: { params: { id: string } }) {
  // Use params.id directly (always available from route props) to avoid
  // the useParams() first-render undefined race that can set notFound too early.
  const tripId = params?.id as string;
  // Email/SMS invites embed an `invite` token in the URL. We read it here
  // and pass it to the members POST so the server can validate + consume
  // the trip_invites row. Tokenless joins still work today (open share-link),
  // but a tokened join generates an audit row + lays groundwork for the
  // privacy gate.
  const searchParams = useSearchParams();
  const inviteToken = searchParams?.get('invite') ?? null;

  // Authenticated joiners get routed to the full mini-wizard at
  // /trip/[id]/preferences after the join completes. Guests stay in this
  // open share-link flow with the lighter inline questions below.
  const currentUser = useCurrentUser();
  const isAuthenticated = !currentUser.isLoading && !!currentUser.id && !currentUser.isDemo;

  const [step, setStep] = useState<JoinStep>('intro');
  // Surfaces server errors from the members POST — most importantly the
  // privacy gate ("This trip is private") so users without a valid invite
  // token don't silently end up on the confirmation step thinking they
  // joined a trip they didn't actually get into.
  const [joinError, setJoinError] = useState<string | null>(null);
  const [tripData, setTripData] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [joining, setJoining] = useState(false);
  const [guestData, setGuestData] = useState<GuestJoinData>({
    name: '',
    email: '',
    priorities: [],
    accommodation: '',
    curiosity: '',
  });

  useEffect(() => {
    const loadTripData = async () => {
      setLoading(true);
      setNotFound(false); // always reset between effect runs

      try {
        if (!tripId) {
          setNotFound(true);
          return;
        }

        // Check if it's a mock trip
        if (MOCK_TRIP_IDS.has(tripId)) {
          const mockTrip = trips.find((t) => t.id === tripId);
          if (mockTrip) {
            // Roll the mock-trip preview dates forward to today+30
            // through today+36. The original hardcoded 2024-09-15 dates
            // are now in the past and made the demo look stale; this
            // matches Trip Builder's rolling-default pattern (line 686).
            const ms = 24 * 60 * 60 * 1000;
            const startDate = new Date(Date.now() + 30 * ms);
            const dayCount = 7;
            const isoDate = (d: Date) => d.toISOString().split('T')[0];

            const itineraryPreview = Array.from({ length: dayCount }, (_, i) => ({
              day: i + 1,
              date: isoDate(new Date(startDate.getTime() + i * ms)),
              theme: `Day ${i + 1}`,
              activities: [`Explore ${mockTrip.destination}`],
            }));

            setTripData({
              title: mockTrip.title,
              destination: mockTrip.destination,
              startDate: isoDate(startDate),
              endDate: isoDate(new Date(startDate.getTime() + (dayCount - 1) * ms)),
              travelerCount: mockTrip.memberCount + mockTrip.guestCount,
              organizerName: 'Brandon',
              coverImage: mockTrip.coverImage,
              itineraryPreview,
            });
            setLoading(false);
            return;
          }
        }

        // Check if it's a UUID (36 chars with dashes)
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tripId)) {
          // Use the public API endpoint (admin client) to bypass RLS — the join
          // page is publicly accessible and the anon Supabase key may be blocked
          // by RLS policies, causing "Trip not found" for valid invite links.
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          let tripRes: Response | null = null;
          try {
            tripRes = await fetch(`/api/trips/${tripId}/public`, { signal: controller.signal });
          } catch {
            // Timeout or network error — fall through to notFound
          } finally {
            clearTimeout(timeoutId);
          }

          if (!tripRes || !tripRes.ok) {
            setNotFound(true);
            setLoading(false);
            return;
          }

          const data = await tripRes.json();

          const startDate = new Date(data.startDate);
          const endDate = new Date(data.endDate);
          const dayCount = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

          const itineraryPreview = Array.from({ length: dayCount }, (_, i) => ({
            day: i + 1,
            date: new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            theme: `Day ${i + 1}`,
            activities: ['Itinerary coming soon'],
          }));

          setTripData({
            title: data.title,
            destination: data.destination,
            startDate: data.startDate,
            endDate: data.endDate,
            travelerCount: data.groupSize || 0,
            organizerName: 'Trip Organizer',
            coverImage: data.coverImage || '',
            itineraryPreview,
          });
          setLoading(false);
          return;
        }

        // Not found
        setNotFound(true);
      } catch (err) {
        console.error('Error loading trip:', err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    loadTripData();
  }, [tripId]);

  const togglePriority = (priority: string) => {
    setGuestData({
      ...guestData,
      priorities: guestData.priorities.includes(priority)
        ? guestData.priorities.filter(p => p !== priority)
        : [...guestData.priorities, priority]
    });
  };

  const handleContinue = async () => {
    if (step === 'intro' && guestData.name.trim()) {
      setStep('preferences');
    } else if (step === 'preferences' && guestData.priorities.length > 0 && guestData.accommodation && guestData.curiosity) {
      // Only write to trip_members for real Supabase trip UUIDs (not mock/upload trips)
      const isRealTrip = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tripId);
      if (isRealTrip) {
        setJoining(true);
        try {
          // Normalise to the TripMemberPreferences shape so the AI prompt
          // merger can read every member's row uniformly. The 3-field guest
          // form here is a subset — dietary/accessibility/budget come back
          // empty and the user can fill them in later via the full mini-
          // wizard once they sign up. `accommodation` is preserved as a
          // sidecar field on the JSON; it's not part of the schema but it's
          // useful signal for the buyer when picking lodging.
          const preferences: TripMemberPreferences & { accommodation?: string } = {
            priorities: guestData.priorities,
            pace: CURIOSITY_TO_PACE[guestData.curiosity] ?? 'balanced',
            dietary: { tags: [] },
            accessibility: { needs: [] },
            submittedAt: new Date().toISOString(),
            accommodation: guestData.accommodation,
          };
          const res = await fetch(`/api/trips/${tripId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: guestData.name.trim(),
              email: guestData.email.trim() || undefined,
              preferences,
              ...(inviteToken ? { inviteToken } : {}),
            }),
          });
          if (!res.ok) {
            // Read the server's error message so privacy/expired-token
            // errors land in the UI verbatim. The bail-out below stops
            // the user from advancing to the confirmation step thinking
            // they joined when they actually didn't.
            let msg = `Couldn't join the trip (${res.status}).`;
            try {
              const body = await res.json();
              if (body?.error) msg = body.error;
            } catch { /* response wasn't JSON */ }
            setJoinError(msg);
            setJoining(false);
            return;
          }
        } catch (err) {
          console.error('Join trip error:', err);
          setJoinError('Network error — please check your connection and try again.');
          setJoining(false);
          return;
        } finally {
          setJoining(false);
        }
      }
      setStep('confirmation');
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white border-b border-slate-200 py-4 px-6">
          <div className="max-w-2xl mx-auto">
            <Link href="/">
              <Image src="/tripcoord_logo.png" alt="TripCoord" width={140} height={36} className="h-9 w-auto" />
            </Link>
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-2xl text-center">
            <Loader className="w-12 h-12 text-sky-700 mx-auto mb-4 animate-spin" />
            <p className="text-zinc-600 font-medium">Loading trip details...</p>
          </div>
        </main>
      </div>
    );
  }

  // Not found state
  if (notFound || !tripData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-white border-b border-slate-200 py-4 px-6">
          <div className="max-w-2xl mx-auto">
            <Link href="/">
              <Image src="/tripcoord_logo.png" alt="TripCoord" width={140} height={36} className="h-9 w-auto" />
            </Link>
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-md p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-zinc-400" />
            </div>
            <h2 className="text-2xl font-semibold text-zinc-900 mb-2">Trip not found</h2>
            <p className="text-zinc-600 mb-6">We couldn't find the trip you're looking for. Please check the link and try again.</p>
            <Link
              href="/"
              className="inline-flex items-center space-x-2 px-6 py-3 bg-sky-800 hover:bg-sky-900 text-white rounded-lg font-semibold transition-all"
            >
              <span>Back to Home</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-4 px-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-script italic font-semibold text-sky-900">tripcoord</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-2xl">
          {/* STEP 1: INTRO */}
          {step === 'intro' && (
            <div className="bg-white rounded-xl shadow-md overflow-hidden">
              {/* Trip Info Card */}
              <div className="relative h-64 bg-gradient-to-br from-sky-800 to-sky-600">
                {tripData.coverImage && (
                  <Image
                    src={tripData.coverImage}
                    alt={tripData.destination}
                    fill
                    className="object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                {!tripData.coverImage && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-6xl opacity-40">✈️</span>
                  </div>
                )}
              </div>

              <div className="p-8">
                {/* Trip Details */}
                <div className="mb-8">
                  <h2 className="text-3xl font-script italic font-semibold text-zinc-900 mb-2">{tripData.destination}</h2>
                  <p className="text-zinc-600">{tripData.title}</p>

                  {/* Meta Info */}
                  <div className="grid grid-cols-3 gap-4 mt-6">
                    <div className="flex items-center space-x-2 text-zinc-600">
                      <Calendar className="w-4 h-4 text-sky-700" />
                      <span className="text-sm">{new Date(tripData.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}-{new Date(tripData.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-zinc-600">
                      <Users className="w-4 h-4 text-sky-700" />
                      <span className="text-sm">{tripData.travelerCount} travelers</span>
                    </div>
                    <div className="flex items-center space-x-2 text-zinc-600">
                      <MapPin className="w-4 h-4 text-sky-700" />
                      <span className="text-sm">{tripData.itineraryPreview.length} days</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-6 mb-8">
                  <p className="text-sm text-zinc-600 mb-3">Organized by</p>
                  <p className="font-semibold text-zinc-900">{tripData.organizerName}</p>
                </div>

                {/* Guest Flow */}
                <div>
                  <h3 className="font-semibold text-zinc-900 mb-2 text-lg">What should we call you?</h3>
                  <p className="text-sm text-zinc-600 mb-4">No app required to join — but we'll need your name to vote and submit preferences.</p>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={guestData.name}
                    onChange={(e) => setGuestData({ ...guestData, name: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 mb-4"
                  />

                  <div>
                    <label className="block text-sm text-zinc-600 mb-2">Email (optional — for updates)</label>
                    <input
                      type="email"
                      placeholder="your@email.com"
                      value={guestData.email}
                      onChange={(e) => setGuestData({ ...guestData, email: e.target.value })}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                    />
                  </div>
                </div>

                {/* CTA */}
                <button
                  onClick={handleContinue}
                  disabled={!guestData.name.trim()}
                  className="w-full mt-8 px-6 py-3 bg-sky-800 hover:bg-sky-900 disabled:bg-slate-300 text-white rounded-lg font-semibold transition-all flex items-center justify-center space-x-2"
                >
                  <span>Next</span>
                  <ChevronRight className="w-5 h-5" />
                </button>

                <p className="text-xs text-zinc-500 text-center mt-4">Step 1 of 3</p>
              </div>
            </div>
          )}

          {/* STEP 2: PREFERENCES */}
          {step === 'preferences' && (
            <div className="bg-white rounded-xl shadow-md p-8">
              <h3 className="text-2xl font-script italic font-semibold text-zinc-900 mb-6">Tell us about your travel style</h3>

              {/* Travel Priorities */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-zinc-900 mb-3">What are you most interested in?</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {priorityOptions.map((priority) => (
                    <button
                      key={priority.id}
                      onClick={() => togglePriority(priority.id)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all text-left flex items-center gap-2 ${
                        guestData.priorities.includes(priority.id)
                          ? 'bg-sky-800 text-white'
                          : 'bg-slate-100 text-zinc-700 hover:bg-slate-200'
                      }`}
                    >
                      <span>{priority.icon}</span>
                      <span>{priority.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Accommodation Preference */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-zinc-900 mb-3">Accommodation preference</label>
                <div className="space-y-2">
                  {accommodationOptions.map((option) => (
                    <label key={option} className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-all">
                      <input
                        type="radio"
                        name="accommodation"
                        checked={guestData.accommodation === option}
                        onChange={() => setGuestData({ ...guestData, accommodation: option })}
                        className="w-4 h-4 text-sky-700"
                      />
                      <span className="text-zinc-700">{option}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Curiosity Level */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-zinc-900 mb-3">What's your pace?</label>
                <div className="space-y-2">
                  {curiosityLevels.map((level) => (
                    <label key={level} className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-all">
                      <input
                        type="radio"
                        name="curiosity"
                        checked={guestData.curiosity === level}
                        onChange={() => setGuestData({ ...guestData, curiosity: level })}
                        className="w-4 h-4 text-sky-700"
                      />
                      <span className="text-zinc-700">{level}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Server-side error from /api/trips/[id]/members POST.
                  Most commonly: privacy gate ("This trip is private") or
                  expired/invalid invite token. Surfaced inline so users
                  know exactly why the join didn't go through. */}
              {joinError && (
                <div className="mt-4 px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg">
                  <p className="text-sm text-rose-800 font-medium">{joinError}</p>
                  {joinError.toLowerCase().includes('private') && (
                    <p className="text-xs text-rose-700 mt-1">
                      Ask the trip organizer to send you an email or text invite — those links carry the access token you need.
                    </p>
                  )}
                </div>
              )}

              {/* CTAs */}
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={() => setStep('intro')}
                  disabled={joining}
                  className="flex-1 px-6 py-3 border border-slate-300 rounded-lg hover:bg-slate-50 font-semibold transition-all disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleContinue}
                  disabled={!guestData.priorities.length || !guestData.accommodation || !guestData.curiosity || joining}
                  className="flex-1 px-6 py-3 bg-sky-800 hover:bg-sky-900 disabled:bg-slate-300 text-white rounded-lg font-semibold transition-all flex items-center justify-center space-x-2"
                >
                  {joining ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      <span>Joining...</span>
                    </>
                  ) : (
                    <>
                      <span>Join Trip</span>
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>

              <p className="text-xs text-zinc-500 text-center mt-4">Step 2 of 3</p>
            </div>
          )}

          {/* STEP 3: CONFIRMATION */}
          {step === 'confirmation' && (
            <div className="bg-white rounded-xl shadow-md p-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-8 h-8 text-stone-700" />
                </div>
                <h3 className="text-2xl font-script italic font-semibold text-zinc-900">You're in!</h3>
                <p className="text-zinc-600 mt-2">Your preferences have been submitted to {tripData.destination}.</p>
              </div>

              {/* Summary */}
              <div className="bg-slate-50 rounded-lg p-6 mb-6">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-zinc-600">Your Name</p>
                    <p className="font-semibold text-zinc-900">{guestData.name}</p>
                  </div>
                  {guestData.email && (
                    <div>
                      <p className="text-sm text-zinc-600">Email</p>
                      <p className="font-semibold text-zinc-900">{guestData.email}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-zinc-600">Interests</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {guestData.priorities.map((p) => {
                        const opt = priorityOptions.find(o => o.id === p);
                        return (
                          <span key={p} className="inline-flex items-center gap-1 px-3 py-1 bg-sky-100 text-sky-900 rounded-full text-xs font-medium">
                            {opt ? <><span>{opt.icon}</span>{opt.label}</> : p}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Itinerary Preview - Read Only */}
              <div className="mb-8">
                <h4 className="font-semibold text-zinc-900 mb-4">Your {tripData.itineraryPreview.length}-Day Itinerary (Read-Only)</h4>
                <p className="text-sm text-zinc-600 mb-4">You can view the full itinerary below, but to edit or plan your own trip, download the app.</p>
                <div className="space-y-3">
                  {tripData.itineraryPreview.slice(0, 3).map((day) => (
                    <div key={day.day} className="flex items-start space-x-3 p-3 border border-slate-200 rounded-lg">
                      <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-sky-800">{day.day}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-900">{day.theme}</p>
                        <p className="text-sm text-zinc-600">{day.activities[0]}</p>
                      </div>
                    </div>
                  ))}
                  {tripData.itineraryPreview.length > 3 && (
                    <div className="text-center py-3">
                      <p className="text-sm text-zinc-600">+ {tripData.itineraryPreview.length - 3} more days planned</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Authenticated joiners → full mini-wizard CTA. Their join row
                  exists in trip_members (POST above), so the standalone page
                  will load their existing answers and let them fill in the
                  fuller fields (dietary, accessibility, budget). */}
              {isAuthenticated ? (
                <div className="bg-gradient-to-br from-amber-50 to-sky-50 rounded-lg p-6 mb-6 border border-amber-200">
                  <div className="flex items-start gap-3 mb-3">
                    <Sparkles className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                    <h4 className="font-semibold text-zinc-900">One more 30 seconds — make it personal</h4>
                  </div>
                  <p className="text-sm text-zinc-700 mb-4">
                    Tell {tripData.organizerName} about your dietary needs, accessibility, and food budget so the AI can build an itinerary that actually works for you.
                  </p>
                  <Link
                    href={`/trip/${tripId}/preferences`}
                    className="w-full px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Complete my preferences
                  </Link>
                </div>
              ) : (
                <div className="bg-gradient-to-br from-sky-50 to-green-50 rounded-lg p-6 mb-6 border border-sky-200">
                  <div className="flex items-start gap-3 mb-3">
                    <Lock className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
                    <h4 className="font-semibold text-zinc-900">Get more from this trip</h4>
                  </div>
                  <p className="text-sm text-zinc-700 mb-4">
                    Your preferences have been submitted. But the app is where the trip really comes alive. For $7.99/month (Explorer plan), you get:
                  </p>
                  <ul className="space-y-2 text-sm text-zinc-700 mb-4">
                    <li className="flex items-center space-x-2">
                      <ChevronRight className="w-4 h-4 text-sky-700 flex-shrink-0" />
                      <span>Group chat with other travelers</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <ChevronRight className="w-4 h-4 text-sky-700 flex-shrink-0" />
                      <span>Log and split expenses automatically</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <ChevronRight className="w-4 h-4 text-sky-700 flex-shrink-0" />
                      <span>Full itinerary editing and real-time collaboration</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <ChevronRight className="w-4 h-4 text-sky-700 flex-shrink-0" />
                      <span>Plan and organize your own trips</span>
                    </li>
                  </ul>
                  {/* "Download the App" CTA hidden for launch — no native
                      app exists yet. The previous placeholder fired a
                      browser alert() ("Opening tripcoord App Store page…")
                      which read as broken to real users. Restore once the
                      iOS / Android builds are live. */}
                </div>
              )}

              {/* CTA - View Trip */}
              <a
                href={`/trip/${tripId}/itinerary`}
                className="block w-full px-6 py-3 border border-sky-300 hover:bg-sky-50 text-sky-700 rounded-lg font-semibold transition-all mb-4 text-center"
              >
                View Full Trip
              </a>

              {/* Footer Signup/Login CTA */}
              <div className="bg-slate-50 rounded-lg p-6 text-center border border-slate-200">
                <div className="space-y-3">
                  <div>
                    <p className="text-zinc-700 font-medium mb-2">Ready to plan your own adventure?</p>
                    <Link
                      href="/auth/signup"
                      className="inline-flex items-center space-x-2 text-sky-700 hover:text-sky-800 font-semibold"
                    >
                      <span>Start for free</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                  <div className="border-t border-slate-200 pt-3">
                    <p className="text-sm text-zinc-600 mb-2">Already have an account?</p>
                    <Link
                      href="/auth/login"
                      className="inline-flex items-center space-x-2 text-zinc-600 hover:text-sky-700 font-medium text-sm"
                    >
                      <span>Sign in</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-sm text-zinc-600 mb-2">
            Powered by <span className="font-semibold text-zinc-900">tripcoord</span>
          </p>
          <Link
            href="/auth/signup"
            className="text-sm text-sky-700 hover:text-sky-800 font-medium inline-flex items-center gap-1"
          >
            Planning your own trip? Start for free
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
