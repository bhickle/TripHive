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

// A saved layover plan ("mini-trip"): airport + time + the activities the user
// added, persisted to their account (api/layovers).
interface SavedLayover {
  id: string;
  airportCode: string;
  airportName: string | null;
  city: string | null;
  country: string | null;
  layoverHours: number | null;
  title: string | null;
  items: LayoverSuggestion[];
  createdAt: string;
  updatedAt: string;
}

// ─── Day-pass shortcut strips ────────────────────────────────────────────────
// Plain links to third-party day-pass services. Affiliate IDs can be added
// later via env vars (RESORTPASS_AFFILIATE_ID, etc.) without touching the UI.
// Only LoungeBuddy has a reliable public airport-page URL pattern; the others
// land on a homepage / search page since their deep-link formats are
// JS-driven and easy to break.

function HotelDayRoomStrip({ city }: { city: string }) {
  const q = encodeURIComponent(city);
  // utm_source kept simple — switch to a per-link affiliate URL when programs are enrolled.
  const links = [
    { label: 'ResortPass',     href: `https://www.resortpass.com/?utm_source=tripcoord` },
    { label: 'DayUse',         href: `https://www.dayuse.com/search?q=${q}&utm_source=tripcoord` },
    { label: 'DayBreak Hotels', href: `https://www.daybreakhotels.com/?utm_source=tripcoord` },
  ];
  return (
    <div className="mb-4 p-4 bg-violet-50/60 border border-violet-200 rounded-xl">
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0">💧</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-violet-900 mb-1">Search day rooms near {city}</p>
          <p className="text-xs text-violet-700 mb-3 leading-relaxed">
            Day-use rooms include pool, spa, and gym access — ideal for a refresh between flights.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {links.map(l => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-violet-300 rounded-full text-xs font-semibold text-violet-800 hover:bg-violet-100 transition-colors"
              >
                {l.label}
                <span className="text-violet-400">↗</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoungeDayPassStrip({ airportCode }: { airportCode: string }) {
  const code = airportCode.toUpperCase();
  const links = [
    { label: 'Priority Pass', href: `https://www.prioritypass.com/?utm_source=tripcoord` },
    // LoungeBuddy hosts public per-airport pages at /airports/<code>
    { label: 'LoungeBuddy',   href: `https://loungebuddy.com/airports/${code}?utm_source=tripcoord` },
  ];
  return (
    <div className="mb-3 p-4 bg-purple-50/60 border border-purple-200 rounded-xl">
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">🛋️</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-sm font-semibold text-purple-900">No lounge access via your card?</p>
            <span className="text-[10px] px-2 py-0.5 bg-purple-200 text-purple-800 rounded-full font-bold uppercase tracking-wide">Day Pass</span>
          </div>
          <p className="text-xs text-purple-700 mb-3 leading-relaxed">
            Most major airports sell single-visit lounge passes (~$30–60). Worth it for a 2+ hr break with food, Wi-Fi, and quiet seating.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {links.map(l => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-purple-300 rounded-full text-xs font-semibold text-purple-800 hover:bg-purple-100 transition-colors"
              >
                {l.label}
                <span className="text-purple-400">↗</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Duration parsing (best-effort) ───────────────────────────────────────────
// Suggestion durations are free text ("3 hrs", "1.5 hours", "45 min", "in
// terminal"). Parse a rough hour value for the time-fit indicator; return 0 when
// we can't, so unparseable items simply don't count toward the planned total.
function parseDurationHours(d: string): number {
  if (!d) return 0;
  const s = d.toLowerCase();
  const hr = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  if (hr) return parseFloat(hr[1]);
  const min = s.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  if (min) return parseFloat(min[1]) / 60;
  return 0;
}

// ─── My Layover basket panel ───────────────────────────────────────────────────
function MyLayoverPanel({
  items, airportLabel, hours, saved, saving, onRemove, onMove, onClear, onSave,
}: {
  items: LayoverSuggestion[];
  airportLabel: string;
  hours: number;
  saved: boolean;
  saving: boolean;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onClear: () => void;
  onSave: () => void;
}) {
  const plannedHours = items.reduce((sum, it) => sum + parseDurationHours(it.duration), 0);
  const overBudget = hours > 0 && plannedHours > hours;
  return (
    <div className="card p-4 border-2 border-sky-200 sticky top-4">
      <div className="flex items-center justify-between mb-1 gap-2">
        <h3 className="font-script italic text-lg font-semibold text-zinc-900">My Layover</h3>
        {airportLabel && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 whitespace-nowrap">
            {airportLabel}{hours > 0 ? ` · ${hours} hr` : ''}
          </span>
        )}
      </div>
      {items.length > 0 && (
        <p className={`text-[11px] mb-3 ${overBudget ? 'text-amber-600 font-medium' : 'text-zinc-400'}`}>
          {plannedHours > 0 ? `~${plannedHours.toFixed(1)} hr planned` : `${items.length} item${items.length !== 1 ? 's' : ''}`}
          {plannedHours > 0 && hours > 0 ? ` of ${hours}` : ''}{overBudget ? ' · over your layover' : ''}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-zinc-400 py-6 text-center">
          Add activities from the suggestions to build your layover.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={it.id} className="flex items-start gap-2 p-2 rounded-lg bg-stone-50 border border-zinc-100">
              <span className="text-xs font-bold text-zinc-400 mt-0.5 w-4 text-center flex-shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-800 leading-snug">{it.title}</p>
                <p className="text-[11px] text-zinc-400">
                  {it.duration}{it.distance ? ` · ${it.distance}` : ''}{it.requiresExitAirside ? ' · ⚠ exits airside' : ''}
                </p>
              </div>
              <div className="flex flex-col gap-0.5 flex-shrink-0 text-zinc-300 leading-none">
                <button onClick={() => onMove(it.id, -1)} disabled={i === 0} title="Move up" className="hover:text-zinc-600 disabled:opacity-30 text-[10px]">▲</button>
                <button onClick={() => onMove(it.id, 1)} disabled={i === items.length - 1} title="Move down" className="hover:text-zinc-600 disabled:opacity-30 text-[10px]">▼</button>
              </div>
              <button onClick={() => onRemove(it.id)} title="Remove" className="text-zinc-300 hover:text-rose-500 flex-shrink-0 text-sm">✕</button>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="mt-3 flex items-center justify-between">
            <button onClick={onClear} className="text-[11px] text-zinc-400 hover:text-zinc-600">Clear all</button>
            <span className="text-[11px] text-zinc-400">{saving ? 'Saving…' : saved ? 'Saved ✓' : ''}</span>
          </div>
          {!saved && (
            <button
              onClick={onSave}
              disabled={saving}
              className="w-full mt-2 px-4 py-2 bg-sky-800 hover:bg-sky-900 disabled:bg-slate-300 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              Save this layover
            </button>
          )}
        </>
      )}
    </div>
  );
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

  // Keep the visible input in sync with the parent's selectedCode — not only on
  // clear. Without setting it when value is present, restoring a saved layover
  // or clicking a popular airport left the field blank while selectedCode was
  // set, so the "Find Activities" button looked usable but was greyed out (the
  // "stuck button on return" bug).
  useEffect(() => {
    if (!value) { setQuery(''); return; }
    const a = AIRPORTS.find(x => x.code === value);
    setQuery(a ? `${a.code} — ${a.city}` : value);
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

  // Load the user's saved layovers for the switcher.
  useEffect(() => {
    if (currentUser.isLoading || currentUser.isDemo || !currentUser.id) return;
    fetch('/api/layovers')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (Array.isArray(data?.layovers)) setSavedLayovers(data.layovers as SavedLayover[]); })
      .catch(() => {});
  }, [currentUser.isLoading, currentUser.isDemo, currentUser.id]);

  const [selectedCode, setSelectedCode] = useState('');
  const [layoverHours, setLayoverHours] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState<LayoverResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [basket, setBasket] = useState<LayoverSuggestion[]>([]);
  const [savedLayovers, setSavedLayovers] = useState<SavedLayover[]>([]);
  const [currentLayoverId, setCurrentLayoverId] = useState<string | null>(null);
  const [savingLayover, setSavingLayover] = useState(false);
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

  // Aligned with the main Trip Builder priorities (src/app/trip/new/Client.tsx)
  // so long / multi-day layovers (Iceland, Singapore, Doha programs) get the
  // same selection model the user is used to from the main flow. Sports +
  // Theme Parks omitted — not realistic for any layover ≤ 24 hrs. Beach also
  // dropped because it depends heavily on airport geography and the AI can
  // surface a beach-friendly layover under sightseeing/adventure where applicable.
  const priorityOptions = [
    { id: 'food', label: 'Food', icon: '🍽️' },
    { id: 'shopping', label: 'Shopping', icon: '🛍️' },
    { id: 'culture', label: 'Culture', icon: '🏛️' },
    { id: 'history', label: 'History', icon: '📜' },
    { id: 'nature', label: 'Nature', icon: '🌿' },
    { id: 'photography', label: 'Photography', icon: '📷' },
    { id: 'wellness', label: 'Wellness', icon: '💆' },
    { id: 'nightlife', label: 'Nightlife', icon: '🎶' },
    { id: 'adventure', label: 'Adventure', icon: '⚡' },
    { id: 'family', label: 'Family/Kids', icon: '👨‍👩‍👧' },
    // Layover-specific addition — "Relaxation" matches the existing layover
    // semantics (rest, lounges, spa, hotel day-use rooms) which doesn't have
    // a 1:1 in the main priorities list. Kept here so airside-only layovers
    // still have a meaningful option.
    { id: 'relaxation', label: 'Relaxation', icon: '🧘' },
    // "Sightseeing" kept as a synonym for casual exploration — main-builder
    // doesn't have it but layover users naturally reach for it for "tour
    // the highlights" requests.
    { id: 'sightseeing', label: 'Sightseeing', icon: '📸' },
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
    if (!searchCode || !hoursNum) return; // both airport + time are required
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

  // ── My Layover basket ──────────────────────────────────────────────────────
  // Persist the basket to the loaded saved layover (if any). Fire-and-forget;
  // the UI basket is the source of truth.
  const persistBasket = useCallback((items: LayoverSuggestion[]) => {
    if (!currentLayoverId || currentUser.isDemo) return;
    fetch(`/api/layovers/${currentLayoverId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, layoverHours: hoursNum || undefined }),
    }).catch(() => {});
  }, [currentLayoverId, currentUser.isDemo, hoursNum]);

  const isInBasket = (id: string) => basket.some(b => b.id === id);

  const addToBasket = (item: LayoverSuggestion) => {
    if (basket.some(b => b.id === item.id)) return;
    const next = [...basket, item];
    setBasket(next);
    persistBasket(next);
  };
  const removeFromBasket = (id: string) => {
    const next = basket.filter(b => b.id !== id);
    setBasket(next);
    persistBasket(next);
  };
  const moveInBasket = (id: string, dir: -1 | 1) => {
    const idx = basket.findIndex(b => b.id === id);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= basket.length) return;
    const next = [...basket];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setBasket(next);
    persistBasket(next);
  };
  const clearBasket = () => { setBasket([]); persistBasket([]); };

  // ── Saved layovers ───────────────────────────────────────────────────────────
  const loadLayover = (id: string) => {
    const lay = savedLayovers.find(l => l.id === id);
    if (!lay) return;
    setCurrentLayoverId(lay.id);
    setBasket(Array.isArray(lay.items) ? lay.items : []);
    setSelectedCode(lay.airportCode);
    setLayoverHours(lay.layoverHours ? String(lay.layoverHours) : '');
    setResult(null);
    setShowPreferences(false);
    setError(null);
  };

  const startNewLayover = () => {
    setCurrentLayoverId(null);
    setBasket([]);
    setResult(null);
    setError(null);
  };

  const saveLayover = async () => {
    if (currentLayoverId || basket.length === 0 || savingLayover) return;
    setSavingLayover(true);
    try {
      const airport = result?.airport;
      const fallback = AIRPORTS.find(a => a.code === selectedCode);
      const res = await fetch('/api/layovers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          airportCode: selectedCode,
          airportName: airport?.name ?? fallback?.name ?? null,
          city: airport?.city ?? fallback?.city ?? null,
          country: airport?.country ?? null,
          layoverHours: hoursNum || undefined,
          title: `${selectedCode}${hoursNum ? ` · ${hoursNum} hr` : ''} layover`,
          items: basket,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.layover) {
        setCurrentLayoverId(data.layover.id);
        setSavedLayovers(prev => [data.layover, ...prev]);
      }
    } finally {
      setSavingLayover(false);
    }
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

          {/* Saved layovers switcher — only once the user has saved at least one */}
          {savedLayovers.length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-xs text-zinc-500">Saved layovers:</span>
              <select
                value={currentLayoverId ?? ''}
                onChange={(e) => { const v = e.target.value; if (v) loadLayover(v); else startNewLayover(); }}
                className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-sky-700"
              >
                <option value="">— New layover —</option>
                {savedLayovers.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.title || `${l.airportCode}${l.layoverHours ? ` · ${l.layoverHours} hr` : ''}`}
                  </option>
                ))}
              </select>
              {currentLayoverId && (
                <button
                  onClick={startNewLayover}
                  className="text-xs px-3 py-1.5 bg-sky-50 text-sky-800 hover:bg-sky-100 rounded-full font-medium transition-colors"
                >
                  + New layover
                </button>
              )}
            </div>
          )}

          {/* Search Form */}
          <div className="card p-6 mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-zinc-700 mb-2">Airport <span className="text-rose-500">*</span></label>
                <AirportSearch
                  value={selectedCode}
                  onSelect={(code) => setSelectedCode(code)}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-zinc-700 mb-2">Layover Duration <span className="text-rose-500">*</span></label>
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
                    onClick={() => setSelectedCode(a.code)}
                    className="text-xs px-3 py-1.5 bg-sky-50 text-sky-800 hover:bg-sky-100 rounded-full font-medium transition-colors"
                  >
                    {a.code} — {a.city}
                  </button>
                ))}
              </div>
              <button
                onClick={() => handleSearch()}
                disabled={!selectedCode || !hoursNum || isSearching}
                className="px-6 py-3 bg-sky-800 hover:bg-sky-900 disabled:bg-slate-300 text-white rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isSearching ? 'Generating…' : 'Find Activities'}
              </button>
            </div>
            {(!selectedCode || !hoursNum) && (
              <p className="text-xs text-rose-500 mt-3">Enter an airport and layover time to find activities.</p>
            )}
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
          {(result || basket.length > 0 || currentLayoverId !== null) && !isSearching && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2 min-w-0">
              {result ? (
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
                {/* Lounge day-pass shortcut — slotted at the top of the list. Always
                    relevant: short layovers benefit most (a 2-hr lounge pass is the
                    best short-stop move), medium/long layovers also useful. */}
                <LoungeDayPassStrip airportCode={result.airport.code} />
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
                            onClick={() => isInBasket(item.id) ? removeFromBasket(item.id) : addToBasket(item)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                              isInBasket(item.id)
                                ? 'bg-green-100 text-green-700'
                                : 'bg-sky-100 text-sky-800 hover:bg-sky-200'
                            }`}
                          >
                            {isInBasket(item.id) ? '✓ Added' : '+ Add to layover'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Hotel day-room strip — medium layovers only (3–6 hr).
                  Long layovers get this same strip nested inside the Rest &
                  Recharge section below, alongside the AI's hotel picks. */}
              {(() => {
                const hours = parseFloat(layoverHours) || 0;
                const hasAiHotels = !!result.hotelSuggestions && result.hotelSuggestions.length > 0;
                if (hours >= 3 && hours < 6 && !hasAiHotels) {
                  return (
                    <div className="mb-8">
                      <div className="flex items-center gap-2 mb-4">
                        <Hotel className="w-5 h-5 text-violet-600" />
                        <h3 className="font-script italic text-lg font-semibold text-zinc-900">Hotel Day Rooms</h3>
                        <span className="text-xs px-2.5 py-1 bg-violet-100 text-violet-700 rounded-full font-medium">
                          Quick refresh
                        </span>
                      </div>
                      <HotelDayRoomStrip city={result.airport.city} />
                    </div>
                  );
                }
                return null;
              })()}

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
                  {/* Day-room booking shortcut, above the AI hotel picks */}
                  <HotelDayRoomStrip city={result.airport.city} />
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
              ) : (
                <div className="card p-8 text-center text-zinc-500">
                  <p className="text-sm">
                    Search an airport and hit <span className="font-semibold">Find Activities</span> to add suggestions to this layover.
                  </p>
                </div>
              )}
              </div>

              {/* My Layover basket — sticky sidebar (stacks below on mobile) */}
              <div className="lg:col-span-1">
                <MyLayoverPanel
                  items={basket}
                  airportLabel={result?.airport.code ?? selectedCode}
                  hours={hoursNum}
                  saved={!!currentLayoverId}
                  saving={savingLayover}
                  onRemove={removeFromBasket}
                  onMove={moveInBasket}
                  onClear={clearBasket}
                  onSave={saveLayover}
                />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
