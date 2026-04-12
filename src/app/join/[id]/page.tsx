'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { trips } from '@/data/mock';
import { ChevronRight, MapPin, Users, Calendar, Heart, ArrowRight, Download, Lock } from 'lucide-react';

type JoinStep = 'intro' | 'preferences' | 'confirmation';

interface GuestJoinData {
  name: string;
  email: string;
  priorities: string[];
  accommodation: string;
  curiosity: string;
}

const priorityOptions = ['Food & Dining', 'Culture & History', 'Adventure & Sports', 'Nature & Outdoors', 'Shopping', 'Photography', 'Nightlife', 'Wellness'];
const accommodationOptions = ['Luxury Hotels', 'Mid-Range Hotels', 'Boutique Stays', 'Hostels', 'Airbnb/Vacation Rentals'];
const curiosityLevels = ['Exploring casually', 'Moderate pace', 'Packed schedule'];

export default function JoinTripPage({ params }: { params: { id: string } }) {
  const trip = trips[0];
  const [step, setStep] = useState<JoinStep>('intro');
  const [guestData, setGuestData] = useState<GuestJoinData>({
    name: '',
    email: '',
    priorities: [],
    accommodation: '',
    curiosity: '',
  });

  const togglePriority = (priority: string) => {
    setGuestData({
      ...guestData,
      priorities: guestData.priorities.includes(priority)
        ? guestData.priorities.filter(p => p !== priority)
        : [...guestData.priorities, priority]
    });
  };

  const handleContinue = () => {
    if (step === 'intro' && guestData.name.trim()) {
      setStep('preferences');
    } else if (step === 'preferences' && guestData.priorities.length > 0 && guestData.accommodation && guestData.curiosity) {
      setStep('confirmation');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-4 px-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-display font-bold text-sky-900">triphive</h1>
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
                  src={trip.coverImage}
                  alt={trip.destination}
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              </div>

              <div className="p-8">
                {/* Trip Details */}
                <div className="mb-8">
                  <h2 className="text-3xl font-display font-bold text-slate-900 mb-2">{trip.destination}</h2>
                  <p className="text-slate-600">{trip.title}</p>

                  {/* Meta Info */}
                  <div className="grid grid-cols-3 gap-4 mt-6">
                    <div className="flex items-center space-x-2 text-slate-600">
                      <Calendar className="w-4 h-4 text-sky-700" />
                      <span className="text-sm">Sep 15-21</span>
                    </div>
                    <div className="flex items-center space-x-2 text-slate-600">
                      <Users className="w-4 h-4 text-sky-700" />
                      <span className="text-sm">{trip.memberCount + trip.guestCount} travelers</span>
                    </div>
                    <div className="flex items-center space-x-2 text-slate-600">
                      <MapPin className="w-4 h-4 text-sky-700" />
                      <span className="text-sm">7 days</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-6 mb-8">
                  <p className="text-sm text-slate-600 mb-3">Organized by</p>
                  <p className="font-semibold text-slate-900">Brandon</p>
                </div>

                {/* Guest Flow */}
                <div>
                  <h3 className="font-semibold text-slate-900 mb-2 text-lg">What should we call you?</h3>
                  <p className="text-sm text-slate-600 mb-4">No app required to join — but we'll need your name to vote and submit preferences.</p>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={guestData.name}
                    onChange={(e) => setGuestData({ ...guestData, name: e.target.value })}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 mb-4"
                  />

                  <div>
                    <label className="block text-sm text-slate-600 mb-2">Email (optional — for updates)</label>
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

                <p className="text-xs text-slate-500 text-center mt-4">Step 1 of 3</p>
              </div>
            </div>
          )}

          {/* STEP 2: PREFERENCES */}
          {step === 'preferences' && (
            <div className="bg-white rounded-xl shadow-md p-8">
              <h3 className="text-2xl font-display font-bold text-slate-900 mb-6">Tell us about your travel style</h3>

              {/* Travel Priorities */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-slate-900 mb-3">What are you most interested in?</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {priorityOptions.map((priority) => (
                    <button
                      key={priority}
                      onClick={() => togglePriority(priority)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all text-left ${
                        guestData.priorities.includes(priority)
                          ? 'bg-sky-800 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {priority}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accommodation Preference */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-slate-900 mb-3">Accommodation preference</label>
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
                      <span className="text-slate-700">{option}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Curiosity Level */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-slate-900 mb-3">What's your pace?</label>
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
                      <span className="text-slate-700">{level}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* CTAs */}
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={() => setStep('intro')}
                  className="flex-1 px-6 py-3 border border-slate-300 rounded-lg hover:bg-slate-50 font-semibold transition-all"
                >
                  Back
                </button>
                <button
                  onClick={handleContinue}
                  disabled={!guestData.priorities.length || !guestData.accommodation || !guestData.curiosity}
                  className="flex-1 px-6 py-3 bg-sky-800 hover:bg-sky-900 disabled:bg-slate-300 text-white rounded-lg font-semibold transition-all flex items-center justify-center space-x-2"
                >
                  <span>Review</span>
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-500 text-center mt-4">Step 2 of 3</p>
            </div>
          )}

          {/* STEP 3: CONFIRMATION */}
          {step === 'confirmation' && (
            <div className="bg-white rounded-xl shadow-md p-8">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-8 h-8 text-stone-700" />
                </div>
                <h3 className="text-2xl font-display font-bold text-slate-900">You're in!</h3>
                <p className="text-slate-600 mt-2">Your preferences have been submitted to {trip.destination}.</p>
              </div>

              {/* Summary */}
              <div className="bg-slate-50 rounded-lg p-6 mb-6">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-slate-600">Your Name</p>
                    <p className="font-semibold text-slate-900">{guestData.name}</p>
                  </div>
                  {guestData.email && (
                    <div>
                      <p className="text-sm text-slate-600">Email</p>
                      <p className="font-semibold text-slate-900">{guestData.email}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-slate-600">Interests</p>
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
                <h4 className="font-semibold text-slate-900 mb-4">Your 7-Day Itinerary (Read-Only)</h4>
                <p className="text-sm text-slate-600 mb-4">You can view the full itinerary below, but to edit or plan your own trip, download the app.</p>
                <div className="space-y-3">
                  <div className="flex items-start space-x-3 p-3 border border-slate-200 rounded-lg">
                    <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-sky-800">1</span>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Arrival & Reykjavik</p>
                      <p className="text-sm text-slate-600">Meet at Hotel Borg, welcome dinner</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-3 border border-slate-200 rounded-lg">
                    <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-sky-800">2</span>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Golden Circle</p>
                      <p className="text-sm text-slate-600">Þingvellir, Geysir, Gullfoss waterfall</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3 p-3 border border-slate-200 rounded-lg">
                    <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-sky-800">3</span>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">South Coast Adventures</p>
                      <p className="text-sm text-slate-600">Waterfalls, glacier hiking, black sand beach</p>
                    </div>
                  </div>

                  <div className="text-center py-3">
                    <p className="text-sm text-slate-600">+ 4 more days planned</p>
                  </div>
                </div>
              </div>

              {/* Upsell Card */}
              <div className="bg-gradient-to-br from-sky-50 to-green-50 rounded-lg p-6 mb-6 border border-sky-200">
                <div className="flex items-start gap-3 mb-3">
                  <Lock className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
                  <h4 className="font-semibold text-slate-900">Get more from this trip</h4>
                </div>
                <p className="text-sm text-slate-700 mb-4">
                  Your preferences have been submitted. But the app is where the trip really comes alive. For $7.99/month (Explorer plan), you get:
                </p>
                <ul className="space-y-2 text-sm text-slate-700 mb-4">
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
                  onClick={() => alert('Opening triphive App Store page...')}
                  className="w-full px-4 py-2.5 bg-sky-800 hover:bg-sky-900 text-white rounded-lg font-semibold transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download the triphive App
                </button>
              </div>

              {/* CTA - View Trip */}
              <button
                onClick={() => alert('Opening full trip view...')}
                className="w-full px-6 py-3 border border-sky-300 hover:bg-sky-50 text-sky-700 rounded-lg font-semibold transition-all mb-4"
              >
                View Full Trip
              </button>

              {/* Footer Signup CTA */}
              <div className="bg-slate-50 rounded-lg p-6 text-center border border-slate-200">
                <p className="text-slate-700 font-medium mb-2">Ready to plan your own adventure?</p>
                <Link
                  href="/auth/signup"
                  className="inline-flex items-center space-x-2 text-sky-700 hover:text-sky-800 font-semibold"
                >
                  <span>Start for free</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-sm text-slate-600 mb-2">
            Powered by <span className="font-semibold text-slate-900">triphive</span>
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
