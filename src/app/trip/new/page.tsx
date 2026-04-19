'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { UpgradeModal, LockBadge } from '@/components/UpgradeModal';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePlacesSearch } from '@/hooks/usePlacesSearch';
import {
  ChevronLeft,
  ChevronRight,
  Users,
  MapPin,
  Calendar,
  Zap,
  Plane,
  DollarSign,
  Check,
  Loader2,
  User2,
  Users2,
  Heart,
  Lightbulb,
  Flame,
  Dice6,
  Search,
  Shuffle,
  X,
  Plus,
  Lock,
  Info,
  Crown,
} from 'lucide-react';

interface BookedFlight {
  airline: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string;
  arrivalTime: string;
  returnDepartureTime: string;
  returnArrivalTime: string;
  /** Nomad open-jaw: airport the return flight departs from (if different from arrivalAirport) */
  returnDepartureAirport?: string;
  /** Nomad open-jaw: airport the return flight arrives at (usually home airport) */
  returnArrivalAirport?: string;
}

interface BookedHotel {
  name: string;
  address: string;
  checkIn: string;
  checkOut: string;
}

interface TripWizardState {
  groupType: string;
  groupSize: number;
  destination: string;
  startDate: string;
  endDate: string;
  tripLength: number;
  flexibleDates: boolean;
  priorities: string[];
  modality: string[];
  accommodationType: string[];
  curiosityLevel: number;
  localMode: boolean;
  budget: number;
  budgetBreakdown: {
    flights: number;
    hotel: number;
    food: number;
    experiences: number;
    transport: number;
  };
  ageRanges: string[];
  accessibilityNeeds: string[];
  difficultyPrefs: Record<string, string>;
  bookedFlight: BookedFlight | null;
  bookedHotels: BookedHotel[];
  hasPreBookedFlight: boolean;
  hasPreBookedHotel: boolean;
  /** Nomad only: return flight departs from a different airport */
  isOpenJaw: boolean;
}

const priorityOptions = [
  { id: 'nature', label: 'Nature', icon: '🌿' },
  { id: 'food', label: 'Food', icon: '🍽️' },
  { id: 'nightlife', label: 'Nightlife', icon: '🎉' },
  { id: 'history', label: 'History', icon: '🏛️' },
  { id: 'sports', label: 'Sports', icon: '⚽' },
  { id: 'photography', label: 'Photography', icon: '📸' },
  { id: 'wellness', label: 'Wellness', icon: '🧘' },
  { id: 'shopping', label: 'Shopping', icon: '🛍️' },
  { id: 'adventure', label: 'Adventure', icon: '🪂' },
  { id: 'culture', label: 'Culture', icon: '🎨' },
];

const mockDestinations = [
  { name: 'Kyoto, Japan', match: 95 },
  { name: 'Barcelona, Spain', match: 91 },
  { name: 'Bali, Indonesia', match: 88 },
  { name: 'Venice, Italy', match: 85 },
  { name: 'Bangkok, Thailand', match: 82 },
];

const ageRangeOptions = [
  'Under 12',
  '12-17',
  '18-30',
  '31-50',
  '51-65',
  '65+',
];

const accessibilityOptions = [
  'Wheelchair accessible',
  'Limited mobility',
  'Visual assistance',
  'Hearing assistance',
  'No special needs',
];

const difficultyLevels = ['Easy', 'Moderate', 'Challenging'];

// Destination cost estimates (per-person, USD, for a 7-day trip baseline)
interface DestinationCosts {
  flightsPerPerson: number;   // typical round-trip from US
  hotelPerNight: number;      // mid-range hotel
  foodPerDay: number;         // 3 meals + coffee
  experiencesPerDay: number;  // tours, tickets, activities
  transportPerDay: number;    // local transit, taxis
  label: string;
}

const DESTINATION_COSTS: Record<string, DestinationCosts> = {
  // Europe
  paris: { flightsPerPerson: 700, hotelPerNight: 180, foodPerDay: 80, experiencesPerDay: 60, transportPerDay: 20, label: 'Paris' },
  france: { flightsPerPerson: 700, hotelPerNight: 160, foodPerDay: 75, experiencesPerDay: 50, transportPerDay: 18, label: 'France' },
  london: { flightsPerPerson: 650, hotelPerNight: 200, foodPerDay: 90, experiencesPerDay: 60, transportPerDay: 25, label: 'London' },
  barcelona: { flightsPerPerson: 700, hotelPerNight: 140, foodPerDay: 65, experiencesPerDay: 45, transportPerDay: 15, label: 'Barcelona' },
  spain: { flightsPerPerson: 700, hotelPerNight: 120, foodPerDay: 55, experiencesPerDay: 40, transportPerDay: 12, label: 'Spain' },
  rome: { flightsPerPerson: 700, hotelPerNight: 150, foodPerDay: 70, experiencesPerDay: 55, transportPerDay: 15, label: 'Rome' },
  italy: { flightsPerPerson: 700, hotelPerNight: 140, foodPerDay: 65, experiencesPerDay: 50, transportPerDay: 15, label: 'Italy' },
  amsterdam: { flightsPerPerson: 680, hotelPerNight: 170, foodPerDay: 75, experiencesPerDay: 50, transportPerDay: 12, label: 'Amsterdam' },
  berlin: { flightsPerPerson: 680, hotelPerNight: 120, foodPerDay: 55, experiencesPerDay: 40, transportPerDay: 10, label: 'Berlin' },
  germany: { flightsPerPerson: 680, hotelPerNight: 110, foodPerDay: 55, experiencesPerDay: 35, transportPerDay: 12, label: 'Germany' },
  // Nordic
  iceland: { flightsPerPerson: 550, hotelPerNight: 200, foodPerDay: 90, experiencesPerDay: 100, transportPerDay: 60, label: 'Iceland' },
  reykjavik: { flightsPerPerson: 550, hotelPerNight: 200, foodPerDay: 90, experiencesPerDay: 100, transportPerDay: 60, label: 'Reykjavik' },
  norway: { flightsPerPerson: 700, hotelPerNight: 180, foodPerDay: 100, experiencesPerDay: 80, transportPerDay: 25, label: 'Norway' },
  sweden: { flightsPerPerson: 700, hotelPerNight: 150, foodPerDay: 80, experiencesPerDay: 60, transportPerDay: 20, label: 'Sweden' },
  // Asia
  tokyo: { flightsPerPerson: 900, hotelPerNight: 120, foodPerDay: 40, experiencesPerDay: 60, transportPerDay: 15, label: 'Tokyo' },
  japan: { flightsPerPerson: 900, hotelPerNight: 100, foodPerDay: 40, experiencesPerDay: 55, transportPerDay: 20, label: 'Japan' },
  bali: { flightsPerPerson: 900, hotelPerNight: 80, foodPerDay: 25, experiencesPerDay: 45, transportPerDay: 20, label: 'Bali' },
  indonesia: { flightsPerPerson: 900, hotelPerNight: 80, foodPerDay: 25, experiencesPerDay: 40, transportPerDay: 15, label: 'Indonesia' },
  bangkok: { flightsPerPerson: 850, hotelPerNight: 70, foodPerDay: 20, experiencesPerDay: 35, transportPerDay: 10, label: 'Bangkok' },
  thailand: { flightsPerPerson: 850, hotelPerNight: 70, foodPerDay: 20, experiencesPerDay: 35, transportPerDay: 12, label: 'Thailand' },
  // Americas
  mexico: { flightsPerPerson: 350, hotelPerNight: 100, foodPerDay: 35, experiencesPerDay: 40, transportPerDay: 20, label: 'Mexico' },
  cancun: { flightsPerPerson: 350, hotelPerNight: 150, foodPerDay: 50, experiencesPerDay: 60, transportPerDay: 25, label: 'Cancun' },
  colombia: { flightsPerPerson: 500, hotelPerNight: 80, foodPerDay: 25, experiencesPerDay: 35, transportPerDay: 15, label: 'Colombia' },
  peru: { flightsPerPerson: 600, hotelPerNight: 90, foodPerDay: 30, experiencesPerDay: 60, transportPerDay: 20, label: 'Peru' },
  // Default / USA
  default: { flightsPerPerson: 600, hotelPerNight: 150, foodPerDay: 60, experiencesPerDay: 50, transportPerDay: 20, label: 'Your Destination' },
};

function getDestinationCosts(destination: string): DestinationCosts {
  const dest = destination.toLowerCase();
  for (const [key, costs] of Object.entries(DESTINATION_COSTS)) {
    if (key !== 'default' && dest.includes(key)) return costs;
  }
  return DESTINATION_COSTS.default;
}

function calcBudgetFromDestination(destination: string, tripLength: number): {
  flights: number; hotel: number; food: number; experiences: number; transport: number;
} {
  const costs = getDestinationCosts(destination);
  const nights = tripLength - 1;
  return {
    flights: Math.round(costs.flightsPerPerson / 50) * 50,
    hotel: Math.round(costs.hotelPerNight * nights / 50) * 50,
    food: Math.round(costs.foodPerDay * tripLength / 50) * 50,
    experiences: Math.round(costs.experiencesPerDay * tripLength / 50) * 50,
    transport: Math.round(costs.transportPerDay * tripLength / 10) * 10,
  };
}

// Style multiplier: 0 = backpacker (0.45×), 50 = mid-range (1.0×), 100 = luxury (2.4×)
const STYLE_BREAKPOINTS: [number, number][] = [[0, 0.45], [25, 0.70], [50, 1.00], [75, 1.55], [100, 2.40]];
function getStyleMultiplier(level: number): number {
  for (let i = STYLE_BREAKPOINTS.length - 1; i >= 0; i--) {
    if (level >= STYLE_BREAKPOINTS[i][0]) {
      if (i === STYLE_BREAKPOINTS.length - 1) return STYLE_BREAKPOINTS[i][1];
      const [lo, loM] = STYLE_BREAKPOINTS[i];
      const [hi, hiM] = STYLE_BREAKPOINTS[i + 1];
      return loM + ((level - lo) / (hi - lo)) * (hiM - loM);
    }
  }
  return 1.0;
}

function calcBudgetFromStyle(destination: string, tripLength: number, curiosityLevel: number): {
  flights: number; hotel: number; food: number; experiences: number; transport: number;
} {
  const costs = getDestinationCosts(destination);
  const nights = tripLength - 1;
  const m = getStyleMultiplier(curiosityLevel);
  return {
    flights: Math.round(costs.flightsPerPerson * m / 50) * 50,
    hotel: Math.round(costs.hotelPerNight * nights * m / 50) * 50,
    food: Math.round(costs.foodPerDay * tripLength * m / 25) * 25,
    experiences: Math.round(costs.experiencesPerDay * tripLength * m / 25) * 25,
    transport: Math.round(costs.transportPerDay * tripLength * m / 10) * 10,
  };
}

function TripBuilderPage() {
  const currentUser = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFirstTrip = searchParams.get('firsttrip') === 'true';
  const [currentStep, setCurrentStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [daysReceived, setDaysReceived] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const { canAffordAction, getUpgradePrompt, maxTripDays, tier } = useEntitlements();
  const [budgetInput, setBudgetInput] = useState('5000');
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const [state, setState] = useState<TripWizardState>({
    groupType: '',
    groupSize: 2,
    destination: '',
    startDate: '',
    endDate: '',
    tripLength: 7,
    flexibleDates: false,
    priorities: [],
    modality: [],
    accommodationType: ['hotel'],
    curiosityLevel: 50,
    localMode: false,
    budget: 5000,
    budgetBreakdown: {
      flights: 800,
      hotel: 900,
      food: 600,
      experiences: 500,
      transport: 200,
    },
    ageRanges: [],
    accessibilityNeeds: [],
    difficultyPrefs: {},
    bookedFlight: null,
    bookedHotels: [],
    hasPreBookedFlight: false,
    hasPreBookedHotel: false,
    isOpenJaw: false,
  });

  const [showDestinationSuggestions, setShowDestinationSuggestions] =
    useState(false);
  const [budgetAutoFilled, setBudgetAutoFilled] = useState(false);

  // Destination typeahead — powered by world cities dataset
  const {
    suggestions: destSuggestions,
    loading: destLoading,
    setQuery: setDestQuery,
  } = usePlacesSearch(150, '/api/destinations/search');

  // Load profile from onboarding if coming from first-trip flow
  useEffect(() => {
    if (!isFirstTrip) return;
    try {
      const raw = localStorage.getItem('tripcoord_profile');
      if (!raw) return;
      const profile = JSON.parse(raw);
      if (profile.name) setWelcomeName(profile.name);
      if (profile.groupType) setState(prev => ({ ...prev, groupType: profile.groupType }));
    } catch {
      // ignore
    }
  }, [isFirstTrip]);

  // Pre-fill destination (and optionally trip length) from wishlist "Plan This Trip"
  useEffect(() => {
    const destination = searchParams.get('destination');
    const days = searchParams.get('days');
    if (!destination) return;
    setState(prev => ({
      ...prev,
      destination,
      ...(days ? { tripLength: parseInt(days, 10) } : {}),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep budgetInput in sync when budget changes from breakdown sliders
  React.useEffect(() => {
    setBudgetInput(state.budget.toString());
  }, [state.budget]);

  // Auto-fill budget when destination or trip length changes
  const prevDestRef = React.useRef('');
  React.useEffect(() => {
    if (state.destination && state.destination !== prevDestRef.current && state.destination.length > 3) {
      prevDestRef.current = state.destination;
      const breakdown = calcBudgetFromDestination(state.destination, state.tripLength);
      const total = Object.values(breakdown).reduce((s: number, v: number) => s + v, 0);
      setState(prev => ({ ...prev, budgetBreakdown: breakdown, budget: total }));
      setBudgetInput(total.toString());
      setBudgetAutoFilled(true);
    }
  }, [state.destination, state.tripLength]);

  const handleNext = () => {
    if (currentStep < 8) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const togglePriority = (priorityId: string) => {
    setState((prev) => ({
      ...prev,
      priorities: prev.priorities.includes(priorityId)
        ? prev.priorities.filter((p) => p !== priorityId)
        : [...prev.priorities, priorityId],
    }));
  };

  const toggleAgeRange = (ageRange: string) => {
    setState((prev) => ({
      ...prev,
      ageRanges: prev.ageRanges.includes(ageRange)
        ? prev.ageRanges.filter((a) => a !== ageRange)
        : [...prev.ageRanges, ageRange],
    }));
  };

  const toggleAccessibilityNeed = (need: string) => {
    setState((prev) => {
      if (need === 'No special needs') {
        // Clicking "No special needs" clears all other selections
        return { ...prev, accessibilityNeeds: [] };
      }
      // Selecting any real need removes implicit "no needs" state
      const next = prev.accessibilityNeeds.includes(need)
        ? prev.accessibilityNeeds.filter((a) => a !== need)
        : [...prev.accessibilityNeeds.filter((a) => a !== 'No special needs'), need];
      return { ...prev, accessibilityNeeds: next };
    });
  };

  const toggleModality = (id: string) => {
    setState((prev) => ({
      ...prev,
      modality: prev.modality.includes(id)
        ? prev.modality.filter((m) => m !== id)
        : [...prev.modality, id],
    }));
  };

  const toggleAccommodationType = (id: string) => {
    setState((prev) => ({
      ...prev,
      accommodationType: prev.accommodationType.includes(id)
        ? prev.accommodationType.filter((a) => a !== id)
        : [...prev.accommodationType, id],
    }));
  };

  const handleSurpriseMe = () => {
    const randomIndex = Math.floor(Math.random() * mockDestinations.length);
    const randomDestination = mockDestinations[randomIndex];
    setState((prev) => ({
      ...prev,
      destination: randomDestination.name,
    }));
    setShowDestinationSuggestions(false);
  };

  const [generationStatus, setGenerationStatus] = useState('');
  const [generationError, setGenerationError] = useState('');

  const LOADING_MESSAGES = [
    `Researching the best spots in ${state.destination || 'your destination'}…`,
    'Crafting the perfect daily rhythm…',
    'Finding hidden gems off the tourist trail…',
    'Balancing must-sees with breathing room…',
    'Checking seasonal highlights and local tips…',
    'Timing activities to avoid the crowds…',
    "Personalizing for your group's priorities…",
    'Adding the finishing touches…',
  ];

  const handleGenerateItinerary = async () => {
    setIsGenerating(true);
    setGenerationError('');
    setDaysReceived(0);
    setGenerationStatus('Crafting your itinerary…');

    try {
      const res = await fetch('/api/generate-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: state.destination,
          startDate: state.startDate || '2026-09-15',
          endDate: state.endDate || '2026-09-21',
          tripLength: state.tripLength || 7,
          groupType: state.groupType,
          priorities: state.priorities,
          budget: state.budget,
          budgetBreakdown: state.budgetBreakdown,
          ageRanges: state.ageRanges,
          accessibilityNeeds: state.accessibilityNeeds,
          localMode: state.localMode,
          curiosityLevel: state.curiosityLevel,
          modality: state.modality.join(', '),
          accommodationType: state.accommodationType.join(', '),
          bookedFlight: state.hasPreBookedFlight ? state.bookedFlight : null,
          bookedHotels: state.hasPreBookedHotel ? state.bookedHotels.filter(h => h.name.trim()) : [],
        }),
      });

      // Pre-stream errors (NO_API_KEY, TRIP_LENGTH_LIMIT, etc.) come back as JSON
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || !contentType.includes('text/event-stream')) {
        const data = await res.json();
        if (data.error === 'NO_API_KEY') {
          setGenerationStatus('Loading your demo itinerary…');
          await new Promise(r => setTimeout(r, 800));
          router.push('/trip/trip_1/itinerary');
          return;
        }
        throw new Error(data.message || 'Generation failed');
      }

      // ── Read the SSE stream ──────────────────────────────────────────────────
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const collectedDays: any[] = [];
      let tripMeta: { title?: string; practicalNotes?: unknown; hotelSuggestions?: unknown } = {};
      const totalDays = state.tripLength || 7;

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });

        // SSE events are delimited by \n\n
        const events = sseBuffer.split('\n\n');
        sseBuffer = events.pop() ?? ''; // keep incomplete trailing event

        for (const rawEvent of events) {
          for (const line of rawEvent.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            let parsed: Record<string, unknown>;
            try { parsed = JSON.parse(line.slice(6)); } catch { continue; }

            switch (parsed.type) {
              case 'meta':
                tripMeta = {
                  title: parsed.title as string | undefined,
                  practicalNotes: parsed.practicalNotes,
                  hotelSuggestions: parsed.hotelSuggestions,
                };
                break;

              case 'day': {
                const idx = parsed.index as number;
                collectedDays[idx] = parsed.data;
                const received = idx + 1;
                setDaysReceived(received);
                setGenerationStatus(`Building Day ${received} of ${totalDays}…`);
                break;
              }

              case 'done':
                break outer;

              case 'error':
                throw new Error((parsed.message as string) || 'Generation failed');
            }
          }
        }
      }

      // ── All days received — build meta and save ──────────────────────────────
      setGenerationStatus('Saving your trip…');

      const tripMetaFull = {
        destination: state.destination,
        startDate: state.startDate,
        endDate: state.endDate,
        groupType: state.groupType,
        groupSize: state.groupSize,
        budget: state.budget,
        budgetBreakdown: state.budgetBreakdown,
        bookedHotels: state.hasPreBookedHotel ? state.bookedHotels.filter(h => h.name.trim()) : [],
        bookedFlight: state.hasPreBookedFlight ? state.bookedFlight : null,
        preferences: {
          priorities: state.priorities,
          modality: state.modality,
          accommodationType: state.accommodationType,
          localMode: state.localMode,
          curiosityLevel: state.curiosityLevel,
          ageRanges: state.ageRanges,
          accessibilityNeeds: state.accessibilityNeeds,
        },
        title: tripMeta.title || null,
        practicalNotes: tripMeta.practicalNotes || null,
        hotelSuggestions: tripMeta.hotelSuggestions || null,
      };

      // Always write to localStorage as a fallback
      localStorage.setItem('generatedItinerary', JSON.stringify(collectedDays));
      localStorage.setItem('generatedTripMeta', JSON.stringify(tripMetaFull));

      // Try to persist to Supabase and get a real trip ID
      let tripId = 'trip_1';
      try {
        const saveRes = await fetch('/api/trips/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tripMeta: tripMetaFull, itinerary: collectedDays }),
        });
        if (saveRes.ok) {
          const saveData = await saveRes.json();
          if (saveData.tripId) {
            tripId = saveData.tripId;
            localStorage.setItem('currentTripId', tripId);
          }
        }
      } catch {
        // Supabase save failed — localStorage fallback already set, continue
      }

      setGenerationStatus('Your itinerary is ready ✦');
      await new Promise(r => setTimeout(r, 700));
      router.push(`/trip/${tripId}/itinerary`);

    } catch (err) {
      // Keep isGenerating true — the error card inside the loading screen
      // lets the user read what went wrong and choose to go back.
      setGenerationError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  const updateBudgetBreakdown = (
    category: keyof TripWizardState['budgetBreakdown'],
    value: number
  ) => {
    setState((prev) => {
      const newBreakdown = {
        ...prev.budgetBreakdown,
        [category]: value,
      };
      const newTotal = Object.values(newBreakdown).reduce((sum, val) => sum + val, 0);
      return {
        ...prev,
        budget: newTotal,
        budgetBreakdown: newBreakdown,
      };
    });
  };

  const handleBudgetChange = (newBudget: number) => {
    setState((prev) => {
      const oldTotal = Object.values(prev.budgetBreakdown).reduce(
        (sum, val) => sum + val,
        0
      );

      if (oldTotal === 0) {
        return { ...prev, budget: newBudget };
      }

      const ratio = newBudget / oldTotal;
      const newBreakdown: TripWizardState['budgetBreakdown'] = {
        flights: Math.round(prev.budgetBreakdown.flights * ratio),
        hotel: Math.round(prev.budgetBreakdown.hotel * ratio),
        food: Math.round(prev.budgetBreakdown.food * ratio),
        experiences: Math.round(prev.budgetBreakdown.experiences * ratio),
        transport: Math.round(prev.budgetBreakdown.transport * ratio),
      };

      return {
        ...prev,
        budget: newBudget,
        budgetBreakdown: newBreakdown,
      };
    });
  };

  const handleTripLengthClick = (days: number) => {
    if (state.startDate) {
      const startDate = new Date(state.startDate);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + days - 1);
      const endDateString = endDate.toISOString().split('T')[0];

      setState((prev) => ({
        ...prev,
        tripLength: days,
        endDate: endDateString,
      }));
    } else {
      setState((prev) => ({
        ...prev,
        tripLength: days,
      }));
    }
  };

  const handleDateChange = (
    type: 'startDate' | 'endDate',
    value: string
  ) => {
    setState((prev) => {
      const newState = { ...prev, [type]: value };

      // When start date is set and end date is empty, auto-fill end date from trip length
      if (type === 'startDate' && value && !prev.endDate && prev.tripLength > 0) {
        const startDate = new Date(value);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + prev.tripLength - 1);
        newState.endDate = endDate.toISOString().split('T')[0];
      }

      // When both dates are set, recalculate trip length
      if (
        newState.startDate &&
        newState.endDate &&
        new Date(newState.startDate) < new Date(newState.endDate)
      ) {
        const start = new Date(newState.startDate);
        const end = new Date(newState.endDate);
        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        newState.tripLength = diffDays;
      }

      return newState;
    });
  };

  const totalBreakdown = Object.values(state.budgetBreakdown).reduce(
    (sum, val) => sum + val,
    0
  );

  const progressPercent = ((currentStep - 1) / 7) * 100;

  // Destination photo map for loading screen
  const destinationPhotos: Record<string, string> = {
    iceland: 'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=1600&h=900&fit=crop',
    tokyo: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1600&h=900&fit=crop',
    japan: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1600&h=900&fit=crop',
    barcelona: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=1600&h=900&fit=crop',
    bali: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1600&h=900&fit=crop',
    paris: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1600&h=900&fit=crop',
    italy: 'https://images.unsplash.com/photo-1555992336-03a23c7b20ee?w=1600&h=900&fit=crop',
    default: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1600&h=900&fit=crop',
  };

  const getLoadingPhoto = () => {
    const dest = state.destination.toLowerCase();
    for (const key of Object.keys(destinationPhotos)) {
      if (key !== 'default' && dest.includes(key)) return destinationPhotos[key];
    }
    return destinationPhotos.default;
  };

  if (isGenerating) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center"
        style={{ backgroundImage: `url(${getLoadingPhoto()})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        {/* Warm parchment overlay */}
        <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(245,241,232,0.82)' }} />

        <div className="relative z-10 flex flex-col items-center text-center px-8 max-w-lg">
          {/* Logo */}
          <div className="mb-8">
            <Image src="/tripcoord_logo.png" alt="tripcoord" width={180} height={64} className="h-14 w-auto animate-pulse" priority />
          </div>

          <p className="text-xs font-semibold uppercase tracking-widest text-orange-600 mb-3">
            AI Itinerary Generator
          </p>
          <h2 className="text-4xl font-script italic font-semibold text-zinc-900 mb-3 leading-tight">
            {state.destination || 'Your Trip'}
          </h2>
          <p className="text-zinc-500 text-sm mb-10">
            {state.startDate && state.endDate
              ? `${new Date(state.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(state.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
              : `${state.tripLength} days`}
          </p>

          {/* Status message */}
          <div className="mb-8 h-6">
            <p className="text-zinc-600 text-sm font-medium transition-all duration-500">
              {generationStatus}
            </p>
          </div>

          {/* Progress bar — hidden once an error occurs */}
          {!generationError && (() => {
            const totalDays = state.tripLength || 7;
            // Phase 0: pre-stream (Places fetch + first token) → indeterminate pulse at 8%
            // Phase 1: days streaming in → real progress 8% → 92%
            // Phase 2: saving → 96%
            const isSaving = generationStatus.startsWith('Saving') || generationStatus.startsWith('Your itinerary');
            const pct = isSaving
              ? 96
              : daysReceived > 0
                ? Math.round(8 + (daysReceived / totalDays) * 84)
                : 8;
            return (
              <div className="w-64 h-1.5 bg-zinc-900/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${pct}%`,
                    animation: daysReceived === 0 && !isSaving ? 'pulse 1.5s ease-in-out infinite' : 'none',
                  }}
                />
              </div>
            );
          })()}

          {generationError && (
            <div className="mt-8 w-full max-w-sm px-5 py-4 bg-rose-50 border border-rose-200 rounded-2xl text-left">
              <p className="text-rose-800 text-sm font-semibold mb-1">Something went wrong</p>
              <p className="text-rose-600 text-xs mb-3 leading-relaxed">{generationError}</p>
              <button
                onClick={() => { setIsGenerating(false); setGenerationError(''); }}
                className="w-full py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition-colors"
              >
                ← Go back and try again
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-parchment">
      <Sidebar
        activePage="trips"
        user={{
          name: currentUser.name,
          avatarUrl: currentUser.avatarUrl,
          subscriptionTier: currentUser.subscriptionTier,
        }}
      />

      <main className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/dashboard"
              className="flex items-center space-x-2 text-sky-700 hover:text-sky-800 mb-6 font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Home Base</span>
            </Link>

            {/* First-trip welcome banner */}
            {isFirstTrip && welcomeName && (
              <div className="mb-6 p-4 bg-gradient-to-r from-sky-50 to-green-50 border border-sky-100 rounded-2xl flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-700 to-green-700 flex items-center justify-center text-white text-lg flex-shrink-0">
                  🎉
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Hey {welcomeName}, let's plan your first trip!</p>
                  <p className="text-sm text-slate-500">Answer a few questions and we'll build a full AI itinerary in seconds.</p>
                </div>
              </div>
            )}

            <h1 className="text-3xl font-script italic font-semibold text-slate-900">
              {isFirstTrip ? 'Where are you headed?' : 'Let\'s Build Your Trip'}
            </h1>
            <p className="text-slate-600 mt-2">
              Answer a few things and we'll handle the rest.
            </p>
          </div>

          {/* Named Step Indicator */}
          {(() => {
            const steps = [
              { n: 1, label: "Who's In", full: "Who's Coming?" },
              { n: 2, label: 'Where To', full: 'Where To?' },
              { n: 3, label: 'When', full: 'When?' },
              { n: 4, label: 'Head Start', full: 'Head Start' },
              { n: 5, label: 'Your Vibe', full: 'Your Vibe' },
              { n: 6, label: 'How You Roll', full: 'How You Roll' },
              { n: 7, label: 'The Budget', full: 'The Budget' },
              { n: 8, label: "Let's Go", full: "Let's Go 🚀" },
            ];
            return (
              <div className="mb-8">
                {/* Step label row */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                    Step {currentStep} of {steps.length}
                  </span>
                  <span className="text-xs font-semibold text-sky-700">
                    {steps[currentStep - 1]?.full}
                  </span>
                </div>
                {/* Segmented track */}
                <div className="flex items-center gap-1 mb-3">
                  {steps.map((s) => (
                    <div
                      key={s.n}
                      className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                        s.n < currentStep
                          ? 'bg-green-700'
                          : s.n === currentStep
                          ? 'bg-sky-700'
                          : 'bg-zinc-200'
                      }`}
                    />
                  ))}
                </div>
                {/* Step dots with labels (desktop) */}
                <div className="hidden sm:flex items-start justify-between">
                  {steps.map((s) => (
                    <button
                      key={s.n}
                      onClick={() => s.n < currentStep && setCurrentStep(s.n)}
                      className="flex flex-col items-center gap-1 group"
                      style={{ cursor: s.n < currentStep ? 'pointer' : 'default' }}
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                        s.n < currentStep
                          ? 'bg-green-700 text-white group-hover:bg-green-800'
                          : s.n === currentStep
                          ? 'bg-sky-800 text-white ring-2 ring-sky-200'
                          : 'bg-zinc-200 text-zinc-400'
                      }`}>
                        {s.n < currentStep ? '✓' : s.n}
                      </div>
                      <span className={`text-[10px] font-medium whitespace-nowrap transition-colors ${
                        s.n === currentStep ? 'text-sky-700' : s.n < currentStep ? 'text-green-700' : 'text-zinc-400'
                      }`}>
                        {s.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Step Content */}
          <div className="card p-8 mb-8">
            {/* Step 1: Who's Traveling? */}
            {currentStep === 1 && (
              <div>
                <h2 className="text-2xl font-script italic font-semibold text-slate-900 mb-6">
                  Who's coming? 👋
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    {
                      id: 'solo',
                      label: 'Solo',
                      icon: User2,
                      desc: 'Just me',
                    },
                    {
                      id: 'couple',
                      label: 'Couple',
                      icon: Heart,
                      desc: 'Two of us',
                    },
                    {
                      id: 'friends',
                      label: 'Friends',
                      icon: Users2,
                      desc: '3+ friends',
                    },
                    {
                      id: 'family',
                      label: 'Family',
                      icon: Users,
                      desc: 'Family trip',
                    },
                  ].map((option) => {
                    const IconComponent = option.icon;
                    const isSelected = state.groupType === option.id;
                    return (
                      <button
                        key={option.id}
                        onClick={() =>
                          setState((prev) => {
                            const minSize =
                              option.id === 'friends' || option.id === 'family'
                                ? Math.max(3, prev.groupSize)
                                : option.id === 'couple'
                                ? Math.max(2, prev.groupSize)
                                : option.id === 'solo'
                                ? 1
                                : prev.groupSize;
                            return { ...prev, groupType: option.id, groupSize: minSize };
                          })
                        }
                        className={`p-6 rounded-lg border-2 transition-all duration-200 text-center ${
                          isSelected
                            ? 'border-green-700 bg-green-50'
                            : 'border-slate-200 hover:border-sky-300'
                        }`}
                      >
                        <IconComponent className="w-8 h-8 mx-auto mb-3 text-green-800" />
                        <p className="font-semibold text-slate-900">
                          {option.label}
                        </p>
                        <p className="text-sm text-slate-600 mt-1">
                          {option.desc}
                        </p>
                        {isSelected && (
                          <div className="mt-3 flex justify-center">
                            <div className="w-5 h-5 bg-green-800 rounded-full flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" />
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Group Size */}
                <div className="mt-6 flex items-center gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-slate-900 mb-0.5">How many people total?</label>
                    <p className="text-xs text-slate-400">Used to estimate per-person costs</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setState(prev => ({ ...prev, groupSize: Math.max(1, prev.groupSize - 1) }))}
                      className="w-8 h-8 rounded-full border-2 border-slate-300 flex items-center justify-center text-slate-600 hover:border-sky-400 hover:text-sky-700 font-bold transition-colors"
                    >−</button>
                    <span className="w-8 text-center text-lg font-bold text-slate-900">{state.groupSize}</span>
                    <button
                      type="button"
                      onClick={() => setState(prev => ({ ...prev, groupSize: Math.min(20, prev.groupSize + 1) }))}
                      className="w-8 h-8 rounded-full border-2 border-slate-300 flex items-center justify-center text-slate-600 hover:border-sky-400 hover:text-sky-700 font-bold transition-colors"
                    >+</button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Where to? */}
            {currentStep === 2 && (
              <div>
                <h2 className="text-2xl font-script italic font-semibold text-slate-900 mb-6">
                  Where to? 🌍
                </h2>
                <div className="space-y-6">
                  <div className="relative">
                    <div className="flex items-baseline justify-between mb-3">
                      <label className="text-sm font-semibold text-slate-900">
                        Search Destination
                      </label>
                      <span className="text-xs text-slate-400">Any city, country, or region in the world</span>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        value={state.destination}
                        onChange={(e) => {
                          const val = e.target.value;
                          setState((prev) => ({ ...prev, destination: val }));
                          setDestQuery(val);
                          setShowDestinationSuggestions(val.length >= 2);
                        }}
                        placeholder="Type a city, country, or region…"
                        className="w-full pl-10 pr-10 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
                      />
                      {destLoading && (
                        <Loader2 className="absolute right-3 top-3.5 w-4 h-4 text-slate-400 animate-spin" />
                      )}
                    </div>

                    {/* Suggestions Dropdown — world cities typeahead */}
                    {showDestinationSuggestions && state.destination.trim().length >= 2 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg z-10 max-h-72 overflow-y-auto">
                        {destSuggestions.map((s) => {
                          // Build the full destination string: "Prague, Czech Republic"
                          // This gives the AI better context AND makes the selection
                          // visually obvious in the input (vs. just the city name).
                          const fullDest = s.address ? `${s.name}, ${s.address}` : s.name;
                          return (
                            <button
                              key={s.placeId}
                              type="button"
                              // onMouseDown preventDefault stops the input from losing focus
                              // before the click fires — fixes the "click doesn't register" bug
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setState((prev) => ({ ...prev, destination: fullDest }));
                                setDestQuery('');
                                setShowDestinationSuggestions(false);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-sky-50 border-b border-slate-100 last:border-b-0 transition-colors flex items-start gap-3"
                            >
                              <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="font-medium text-slate-900 text-sm">{s.name}</p>
                                <p className="text-xs text-slate-500">{s.address}</p>
                              </div>
                            </button>
                          );
                        })}
                        {/* Always allow free-typing any destination */}
                        {!destSuggestions.some(s => s.name.toLowerCase() === state.destination.trim().toLowerCase()) && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setState((prev) => ({ ...prev, destination: state.destination.trim() }));
                              setDestQuery('');
                              setShowDestinationSuggestions(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-sky-50 transition-colors flex items-center gap-3"
                          >
                            <Search className="w-4 h-4 text-sky-600 flex-shrink-0" />
                            <span className="text-sky-700 text-sm font-medium">Use &quot;{state.destination.trim()}&quot;</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Surprise Me — hidden for now, revisit in a future phase
                  <div>
                    <button
                      onClick={handleSurpriseMe}
                      className="w-full btn btn-secondary flex items-center justify-center space-x-2"
                    >
                      <Shuffle className="w-5 h-5" />
                      <span>Surprise Me</span>
                    </button>
                  </div>
                  */}
                </div>
              </div>
            )}

            {/* Step 3: When? */}
            {currentStep === 3 && (
              <div>
                <h2 className="text-2xl font-script italic font-semibold text-slate-900 mb-6">
                  When are you going? 📅
                </h2>
                <div className="space-y-6">
                  {/* Trip Length — quick-select first */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-1">
                      Trip Length
                    </label>
                    <p className="text-xs text-slate-400 mb-3">Quick-pick or set exact dates below — selecting dates auto-calculates length</p>
                    <div className="grid grid-cols-5 gap-2">
                      {[3, 5, 7, 10, 14].map((days) => {
                        const isLocked = days > maxTripDays;
                        const upgradeTo = maxTripDays <= 7 ? 'Explorer' : 'Nomad';
                        return (
                          <div key={days} className="relative group">
                            <button
                              onClick={() => {
                                if (!isLocked) handleTripLengthClick(days);
                              }}
                              disabled={isLocked}
                              title={isLocked ? `${days}-day trips require ${upgradeTo} or higher` : undefined}
                              className={`w-full p-3 rounded-lg border-2 font-semibold transition-all ${
                                isLocked
                                  ? 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
                                  : state.tripLength === days
                                    ? 'border-green-700 bg-green-50 text-green-800'
                                    : 'border-slate-200 text-slate-700 hover:border-sky-300'
                              }`}
                            >
                              {days}d
                              {isLocked && (
                                <Lock className="w-3 h-3 inline-block ml-1 mb-0.5 text-slate-300" />
                              )}
                            </button>
                            {isLocked && (
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 w-40 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 text-center shadow-lg pointer-events-none">
                                Requires {upgradeTo}+
                                <Link href="/pricing" className="block mt-1 text-sky-300 underline pointer-events-auto">
                                  Upgrade
                                </Link>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Flexible dates toggle */}
                  <div className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      id="flexibleDates"
                      checked={state.flexibleDates}
                      onChange={(e) =>
                        setState((prev) => ({
                          ...prev,
                          flexibleDates: e.target.checked,
                          startDate: '',
                          endDate: '',
                        }))
                      }
                      className="w-5 h-5 rounded border-slate-300 text-sky-700 focus:ring-sky-700"
                    />
                    <label htmlFor="flexibleDates" className="text-sm font-medium text-slate-900 cursor-pointer">
                      I have flexible dates
                    </label>
                  </div>

                  {/* Exact date pickers (non-flexible) */}
                  {!state.flexibleDates && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-3">
                          Start Date
                        </label>
                        <input
                          type="date"
                          value={state.startDate}
                          onChange={(e) =>
                            handleDateChange('startDate', e.target.value)
                          }
                          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-3">
                          End Date
                        </label>
                        <input
                          type="date"
                          value={state.endDate}
                          onChange={(e) =>
                            handleDateChange('endDate', e.target.value)
                          }
                          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
                        />
                      </div>
                    </div>
                  )}

                  {/* Month range selector (flexible) */}
                  {state.flexibleDates && (
                    <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl space-y-4">
                      <p className="text-xs text-sky-800 font-semibold uppercase tracking-wide">Which months work for you?</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-900 mb-2">Earliest month</label>
                          <select
                            value={state.startDate ? state.startDate.slice(0, 7) : ''}
                            onChange={(e) => {
                              if (e.target.value) {
                                setState(prev => ({ ...prev, startDate: `${e.target.value}-01` }));
                              }
                            }}
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100 bg-white"
                          >
                            <option value="">Select month…</option>
                            {Array.from({ length: 18 }, (_, i) => {
                              const d = new Date();
                              d.setDate(1);
                              d.setMonth(d.getMonth() + i);
                              const val = d.toISOString().slice(0, 7);
                              const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                              return <option key={val} value={val}>{label}</option>;
                            })}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-900 mb-2">Latest month</label>
                          <select
                            value={state.endDate ? state.endDate.slice(0, 7) : ''}
                            onChange={(e) => {
                              if (e.target.value) {
                                // Set to last day of that month
                                const [y, m] = e.target.value.split('-').map(Number);
                                const lastDay = new Date(y, m, 0).getDate();
                                setState(prev => ({ ...prev, endDate: `${e.target.value}-${String(lastDay).padStart(2, '0')}` }));
                              }
                            }}
                            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100 bg-white"
                          >
                            <option value="">Select month…</option>
                            {Array.from({ length: 18 }, (_, i) => {
                              const d = new Date();
                              d.setDate(1);
                              d.setMonth(d.getMonth() + i);
                              const val = d.toISOString().slice(0, 7);
                              const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                              return <option key={val} value={val}>{label}</option>;
                            })}
                          </select>
                        </div>
                      </div>
                      <p className="text-xs text-sky-700">
                        💡 AI will suggest the best travel windows in this range based on weather, crowds, and pricing.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Pre-Booked Hotels & Flights */}
            {currentStep === 4 && (
              <div>
                <h2 className="text-2xl font-script italic font-semibold text-slate-900 mb-2">
                  Got a head start? ✈️
                </h2>
                <p className="text-slate-500 mb-6 text-sm">
                  If you've already booked flights or a hotel, add them here so your itinerary is built around your schedule. Skip if you're starting fresh.
                </p>

                {/* Flights Section */}
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Plane className="w-5 h-5 text-sky-700" />
                      <span className="font-semibold text-slate-900">Flights</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-sm text-slate-600">Already booked</span>
                      <button
                        onClick={() => setState(prev => ({
                          ...prev,
                          hasPreBookedFlight: !prev.hasPreBookedFlight,
                          isOpenJaw: false,
                          bookedFlight: !prev.hasPreBookedFlight ? {
                            airline: '', flightNumber: '', departureAirport: '', arrivalAirport: '',
                            departureTime: '', arrivalTime: '', returnDepartureTime: '', returnArrivalTime: '',
                          } : null,
                        }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          state.hasPreBookedFlight ? 'bg-sky-800' : 'bg-slate-200'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          state.hasPreBookedFlight ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </label>
                  </div>

                  {/* Same-airport note — always visible once flights are toggled on */}
                  {state.hasPreBookedFlight && (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-sky-50 border border-sky-100 rounded-lg mb-4 text-xs text-sky-700">
                      <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>
                        We plan your itinerary assuming your return flight departs from the same airport you arrive into.
                        {tier === 'nomad' && ' Nomad users can override this in the Return section below.'}
                      </span>
                    </div>
                  )}

                  {state.hasPreBookedFlight && state.bookedFlight && (
                    <div className="p-5 bg-sky-50 border border-sky-100 rounded-xl space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Airline</label>
                          <input type="text" placeholder="e.g. Delta, United" value={state.bookedFlight.airline}
                            onChange={e => setState(prev => ({ ...prev, bookedFlight: { ...prev.bookedFlight!, airline: e.target.value } }))}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200 bg-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Flight Number</label>
                          <input type="text" placeholder="e.g. DL 412" value={state.bookedFlight.flightNumber}
                            onChange={e => setState(prev => ({ ...prev, bookedFlight: { ...prev.bookedFlight!, flightNumber: e.target.value } }))}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200 bg-white" />
                        </div>
                      </div>

                      <div className="border-t border-sky-100 pt-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Outbound</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Departing From</label>
                            <input type="text" placeholder="e.g. JFK, LAX" value={state.bookedFlight.departureAirport}
                              onChange={e => setState(prev => ({ ...prev, bookedFlight: { ...prev.bookedFlight!, departureAirport: e.target.value } }))}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200 bg-white" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Arriving At</label>
                            <input type="text" placeholder="e.g. KEF, CDG" value={state.bookedFlight.arrivalAirport}
                              onChange={e => setState(prev => ({ ...prev, bookedFlight: { ...prev.bookedFlight!, arrivalAirport: e.target.value } }))}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200 bg-white" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Departure Time</label>
                            <input type="datetime-local" value={state.bookedFlight.departureTime}
                              onChange={e => setState(prev => ({ ...prev, bookedFlight: { ...prev.bookedFlight!, departureTime: e.target.value } }))}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200 bg-white" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Arrival Time</label>
                            <input type="datetime-local" value={state.bookedFlight.arrivalTime}
                              onChange={e => setState(prev => ({ ...prev, bookedFlight: { ...prev.bookedFlight!, arrivalTime: e.target.value } }))}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200 bg-white" />
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-sky-100 pt-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Return (optional)</p>

                        {/* Open-jaw toggle — Nomad only */}
                        {tier === 'nomad' && (
                          <div className="flex items-center gap-3 mb-4 p-3 bg-white border border-amber-100 rounded-lg">
                            <button
                              onClick={() => setState(prev => ({
                                ...prev,
                                isOpenJaw: !prev.isOpenJaw,
                                bookedFlight: prev.bookedFlight
                                  ? { ...prev.bookedFlight, returnDepartureAirport: '', returnArrivalAirport: '' }
                                  : null,
                              }))}
                              className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
                                state.isOpenJaw ? 'bg-amber-500' : 'bg-slate-200'
                              }`}
                            >
                              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                                state.isOpenJaw ? 'translate-x-4' : 'translate-x-0.5'
                              }`} />
                            </button>
                            <span className="text-xs text-slate-700 flex items-center gap-1.5">
                              <Crown className="w-3 h-3 text-amber-400 flex-shrink-0" />
                              My return flight departs from a different airport
                            </span>
                          </div>
                        )}

                        {/* Open-jaw airport fields — Nomad only, when toggled on */}
                        {tier === 'nomad' && state.isOpenJaw && (
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Return Departs From</label>
                              <input type="text" placeholder="e.g. FCO, BCN"
                                value={state.bookedFlight.returnDepartureAirport ?? ''}
                                onChange={e => setState(prev => ({ ...prev, bookedFlight: { ...prev.bookedFlight!, returnDepartureAirport: e.target.value } }))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-100 bg-white" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Return Arrives At (home)</label>
                              <input type="text" placeholder="e.g. JFK, LAX"
                                value={state.bookedFlight.returnArrivalAirport ?? ''}
                                onChange={e => setState(prev => ({ ...prev, bookedFlight: { ...prev.bookedFlight!, returnArrivalAirport: e.target.value } }))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-100 bg-white" />
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Return Departure</label>
                            <input type="datetime-local" value={state.bookedFlight.returnDepartureTime}
                              onChange={e => setState(prev => ({ ...prev, bookedFlight: { ...prev.bookedFlight!, returnDepartureTime: e.target.value } }))}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200 bg-white" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Return Arrival</label>
                            <input type="datetime-local" value={state.bookedFlight.returnArrivalTime}
                              onChange={e => setState(prev => ({ ...prev, bookedFlight: { ...prev.bookedFlight!, returnArrivalTime: e.target.value } }))}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200 bg-white" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Hotel Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🏨</span>
                      <span className="font-semibold text-slate-900">Hotel / Accommodation</span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-sm text-slate-600">Already booked</span>
                      <button
                        onClick={() => setState(prev => ({
                          ...prev,
                          hasPreBookedHotel: !prev.hasPreBookedHotel,
                          bookedHotels: !prev.hasPreBookedHotel
                            ? [{ name: '', address: '', checkIn: '', checkOut: '' }]
                            : [],
                        }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          state.hasPreBookedHotel ? 'bg-sky-800' : 'bg-slate-200'
                        }`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          state.hasPreBookedHotel ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </label>
                  </div>

                  {state.hasPreBookedHotel && (
                    <div className="space-y-4">
                      {state.bookedHotels.map((hotel, idx) => (
                        <div key={idx} className="p-5 bg-sky-50 border border-sky-100 rounded-xl space-y-4">
                          {/* Hotel header */}
                          <div className="flex items-center justify-between -mb-1">
                            <span className="text-xs font-semibold text-sky-700 uppercase tracking-wide">
                              {state.bookedHotels.length > 1 ? `Hotel ${idx + 1}` : 'Hotel'}
                            </span>
                            {idx > 0 && (
                              <button
                                onClick={() => setState(prev => ({
                                  ...prev,
                                  bookedHotels: prev.bookedHotels.filter((_, i) => i !== idx),
                                }))}
                                className="flex items-center gap-1 text-xs text-rose-500 hover:text-rose-700 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" /> Remove
                              </button>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Hotel Name</label>
                            <input
                              type="text"
                              placeholder="e.g. Marriott Downtown Reykjavik"
                              value={hotel.name}
                              onChange={e => setState(prev => ({
                                ...prev,
                                bookedHotels: prev.bookedHotels.map((h, i) =>
                                  i === idx ? { ...h, name: e.target.value } : h
                                ),
                              }))}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200 bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Address (optional)</label>
                            <input
                              type="text"
                              placeholder="e.g. 44 Suðurgata, 101 Reykjavik"
                              value={hotel.address}
                              onChange={e => setState(prev => ({
                                ...prev,
                                bookedHotels: prev.bookedHotels.map((h, i) =>
                                  i === idx ? { ...h, address: e.target.value } : h
                                ),
                              }))}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200 bg-white"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Check-in Date</label>
                              <input
                                type="date"
                                value={hotel.checkIn}
                                onChange={e => setState(prev => ({
                                  ...prev,
                                  bookedHotels: prev.bookedHotels.map((h, i) =>
                                    i === idx ? { ...h, checkIn: e.target.value } : h
                                  ),
                                }))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200 bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Check-out Date</label>
                              <input
                                type="date"
                                value={hotel.checkOut}
                                onChange={e => setState(prev => ({
                                  ...prev,
                                  bookedHotels: prev.bookedHotels.map((h, i) =>
                                    i === idx ? { ...h, checkOut: e.target.value } : h
                                  ),
                                }))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200 bg-white"
                              />
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Add another hotel — tier-gated with progressive disclosure */}
                      {(() => {
                        const maxHotels = tier === 'nomad' ? 7 : tier === 'explorer' ? 3 : 1;
                        const lastFilled = state.bookedHotels[state.bookedHotels.length - 1]?.name?.trim() !== '';
                        // Explorer: progressive — only show when last slot has a name
                        // Nomad: always show when under cap
                        const canAdd = state.bookedHotels.length < maxHotels && (tier === 'nomad' ? true : lastFilled);
                        if (!canAdd) return null;
                        return (
                          <button
                            onClick={() => setState(prev => ({
                              ...prev,
                              bookedHotels: [...prev.bookedHotels, { name: '', address: '', checkIn: '', checkOut: '' }],
                            }))}
                            className="flex items-center gap-2 text-sm text-sky-700 hover:text-sky-900 font-medium transition-colors py-1"
                          >
                            <Plus className="w-4 h-4" />
                            Add another hotel
                            {tier === 'explorer' && state.bookedHotels.length < maxHotels && (
                              <span className="text-xs text-slate-400 font-normal">({state.bookedHotels.length}/{maxHotels})</span>
                            )}
                          </button>
                        );
                      })()}

                      {/* Tier cap hint for Free / Trip Pass */}
                      {(tier === 'free' || tier === 'trip_pass') && state.bookedHotels.length >= 1 && (
                        <p className="text-xs text-slate-400 flex items-center gap-1.5">
                          <Lock className="w-3 h-3" />
                          Multiple hotels require Explorer or Nomad. <Link href="/pricing" className="text-sky-700 hover:underline">Upgrade</Link>
                        </p>
                      )}

                      {state.bookedHotels.length > 1 && (
                        <p className="text-xs text-slate-500 italic">
                          Your itinerary will use the correct hotel as home base for each night based on check-in/out dates.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {!state.hasPreBookedFlight && !state.hasPreBookedHotel && (
                  <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl text-center">
                    <p className="text-sm text-slate-500">No pre-bookings? No problem — your AI itinerary will include hotel and flight suggestions that fit your budget.</p>
                  </div>
                )}
              </div>
            )}

            {/* Step 5: What Matters Most? */}
            {currentStep === 5 && (
              <div>
                <h2 className="text-2xl font-script italic font-semibold text-slate-900 mb-6">
                  What's your vibe? ✨
                </h2>
                <p className="text-slate-600 mb-6">
                  Select your top priorities (we'll rank the top 3)
                </p>

                {/* Age Ranges */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold text-slate-900 mb-4">
                    Age Ranges
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {ageRangeOptions.map((ageRange) => (
                      <label
                        key={ageRange}
                        className="flex items-center space-x-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={state.ageRanges.includes(ageRange)}
                          onChange={() => toggleAgeRange(ageRange)}
                          className="w-4 h-4 rounded border-slate-300 text-sky-700 focus:ring-sky-700"
                        />
                        <span className="text-sm font-medium text-slate-900">
                          {ageRange}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Accessibility Needs */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold text-slate-900 mb-1">
                    Accessibility Needs
                  </label>
                  <p className="text-xs text-slate-400 mb-4">Select any that apply — defaults to no special needs</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {accessibilityOptions.map((need) => {
                      const noNeeds = need === 'No special needs';
                      // "No special needs" shows checked when nothing else is selected
                      const isChecked = noNeeds
                        ? state.accessibilityNeeds.length === 0
                        : state.accessibilityNeeds.includes(need);
                      return (
                        <label
                          key={need}
                          className="flex items-center space-x-2 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleAccessibilityNeed(need)}
                            className="w-4 h-4 rounded border-slate-300 text-sky-700 focus:ring-sky-700"
                          />
                          <span className="text-sm font-medium text-slate-900">{need}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Travel Priorities */}
                <div className="mb-8">
                  <div className="flex items-baseline justify-between mb-4">
                    <label className="text-sm font-semibold text-slate-900">
                      Travel Priorities
                    </label>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      state.priorities.length >= 4
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {state.priorities.length}/4 selected
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {priorityOptions.map((priority) => {
                      const isSelected = state.priorities.includes(priority.id);
                      const isDisabled = !isSelected && state.priorities.length >= 4;
                      return (
                        <button
                          key={priority.id}
                          onClick={() => !isDisabled && togglePriority(priority.id)}
                          className={`p-4 rounded-lg border-2 transition-all text-center ${
                            isSelected
                              ? 'border-green-700 bg-green-50'
                              : isDisabled
                              ? 'border-slate-100 bg-slate-50 opacity-40 cursor-not-allowed'
                              : 'border-slate-200 hover:border-sky-300'
                          }`}
                        >
                          <span className="text-3xl mb-2 block">{priority.icon}</span>
                          <p className="font-semibold text-slate-900 text-sm">{priority.label}</p>
                          {isSelected && (
                            <div className="mt-2">
                              <div className="w-4 h-4 bg-green-800 rounded-full mx-auto" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Summary */}
                {state.priorities.length > 0 && (
                  <div className="p-4 bg-slate-100 rounded-lg border border-slate-300">
                    <p className="text-sm font-medium text-slate-900">
                      Selected ({state.priorities.length}):{' '}
                      {state.priorities
                        .map(
                          (id) =>
                            priorityOptions.find((p) => p.id === id)?.label
                        )
                        .join(', ')}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 6: How Do You Travel? */}
            {currentStep === 6 && (
              <div>
                <h2 className="text-2xl font-script italic font-semibold text-slate-900 mb-6">
                  How do you roll? 🎒
                </h2>

                <div className="space-y-8">
                  {/* Local Transportation */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-1">
                      Local Transportation
                    </label>
                    <p className="text-xs text-slate-400 mb-4">Select all that apply — how will you get around once you're there?</p>
                    <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
                      {[
                        { id: 'train', label: 'Train / Metro', icon: '🚂' },
                        { id: 'car', label: 'Car / Rental', icon: '🚗' },
                        { id: 'uber', label: 'Rideshare', icon: '📱' },
                        { id: 'excursion', label: 'Excursion Bus', icon: '🚌' },
                      ].map((mode) => {
                        const isSelected = state.modality.includes(mode.id);
                        return (
                          <button
                            key={mode.id}
                            onClick={() => toggleModality(mode.id)}
                            className={`p-4 rounded-lg border-2 transition-all text-center ${
                              isSelected
                                ? 'border-sky-700 bg-sky-50'
                                : 'border-slate-200 hover:border-sky-300'
                            }`}
                          >
                            <span className="text-3xl block mb-2">{mode.icon}</span>
                            <p className="text-sm font-semibold text-slate-900">{mode.label}</p>
                            {isSelected && <div className="mt-1 w-3 h-3 bg-sky-700 rounded-full mx-auto" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Accommodation Type */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-1">
                      Accommodation Type
                    </label>
                    <p className="text-xs text-slate-400 mb-4">Select all that apply</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { id: 'hotel', label: 'Hotel', icon: '🏨' },
                        { id: 'airbnb', label: 'Airbnb / Rental', icon: '🏠' },
                        { id: 'hostel', label: 'Hostel', icon: '🛏️' },
                        { id: 'resort', label: 'Resort', icon: '🌴' },
                      ].map((type) => {
                        const isSelected = state.accommodationType.includes(type.id);
                        return (
                          <button
                            key={type.id}
                            onClick={() => toggleAccommodationType(type.id)}
                            className={`p-4 rounded-lg border-2 transition-all text-center ${
                              isSelected
                                ? 'border-sky-700 bg-sky-50 text-sky-800'
                                : 'border-slate-200 hover:border-sky-300 text-slate-900'
                            }`}
                          >
                            <span className="text-2xl block mb-1">{type.icon}</span>
                            <p className="text-sm font-semibold">{type.label}</p>
                            {isSelected && <div className="mt-1 w-3 h-3 bg-sky-700 rounded-full mx-auto" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Local Mode Toggle */}
                  <div className="flex items-center space-x-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      checked={state.localMode}
                      onChange={(e) =>
                        setState((prev) => ({
                          ...prev,
                          localMode: e.target.checked,
                        }))
                      }
                      className="w-5 h-5 rounded border-slate-300 text-sky-700 focus:ring-sky-700"
                    />
                    <label className="text-sm font-medium text-slate-900">
                      Local insider mode (off-the-beaten-path experiences)
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Step 7: Budget */}
            {currentStep === 7 && (
              <div>
                <h2 className="text-2xl font-script italic font-semibold text-slate-900 mb-6">
                  What's the budget? 💰
                </h2>

                <div className="space-y-8">
                  {/* Travel Comfort Slider */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-1">
                      Travel Style
                    </label>
                    <p className="text-xs text-slate-400 mb-4">How do you prefer to travel — budget-smart or comfort-first?</p>
                    <div className="flex items-center gap-4">
                      <div className="text-center flex-shrink-0">
                        <span className="text-xl block mb-1">🛏️</span>
                        <span className="text-xs text-slate-500 font-medium">Backpacker</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={state.curiosityLevel}
                        onChange={(e) => {
                          const level = parseInt(e.target.value);
                          const breakdown = calcBudgetFromStyle(state.destination, state.tripLength, level);
                          const total = Object.values(breakdown).reduce((s: number, v: number) => s + v, 0);
                          setState((prev) => ({
                            ...prev,
                            curiosityLevel: level,
                            budgetBreakdown: breakdown,
                            budget: total,
                          }));
                        }}
                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-700"
                      />
                      <div className="text-center flex-shrink-0">
                        <span className="text-xl block mb-1">✨</span>
                        <span className="text-xs text-slate-500 font-medium">Luxury</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 text-center">
                      {state.curiosityLevel < 30
                        ? 'Budget-conscious — hostels, street food, local transit'
                        : state.curiosityLevel < 60
                        ? 'Mid-range — comfortable hotels, mix of dining'
                        : state.curiosityLevel < 85
                        ? 'Comfort-first — nice hotels, quality restaurants'
                        : 'Luxury — premium hotels, fine dining, private transfers'}
                    </p>
                  </div>

                  {/* Per-Person Budget */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-1">
                      Per-Person Budget (USD)
                    </label>
                    <p className="text-xs text-slate-400 mb-3">Your budget for one person — excluding flights if already booked</p>
                    <div className="flex items-center space-x-2">
                      <DollarSign className="w-5 h-5 text-slate-600" />
                      <input
                        type="number"
                        value={budgetInput}
                        onChange={(e) => setBudgetInput(e.target.value)}
                        onBlur={() => handleBudgetChange(parseInt(budgetInput) || 0)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleBudgetChange(parseInt(budgetInput) || 0); }}
                        className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
                      />
                    </div>
                  </div>

                  {/* Auto-fill notice */}
                  {budgetAutoFilled && state.destination && (
                    <div className="flex items-start gap-3 p-4 bg-sky-50 border border-sky-200 rounded-xl">
                      <span className="text-sky-700 mt-0.5">✦</span>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-sky-900">Auto-estimated for {state.destination}</p>
                        <p className="text-xs text-sky-800 mt-0.5">Based on typical costs for this destination. Adjust any category below.</p>
                      </div>
                      <button onClick={() => setBudgetAutoFilled(false)} className="text-sky-600 hover:text-sky-700 text-xs">✕</button>
                    </div>
                  )}

                  {/* Budget Breakdown — number inputs */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-4">
                      Budget Breakdown <span className="text-slate-400 font-normal text-xs">(per person)</span>
                    </label>
                    <div className="space-y-3">
                      {[
                        { key: 'flights' as const, label: 'Flights', icon: '✈️', hint: state.hasPreBookedFlight ? 'Already booked' : 'Round-trip per person' },
                        { key: 'hotel' as const, label: 'Hotel / Stay', icon: '🏨', hint: state.hasPreBookedHotel ? 'Already booked' : `${state.tripLength - 1} nights, your share` },
                        { key: 'food' as const, label: 'Food & Drinks', icon: '🍽️', hint: 'Meals, coffee, snacks' },
                        { key: 'experiences' as const, label: 'Experiences', icon: '🎯', hint: 'Tours, tickets, activities' },
                        { key: 'transport' as const, label: 'Local Transport', icon: '🚌', hint: 'Transit, rideshare, taxis' },
                      ].map(({ key, label, icon, hint }) => {
                        const isPreBooked = (key === 'flights' && state.hasPreBookedFlight) || (key === 'hotel' && state.hasPreBookedHotel);
                        return (
                          <div key={key} className={`flex items-center gap-3 p-3 rounded-xl border ${isPreBooked ? 'bg-emerald-50 border-emerald-200 opacity-70' : 'bg-white border-slate-200'}`}>
                            <span className="text-xl w-8 text-center">{icon}</span>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-slate-900">{label}</p>
                              <p className="text-xs text-slate-400">{hint}</p>
                            </div>
                            {isPreBooked ? (
                              <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-2.5 py-1 rounded-full">✓ Paid</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-sm text-slate-500">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="50"
                                  value={state.budgetBreakdown[key]}
                                  onChange={(e) => updateBudgetBreakdown(key, parseInt(e.target.value) || 0)}
                                  className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right font-semibold focus:outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-200"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Totals */}
                  <div className="rounded-xl overflow-hidden border border-zinc-800">
                    <div className="p-4 bg-zinc-900 flex items-center justify-between">
                      <span className="font-semibold text-white">Per-Person Total</span>
                      <span className="font-script italic text-xl font-semibold text-sky-400">${totalBreakdown.toLocaleString()}</span>
                    </div>
                    <div className="p-3 bg-zinc-800/60 flex items-center justify-between">
                      <span className="text-sm text-zinc-400">Estimated for {state.groupSize} {state.groupSize === 1 ? 'person' : 'people'}</span>
                      <span className="text-sm font-semibold text-zinc-300">${(totalBreakdown * state.groupSize).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 8: Review & Generate */}
            {currentStep === 8 && (
              <div>
                <h2 className="text-2xl font-script italic font-semibold text-slate-900 mb-6">
                  Good to go? 🚀
                </h2>

                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-sky-50 rounded-lg border border-sky-200">
                      <p className="text-xs font-semibold text-sky-800 uppercase tracking-wide mb-2">
                        Group Type
                      </p>
                      <p className="text-lg font-semibold text-slate-900 capitalize">
                        {state.groupType}
                      </p>
                    </div>
                    <div className="p-4 bg-sky-50 rounded-lg border border-sky-200">
                      <p className="text-xs font-semibold text-sky-800 uppercase tracking-wide mb-2">
                        Destination
                      </p>
                      <p className="text-lg font-semibold text-slate-900">
                        {state.destination || 'Not selected'}
                      </p>
                    </div>
                    <div className="p-4 bg-parchment rounded-lg border border-stone-200">
                      <p className="text-xs font-semibold text-stone-700 uppercase tracking-wide mb-2">
                        Trip Length
                      </p>
                      <p className="text-lg font-semibold text-slate-900">
                        {state.tripLength} days
                      </p>
                    </div>
                    <div className="p-4 bg-parchment rounded-lg border border-stone-200">
                      <p className="text-xs font-semibold text-stone-700 uppercase tracking-wide mb-2">
                        Budget (per person)
                      </p>
                      <p className="text-lg font-semibold text-slate-900">
                        ${state.budget.toLocaleString()} <span className="text-sm text-slate-500">× {state.groupSize} = ${(state.budget * state.groupSize).toLocaleString()}</span>
                      </p>
                    </div>
                    <div className="p-4 bg-sky-50 rounded-lg border border-sky-200">
                      <p className="text-xs font-semibold text-sky-800 uppercase tracking-wide mb-2">
                        Local Transport
                      </p>
                      <p className="text-lg font-semibold text-slate-900 capitalize">
                        {state.modality.length > 0 ? state.modality.join(', ') : 'Not set'}
                      </p>
                    </div>
                    <div className="p-4 bg-sky-50 rounded-lg border border-sky-200">
                      <p className="text-xs font-semibold text-sky-800 uppercase tracking-wide mb-2">
                        Accommodation
                      </p>
                      <p className="text-lg font-semibold text-slate-900 capitalize">
                        {state.accommodationType.length > 0 ? state.accommodationType.join(', ') : 'Not set'}
                      </p>
                    </div>
                  </div>

                  {/* Priorities Summary */}
                  {state.priorities.length > 0 && (
                    <div className="p-4 bg-slate-100 rounded-lg border border-slate-300">
                      <p className="text-sm font-semibold text-slate-900 mb-3">
                        Priorities
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {state.priorities.map((id) => {
                          const priority = priorityOptions.find((p) => p.id === id);
                          return priority ? (
                            <span
                              key={id}
                              className="inline-flex items-center space-x-1 px-3 py-1.5 bg-sky-100 text-sky-800 rounded-full text-sm font-medium"
                            >
                              <span>{priority.icon}</span>
                              <span>{priority.label}</span>
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}

                  {/* Validation warnings */}
                  {(() => {
                    const warnings: { field: string; msg: string; step: number }[] = [];
                    if (!state.destination.trim()) warnings.push({ field: 'Destination', msg: 'No destination set — where are you going?', step: 2 });
                    if (!state.startDate || !state.endDate) warnings.push({ field: 'Dates', msg: 'Trip dates aren\'t set yet.', step: 3 });
                    if (!state.groupType) warnings.push({ field: 'Group type', msg: 'Who\'s traveling? (Solo, couple, friends, family)', step: 1 });
                    if (warnings.length === 0) return null;
                    return (
                      <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-sky-100 flex items-center gap-2">
                          <span className="text-sky-700 text-sm">⚠</span>
                          <p className="text-xs font-semibold text-sky-800 uppercase tracking-wide">A few things to fill in</p>
                        </div>
                        <div className="divide-y divide-sky-100">
                          {warnings.map(w => (
                            <div key={w.field} className="flex items-center justify-between px-4 py-2.5">
                              <p className="text-sm text-sky-900">{w.msg}</p>
                              <button
                                onClick={() => setCurrentStep(w.step)}
                                className="text-xs font-semibold text-sky-700 hover:text-sky-900 whitespace-nowrap ml-4 underline underline-offset-2"
                              >
                                Fix →
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* CTA */}
                  <div className="pt-6 border-t border-slate-200">
                    <p className="text-sm text-slate-600 mb-4">
                      Ready? AI will build a day-by-day itinerary around your preferences
                      {state.destination ? ` for ${state.destination}` : ''}.
                    </p>
                    <button
                      onClick={() => {
                        if (!canAffordAction('itinerary_generate')) {
                          setShowUpgradeModal(true);
                          return;
                        }
                        handleGenerateItinerary();
                      }}
                      disabled={isGenerating || !state.destination.trim()}
                      className="w-full flex items-center justify-center gap-2 py-4 text-base font-semibold rounded-full transition-all bg-sky-800 hover:bg-sky-900 text-white disabled:bg-zinc-200 disabled:text-zinc-400 disabled:cursor-not-allowed shadow-sm"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Generating your itinerary...</span>
                        </>
                      ) : !canAffordAction('itinerary_generate') ? (
                        <>
                          <Zap className="w-5 h-5" />
                          <span>Build My Trip</span>
                          <LockBadge />
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5" />
                          <span>Build My Trip ✨</span>
                        </>
                      )}
                    </button>
                    {showUpgradeModal && (
                      <UpgradeModal
                        prompt={getUpgradePrompt('no_ai')}
                        onClose={() => setShowUpgradeModal(false)}
                      />
                    )}
                    {!state.destination.trim() && (
                      <p className="text-center text-xs text-zinc-400 mt-2">Set a destination to enable generation</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Navigation Buttons */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center justify-between w-full">
              <button
                onClick={handleBack}
                disabled={currentStep === 1}
                className="flex items-center space-x-2 px-6 py-3 text-sky-700 hover:text-sky-800 disabled:text-slate-400 disabled:cursor-not-allowed font-medium transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
                <span>Back</span>
              </button>

              <div className="flex gap-3">
                {currentStep < 8 && (
                  <button
                    onClick={handleNext}
                    disabled={
                      (currentStep === 2 && !state.destination.trim()) ||
                      (currentStep === 5 && (state.priorities.length === 0 || state.ageRanges.length === 0)) ||
                      (currentStep === 6 && state.modality.length === 0)
                    }
                    className="flex items-center space-x-2 btn btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
            {currentStep === 5 && state.priorities.length === 0 && (
              <p className="text-xs text-zinc-400">Select at least one travel priority to continue</p>
            )}
            {currentStep === 5 && state.priorities.length > 0 && state.ageRanges.length === 0 && (
              <p className="text-xs text-zinc-400">Select at least one age range to continue</p>
            )}
            {currentStep === 6 && state.modality.length === 0 && (
              <p className="text-xs text-zinc-400">Select at least one local transportation option to continue</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function TripBuilderPageWrapper() {
  return (
    <Suspense>
      <TripBuilderPage />
    </Suspense>
  );
}
