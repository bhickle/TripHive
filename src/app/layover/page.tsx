'use client';

import React, { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { currentUser } from '@/data/mock';
import {
  Plane,
  Clock,
  MapPin,
  ChevronLeft,
  Loader2,
  Sparkles,
  AlertTriangle,
  ExternalLink,
  Info,
} from 'lucide-react';
import Link from 'next/link';

interface LayoverSuggestion {
  id: string;
  title: string;
  category: 'food' | 'shopping' | 'lounge' | 'sightseeing' | 'relax';
  duration: string;
  location: string;
  description: string;
  distance: string;
  cost: string;
  rating: number;
  icon: string;
  requiresExitAirside?: boolean;
  bookingTip?: string;
}

interface LayoverResult {
  airport: {
    code: string;
    name: string;
    city: string;
    country: string;
    transitVisaNote?: string;
  };
  suggestions: LayoverSuggestion[];
}

export default function LayoverPlannerPage() {
  const [airport, setAirport] = useState('');
  const [layoverHours, setLayoverHours] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<LayoverResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedItems, setSavedItems] = useState<Set<string>>(new Set());
  const [showPreferences, setShowPreferences] = useState(false);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [selectedAgeRanges, setSelectedAgeRanges] = useState<string[]>([]);
  const [accessibilityNeeds, setAccessibilityNeeds] = useState<string[]>([]);
  const [groupType, setGroupType] = useState('');
  // Staged: after first search we show preferences, then generate
  const [pendingCode, setPendingCode] = useState('');

  const popularAirports = [
    { code: 'LHR', label: 'London Heathrow' },
    { code: 'DXB', label: 'Dubai' },
    { code: 'SIN', label: 'Singapore Changi' },
    { code: 'CDG', label: 'Paris Charles de Gaulle' },
    { code: 'NRT', label: 'Tokyo Narita' },
  ];

  const priorityOptions = [
    { id: 'food', label: 'Food & Dining', icon: '🍽️' },
    { id: 'shopping', label: 'Shopping', icon: '🛍️' },
    { id: 'sightseeing', label: 'Sightseeing', icon: '📸' },
    { id: 'relaxation', label: 'Relaxation', icon: '🧘' },
    { id: 'culture', label: 'Culture', icon: '🎨' },
    { id: 'adventure', label: 'Adventure', icon: '🪂' },
  ];

  const ageRangeOptions = ['Under 12', '12-17', '18-30', '31-50', '51-65', '65+'];

  const accessibilityOptionsList = [
    'Wheelchair accessible',
    'Limited mobility',
    'Visual assistance',
    'No special needs',
  ];

  const groupTypeOptions = [
    { id: 'solo', label: 'Solo', icon: '🧳', desc: 'Just me' },
    { id: 'couple', label: 'Couple', icon: '💑', desc: 'Two of us' },
    { id: 'friends', label: 'Friends', icon: '👥', desc: '3+ friends' },
    { id: 'family', label: 'Family', icon: '👨‍👩‍👧‍👦', desc: 'Family trip' },
  ];

  // Step 1 — validate the code and reveal preferences panel
  const handleSearch = (code?: string) => {
    const searchCode = (code || airport).toUpperCase().trim();
    if (!searchCode) return;
    if (code) setAirport(searchCode);
    setPendingCode(searchCode);
    setShowPreferences(true);
    setResult(null);
    setError(null);
  };

  // Step 2 — call the AI route
  const handleGenerateResults = async () => {
    const searchCode = pendingCode || airport.toUpperCase().trim();
    if (!searchCode) return;

    setIsSearching(true);
    setShowPreferences(false);
    setError(null);

    try {
      const res = await fetch('/api/generate-layover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          airport: searchCode,
          layoverHours: parseFloat(layoverHours) || 4,
          groupType,
          priorities: selectedPriorities,
          ageRanges: selectedAgeRanges,
          accessibilityNeeds,
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json() as LayoverResult & { error?: string; message?: string };

      if (data.error) throw new Error(data.message || 'Generation failed');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const toggleSaved = (id: string) => {
    setSavedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const categoryColors: Record<string, string> = {
    food: 'bg-orange-100 text-orange-700',
    shopping: 'bg-pink-100 text-pink-700',
    lounge: 'bg-purple-100 text-purple-700',
    sightseeing: 'bg-blue-100 text-blue-700',
    relax: 'bg-green-100 text-green-700',
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar
        activePage="dashboard"
        user={{
          name: currentUser.name,
          avatarUrl: currentUser.avatarUrl,
          subscriptionTier: currentUser.subscriptionTier,
        }}
      />
      <main className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link
            href="/dashboard"
            className="flex items-center space-x-2 text-sky-700 hover:text-sky-800 mb-6 font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>

          <div className="mb-8">
            <h1 className="text-3xl font-display font-bold text-slate-900 flex items-center gap-3">
              <Plane className="w-8 h-8 text-sky-700" />
              Layover Planner
            </h1>
            <p className="text-slate-600 mt-2">
              Got a long layover? We'll help you make the most of your time between flights — for any airport in the world.
            </p>
          </div>

          {/* Search Form */}
          <div className="card p-6 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="md:col-span-1">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Airport Code</label>
                <input
                  type="text"
                  placeholder="e.g., LHR, DXB, JFK"
                  value={airport}
                  onChange={(e) => setAirport(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === 'Enter' && airport) handleSearch(); }}
                  maxLength={4}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 uppercase font-mono text-lg"
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm font-semibold text-slate-700 mb-2">Layover Duration</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="Hours"
                    value={layoverHours}
                    onChange={(e) => setLayoverHours(e.target.value)}
                    min="1"
                    max="48"
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                  />
                  <span className="text-sm text-slate-500 whitespace-nowrap">hours</span>
                </div>
              </div>
              <div className="md:col-span-1 flex items-end">
                <button
                  onClick={() => handleSearch()}
                  disabled={!airport || isSearching}
                  className="w-full px-6 py-3 bg-sky-800 hover:bg-sky-900 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isSearching ? 'Generating...' : 'Find Activities'}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500">Popular:</span>
              {popularAirports.map(a => (
                <button
                  key={a.code}
                  onClick={() => handleSearch(a.code)}
                  className="text-xs px-3 py-1.5 bg-sky-50 text-sky-800 hover:bg-sky-100 rounded-full font-medium transition-colors"
                >
                  {a.code} — {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preferences Panel */}
          {showPreferences && (
            <div className="card p-6 mb-8">
              <h2 className="text-xl font-display font-bold text-slate-900 mb-2">
                Customize Your Layover at {pendingCode}
              </h2>
              <p className="text-sm text-slate-600 mb-6">
                Tell us a bit more so AI can tailor suggestions for your{' '}
                {layoverHours ? `${layoverHours}-hour` : ''} layover.
              </p>

              {/* Who's Traveling */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-900 mb-3">Who's traveling?</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {groupTypeOptions.map(option => (
                    <button
                      key={option.id}
                      onClick={() => setGroupType(option.id)}
                      className={`p-4 rounded-lg border-2 transition-all text-center ${
                        groupType === option.id ? 'border-sky-700 bg-sky-50' : 'border-slate-200 hover:border-sky-300'
                      }`}
                    >
                      <span className="text-2xl block mb-1">{option.icon}</span>
                      <p className="font-semibold text-slate-900 text-sm">{option.label}</p>
                      <p className="text-xs text-slate-500">{option.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Travel Priorities */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-900 mb-3">
                  What are you in the mood for? <span className="text-slate-400 font-normal">(pick any)</span>
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {priorityOptions.map((priority) => {
                    const isSelected = selectedPriorities.includes(priority.id);
                    return (
                      <button
                        key={priority.id}
                        onClick={() => setSelectedPriorities(prev =>
                          prev.includes(priority.id)
                            ? prev.filter(p => p !== priority.id)
                            : [...prev, priority.id]
                        )}
                        className={`p-4 rounded-lg border-2 transition-all text-center ${
                          isSelected ? 'border-sky-700 bg-sky-50' : 'border-slate-200 hover:border-sky-300'
                        }`}
                      >
                        <span className="text-2xl mb-1 block">{priority.icon}</span>
                        <p className="font-medium text-slate-900 text-sm">{priority.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Age Ranges */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-900 mb-3">Age Ranges in Your Group</label>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {ageRangeOptions.map((age) => (
                    <button
                      key={age}
                      onClick={() => setSelectedAgeRanges(prev =>
                        prev.includes(age) ? prev.filter(a => a !== age) : [...prev, age]
                      )}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                        selectedAgeRanges.includes(age)
                          ? 'border-sky-700 bg-sky-50 text-sky-800'
                          : 'border-slate-200 text-slate-700 hover:border-sky-300'
                      }`}
                    >
                      {age}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accessibility */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-slate-900 mb-3">Accessibility Needs</label>
                <div className="grid grid-cols-2 gap-2">
                  {accessibilityOptionsList.map((need) => (
                    <label key={need} className="flex items-center space-x-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={accessibilityNeeds.includes(need)}
                        onChange={() => setAccessibilityNeeds(prev =>
                          prev.includes(need) ? prev.filter(n => n !== need) : [...prev, need]
                        )}
                        className="w-4 h-4 rounded border-slate-300 text-sky-700 focus:ring-sky-700"
                      />
                      <span className="text-sm font-medium text-slate-900">{need}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button
                onClick={handleGenerateResults}
                className="w-full px-6 py-3 bg-sky-800 hover:bg-sky-900 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                Generate Personalized Activities
              </button>
            </div>
          )}

          {/* Loading state */}
          {isSearching && (
            <div className="card p-12 text-center">
              <Loader2 className="w-10 h-10 text-sky-700 animate-spin mx-auto mb-4" />
              <p className="text-lg font-semibold text-slate-900">Finding the best layover activities…</p>
              <p className="text-sm text-slate-500 mt-1">AI is personalizing suggestions for {pendingCode}</p>
            </div>
          )}

          {/* Error state */}
          {error && !isSearching && (
            <div className="card p-6 text-center">
              <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
              <p className="text-lg font-semibold text-slate-900">Couldn't load suggestions</p>
              <p className="text-sm text-slate-600 mt-1">{error}</p>
              <button
                onClick={() => handleSearch()}
                className="mt-4 px-5 py-2.5 bg-sky-800 text-white rounded-lg text-sm font-medium hover:bg-sky-900 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Results */}
          {result && !isSearching && (
            <div>
              <div className="mb-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-display font-bold text-slate-900">
                      {result.airport.name}
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">
                      {result.airport.city}, {result.airport.country} · {result.suggestions.length} suggestions
                      {layoverHours ? ` for your ${layoverHours}-hour layover` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowPreferences(true); setResult(null); }}
                    className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Adjust Preferences
                  </button>
                </div>

                {result.airport.transitVisaNote && (
                  <div className="mt-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">{result.airport.transitVisaNote}</p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {result.suggestions.map((item) => (
                  <div key={item.id} className="card p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-4">
                      <span className="text-3xl flex-shrink-0">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-slate-900 text-lg">{item.title}</h3>
                              {item.requiresExitAirside && (
                                <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium flex-shrink-0">
                                  Exits Airside
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-slate-600 mt-1 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" /> {item.duration}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" /> {item.distance}
                              </span>
                              <span>{item.cost}</span>
                              <span>⭐ {item.rating.toFixed(1)}</span>
                            </div>
                          </div>
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${categoryColors[item.category] ?? 'bg-slate-100 text-slate-700'}`}>
                            {item.category}
                          </span>
                        </div>

                        <p className="text-sm text-slate-700 mt-2">{item.description}</p>
                        <p className="text-xs text-slate-500 mt-1">{item.location}</p>

                        {item.bookingTip && (
                          <p className="text-xs text-sky-700 mt-1.5 font-medium">💡 {item.bookingTip}</p>
                        )}

                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => toggleSaved(item.id)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                              savedItems.has(item.id)
                                ? 'bg-green-100 text-green-700'
                                : 'bg-sky-100 text-sky-800 hover:bg-sky-200'
                            }`}
                          >
                            {savedItems.has(item.id) ? '✓ Saved to Trip' : '+ Add to Trip'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
