'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { trips, MOCK_TRIP_IDS } from '@/data/mock';
import { ChevronRight, MapPin, Users, Calendar, Heart, ArrowRight, Download, Lock, Loader } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

type JoinStep = 'intro' | 'preferences' | 'confirmation';

interface GuestJoinData {
  name: string;
  email: string;
  priorities: string[];
  accommodation: string;
  curiosity: string;
}

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

const priorityOptions = ['Food & Dining', 'Culture & History', 'Adventure & Sports', 'Nature & Outdoors', 'Shopping', 'Photography', 'Nightlife', 'Wellness'];
const accommodationOptions = ['Luxury Hotels', 'Mid-Range Hotels', 'Boutique Stays', 'Hostels', 'Airbnb/Vacation Rentals'];
const curiosityLevels = ['Exploring casually', 'Moderate pace', 'Packed schedule'];

// MOCK_TRIP_IDS imported from @/data/mock

export default function JoinTripPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const p = useParams();
  const tripId = p?.id as string;

  const [step, setStep] = useState<JoinStep>('intro');
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
      setNotFound(false);

      try {
        if (!tripId) {
          setNotFound(true);
          return;
        }

        // Check if it's a mock trip
        if (MOCK_TRIP_IDS.has(tripId)) {
          const mockTrip = trips.find((t) => t.id === tripId);
          if (mockTrip) {
            const startDate = new Date('2024-09-15');
            const endDate = new Date('2024-09-21');
            const dayCount = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

            const itineraryPreview = Array.from({ length: dayCount }, (_, i) => ({
              day: i + 1,
              date: new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              theme: `Day ${i + 1}`,
              activities: [`Explore ${mockTrip.destination}`],
            }));

            setTripData({
              title: mockTrip.title,
              destination: mockTrip.destination,
              startDate: '2024-09-15',
              endDate: '2024-09-21',
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
          const supabase = createBrowserClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
          );

          const { data, error } = await supabase
            .from('trips')
            .select('id, title, destination, start_date, end_date, group_size, cover_image')
            .eq('id', tripId)
            .single();

          if (error || !data) {
            setNotFound(true);
            setLoading(false);
            return;
          }

          const startDate = new Date(data.start_date);
          const endDate = new Date(data.end_date);
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
            startDate: data.start_date,
            endDate: data.end_date,
            travelerCount: data.group_size || 0,
            organizerName: 'Trip Organizer',
            coverImage: data.cover_image || '/default-trip.jpg',
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
          await fetch(`/api/trips/${tripId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: guestData.name.trim(),
              email: guestData.email.trim() || undefined,
              preferences: {
                priorities: guestData.priorities,
                accommodation: guestData.accommodation,
                curiosity: guestData.curiosity,
              },
            }),
          });
        } catch (err) {
          console.error('Join trip error:', err);
          // Non-blocking — still advance to confirmation even if the write fails
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
            <h1 className="text-2xl font-script italic font-semibold text-sky-900">tripcoord</h1>
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
            <h1 className="text-2xl font-script italic font-semibold text-sky-900">tripcoord</h1>
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
              <div className="relative h-64 bg-slate-100">
                <Image
                  src={tripData.coverImage}
                  alt={tripData.destination}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
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
                      key={priority}
                      onClick={() => togglePriority(priority)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all text-left ${
                        guestData.priorities.includes(priority)
                          ? 'bg-sky-800 text-white'
                          : 'bg-slate-100 text-zinc-700 hover:bg-slate-200'
                      }`}
                    >
                      {priority}
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
                      {guestData.priorities.map((p) => (
                        <span key={p} className="px-3 py-1 bg-sky-100 text-sky-900 rounded-full text-xs font-medium">
                          {p}
                        </span>
                      ))}
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

              {/* Upsell Card */}
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
                <button
                  onClick={() => alert('Opening tripcoord App Store page...')}
                  className="w-full px-4 py-2.5 bg-sky-800 hover:bg-sky-900 text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download the tripcoord App
                </button>
              </div>

              {/* CTA - View Trip */}
              <button
                onClick={() => router.push(`/trip/${tripId}/itinerary`)}
                className="w-full px-6 py-3 border border-sky-300 hover:bg-sky-50 text-sky-700 rounded-lg font-semibold transition-all mb-4"
              >
                View Full Trip
              </button>

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
