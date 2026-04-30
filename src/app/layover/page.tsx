'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  Plane,
  Clock,
  MapPin,
  ChevronLeft,
  Loader2,
  Sparkles,
  AlertTriangle,
  Info,
  Search,
  Hotel,
  Star,
} from 'lucide-react';
import Link from 'next/link';

// ─── Airport lookup data ──────────────────────────────────────────────────────

interface AirportOption {
  code: string;
  city: string;
  name: string;
}

const AIRPORTS: AirportOption[] = [
  { code: 'ATL', city: 'Atlanta', name: 'Hartsfield-Jackson Atlanta International' },
  { code: 'PEK', city: 'Beijing', name: 'Beijing Capital International' },
  { code: 'PKX', city: 'Beijing', name: 'Beijing Daxing International' },
  { code: 'DXB', city: 'Dubai', name: 'Dubai International' },
  { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles International' },
  { code: 'HND', city: 'Tokyo', name: 'Tokyo Haneda' },
  { code: 'NRT', city: 'Tokyo', name: 'Tokyo Narita' },
  { code: 'ORD', city: 'Chicago', name: "O'Hare International" },
  { code: 'MDW', city: 'Chicago', name: 'Chicago Midway International' },
  { code: 'LHR', city: 'London', name: 'London Heathrow' },
  { code: 'LGW', city: 'London', name: 'London Gatwick' },
  { code: 'STN', city: 'London', name: 'London Stansted' },
  { code: 'CDG', city: 'Paris', name: 'Charles de Gaulle' },
  { code: 'ORY', city: 'Paris', name: 'Paris Orly' },
  { code: 'AMS', city: 'Amsterdam', name: 'Amsterdam Schiphol' },
  { code: 'DFW', city: 'Dallas', name: 'Dallas/Fort Worth International' },
  { code: 'DAL', city: 'Dallas', name: 'Dallas Love Field' },
  { code: 'CAN', city: 'Guangzhou', name: 'Guangzhou Baiyun International' },
  { code: 'ICN', city: 'Seoul', name: 'Incheon International' },
  { code: 'GMP', city: 'Seoul', name: 'Gimpo International' },
  { code: 'DEL', city: 'Delhi', name: 'Indira Gandhi International' },
  { code: 'BOM', city: 'Mumbai', name: 'Chhatrapati Shivaji Maharaj International' },
  { code: 'FRA', city: 'Frankfurt', name: 'Frankfurt Airport' },
  { code: 'IST', city: 'Istanbul', name: 'Istanbul Airport' },
  { code: 'SAW', city: 'Istanbul', name: 'Istanbul Sabiha Gökçen' },
  { code: 'SIN', city: 'Singapore', name: 'Singapore Changi' },
  { code: 'SFO', city: 'San Francisco', name: 'San Francisco International' },
  { code: 'OAK', city: 'Oakland', name: 'Oakland International' },
  { code: 'JFK', city: 'New York', name: 'John F. Kennedy International' },
  { code: 'EWR', city: 'Newark', name: 'Newark Liberty International' },
  { code: 'LGA', city: 'New York', name: 'LaGuardia Airport' },
  { code: 'MIA', city: 'Miami', name: 'Miami International' },
  { code: 'FLL', city: 'Fort Lauderdale', name: 'Fort Lauderdale-Hollywood International' },
  { code: 'MUC', city: 'Munich', name: 'Munich Airport' },
  { code: 'MAD', city: 'Madrid', name: 'Adolfo Suárez Madrid-Barajas' },
  { code: 'BCN', city: 'Barcelona', name: 'Josep Tarradellas Barcelona-El Prat' },
  { code: 'SYD', city: 'Sydney', name: 'Sydney Kingsford Smith' },
  { code: 'MEL', city: 'Melbourne', name: 'Melbourne Airport' },
  { code: 'BNE', city: 'Brisbane', name: 'Brisbane Airport' },
  { code: 'PER', city: 'Perth', name: 'Perth Airport' },
  { code: 'BKK', city: 'Bangkok', name: 'Suvarnabhumi Airport' },
  { code: 'DMK', city: 'Bangkok', name: 'Don Mueang International' },
  { code: 'KUL', city: 'Kuala Lumpur', name: 'Kuala Lumpur International' },
  { code: 'HKG', city: 'Hong Kong', name: 'Hong Kong International' },
  { code: 'CGK', city: 'Jakarta', name: 'Soekarno-Hatta International' },
  { code: 'DOH', city: 'Doha', name: 'Hamad International' },
  { code: 'AUH', city: 'Abu Dhabi', name: 'Zayed International' },
  { code: 'ZRH', city: 'Zurich', name: 'Zurich Airport' },
  { code: 'VIE', city: 'Vienna', name: 'Vienna International' },
  { code: 'BRU', city: 'Brussels', name: 'Brussels Airport' },
  { code: 'ARN', city: 'Stockholm', name: 'Stockholm Arlanda' },
  { code: 'CPH', city: 'Copenhagen', name: 'Copenhagen Airport' },
  { code: 'OSL', city: 'Oslo', name: 'Oslo Gardermoen' },
  { code: 'HEL', city: 'Helsinki', name: 'Helsinki-Vantaa' },
  { code: 'LIS', city: 'Lisbon', name: 'Humberto Delgado Airport' },
  { code: 'FCO', city: 'Rome', name: 'Leonardo da Vinci–Fiumicino' },
  { code: 'MXP', city: 'Milan', name: 'Milan Malpensa' },
  { code: 'LIN', city: 'Milan', name: 'Milan Linate' },
  { code: 'GRU', city: 'São Paulo', name: 'São Paulo/Guarulhos International' },
  { code: 'EZE', city: 'Buenos Aires', name: 'Ministro Pistarini International' },
  { code: 'BOG', city: 'Bogotá', name: 'El Dorado International' },
  { code: 'LIM', city: 'Lima', name: 'Jorge Chávez International' },
  { code: 'MEX', city: 'Mexico City', name: 'Benito Juárez International' },
  { code: 'CUN', city: 'Cancún', name: 'Cancún International' },
  { code: 'YYZ', city: 'Toronto', name: 'Toronto Pearson International' },
  { code: 'YVR', city: 'Vancouver', name: 'Vancouver International' },
  { code: 'YUL', city: 'Montreal', name: 'Montréal-Trudeau International' },
  { code: 'YYC', city: 'Calgary', name: 'Calgary International' },
  { code: 'SEA', city: 'Seattle', name: 'Seattle-Tacoma International' },
  { code: 'BOS', city: 'Boston', name: 'Logan International' },
  { code: 'IAD', city: 'Washington', name: 'Dulles International' },
  { code: 'DCA', city: 'Washington', name: 'Ronald Reagan Washington National' },
  { code: 'PHL', city: 'Philadelphia', name: 'Philadelphia International' },
  { code: 'IAH', city: 'Houston', name: 'George Bush Intercontinental' },
  { code: 'HOU', city: 'Houston', name: 'William P. Hobby Airport' },
  { code: 'MSP', city: 'Minneapolis', name: 'Minneapolis-Saint Paul International' },
  { code: 'DTW', city: 'Detroit', name: 'Detroit Metropolitan Wayne County' },
  { code: 'PHX', city: 'Phoenix', name: 'Phoenix Sky Harbor International' },
  { code: 'DEN', city: 'Denver', name: 'Denver International' },
  { code: 'LAS', city: 'Las Vegas', name: 'Harry Reid International' },
  { code: 'MAN', city: 'Manchester', name: 'Manchester Airport' },
  { code: 'DUB', city: 'Dublin', name: 'Dublin Airport' },
  { code: 'GVA', city: 'Geneva', name: 'Geneva Airport' },
  { code: 'PRG', city: 'Prague', name: 'Václav Havel Airport Prague' },
  { code: 'WAW', city: 'Warsaw', name: 'Warsaw Chopin Airport' },
  { code: 'BUD', city: 'Budapest', name: 'Budapest Ferenc Liszt International' },
  { code: 'ATH', city: 'Athens', name: 'Athens International' },
  { code: 'CMB', city: 'Colombo', name: 'Bandaranaike International' },
  { code: 'MLE', city: 'Malé', name: 'Velana International' },
  { code: 'JNB', city: 'Johannesburg', name: 'O.R. Tambo International' },
  { code: 'CPT', city: 'Cape Town', name: 'Cape Town International' },
  { code: 'CAI', city: 'Cairo', name: 'Cairo International' },
  { code: 'NBO', city: 'Nairobi', name: 'Jomo Kenyatta International' },
  { code: 'ADD', city: 'Addis Ababa', name: 'Bole International' },
  { code: 'MNL', city: 'Manila', name: 'Ninoy Aquino International' },
  { code: 'CTU', city: 'Chengdu', name: 'Chengdu Tianfu International' },
  { code: 'SZX', city: 'Shenzhen', name: "Shenzhen Bao'an International" },
  { code: 'SHA', city: 'Shanghai', name: 'Shanghai Hongqiao International' },
  { code: 'PVG', city: 'Shanghai', name: 'Shanghai Pudong International' },
  { code: 'TPE', city: 'Taipei', name: 'Taiwan Taoyuan International' },
  { code: 'KIX', city: 'Osaka', name: 'Kansai International' },
  { code: 'ITM', city: 'Osaka', name: 'Osaka Itami' },
  { code: 'KEF', city: 'Reykjavík', name: 'Keflavík International' },
  { code: 'DUB', city: 'Dubai', name: 'Dubai International' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

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

interface HotelSuggestion {
  name: string;
  stars: number;
  distanceFromAirport: string;
  priceRange: string;
  why: string;
  checkInNote?: string;
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
  hotelSuggestions?: HotelSuggestion[];
}

// ─── Airport Search Component ─────────────────────────────────────────────────

interface AirportSearchProps {
  value: string;
  onSelect: (code: string) => void;
}

function AirportSearch({ value, onSelect }: AirportSearchProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = useCallback((): AirportOption[] => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 1) return [];
    return AIRPORTS.filter(a =>
      a.code.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query]);

  // Keep local query in sync if parent clears it
  useEffect(() => {
    if (!value) setQuery('');
  }, [value]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const suggestions = matches();

  function handleSelect(airport: AirportOption) {
    setQuery(`${airport.code} — ${airport.city}`);
    setOpen(false);
    onSelect(airport.code);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    setOpen(true);
    // If user types an exact 3-letter code match, auto-select it
    const upper = e.target.value.trim().toUpperCase();
    if (upper.length === 3) {
      const exact = AIRPORTS.find(a => a.code === upper);
      if (exact) {
        onSelect(exact.code);
      } else {
        // Could be any unknown code — pass it through directly
        onSelect(upper);
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      if (suggestions.length > 0) {
        handleSelect(suggestions[0]);
      } else {
        // Treat raw input as IATA code
        const upper = query.trim().toUpperCase().slice(0, 4);
        if (upper) { onSelect(upper); setOpen(false); }
      }
    }
    if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
        <input
          type="text"
          placeholder="City, airport name, or code (e.g. Tokyo, LHR)"
          value={query}
          onChange={handleInputChange}
          onFocus={() => { if (query.trim().length >= 1) setOpen(true); }}
          onKeyDown={handleKeyDown}
          className="w-full pl-9 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 text-sm"
        />
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map(airport => (
            <button
              key={airport.code}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(airport); }}
              className="w-full px-4 py-3 text-left hover:bg-sky-50 transition-colors border-b border-slate-100 last:border-b-0"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-sky-800 text-sm w-10 flex-shrink-0">{airport.code}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{airport.name}</p>
                  <p className="text-xs text-zinc-500">{airport.city}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LayoverPlannerPage() {
  const router = useRouter();
  const currentUser = useCurrentUser();

  useEffect(() => {
    if (!currentUser.isLoading && !currentUser.id && !currentUser.isDemo) {
      router.replace('/auth/login');
    }
  }, [currentUser.isLoading, currentUser.id, currentUser.isDemo, router]);

  const [selectedCode, setSelectedCode] = useState('');
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
  const [pendingCode, setPendingCode] = useState('');

  const popularAirports: AirportOption[] = [
    { code: 'LHR', city: 'London', name: 'London Heathrow' },
    { code: 'DXB', city: 'Dubai', name: 'Dubai International' },
    { code: 'SIN', city: 'Singapore', name: 'Singapore Changi' },
    { code: 'CDG', city: 'Paris', name: 'Charles de Gaulle' },
    { code: 'NRT', city: 'Tokyo', name: 'Tokyo Narita' },
    { code: 'DOH', city: 'Doha', name: 'Hamad International' },
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

  const hoursNum = parseFloat(layoverHours) || 0;

  // Tier label for display
  function getTierLabel(hrs: number): { label: string; color: string } {
    if (hrs < 3) return { label: 'Short · Airport only', color: 'bg-green-100 text-green-700' };
    if (hrs < 6) return { label: 'Medium · Airport + terminal', color: 'bg-sky-100 text-sky-700' };
    return { label: 'Long · City + hotel options', color: 'bg-violet-100 text-violet-700' };
  }

  // Step 1 — validate the code and reveal preferences panel
  const handleSearch = (code?: string) => {
    const searchCode = (code || selectedCode).toUpperCase().trim();
    if (!searchCode) return;
    setSelectedCode(searchCode);
    setPendingCode(searchCode);
    setShowPreferences(true);
    setResult(null);
    setError(null);
  };

  // Step 2 — call the AI route
  const handleGenerateResults = async () => {
    const searchCode = pendingCode || selectedCode.toUpperCase().trim();
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
          layoverHours: hoursNum || 4,
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
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link
            href="/dashboard"
            className="flex items-center space-x-2 text-sky-700 hover:text-sky-800 mb-6 font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Link>

          <div className="mb-8">
            <h1 className="text-3xl font-script italic font-semibold text-zinc-900 flex items-center gap-3">
              <Plane className="w-8 h-8 text-sky-700" />
              Layover Planner
            </h1>
            <p className="text-zinc-600 mt-2">
              Got a layover? We'll help you make the most of your time — from quick airport bites to full city day trips.
            </p>
          </div>

          {/* Search Form */}
          <div className="card p-6 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-zinc-700 mb-2">Airport</label>
                <AirportSearch
                  value={selectedCode}
                  onSelect={(code) => setSelectedCode(code)}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-700 mb-2">Layover Duration</label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="number"
                      placeholder="Hours"
                      value={layoverHours}
                      onChange={(e) => setLayoverHours(e.target.value)}
                      min="1"
                      max="48"
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                    />
                    <span className="text-sm text-zinc-500 whitespace-nowrap">hrs</span>
                  </div>
                  {hoursNum > 0 && (
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium whitespace-nowrap ${getTierLabel(hoursNum).color}`}>
                      {getTierLabel(hoursNum).label}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-zinc-500">Popular:</span>
                {popularAirports.map(a => (
                  <button
                    key={a.code}
                    onClick={() => {
                      setSelectedCode(a.code);
                      handleSearch(a.code);
                    }}
                    className="text-xs px-3 py-1.5 bg-sky-50 text-sky-800 hover:bg-sky-100 rounded-full font-medium transition-colors"
                  >
                    {a.code} — {a.city}
                  </button>
                ))}
              </div>
              <button
                onClick={() => handleSearch()}
                disabled={!selectedCode || isSearching}
                className="px-6 py-3 bg-sky-800 hover:bg-sky-900 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isSearching ? 'Generating…' : 'Find Activities'}
              </button>
            </div>
          </div>

          {/* Preferences Panel */}
          {showPreferences && (
            <div className="card p-6 mb-8">
              <h2 className="font-script italic text-xl font-semibold text-zinc-900 mb-2">
                Customize Your Layover at {pendingCode}
              </h2>
              <p className="text-sm text-zinc-600 mb-6">
                Tell us a bit more so AI can tailor suggestions for your{' '}
                {layoverHours ? `${layoverHours}-hour` : ''} layover.
              </p>

              {/* Who's Traveling */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-zinc-900 mb-3">Who's traveling?</label>
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
                      <p className="font-semibold text-zinc-900 text-sm">{option.label}</p>
                      <p className="text-xs text-zinc-500">{option.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Travel Priorities */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-zinc-900 mb-3">
                  What are you in the mood for? <span className="text-zinc-400 font-normal">(pick any)</span>
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
                        <p className="font-medium text-zinc-900 text-sm">{priority.label}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Age Ranges */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-zinc-900 mb-3">Age Ranges in Your Group</label>
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
                          : 'border-slate-200 text-zinc-700 hover:border-sky-300'
                      }`}
                    >
                      {age}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accessibility */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-zinc-900 mb-3">Accessibility Needs</label>
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
                      <span className="text-sm font-medium text-zinc-900">{need}</span>
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
              <p className="text-lg font-semibold text-zinc-900">Finding the best layover activities…</p>
              <p className="text-sm text-zinc-500 mt-1">AI is personalizing suggestions for {pendingCode}</p>
            </div>
          )}

          {/* Error state */}
          {error && !isSearching && (
            <div className="card p-6 text-center">
              <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
              <p className="text-lg font-semibold text-zinc-900">Couldn't load suggestions</p>
              <p className="text-sm text-zinc-600 mt-1">{error}</p>
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
                    <h2 className="font-script italic text-xl font-semibold text-zinc-900">
                      {result.airport.name}
                    </h2>
                    <p className="text-sm text-zinc-600 mt-1">
                      {result.airport.city}, {result.airport.country} · {result.suggestions.length} activities
                      {layoverHours ? ` · ${layoverHours}-hour layover` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => { setShowPreferences(true); setResult(null); }}
                    className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-zinc-600 hover:bg-slate-50 transition-colors"
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

              {/* Activity suggestions */}
              <div className="space-y-4 mb-8">
                {result.suggestions.map((item) => (
                  <div key={item.id} className="card p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start gap-4">
                      <span className="text-3xl flex-shrink-0">{item.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-zinc-900 text-lg">{item.title}</h3>
                              {item.requiresExitAirside && (
                                <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium flex-shrink-0">
                                  Exits Airside
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-sm text-zinc-600 mt-1 flex-wrap">
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
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0 ${categoryColors[item.category] ?? 'bg-slate-100 text-zinc-700'}`}>
                            {item.category}
                          </span>
                        </div>

                        <p className="text-sm text-zinc-700 mt-2">{item.description}</p>
                        <p className="text-xs text-zinc-500 mt-1">{item.location}</p>

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

              {/* Hotel suggestions — only shown for 6+ hour layovers */}
              {result.hotelSuggestions && result.hotelSuggestions.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <Hotel className="w-5 h-5 text-violet-600" />
                    <h3 className="font-script italic text-lg font-semibold text-zinc-900">Rest & Recharge</h3>
                    <span className="text-xs px-2.5 py-1 bg-violet-100 text-violet-700 rounded-full font-medium">
                      Long layover hotels
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500 mb-4">
                    With {layoverHours} hours to spare, a transit hotel lets you shower, nap, or relax properly before your next flight.
                  </p>
                  <div className="space-y-3">
                    {result.hotelSuggestions.map((hotel, i) => (
                      <div key={i} className="card p-5 border-l-4 border-l-violet-400">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h4 className="font-semibold text-zinc-900">{hotel.name}</h4>
                              <div className="flex items-center gap-0.5">
                                {Array.from({ length: hotel.stars }).map((_, si) => (
                                  <Star key={si} className="w-3 h-3 fill-amber-400 text-amber-400" />
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-zinc-500 mb-2 flex-wrap">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {hotel.distanceFromAirport}
                              </span>
                              <span className="font-medium text-zinc-700">{hotel.priceRange}</span>
                            </div>
                            <p className="text-sm text-zinc-700">{hotel.why}</p>
                            {hotel.checkInNote && (
                              <p className="text-xs text-violet-700 mt-1.5 font-medium">💡 {hotel.checkInNote}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
