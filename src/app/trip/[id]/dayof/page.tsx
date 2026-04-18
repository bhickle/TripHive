'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  MapPin, Navigation, CheckCircle2, AlertCircle,
  Cloud, ChevronDown, Camera, DollarSign,
  Car, Bus, Train, Ticket, ArrowRight, Sun, Wind, Droplets,
  ChevronLeft, Zap, Utensils, Star,
  CalendarDays, MessageSquare,
} from 'lucide-react';
import { itineraryDays, groupMembers, trips, MOCK_TRIP_IDS } from '@/data/mock';
import type { TransportLeg, TransportType, Activity } from '@/lib/types';

// ─── Transport config ─────────────────────────────────────────────────────────

const transportConfig: Record<TransportType, {
  icon: React.ReactNode;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
}> = {
  car_rental: {
    icon: <Car className="w-4 h-4" />,
    label: 'Car Rental',
    color: 'text-sky-700',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-200',
    textColor: 'text-sky-800',
  },
  bus: {
    icon: <Bus className="w-4 h-4" />,
    label: 'Bus',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    textColor: 'text-emerald-800',
  },
  train: {
    icon: <Train className="w-4 h-4" />,
    label: 'Train',
    color: 'text-violet-700',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
    textColor: 'text-violet-800',
  },
  excursion: {
    icon: <Ticket className="w-4 h-4" />,
    label: 'Excursion',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    textColor: 'text-amber-800',
  },
};

// ─── Timeline item type ───────────────────────────────────────────────────────

type TimelineItemDayOf =
  | { kind: 'activity'; data: Activity; sortTime: number }
  | { kind: 'transport'; data: TransportLeg; sortTime: number };

function parseTime(t: string): number {
  if (!t) return 0;
  const clean = t.split('\u2013')[0].trim();
  const [h, m] = clean.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatTime(t: string): string {
  if (!t) return '';
  const clean = t.split('\u2013')[0].trim();
  const [h, m] = clean.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatTimeRange(slot: string): string {
  const parts = slot.split('\u2013');
  if (parts.length !== 2) return slot;
  return `${formatTime(parts[0])} \u2013 ${formatTime(parts[1])}`;
}

function parseEndTime(timeSlot: string): number {
  const parts = timeSlot.split('\u2013');
  if (parts.length < 2) return parseTime(timeSlot) + 90;
  return parseTime(parts[1]);
}

function getItemStatus(sortTime: number, endMins: number, nowMins: number): 'done' | 'now' | 'soon' | 'upcoming' {
  if (nowMins > endMins) return 'done';
  if (nowMins >= sortTime) return 'now';
  if (sortTime - nowMins <= 60) return 'soon';
  return 'upcoming';
}

// ─── Transport Card (day-of) ──────────────────────────────────────────────────

function TransportCardDayOf({ leg, status }: { leg: TransportLeg; status: 'done' | 'now' | 'soon' | 'upcoming' }) {
  const [expanded, setExpanded] = useState(status === 'now' || status === 'soon');
  const cfg = transportConfig[leg.type];

  const mapsUrl = leg.meetingPoint
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(leg.meetingPoint)}`
    : null;

  return (
    <div className={`rounded-xl border-2 overflow-hidden transition-all duration-200 ${
      status === 'now' ? `${cfg.borderColor} ${cfg.bgColor} shadow-md` :
      status === 'done' ? 'border-slate-100 bg-slate-50 opacity-60' :
      'border-slate-200 bg-white'
    }`}>
      <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setExpanded(!expanded)}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
          status === 'done' ? 'bg-slate-100 text-slate-400' : `${cfg.bgColor} ${cfg.color}`
        }`}>
          {cfg.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold uppercase tracking-wide ${status === 'done' ? 'text-slate-400' : cfg.color}`}>
              {cfg.label}
            </span>
            {status === 'now' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />NOW
              </span>
            )}
            {status === 'soon' && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">SOON</span>
            )}
          </div>
          <p className={`font-semibold text-sm truncate ${status === 'done' ? 'text-slate-400' : 'text-slate-900'}`}>
            {leg.meetingPoint}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {leg.meetTime ? `Meet ${formatTime(leg.meetTime)}` : ''}
            {leg.meetTime && leg.departureTime ? ' \u00b7 ' : ''}
            {leg.departureTime ? `Depart ${formatTime(leg.departureTime)}` : ''}
            {leg.destination ? ` \u2192 ${leg.destination}` : ''}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className={`px-4 pb-4 space-y-3 border-t ${cfg.borderColor}`}>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {leg.operator && (
              <div className="p-2.5 rounded-lg bg-white/70 border border-slate-100">
                <p className="text-xs text-slate-500">Operator</p>
                <p className="text-sm font-semibold text-slate-900">{leg.operator}</p>
              </div>
            )}
            {leg.confirmationRef && (
              <div className="p-2.5 rounded-lg bg-white/70 border border-slate-100">
                <p className="text-xs text-slate-500">Confirmation</p>
                <p className="text-sm font-semibold text-slate-900 font-mono">{leg.confirmationRef}</p>
              </div>
            )}
            {leg.carClass && (
              <div className="p-2.5 rounded-lg bg-white/70 border border-slate-100">
                <p className="text-xs text-slate-500">Vehicle</p>
                <p className="text-sm font-semibold text-slate-900">{leg.carClass}</p>
              </div>
            )}
            {leg.duration && (
              <div className="p-2.5 rounded-lg bg-white/70 border border-slate-100">
                <p className="text-xs text-slate-500">Duration</p>
                <p className="text-sm font-semibold text-slate-900">{leg.duration}</p>
              </div>
            )}
            {leg.costPerPerson !== undefined && (
              <div className="p-2.5 rounded-lg bg-white/70 border border-slate-100">
                <p className="text-xs text-slate-500">Per person</p>
                <p className="text-sm font-semibold text-slate-900">${leg.costPerPerson}</p>
              </div>
            )}
          </div>
          {leg.notes && <p className="text-xs text-slate-500 italic">{leg.notes}</p>}
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors ${cfg.bgColor} ${cfg.textColor} hover:opacity-80`}>
              <Navigation className="w-4 h-4" />
              Navigate to Meeting Point
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Activity Card (day-of) ───────────────────────────────────────────────────

function ActivityCardDayOf({ activity, status }: { activity: Activity; status: 'done' | 'now' | 'soon' | 'upcoming' }) {
  const addr = activity.address || activity.title;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;

  return (
    <div className={`rounded-xl border-2 overflow-hidden transition-all duration-200 ${
      status === 'now' ? 'border-sky-300 bg-white shadow-lg shadow-sky-100' :
      status === 'done' ? 'border-slate-100 bg-slate-50 opacity-60' :
      'border-slate-200 bg-white'
    }`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
            status === 'done' ? 'bg-slate-100' : activity.isRestaurant ? 'bg-amber-50' : 'bg-sky-50'
          }`}>
            {status === 'done' ? (
              <CheckCircle2 className="w-5 h-5 text-slate-400" />
            ) : activity.isRestaurant ? (
              <Utensils className="w-4 h-4 text-amber-600" />
            ) : (
              <Star className="w-4 h-4 text-sky-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-xs font-medium ${status === 'done' ? 'text-slate-400' : 'text-slate-500'}`}>
                {formatTimeRange(activity.timeSlot)}
              </span>
              {status === 'now' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />NOW
                </span>
              )}
              {status === 'soon' && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">NEXT</span>
              )}
            </div>
            <h3 className={`font-semibold text-sm leading-snug ${status === 'done' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
              {activity.title}
            </h3>
            {activity.address && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">{activity.address}</p>
            )}
            {activity.description && status !== 'done' && (
              <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{activity.description}</p>
            )}
          </div>
          {(activity.costEstimate !== undefined && activity.costEstimate > 0) && (
            <span className="text-xs font-medium text-slate-500 flex-shrink-0">${activity.costEstimate}/person</span>
          )}
        </div>
        {(status === 'now' || status === 'soon') && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-sky-50 text-sky-700 text-sm font-semibold hover:bg-sky-100 transition-colors">
            <Navigation className="w-3.5 h-3.5" />
            Navigate
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// MOCK_TRIP_IDS imported from @/data/mock

export default function DayOfPage() {
  const params = useParams();
  const tripId = params?.id as string;

  // Determine synchronously so initial state is correct (avoids flash of mock data)
  const isRealTrip = !MOCK_TRIP_IDS.has(tripId) && /^[0-9a-f-]{36}$/i.test(tripId);

  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set(['user_1']));
  const [showEndOfDay, setShowEndOfDay] = useState(false);
  const [destination, setDestination] = useState<string>('Destination');
  const [currentUserName, setCurrentUserName] = useState<string>('You');
  const [isMockTrip, setIsMockTrip] = useState(!isRealTrip);
  // Use state for currentDay so Supabase/localStorage loads trigger a re-render
  const [currentDay, setCurrentDay] = useState<(typeof itineraryDays)[0]>(
    isRealTrip ? itineraryDays[0] : itineraryDays[1]
  );

  useEffect(() => {
    if (!isRealTrip) return;

    const load = async () => {
      // ── Supabase first (UUID trips) ────────────────────────────────────────
      try {
        const res = await fetch(`/api/trips/${tripId}`);
        if (res.ok) {
          const { trip, itinerary } = await res.json();
          if (trip?.destination) setDestination(trip.destination);
          const days = itinerary?.days ?? itinerary?.itinerary;
          if (days?.length > 0) {
            const today = new Date().toISOString().split('T')[0];
            const idx = days.findIndex((d: { date?: string }) => d.date === today);
            setCurrentDay(days[idx >= 0 ? idx : 0]);
            setIsMockTrip(false);
            return;
          }
        }
      } catch { /* fall through to localStorage */ }

      // ── localStorage fallback ──────────────────────────────────────────────
      try {
        const itineraryJson = localStorage.getItem('generatedItinerary');
        const metaJson = localStorage.getItem('generatedTripMeta');
        if (itineraryJson && metaJson) {
          const itinerary = JSON.parse(itineraryJson);
          const meta = JSON.parse(metaJson);
          if (meta?.destination) setDestination(meta.destination);
          if (meta?.organizerName) setCurrentUserName(meta.organizerName);
          if (itinerary?.length > 0) {
            const today = new Date().toISOString().split('T')[0];
            const idx = itinerary.findIndex((d: { date?: string }) => d.date === today);
            setCurrentDay(itinerary[idx >= 0 ? idx : 0]);
          }
          setIsMockTrip(false);
        }
      } catch (err) {
        console.error('Error loading trip for day-of view:', err);
      }
    };

    load();
  }, [tripId, isRealTrip]);

  const transportLegs = currentDay.transportLegs || [];

  // Merged + sorted timeline
  const timeline: TimelineItemDayOf[] = [
    ...currentDay.tracks.shared.map((a) => ({
      kind: 'activity' as const,
      data: a,
      sortTime: parseTime(a.timeSlot),
    })),
    ...transportLegs.map((leg) => ({
      kind: 'transport' as const,
      data: leg,
      sortTime: parseTime(leg.meetTime ?? leg.departureTime),
    })),
  ].sort((a, b) => a.sortTime - b.sortTime);

  // Get current time
  const getCurrentTimeInMinutes = () => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  };

  const displayNow = isMockTrip ? (10 * 60 + 15) : getCurrentTimeInMinutes();

  const getStatus = (item: TimelineItemDayOf): 'done' | 'now' | 'soon' | 'upcoming' => {
    const endMins = item.kind === 'activity' ? parseEndTime(item.data.timeSlot) : item.sortTime + 20;
    return getItemStatus(item.sortTime, endMins, displayNow);
  };

  const nowItem = timeline.find((i) => getStatus(i) === 'now');
  const doneCount = timeline.filter((i) => getStatus(i) === 'done').length;
  const totalActivities = timeline.filter((i) => i.kind === 'activity').length;

  const formattedTime = (() => {
    const d = new Date();
    const h = d.getHours();
    const m = d.getMinutes();
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  })();

  // Determine crew display
  const crewDisplay = isMockTrip
    ? groupMembers.slice(0, 4)
    : [{ id: 'current-user', name: currentUserName }];

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/trip/${tripId}/itinerary`}
            className="w-9 h-9 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors">
            <ChevronLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 font-medium">Day {currentDay.day} — {destination}</p>
            <p className="font-script italic font-semibold text-slate-900 truncate">
              {currentDay.theme || 'Today\'s Schedule'}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-lg font-script italic font-semibold text-slate-900">{formattedTime}</p>
            <p className="text-xs text-slate-500">{doneCount}/{totalActivities} done</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* Weather + Crew */}
        <div className="grid grid-cols-5 gap-3">
          {isMockTrip ? (
            <>
              {/* Mock Weather */}
              <div className="col-span-3 bg-gradient-to-br from-sky-600 to-sky-700 rounded-xl p-4 text-white">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs text-sky-200 font-medium">{destination}</p>
                    <div className="flex items-end gap-2 mt-1">
                      <span className="text-3xl font-script italic font-semibold">8°</span>
                      <span className="text-sky-200 text-xs mb-1">Partly cloudy</span>
                    </div>
                  </div>
                  <Cloud className="w-10 h-10 text-sky-200 opacity-70" />
                </div>
                <div className="grid grid-cols-3 gap-1 pt-2 border-t border-sky-500 text-center">
                  <div>
                    <Sun className="w-3.5 h-3.5 text-amber-300 mx-auto mb-0.5" />
                    <p className="text-xs text-sky-100">High 10°</p>
                  </div>
                  <div>
                    <Wind className="w-3.5 h-3.5 text-sky-300 mx-auto mb-0.5" />
                    <p className="text-xs text-sky-100">15 km/h</p>
                  </div>
                  <div>
                    <Droplets className="w-3.5 h-3.5 text-sky-300 mx-auto mb-0.5" />
                    <p className="text-xs text-sky-100">20%</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Real Trip Weather Placeholder */}
              <div className="col-span-3 bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl p-4 text-slate-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 font-medium">{destination}</p>
                    <p className="text-sm text-slate-600 mt-2">Weather coming soon</p>
                  </div>
                  <Cloud className="w-10 h-10 text-slate-300 opacity-50" />
                </div>
              </div>
            </>
          )}

          {/* Crew */}
          <div className="col-span-2 bg-white rounded-2xl border border-zinc-100 shadow-sm p-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Crew</p>
            <div className="space-y-1.5">
              {crewDisplay.map((m) => (
                <button key={m.id}
                  onClick={() => {
                    if (isMockTrip) {
                      const next = new Set(checkedIn);
                      if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                      setCheckedIn(next);
                    }
                  }}
                  className={`w-full flex items-center gap-2 ${isMockTrip ? '' : 'cursor-default'}`}>
                  <div className="relative flex-shrink-0">
                    <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                      {m.name.charAt(0)}
                    </div>
                    {isMockTrip && (
                      <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-white ${
                        checkedIn.has(m.id) ? 'bg-emerald-500' : 'bg-slate-300'
                      }`} />
                    )}
                  </div>
                  <span className="text-xs text-slate-700 truncate text-left">{m.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Now highlight */}
        {nowItem && (
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-sky-700 to-sky-600 text-white p-5 shadow-lg">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 -translate-y-8 translate-x-8" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/20 rounded-full text-xs font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Happening Now
                </span>
                <span className="text-sky-200 text-xs">
                  {nowItem.kind === 'activity' ? formatTimeRange(nowItem.data.timeSlot) :
                    `Meet ${formatTime(nowItem.data.meetTime ?? nowItem.data.departureTime)}`}
                </span>
              </div>
              <h2 className="font-script italic text-xl font-semibold mb-1">
                {nowItem.kind === 'activity' ? nowItem.data.title : nowItem.data.meetingPoint}
              </h2>
              <p className="text-sky-100 text-sm">
                {nowItem.kind === 'activity' ? (nowItem.data.address || nowItem.data.description?.slice(0, 60)) :
                  `\u2192 ${nowItem.data.destination}`}
              </p>
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                nowItem.kind === 'activity' ? (nowItem.data.address || nowItem.data.title) : nowItem.data.meetingPoint
              )}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold transition-colors">
                <Navigation className="w-4 h-4" />
                Navigate <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div>
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Today&apos;s Schedule</h2>
          <div className="space-y-2">
            {timeline.map((item) => {
              const status = getStatus(item);
              return item.kind === 'activity' ? (
                <ActivityCardDayOf key={item.data.id} activity={item.data} status={status} />
              ) : (
                <TransportCardDayOf key={item.data.id} leg={item.data} status={status} />
              );
            })}
          </div>
        </div>

        {/* Emergency */}
        <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-900">Emergency</p>
            <p className="text-xs text-red-700 mt-0.5">
              <strong>911 (US)</strong> &middot; <strong>112 (Europe/International)</strong> &middot; <strong>999 (UK)</strong>
            </p>
          </div>
        </div>

        {/* End of day */}
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden">
          <button onClick={() => setShowEndOfDay(!showEndOfDay)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors">
            <span className="font-semibold text-slate-900">End of Day Summary</span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showEndOfDay ? 'rotate-180' : ''}`} />
          </button>
          {showEndOfDay && (
            <div className="px-5 pb-5 border-t border-slate-100 space-y-4 pt-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                  <p className="text-2xl font-script italic font-semibold text-emerald-700">{doneCount}/{totalActivities}</p>
                  <p className="text-xs text-emerald-700 font-medium">Done</p>
                </div>
                <div className="bg-sky-50 rounded-xl p-3 border border-sky-100 text-center">
                  <DollarSign className="w-5 h-5 text-sky-600 mx-auto mb-1" />
                  <p className="text-2xl font-script italic font-semibold text-sky-700">$127</p>
                  <p className="text-xs text-sky-700 font-medium">Spent</p>
                </div>
                <div className="bg-violet-50 rounded-xl p-3 border border-violet-100 text-center">
                  <Camera className="w-5 h-5 text-violet-600 mx-auto mb-1" />
                  <p className="text-2xl font-script italic font-semibold text-violet-700">8</p>
                  <p className="text-xs text-violet-700 font-medium">Photos</p>
                </div>
              </div>
              <Link href={`/trip/${tripId}/memories`}
                className="flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors">
                <Camera className="w-4 h-4" />View Today&apos;s Memories
              </Link>
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-3 gap-2 pb-4">
          <Link href={`/trip/${tripId}/itinerary`}
            className="flex flex-col items-center gap-1.5 p-3 bg-white rounded-2xl border border-zinc-100 hover:border-sky-300 hover:shadow-sm hover:bg-sky-50 transition-all duration-300">
            <CalendarDays className="w-5 h-5 text-slate-600" />
            <span className="text-xs font-medium text-slate-700">Itinerary</span>
          </Link>
          <Link href={`/trip/${tripId}/group`}
            className="flex flex-col items-center gap-1.5 p-3 bg-white rounded-2xl border border-zinc-100 hover:border-sky-300 hover:shadow-sm hover:bg-sky-50 transition-all duration-300">
            <MessageSquare className="w-5 h-5 text-slate-600" />
            <span className="text-xs font-medium text-slate-700">Group</span>
          </Link>
          <Link href={`/trip/${tripId}/discover`}
            className="flex flex-col items-center gap-1.5 p-3 bg-white rounded-2xl border border-zinc-100 hover:border-sky-300 hover:shadow-sm hover:bg-sky-50 transition-all duration-300">
            <Zap className="w-5 h-5 text-slate-600" />
            <span className="text-xs font-medium text-slate-700">Discover</span>
          </Link>
        </div>

      </div>
    </main>
  );
}
