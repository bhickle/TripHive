'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Printer, Share2, Pause, Play, Lock } from 'lucide-react';
import {
  trips,
  itineraryDays as mockItineraryDays,
  groupMembers as mockGroupMembers,
  tripPhotos as mockTripPhotos,
  messages as mockMessages,
  MOCK_TRIP_IDS,
} from '@/data/mock';
import { Trip } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type StoryMode = 'trip' | 'yearly';

interface TripStoryModalProps {
  mode: StoryMode;
  trip?: Trip;
  onClose: () => void;
  /** The actual itinerary days for the trip being recapped. When provided,
   *  data-driven slides (Top Picks, etc.) use these instead of falling back
   *  to mock data. Optional so the demo path still works without a parent
   *  passing days explicitly. */
  itineraryDays?: import('@/lib/types').ItineraryDay[];
}

interface SlideDefinition {
  id: string;
  label: string;
  emoji: string;
  locked?: boolean;
  defaultEnabled: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SLIDE_DURATION = 5000;

const travelPersonalities: Record<string, { label: string; description: string; emoji: string }> = {
  adventure: { label: 'The Adventurer', description: "You chase experiences over comfort. If there's a glacier, you're on it.", emoji: '🧗' },
  foodie:    { label: 'The Foodie',     description: 'Every trip is a culinary journey. You plan around restaurants.',       emoji: '🍜' },
  culture:   { label: 'The Explorer',   description: 'History, art, locals — you want the real story behind every place.',   emoji: '🏛️' },
  luxury:    { label: 'The Nomad',      description: 'Slow travel, deep immersion. You live like a local wherever you go.',  emoji: '🌿' },
};

const coverPhotos: Record<string, string> = {
  iceland:   'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800&h=1400&fit=crop',
  tokyo:     'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800&h=1400&fit=crop',
  barcelona: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800&h=1400&fit=crop',
  amalfi:    'https://images.unsplash.com/photo-1534113414509-0eec2bfb493f?w=800&h=1400&fit=crop',
  default:   'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&h=1400&fit=crop',
};

const dayColors = [
  { bg: 'bg-sky-900/60',     border: 'border-sky-700/40',     text: 'text-sky-300',    num: 'bg-sky-700' },
  { bg: 'bg-violet-900/60',  border: 'border-violet-700/40',  text: 'text-violet-300', num: 'bg-violet-700' },
  { bg: 'bg-emerald-900/60', border: 'border-emerald-700/40', text: 'text-emerald-300',num: 'bg-emerald-700' },
  { bg: 'bg-rose-900/60',    border: 'border-rose-700/40',    text: 'text-rose-300',   num: 'bg-rose-700' },
  { bg: 'bg-amber-900/60',   border: 'border-amber-700/40',   text: 'text-amber-300',  num: 'bg-amber-700' },
];

// Mock laugh moments — used only for the demo Iceland trip. Real trips
// derive their laugh moments from `effectiveMessages` (top-reacted chat).
const mockLaughMoments = [
  { text: 'Marcus tried to pronounce "Þingvellir" for 5 whole minutes 💀', from: 'Brandon' },
  { text: "A puffin literally yoinked Sarah's sandwich off the cliff 😂😂", from: 'Alex Rivera' },
  { text: 'Jordan fell asleep at the glacier before the hike even started 🤣', from: 'Emily Park' },
];

// ─── Story data shapes (unified for mock + real-trip data) ────────────────────

type StoryMember = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};

type StoryPhoto = {
  id: string;
  url: string;
  activity?: string;
  day?: number;
  uploadedBy?: string;
};

type StoryMessage = {
  id: string;
  senderName: string;
  content: string;
  // Reactions shape from the API: { '😂': ['user_id', ...], ... }.
  // Mock messages don't include this.
  reactions?: Record<string, string[]> | null;
};

type LaughMoment = { text: string; from: string };

// Sums every reaction across the message's reactions map.
function totalReactions(m: StoryMessage): number {
  if (!m.reactions) return 0;
  return Object.values(m.reactions).reduce((s, arr) => s + (arr?.length ?? 0), 0);
}

// Heuristic match for "this message made people laugh." Used both to count
// laugh-y messages and to surface them in the slide.
const laughEmojiSet = new Set(['😂', '🤣', '💀', '😆', '🤪']);

function laughScore(m: StoryMessage): number {
  let score = 0;
  if (m.reactions) {
    for (const [emoji, users] of Object.entries(m.reactions)) {
      if (laughEmojiSet.has(emoji)) score += (users?.length ?? 0) * 2; // weight reactions
      else score += (users?.length ?? 0);
    }
  }
  // Light boost when the message itself contains a laugh marker.
  if (/😂|🤣|💀|lol|haha|lmao/i.test(m.content)) score += 1;
  return score;
}

function getLaughCount(msgs: StoryMessage[]): number {
  return msgs.reduce((sum, m) => {
    const fromReactions = m.reactions
      ? Object.entries(m.reactions).reduce(
          (s, [emoji, users]) => s + (laughEmojiSet.has(emoji) ? (users?.length ?? 0) : 0),
          0,
        )
      : 0;
    const fromText = /😂|🤣|💀|lol|haha|lmao/i.test(m.content) ? 1 : 0;
    return sum + fromReactions + fromText;
  }, 0);
}

function pickLaughMoments(msgs: StoryMessage[], n: number): LaughMoment[] {
  const ranked = msgs
    .map(m => ({ m, score: laughScore(m) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, n).map(r => ({ text: r.m.content, from: r.m.senderName }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCoverPhoto(destination: string) {
  const lower = destination.toLowerCase();
  for (const key of Object.keys(coverPhotos)) {
    if (key !== 'default' && lower.includes(key)) return coverPhotos[key];
  }
  return coverPhotos.default;
}

function getDayCount(trip: Trip) {
  const ms = new Date(trip.endDate).getTime() - new Date(trip.startDate).getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function formatDateRange(trip: Trip) {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  // Noon-pad to avoid UTC-midnight off-by-one in non-UTC timezones.
  const start = new Date(trip.startDate + 'T12:00:00').toLocaleDateString('en-US', opts);
  const end = new Date(trip.endDate + 'T12:00:00').toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${start} – ${end}`;
}

function getPersonality(tripsArr: Trip[]) {
  const totalBudget = tripsArr.reduce((s, t) => s + t.budgetTotal, 0);
  const avgBudget = totalBudget / (tripsArr.length || 1);
  const dests = tripsArr.map(t => t.destination.toLowerCase()).join(' ');
  if (dests.includes('iceland') || dests.includes('hike') || dests.includes('costa')) return travelPersonalities.adventure;
  if (dests.includes('tokyo') || dests.includes('bangkok') || dests.includes('paris')) return travelPersonalities.foodie;
  if (avgBudget > 4000) return travelPersonalities.luxury;
  return travelPersonalities.culture;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// Avatar — shows photo if available, falls back to coloured initials
function StoryAvatar({ name, avatarUrl, size = 40 }: { name: string; avatarUrl?: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const colors = ['bg-sky-700', 'bg-violet-700', 'bg-emerald-700', 'bg-rose-700', 'bg-amber-700'];
  const color = colors[name.charCodeAt(0) % colors.length];
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`${color} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}

// Slide wrapper with optional semi-transparent photo background
function SlideWithPhotoBg({ bgPhoto, children }: { bgPhoto?: string; children: React.ReactNode }) {
  return (
    <div className="relative w-full h-full bg-zinc-950 overflow-hidden">
      {bgPhoto && (
        <>
          <img
            src={bgPhoto}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: 0.35 }}
          />
          {/* Vignette — heavier at top/bottom where text lives, lighter in the middle */}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/85 via-zinc-950/30 to-zinc-950/70" />
        </>
      )}
      <div className="relative z-10 w-full h-full">
        {children}
      </div>
    </div>
  );
}

// ─── Trip Story Slides ────────────────────────────────────────────────────────

function CoverSlide({ trip, members, coverPhoto }: { trip: Trip; members: StoryMember[]; coverPhoto: string }) {
  const photo = coverPhoto;
  const dest = trip.destination.split(',')[0].toUpperCase();
  const country = trip.destination.split(',')[1]?.trim() || '';
  return (
    <div className="relative w-full h-full overflow-hidden">
      <img src={photo} alt={trip.destination} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />
      <div className="absolute top-6 left-6 flex items-center gap-2">
        <div className="w-7 h-7 bg-sky-800 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-xs">t</span>
        </div>
        <span className="text-white font-bold text-base tracking-tight opacity-90">tripcoord</span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-8 pb-12">
        <p className="text-sky-300 text-xs font-semibold uppercase tracking-widest mb-2">{country}</p>
        {/* Step the size down for long city names so they don't clip off the
            card's right edge ("PITTSBURGH" overflowed at text-6xl). break-words
            is a final safety net for very long single tokens. */}
        <h2 className={`${dest.length > 12 ? 'text-4xl' : dest.length > 9 ? 'text-5xl' : 'text-6xl'} font-black text-white leading-none mb-3 drop-shadow-lg break-words`}>{dest}</h2>
        <p className="text-white/80 text-lg font-semibold mb-1">{trip.title}</p>
        <p className="text-white/60 text-sm mb-6">{formatDateRange(trip)}</p>
        {members.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {members.slice(0, 5).map((m, i) => (
                <div key={m.id} className="ring-2 ring-white/30 rounded-full" style={{ zIndex: 10 - i }}>
                  <StoryAvatar name={m.name} avatarUrl={m.avatarUrl ?? undefined} size={32} />
                </div>
              ))}
            </div>
            <span className="text-white/70 text-sm">
              {members.length} {members.length === 1 ? 'person' : 'people'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function NumbersSlide({
  trip,
  bgPhoto,
  days: tripDays,
  memberCount,
  photoCount,
}: {
  trip: Trip;
  bgPhoto?: string;
  days: import('@/lib/types').ItineraryDay[];
  memberCount: number;
  photoCount: number;
}) {
  const days = getDayCount(trip);
  const activities = tripDays.reduce((s, d) =>
    s + (d.tracks?.shared?.length ?? 0) + (d.tracks?.track_a?.length ?? 0) + (d.tracks?.track_b?.length ?? 0), 0);
  const stats = [
    { value: days,        label: 'Days Out There',    sub: 'of actual living',    color: 'text-sky-300' },
    { value: activities,  label: 'Activities Planned', sub: 'zero of them boring', color: 'text-violet-300' },
    { value: photoCount,  label: 'Photos Taken',       sub: 'memories made',       color: 'text-emerald-300' },
    { value: memberCount, label: memberCount === 1 ? 'Person' : 'People', sub: 'who made it happen',  color: 'text-rose-300' },
  ];
  return (
    <SlideWithPhotoBg bgPhoto={bgPhoto}>
      <div className="flex flex-col items-center justify-center h-full p-8">
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-2">By the numbers</p>
        <h2 className="text-white text-3xl font-black mb-8 text-center leading-tight">
          {trip.destination.split(',')[0]} in stats
        </h2>
        <div className="grid grid-cols-2 gap-4 w-full">
          {stats.map((s, i) => (
            <div key={i} className="bg-white/8 backdrop-blur-sm rounded-2xl p-5 text-center border border-white/10">
              <p className={`text-5xl font-black mb-1 ${s.color}`}>{s.value}</p>
              <p className="text-white font-bold text-sm">{s.label}</p>
              <p className="text-zinc-400 text-xs mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
        <div className="absolute bottom-8 left-0 right-0 flex justify-center">
          <div className="flex items-center gap-2 opacity-30">
            <div className="w-5 h-5 bg-sky-800 rounded flex items-center justify-center">
              <span className="text-white font-bold text-[9px]">t</span>
            </div>
            <span className="text-white text-xs font-bold">tripcoord</span>
          </div>
        </div>
      </div>
    </SlideWithPhotoBg>
  );
}

function DayHighlightsSlide({ trip, bgPhoto, days: tripDays }: { trip: Trip; bgPhoto?: string; days: import('@/lib/types').ItineraryDay[] }) {
  const highlights = tripDays.slice(0, 5).map(day => {
    const all = [
      ...(day.tracks?.shared ?? []),
      ...(day.tracks?.track_a ?? []),
      ...(day.tracks?.track_b ?? []),
    ];
    const notable = all.find(a => a.category !== 'transport' && a.category !== 'accommodation') ?? all[0];
    return { day: day.day, theme: day.theme, activity: notable?.title ?? 'Free time' };
  });
  return (
    <SlideWithPhotoBg bgPhoto={bgPhoto}>
      <div className="flex flex-col p-8 pt-10 h-full">
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-2">The itinerary</p>
        <h2 className="text-white text-3xl font-black mb-6 leading-tight">Day by day</h2>
        <div className="flex flex-col gap-3 flex-1 overflow-hidden">
          {highlights.map((h, i) => {
            const c = dayColors[i % dayColors.length];
            return (
              <div key={h.day} className={`${c.bg} backdrop-blur-sm border ${c.border} rounded-xl px-4 py-3 flex items-center gap-3`}>
                <div className={`${c.num} w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0`}>
                  <span className="text-white font-black text-xs">{h.day}</span>
                </div>
                <div className="min-w-0">
                  <p className={`${c.text} text-[10px] font-semibold uppercase tracking-wide`}>{h.theme}</p>
                  <p className="text-white font-semibold text-sm truncate">{h.activity}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-center mt-4 opacity-30">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-sky-800 rounded flex items-center justify-center">
              <span className="text-white font-bold text-[9px]">t</span>
            </div>
            <span className="text-white text-xs font-bold">tripcoord</span>
          </div>
        </div>
      </div>
    </SlideWithPhotoBg>
  );
}

const crewRoles = ['The Organizer', 'The Adventurer', 'The Foodie', 'The Navigator', 'The Photographer', 'The Vibe'];

// CitiesMapSlide — renders a static Google Maps image with a pin per
// user-tagged visited city. Drops out of the deck when the trip has no
// `visited_cities`. Cities are passed as marker arguments to Static Maps,
// which geocodes them server-side; no client-side geocoding needed.
//
// Uses NEXT_PUBLIC_GOOGLE_MAPS_KEY (the public key Maps embeds use). If
// the key is missing the slide falls back to a simple chip list with no map.
function CitiesMapSlide({ bgPhoto, cities }: { bgPhoto?: string; cities: string[] }) {
  // If the Static Maps image itself fails to load (API not enabled on the
  // key, quota, network), fall back to the chip-only view instead of a
  // broken-image icon.
  const [mapFailed, setMapFailed] = useState(false);
  const trimmed = cities.map(c => (c ?? '').trim()).filter(Boolean);
  // Dedupe case-insensitively while preserving display casing of first occurrence.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const c of trimmed) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? '';
  const mapUrl = apiKey && unique.length > 0
    ? (() => {
        // Cap markers at 10 to keep the URL within Google's length limit.
        // For 11+ city trips we show every chip in the list below but only
        // the first 10 as map pins — acceptable for the v1 visual.
        const markers = unique.slice(0, 10).map(c =>
          `markers=color:0xb91c1c%7Csize:mid%7C${encodeURIComponent(c)}`,
        ).join('&');
        return `https://maps.googleapis.com/maps/api/staticmap?size=600x400&maptype=roadmap&scale=2&${markers}&key=${apiKey}`;
      })()
    : null;

  return (
    <SlideWithPhotoBg bgPhoto={bgPhoto}>
      <div className="relative h-full flex flex-col p-8 sm:p-10 md:p-12">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-white/70">The map</p>
          <p className="text-3xl sm:text-4xl md:text-5xl font-script italic text-white mt-2">Where we went</p>
        </div>

        <div className="flex-1 flex items-center justify-center my-6">
          {mapUrl && !mapFailed ? (
            // Plain <img> not next/image — Static Maps URLs are dynamic per
            // city tuple and don't benefit from Next's image optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mapUrl}
              alt={`Map of ${unique.join(', ')}`}
              onError={() => setMapFailed(true)}
              className="rounded-2xl shadow-2xl max-w-full max-h-full object-contain border border-white/20"
            />
          ) : (
            // Key missing / map failed / no cities — chip-only fallback.
            <div className="bg-white/10 border border-white/20 rounded-2xl p-8 text-white/70 text-sm">
              {unique.length > 0 ? 'Map preview unavailable' : 'No cities tagged yet'}
            </div>
          )}
        </div>

        <div className="text-center space-y-3">
          <p className="text-sm text-white/80">
            <span className="font-semibold text-white">{unique.length}</span>{' '}
            {unique.length === 1 ? 'city' : 'cities'}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5 max-w-md mx-auto">
            {unique.map(c => (
              <span key={c} className="text-xs bg-white/15 text-white px-3 py-1 rounded-full backdrop-blur-sm">
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </SlideWithPhotoBg>
  );
}

function CrewSlide({ bgPhoto, members }: { bgPhoto?: string; members: StoryMember[] }) {
  return (
    <SlideWithPhotoBg bgPhoto={bgPhoto}>
      <div className="flex flex-col p-8 pt-10 h-full">
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-2">Who made it happen</p>
        <h2 className="text-white text-3xl font-black mb-6 leading-tight">The Crew 🫂</h2>
        <div className="grid grid-cols-2 gap-3 flex-1">
          {members.slice(0, 6).map((m, i) => (
            <div key={m.id} className="bg-white/8 backdrop-blur-sm border border-white/10 rounded-2xl p-4 flex flex-col items-center text-center">
              <StoryAvatar name={m.name} avatarUrl={m.avatarUrl ?? undefined} size={48} />
              <p className="text-white font-bold text-sm mt-2 leading-tight">{m.name}</p>
              <p className="text-zinc-400 text-xs mt-0.5">{crewRoles[i % crewRoles.length]}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-center mt-4 opacity-30">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-sky-800 rounded flex items-center justify-center">
              <span className="text-white font-bold text-[9px]">t</span>
            </div>
            <span className="text-white text-xs font-bold">tripcoord</span>
          </div>
        </div>
      </div>
    </SlideWithPhotoBg>
  );
}

// Replaces the old BudgetSlide. Brandon's note: a money breakdown is a
// planning artifact, not a memory artifact. The deck now ends on the
// experiences themselves. Picks 3 standout activities across the whole
// trip — non-meal, non-transport, non-accommodation — ranked by category
// distinctiveness (one adventure, one cultural, one scenic when available).
//
// Reads days from props so the slide reflects the trip actually being
// recapped, not hardcoded mock data. The parent (itinerary page) passes
// the trip's real days; the demo path passes the mock import.
function TopPicksSlide({ bgPhoto, days: tripDays }: { bgPhoto?: string; days: import('@/lib/types').ItineraryDay[] }) {
  // Collect every non-utility activity across all days, then pick the
  // first 3 with distinct categories so the slide isn't all the same
  // type of thing.
  const allActivities = tripDays.flatMap(d => [
    ...(d.tracks?.shared ?? []),
    ...(d.tracks?.track_a ?? []),
    ...(d.tracks?.track_b ?? []),
  ]).filter(a => {
    const cat = (a.category ?? '').toLowerCase();
    return cat !== 'transport' && cat !== 'accommodation' && !a.isRestaurant;
  });

  const seenCategories = new Set<string>();
  const picks: typeof allActivities = [];
  for (const a of allActivities) {
    const cat = (a.category ?? 'experience').toLowerCase();
    if (seenCategories.has(cat) && picks.length >= 3) continue;
    if (picks.length >= 3) break;
    if (!seenCategories.has(cat)) {
      seenCategories.add(cat);
      picks.push(a);
    }
  }
  // Pad to 3 with whatever's left if we didn't find enough categories
  if (picks.length < 3) {
    for (const a of allActivities) {
      if (picks.length >= 3) break;
      if (!picks.includes(a)) picks.push(a);
    }
  }

  return (
    <SlideWithPhotoBg bgPhoto={bgPhoto}>
      <div className="flex flex-col p-8 pt-10 h-full">
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-2">The greatest hits</p>
        <h2 className="text-white text-3xl font-black mb-5 leading-tight">You&apos;ll Remember These</h2>
        <div className="flex flex-col gap-3 flex-1">
          {picks.map((a, i) => {
            const c = dayColors[i % dayColors.length];
            return (
              <div key={a.id} className={`${c.bg} backdrop-blur-sm border ${c.border} rounded-xl p-4`}>
                <div className="flex items-center gap-3 mb-1">
                  <div className={`${c.num} w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0`}>
                    <span className="text-white font-black text-xs">{i + 1}</span>
                  </div>
                  <p className="text-white font-bold text-sm leading-tight flex-1">{a.title}</p>
                </div>
                {a.description && (
                  <p className="text-zinc-300 text-xs leading-relaxed line-clamp-2 ml-10">
                    {a.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-center mt-4 opacity-30">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-sky-800 rounded flex items-center justify-center">
              <span className="text-white font-bold text-[9px]">t</span>
            </div>
            <span className="text-white text-xs font-bold">tripcoord</span>
          </div>
        </div>
      </div>
    </SlideWithPhotoBg>
  );
}

function LaughsSlide({ bgPhoto, moments, laughCount }: { bgPhoto?: string; moments: LaughMoment[]; laughCount: number }) {
  return (
    <SlideWithPhotoBg bgPhoto={bgPhoto}>
      <div className="flex flex-col p-8 pt-10 h-full">
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-2">Best of the chat</p>
        <h2 className="text-white text-3xl font-black mb-2 leading-tight">The Laughs 😂</h2>
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-amber-500/20 border border-amber-500/30 rounded-full px-4 py-1.5">
            <span className="text-amber-300 font-black text-2xl">{laughCount}</span>
            <span className="text-amber-400 text-sm font-semibold ml-2">laugh reactions</span>
          </div>
        </div>
        <div className="flex flex-col gap-3 flex-1">
          {moments.length === 0 ? (
            <div className="bg-white/8 backdrop-blur-sm border border-white/10 rounded-2xl p-6 text-center">
              <p className="text-white/80 text-sm leading-relaxed">No memorable chat moments yet.</p>
              <p className="text-zinc-500 text-xs mt-2">React to messages in the group chat and they'll show up here.</p>
            </div>
          ) : (
            moments.map((m, i) => (
              <div key={i} className="bg-white/8 backdrop-blur-sm border border-white/10 rounded-2xl p-4">
                <p className="text-white text-sm leading-relaxed mb-2">"{m.text}"</p>
                <p className="text-zinc-500 text-xs font-semibold">— {m.from}</p>
              </div>
            ))
          )}
        </div>
        <p className="text-zinc-600 text-xs text-center mt-4">based on group chat activity</p>
      </div>
    </SlideWithPhotoBg>
  );
}

// Photo shape used by the lightbox + photo slides. Mirrors the mock shape
// (`tripPhotos[0]`) and the API response from /api/trips/[id]/photos.
type TripPhoto = StoryPhoto;

// ─── Shared Lightbox (rendered in card root at z-40, above tap zones) ─────────

const REACTION_EMOJIS = ['❤️', '😂', '😍', '🔥'];

interface PhotoLightboxProps {
  photos: TripPhoto[];
  initialIdx: number;
  reactions: Record<string, Record<string, number>>;
  onReact: (photoId: string, emoji: string) => void;
  onClose: () => void;
}

function PhotoLightbox({ photos, initialIdx, reactions, onReact, onClose }: PhotoLightboxProps) {
  const [idx, setIdx] = useState(initialIdx);
  const photo = photos[idx];
  if (!photo) return null;
  const photoReactions = reactions[photo.id] ?? {};
  const nav = (dir: 1 | -1, e: React.MouseEvent) => {
    e.stopPropagation();
    setIdx(i => (i + dir + photos.length) % photos.length);
  };
  return (
    // Sits at z-40 — above tap zones (z-20) and progress bars (z-30)
    <div className="absolute inset-0 z-40 bg-black overflow-hidden" onClick={onClose}>
      <img
        src={photo.url}
        alt={photo.activity}
        className="absolute inset-0 w-full h-full object-contain"
      />
      {/* Top bar */}
      <div
        className="absolute top-0 left-0 right-0 px-4 pt-4 pb-10 bg-gradient-to-b from-black/75 to-transparent z-10 flex items-center gap-2"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-white/80 hover:text-white text-sm font-semibold"
        >
          <ChevronLeft className="w-4 h-4" /> Photos
        </button>
        <span className="ml-auto text-white/45 text-xs font-semibold tabular-nums">
          {idx + 1} / {photos.length}
        </span>
      </div>

      {/* Prev arrow */}
      <button
        onClick={e => nav(-1, e)}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-all shadow-lg"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      {/* Next arrow */}
      <button
        onClick={e => nav(1, e)}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-all shadow-lg"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Dot strip */}
      <div
        className="absolute bottom-24 left-0 right-0 flex justify-center gap-1.5 z-10"
        onClick={e => e.stopPropagation()}
      >
        {photos.map((_, i) => (
          <button
            key={i}
            onClick={e => { e.stopPropagation(); setIdx(i); }}
            className={`rounded-full transition-all ${i === idx ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/35 hover:bg-white/60'}`}
          />
        ))}
      </div>

      {/* Bottom info + reactions */}
      <div
        className="absolute bottom-0 left-0 right-0 px-5 pb-5 pt-12 bg-gradient-to-t from-black/85 to-transparent z-10"
        onClick={e => e.stopPropagation()}
      >
        <p className="text-white font-bold text-sm mb-0.5 truncate">{photo.activity}</p>
        <p className="text-white/45 text-xs mb-3">
          {'day' in photo ? `Day ${photo.day} · ` : ''}by {photo.uploadedBy}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {REACTION_EMOJIS.map(emoji => {
            const count = photoReactions[emoji] ?? 0;
            return (
              <button
                key={emoji}
                onClick={e => { e.stopPropagation(); onReact(photo.id, emoji); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all ${
                  count > 0
                    ? 'bg-white/20 border border-white/30 text-white scale-105'
                    : 'bg-white/10 border border-white/15 text-white/55 hover:bg-white/18 hover:text-white'
                }`}
              >
                <span>{emoji}</span>
                {count > 0 && <span className="text-xs">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Photo slide helpers ───────────────────────────────────────────────────────

interface PhotoGridProps {
  photos: TripPhoto[];
  reactions: Record<string, Record<string, number>>;
  onOpen: (idx: number) => void;
}

function PhotosSlide({ photos, reactions, onOpen }: PhotoGridProps) {
  // Grid only — lightbox is rendered at card root level by TripStoryModal
  return (
    <div className="relative w-full h-full bg-zinc-950 overflow-hidden">
      <div className="absolute top-6 left-6 right-20 z-10">
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-1">You were there</p>
        <h2 className="text-white text-2xl font-black leading-tight">Trip Photos 📷</h2>
      </div>
      <div className="absolute top-6 right-4 z-10 flex items-center gap-1.5 opacity-40">
        <div className="w-5 h-5 bg-sky-800 rounded flex items-center justify-center">
          <span className="text-white font-bold text-[9px]">t</span>
        </div>
        <span className="text-white text-xs font-bold">tripcoord</span>
      </div>
      <div className="absolute inset-0 flex flex-col gap-1 pt-20 pb-10 px-1">
        {photos[0] && (
          <button className="w-full flex-none relative group/photo" style={{ height: '35%' }} onClick={() => onOpen(0)}>
            <img src={photos[0].url} alt={photos[0].activity} className="w-full h-full object-cover rounded-xl" />
            <div className="absolute inset-0 rounded-xl bg-black/0 group-hover/photo:bg-black/20 transition-colors flex items-center justify-center">
              <span className="text-white text-xs font-semibold opacity-0 group-hover/photo:opacity-100 bg-black/50 px-3 py-1 rounded-full transition-opacity">{photos[0].activity}</span>
            </div>
          </button>
        )}
        <div className="grid grid-cols-3 gap-1 flex-1">
          {photos.slice(1).map((p, i) => {
            const total = Object.values(reactions[p.id] ?? {}).reduce((s, v) => s + v, 0);
            return (
              <button key={p.id} className="relative overflow-hidden rounded-xl group/photo" onClick={() => onOpen(i + 1)}>
                <img src={p.url} alt={p.activity} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/15 group-hover/photo:bg-black/30 transition-colors" />
                {total > 0 && <div className="absolute top-1 right-1 bg-black/60 rounded-full px-1.5 py-0.5 text-[10px] text-white font-bold">{total}</div>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-2.5 pt-8 bg-gradient-to-t from-zinc-950">
        <p className="text-zinc-400 text-xs text-center">{photos.length} photos · tap any to open · uploaded by the crew</p>
      </div>
    </div>
  );
}

function ShareSlide({ trip, onDownload, coverPhoto }: { trip: Trip; onDownload: () => void; coverPhoto: string }) {
  const photo = coverPhoto;
  return (
    <div className="relative w-full h-full overflow-hidden">
      <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover scale-110" />
      <div className="absolute inset-0 bg-gradient-to-br from-sky-900/90 via-zinc-900/85 to-emerald-900/90" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-14 h-14 bg-sky-800 rounded-2xl flex items-center justify-center mb-6 shadow-xl">
          <span className="text-white font-black text-2xl">t</span>
        </div>
        <h2 className="text-white text-4xl font-black mb-3 leading-tight">
          See you on<br />the next one ✈
        </h2>
        <p className="text-white/60 text-sm mb-2">{trip.title}</p>
        <p className="text-sky-300 text-xs font-semibold uppercase tracking-widest mb-10">
          {trip.destination} · {formatDateRange(trip)}
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {/* Opens the browser print dialog so the user can save as PDF
              or print. Icon + label match the actual behavior; the
              previous Download icon set the wrong expectation. A real
              image export needs html2canvas/dom-to-image, deferred. */}
          <button
            onClick={onDownload}
            className="flex items-center justify-center gap-2 bg-white text-zinc-900 font-bold py-3 px-6 rounded-full text-sm hover:bg-zinc-100 transition-all shadow-lg"
          >
            <Printer className="w-4 h-4" />
            Print this card
          </button>
          {/* "Copy share link" hidden for launch — there's no public
              /story/[id] route yet, so the link copied a 404. Restore
              once the public story page ships. */}
        </div>
        <p className="text-white/30 text-xs mt-8 font-medium">tripcoord.ai</p>
      </div>
    </div>
  );
}

// ─── Yearly Review Slides ─────────────────────────────────────────────────────

function YearlyCoverSlide({ year }: { year: number }) {
  const photos = trips.slice(0, 3).map(t => getCoverPhoto(t.destination));
  return (
    <div className="relative w-full h-full overflow-hidden bg-zinc-950">
      <div className="absolute inset-0 grid grid-cols-3">
        {photos.map((p, i) => (
          <img key={i} src={p} alt="" className="w-full h-full object-cover opacity-40" />
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-zinc-950/40" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-12 h-12 bg-sky-800 rounded-xl flex items-center justify-center mb-6">
          <span className="text-white font-black text-xl">t</span>
        </div>
        <p className="text-sky-300 text-xs font-semibold uppercase tracking-widest mb-3">Your year in travel</p>
        <h2 className="text-white text-7xl font-black leading-none mb-4">{year}</h2>
        <p className="text-zinc-400 text-base">Wrapped by tripcoord</p>
      </div>
    </div>
  );
}

function YearlyStatsSlide({ year, bgPhoto }: { year: number; bgPhoto?: string }) {
  const allTrips = trips;
  const totalDays = allTrips.reduce((s, t) => s + getDayCount(t), 0);
  const totalSpent = allTrips.reduce((s, t) => s + t.budgetTotal, 0);
  const countries = new Set(allTrips.map(t => t.destination.split(',')[1]?.trim())).size;
  const stats = [
    { value: allTrips.length, label: 'Trips',           sub: 'and counting',         color: 'text-sky-300' },
    { value: countries,       label: 'Countries',        sub: 'in your passport',     color: 'text-violet-300' },
    { value: totalDays,       label: 'Travel Days',      sub: 'living your best life',color: 'text-emerald-300' },
    { value: `$${Math.round(totalSpent / 1000)}k`, label: 'Invested in memories', sub: 'worth every cent', color: 'text-rose-300' },
  ];
  return (
    <SlideWithPhotoBg bgPhoto={bgPhoto}>
      <div className="flex flex-col items-center justify-center h-full p-8">
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-2">The tally</p>
        <h2 className="text-white text-3xl font-black mb-8 text-center">{year} by the numbers</h2>
        <div className="grid grid-cols-2 gap-4 w-full">
          {stats.map((s, i) => (
            <div key={i} className="bg-white/8 backdrop-blur-sm border border-white/10 rounded-2xl p-5 text-center">
              <p className={`text-5xl font-black mb-1 ${s.color}`}>{s.value}</p>
              <p className="text-white font-bold text-sm leading-tight">{s.label}</p>
              <p className="text-zinc-500 text-xs mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>
      </div>
    </SlideWithPhotoBg>
  );
}

function YearlyDestinationsSlide() {
  return (
    <div className="w-full h-full bg-zinc-950 flex flex-col p-8 pt-10">
      <p className="text-zinc-500 text-xs font-semibold uppercase tracking-widest mb-2">Where you went</p>
      <h2 className="text-white text-3xl font-black mb-6 leading-tight">Your adventures</h2>
      <div className="flex flex-col gap-3 flex-1">
        {trips.map((trip, i) => {
          const photo = getCoverPhoto(trip.destination);
          const c = dayColors[i % dayColors.length];
          const days = getDayCount(trip);
          return (
            <div key={trip.id} className="relative rounded-xl overflow-hidden h-[88px] flex-shrink-0">
              <img src={photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
              <div className="relative z-10 flex items-center h-full px-4 gap-3">
                <div className={`${c.num} w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0`}>
                  <span className="text-white font-black text-xs">{i + 1}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-white font-bold truncate">{trip.title}</p>
                  <p className="text-white/60 text-xs">{trip.destination.split(',')[0]} · {days} days</p>
                </div>
                <div className="ml-auto">
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    trip.status === 'completed' ? 'bg-emerald-700/80 text-emerald-200' :
                    trip.status === 'active' ? 'bg-sky-700/80 text-sky-200' :
                    'bg-zinc-700/80 text-zinc-300'
                  }`}>
                    {trip.status === 'completed' ? 'Done ✓' : trip.status === 'active' ? 'Active' : 'Planned'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearlyPersonalitySlide({ bgPhoto }: { bgPhoto?: string }) {
  const personality = getPersonality(trips);
  return (
    <SlideWithPhotoBg bgPhoto={bgPhoto}>
      <div className="flex flex-col items-center justify-center h-full p-8 text-center relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center opacity-10">
          <div className="w-72 h-72 rounded-full bg-sky-500 blur-3xl" />
        </div>
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-4 relative">Based on your travels...</p>
        <div className="text-8xl mb-6 relative">{personality.emoji}</div>
        <p className="text-sky-300 text-sm font-semibold uppercase tracking-widest mb-3 relative">You&apos;re</p>
        <h2 className="text-white text-4xl font-black mb-5 leading-tight relative">{personality.label}</h2>
        <p className="text-zinc-400 text-base leading-relaxed max-w-xs relative">{personality.description}</p>
      </div>
    </SlideWithPhotoBg>
  );
}

function YearlyPhotosSlide({ reactions, onOpen }: { reactions: Record<string, Record<string, number>>; onOpen: (idx: number) => void }) {
  const photos = mockTripPhotos;
  const firstPair = photos.slice(0, 2);
  const rest = photos.slice(2, 8);
  return (
    <div className="relative w-full h-full bg-zinc-950 overflow-hidden">
      <div className="absolute top-6 left-6 right-20 z-10">
        <p className="text-zinc-400 text-xs font-semibold uppercase tracking-widest mb-1">The whole year</p>
        <h2 className="text-white text-2xl font-black leading-tight">Year in Photos 📷</h2>
      </div>
      <div className="absolute top-6 right-4 z-10 flex items-center gap-1.5 opacity-40">
        <div className="w-5 h-5 bg-sky-800 rounded flex items-center justify-center">
          <span className="text-white font-bold text-[9px]">t</span>
        </div>
        <span className="text-white text-xs font-bold">tripcoord</span>
      </div>
      <div className="absolute inset-0 flex flex-col gap-1 pt-20 pb-10 px-1">
        <div className="flex gap-1 flex-none" style={{ height: '30%' }}>
          {firstPair.map((p, i) => (
            <button key={p.id} className="flex-1 relative overflow-hidden rounded-xl group/photo" onClick={() => onOpen(i)}>
              <img src={p.url} alt={p.activity} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/15 group-hover/photo:bg-black/30 transition-colors" />
              <div className="absolute bottom-1.5 left-2 text-white/70 text-[10px] font-semibold truncate max-w-[80%] drop-shadow">{p.activity}</div>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1 flex-1">
          {rest.map((p, i) => {
            const total = Object.values(reactions[p.id] ?? {}).reduce((s, v) => s + v, 0);
            return (
              <button key={p.id} className="relative overflow-hidden rounded-xl group/photo" onClick={() => onOpen(i + 2)}>
                <img src={p.url} alt={p.activity} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/15 group-hover/photo:bg-black/30 transition-colors" />
                {total > 0 && <div className="absolute top-1 right-1 bg-black/60 rounded-full px-1.5 py-0.5 text-[10px] text-white font-bold">{total}</div>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-2.5 pt-6 bg-gradient-to-t from-zinc-950">
        <p className="text-zinc-400 text-xs text-center">{photos.length} photos · tap any to open</p>
      </div>
    </div>
  );
}

function YearlyShareSlide({ year, onDownload, reactions, onOpen }: { year: number; onDownload: () => void; reactions: Record<string, Record<string, number>>; onOpen: (idx: number) => void }) {
  const upcomingCount = trips.filter(t => t.status === 'planning').length;
  // heroPhotos are a subset — we pass their indices relative to mockTripPhotos so the lightbox navigates the full set
  const heroIndices = [0, 3, 6];
  const heroPhotos = heroIndices.map(i => mockTripPhotos[i]).filter(Boolean);
  return (
    <div className="relative w-full h-full overflow-hidden bg-zinc-950 flex flex-col">
      <div className="flex gap-1 flex-none" style={{ height: '38%' }}>
        {heroPhotos.map((p, i) => (
          <button key={p.id} className="flex-1 relative overflow-hidden group/photo" onClick={() => onOpen(heroIndices[i])}>
            <img src={p.url} alt={p.activity} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/20 group-hover/photo:bg-black/10 transition-colors" />
            <div className="absolute inset-0 flex items-end justify-center pb-1.5 opacity-0 group-hover/photo:opacity-100 transition-opacity">
              <span className="text-white/80 text-[10px] font-semibold bg-black/40 px-2 py-0.5 rounded-full">{p.activity}</span>
            </div>
            {Object.values(reactions[p.id] ?? {}).reduce((s, v) => s + v, 0) > 0 && (
              <div className="absolute top-1.5 right-1.5 bg-black/60 rounded-full px-1.5 py-0.5 text-[10px] text-white font-bold">
                {Object.values(reactions[p.id] ?? {}).reduce((s, v) => s + v, 0)}
              </div>
            )}
          </button>
        ))}
      </div>
      <div className="absolute left-0 right-0 bg-gradient-to-b from-transparent to-zinc-950 z-10 pointer-events-none" style={{ top: 'calc(38% - 40px)', height: 80 }} />
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center relative z-20">
        <div className="w-12 h-12 bg-sky-800 rounded-2xl flex items-center justify-center mb-4 shadow-xl">
          <span className="text-white font-black text-xl">t</span>
        </div>
        <h2 className="text-white text-3xl font-black mb-2 leading-tight">Here's to {year + 1} ✨</h2>
        <p className="text-white/55 text-sm mb-1">You've got {upcomingCount} trip{upcomingCount !== 1 ? 's' : ''} already planned.</p>
        <p className="text-sky-300 text-xs font-semibold uppercase tracking-widest mb-6">Let's make it the best year yet.</p>
        <div className="flex flex-col gap-2.5 w-full max-w-[260px]">
          {/* Same Print intent as the per-trip share slide — yearly
              recap doesn't have a real image export yet. */}
          <button onClick={onDownload} className="flex items-center justify-center gap-2 bg-white text-zinc-900 font-bold py-3 px-6 rounded-full text-sm hover:bg-zinc-100 transition-all shadow-lg">
            <Printer className="w-4 h-4" />
            Print your wrap
          </button>
          {/* Yearly "Share your <year>" hidden for launch — yearly
              recap is gated to the "Coming soon" placeholder anyway,
              and there's no /year/[year] public route. */}
        </div>
        <p className="text-white/25 text-xs mt-5 font-medium">tripcoord.ai</p>
      </div>
    </div>
  );
}

// ─── Slide Editor ─────────────────────────────────────────────────────────────

const TRIP_SLIDE_DEFS: SlideDefinition[] = [
  { id: 'cover',   label: 'Cover',          emoji: '🖼️', locked: true,  defaultEnabled: true },
  { id: 'numbers', label: 'By The Numbers', emoji: '📊', defaultEnabled: true },
  { id: 'days',    label: 'Day by Day',     emoji: '🗓️', defaultEnabled: true },
  { id: 'crew',    label: 'The Crew',       emoji: '👥', defaultEnabled: true },
  { id: 'cities',  label: 'Where We Went',  emoji: '🗺️', defaultEnabled: true },
  { id: 'toppicks', label: 'Top Picks',     emoji: '⭐', defaultEnabled: true },
  { id: 'laughs',  label: 'The Laughs',     emoji: '😂', defaultEnabled: true },
  { id: 'photos',  label: 'Trip Photos',    emoji: '📷', defaultEnabled: true },
  { id: 'share',   label: 'Share Card',     emoji: '🎉', locked: true,  defaultEnabled: true },
];

const YEARLY_SLIDE_DEFS: SlideDefinition[] = [
  { id: 'cover',        label: 'Cover',          emoji: '✨', locked: true,  defaultEnabled: true },
  { id: 'stats',        label: 'Year in Stats',  emoji: '📊', defaultEnabled: true },
  { id: 'destinations', label: 'Adventures',     emoji: '🗺️', defaultEnabled: true },
  { id: 'personality',  label: 'Your Vibe',      emoji: '🧬', defaultEnabled: true },
  { id: 'photos',       label: 'Year in Photos', emoji: '📷', defaultEnabled: true },
  { id: 'share',        label: 'Share Card',     emoji: '🎉', locked: true,  defaultEnabled: true },
];

interface SlideEditorProps {
  mode: StoryMode;
  enabledIds: Set<string>;
  onToggle: (id: string) => void;
  onStart: () => void;
  onClose: () => void;
  /** Actual number of slides the deck will render — already filtered for
   *  enabled-AND-has-data, so it matches the progress-bar dot count. Counting
   *  enabled defs alone overstated it (e.g. "9 slides" but 7 dots) when
   *  data-less slides like photos/crew drop out. */
  slideCount: number;
}

function SlideEditor({ mode, enabledIds, onToggle, onStart, onClose, slideCount }: SlideEditorProps) {
  const defs = mode === 'trip' ? TRIP_SLIDE_DEFS : YEARLY_SLIDE_DEFS;
  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-[min(390px,calc(100vw-2rem))] bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10">
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-white/8 flex items-start justify-between">
          <div>
            <h2 className="text-white text-xl font-black leading-tight">
              {mode === 'trip' ? 'Your Trip Story' : 'Your Year in Review'}
            </h2>
            <p className="text-zinc-400 text-sm mt-1">Pick what to share</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/8 hover:bg-white/15 text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Slide list */}
        <div className="px-4 py-3 max-h-[400px] overflow-y-auto">
          {defs.map((def) => {
            const enabled = enabledIds.has(def.id);
            return (
              <div
                key={def.id}
                onClick={() => !def.locked && onToggle(def.id)}
                className={`flex items-center gap-3 px-3 py-3.5 rounded-2xl mb-1.5 transition-all ${
                  def.locked ? 'opacity-60 cursor-default' : 'cursor-pointer hover:bg-white/5'
                } ${enabled && !def.locked ? 'bg-white/4' : ''}`}
              >
                <span className="text-xl flex-shrink-0 w-8 text-center">{def.emoji}</span>
                <span className="flex-1 text-white font-semibold text-sm">{def.label}</span>
                {def.locked ? (
                  <div className="flex items-center gap-1.5 text-zinc-600">
                    <Lock className="w-3.5 h-3.5" />
                    <span className="text-xs font-semibold">Always</span>
                  </div>
                ) : (
                  /* Toggle switch */
                  <div className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-sky-700' : 'bg-zinc-700'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-5 border-t border-white/8">
          <button
            onClick={onStart}
            disabled={slideCount < 2}
            className="w-full py-3.5 bg-gradient-to-r from-sky-800 to-emerald-700 hover:from-sky-700 hover:to-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-full text-sm transition-all shadow-lg"
          >
            Watch Story → ({slideCount} slides)
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function TripStoryModal({ mode, trip, onClose, itineraryDays }: TripStoryModalProps) {
  // effectiveDays: prefer real trip days passed by the parent. Fall back to
  // the mock Iceland days only when no prop is supplied (the demo path).
  // This keeps every data-driven slide reflective of the trip actually being
  // recapped — no Iceland data leaking into a real Lisbon trip's recap.
  const effectiveDays = (itineraryDays && itineraryDays.length > 0)
    ? itineraryDays
    : mockItineraryDays;
  const activeTripData = trip ?? trips[0];
  const currentYear = new Date().getFullYear();

  // isMockData = the demo Iceland trip (or no trip prop). Mock trips keep
  // their hardcoded slide content. Real trips pull live data from the API.
  // Yearly mode still aggregates across the mock trips array — that slide
  // deck remains gated behind a "Coming soon" placeholder until we add a
  // real cross-trip aggregation pipeline.
  const isMockData = mode === 'trip'
    ? (trip?.id ? MOCK_TRIP_IDS.has(trip.id) : true)
    : false;
  const showComingSoon = mode === 'yearly';

  // ── Real-trip data fetch ─────────────────────────────────────────────────
  // Only fires for real trips (mode === 'trip', !isMockData, trip.id present).
  // Pulls members, photos, and messages from the existing trip API in parallel
  // so the slide deck reflects what actually happened on this trip.
  const [fetchedMembers, setFetchedMembers] = useState<StoryMember[] | null>(null);
  const [fetchedPhotos, setFetchedPhotos] = useState<StoryPhoto[] | null>(null);
  const [fetchedMessages, setFetchedMessages] = useState<StoryMessage[] | null>(null);

  useEffect(() => {
    if (mode !== 'trip' || isMockData || !trip?.id) return;
    let cancelled = false;
    const tripId = trip.id;
    (async () => {
      const [mRes, pRes, msgRes] = await Promise.all([
        fetch(`/api/trips/${tripId}/members`).then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/trips/${tripId}/photos`).then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/trips/${tripId}/messages`).then(r => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (cancelled) return;
      const members: StoryMember[] = (mRes?.members ?? []).map((m: { id: string; name: string; avatarUrl: string | null }) => ({
        id: m.id, name: m.name, avatarUrl: m.avatarUrl,
      }));
      const photos: StoryPhoto[] = (pRes?.photos ?? []).map((p: { id: string; url: string; activity?: string; day?: number; uploadedBy?: string }) => ({
        id: p.id, url: p.url, activity: p.activity, day: p.day, uploadedBy: p.uploadedBy,
      }));
      const messages: StoryMessage[] = (msgRes?.messages ?? []).map((m: { id: string; senderName: string; content: string; reactions?: Record<string, string[]> | null }) => ({
        id: m.id, senderName: m.senderName, content: m.content, reactions: m.reactions ?? null,
      }));
      setFetchedMembers(members);
      setFetchedPhotos(photos);
      setFetchedMessages(messages);
    })();
    return () => { cancelled = true; };
  }, [mode, trip?.id, isMockData]);

  // Mock data adapted to the unified Story* shapes for the demo Iceland trip.
  const mockStoryMembers: StoryMember[] = mockGroupMembers.map(m => ({ id: m.id, name: m.name }));
  const mockStoryPhotos: StoryPhoto[] = mockTripPhotos.map(p => ({
    id: p.id, url: p.url, activity: p.activity, day: p.day, uploadedBy: p.uploadedBy,
  }));
  const mockStoryMessages: StoryMessage[] = mockMessages.map(m => ({
    id: m.id, senderName: m.senderName, content: m.content,
  }));

  // effective* — what the slides actually consume. Mock trips use the
  // hardcoded Iceland pools (so the demo still works without auth). Real
  // trips use whatever the API returned; an empty array is fine — slides
  // with nothing to show are filtered out below.
  const effectiveMembers: StoryMember[] = isMockData ? mockStoryMembers : (fetchedMembers ?? []);
  const effectivePhotos: StoryPhoto[] = isMockData ? mockStoryPhotos : (fetchedPhotos ?? []);
  const effectiveMessages: StoryMessage[] = isMockData ? mockStoryMessages : (fetchedMessages ?? []);

  // For real trips: bgPhotos cycle through the trip's actual photos. For
  // mocks: cycle through the mock pool. If a real trip has no photos yet,
  // the slides just render without a background image.
  const bgPhotos = effectivePhotos.map(p => p.url);
  const getBg = (idx: number) => (bgPhotos.length > 0 ? bgPhotos[idx % bgPhotos.length] : undefined);

  // Laugh moments derived from real chat (or mock for the demo trip).
  const laughMomentsForSlide: LaughMoment[] = isMockData
    ? mockLaughMoments
    : pickLaughMoments(effectiveMessages, 3);
  const laughCountForSlide = getLaughCount(effectiveMessages);

  // Slide editor state
  const slideDefs = mode === 'trip' ? TRIP_SLIDE_DEFS : YEARLY_SLIDE_DEFS;
  const [showEditor, setShowEditor] = useState(true);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(
    new Set(slideDefs.filter(d => d.defaultEnabled).map(d => d.id))
  );

  const toggleSlide = (id: string) => {
    setEnabledIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Story playback state
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [isAnimating, setIsAnimating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Lightbox state — lifted here so it renders above the stacking context created by slide content
  const [lightboxState, setLightboxState] = useState<{ photos: TripPhoto[]; idx: number } | null>(null);
  const [photoReactions, setPhotoReactions] = useState<Record<string, Record<string, number>>>({});

  const addReaction = useCallback((photoId: string, emoji: string) => {
    setPhotoReactions(prev => ({
      ...prev,
      [photoId]: {
        ...(prev[photoId] ?? {}),
        [emoji]: ((prev[photoId] ?? {})[emoji] ?? 0) + 1,
      },
    }));
  }, []);

  const openLightbox = useCallback((photos: TripPhoto[], idx: number) => {
    setIsPaused(true);
    setLightboxState({ photos, idx });
  }, []);

  const handleDownload = () => {
    if (cardRef.current) window.print();
  };

  // Build full slide render arrays
  const tripPhotosForSlide = effectivePhotos.slice(0, 7);
  // Cover/share photo: prefer a real uploaded trip photo, then the trip's
  // persisted cover image, then a destination stock fallback. (The main photo
  // should pull from the trip's own photos when it has any.)
  const tripCoverPhoto = effectivePhotos[0]?.url
    ?? activeTripData.coverImage
    ?? getCoverPhoto(activeTripData.destination);
  // visited_cities for the new CitiesMapSlide. Falls through to AI-planned
  // cities (`activeTripData.cities`) for a sensible mock-data preview, but
  // real trips only show the slide when the user has tagged at least one city.
  const visitedCitiesForSlide: string[] = (activeTripData.visitedCities && activeTripData.visitedCities.length > 0)
    ? activeTripData.visitedCities
    : (activeTripData.cities ?? []);

  const allTripSlides = [
    { id: 'cover',   render: () => <CoverSlide trip={activeTripData} members={effectiveMembers} coverPhoto={tripCoverPhoto} /> },
    { id: 'numbers', render: () => <NumbersSlide trip={activeTripData} bgPhoto={getBg(0)} days={effectiveDays} memberCount={effectiveMembers.length} photoCount={effectivePhotos.length} /> },
    { id: 'days',    render: () => <DayHighlightsSlide trip={activeTripData} bgPhoto={getBg(1)} days={effectiveDays} /> },
    { id: 'crew',    render: () => <CrewSlide bgPhoto={getBg(2)} members={effectiveMembers} /> },
    { id: 'cities',  render: () => <CitiesMapSlide bgPhoto={getBg(2)} cities={visitedCitiesForSlide} /> },
    { id: 'toppicks', render: () => <TopPicksSlide bgPhoto={getBg(3)} days={effectiveDays} /> },
    { id: 'laughs',  render: () => <LaughsSlide bgPhoto={getBg(4)} moments={laughMomentsForSlide} laughCount={laughCountForSlide} /> },
    { id: 'photos',  render: () => <PhotosSlide photos={tripPhotosForSlide} reactions={photoReactions} onOpen={(idx) => openLightbox(tripPhotosForSlide, idx)} /> },
    { id: 'share',   render: () => <ShareSlide trip={activeTripData} onDownload={handleDownload} coverPhoto={tripCoverPhoto} /> },
  ];

  const allYearlySlides = [
    { id: 'cover',        render: () => <YearlyCoverSlide year={currentYear} /> },
    { id: 'stats',        render: () => <YearlyStatsSlide year={currentYear} bgPhoto={getBg(0)} /> },
    { id: 'destinations', render: () => <YearlyDestinationsSlide /> },
    { id: 'personality',  render: () => <YearlyPersonalitySlide bgPhoto={getBg(1)} /> },
    { id: 'photos',       render: () => <YearlyPhotosSlide reactions={photoReactions} onOpen={(idx) => openLightbox(mockTripPhotos, idx)} /> },
    { id: 'share',        render: () => <YearlyShareSlide year={currentYear} onDownload={handleDownload} reactions={photoReactions} onOpen={(idx) => openLightbox(mockTripPhotos, idx)} /> },
  ];

  const allSlides = mode === 'trip' ? allTripSlides : allYearlySlides;

  // Active slides = enabled by the editor AND have data to show. Slides
  // that depend on data the trip doesn't have yet (no photos uploaded,
  // no chat reactions) drop out so the deck doesn't show empty cards.
  const slides = allSlides.filter(s => {
    if (!enabledIds.has(s.id)) return false;
    if (mode === 'trip' && !isMockData) {
      if (s.id === 'photos' && effectivePhotos.length === 0) return false;
      if (s.id === 'crew' && effectiveMembers.length === 0) return false;
      if (s.id === 'laughs' && laughMomentsForSlide.length === 0) return false;
      // Cities slide drops out unless the user has tagged at least one city.
      // Falling back to AI cities would defeat the "ground truth" framing
      // we promised in the banner copy.
      if (s.id === 'cities' && (!activeTripData.visitedCities || activeTripData.visitedCities.length === 0)) return false;
    }
    return true;
  });
  const totalSlides = slides.length;

  const goNext = useCallback(() => {
    if (isAnimating) return;
    if (currentSlide < totalSlides - 1) {
      setDirection('forward');
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 300);
      setCurrentSlide(s => s + 1);
      setProgress(0);
    } else {
      onClose();
    }
  }, [currentSlide, totalSlides, isAnimating, onClose]);

  const goPrev = useCallback(() => {
    if (isAnimating || currentSlide === 0) return;
    setDirection('back');
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 300);
    setCurrentSlide(s => s - 1);
    setProgress(0);
  }, [currentSlide, isAnimating]);

  // Progress bar advancement (only when story is playing)
  useEffect(() => {
    if (showEditor || isPaused) return;
    const TICK = 50;
    const increment = (TICK / SLIDE_DURATION) * 100;
    const timer = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { goNext(); return 0; }
        return p + increment;
      });
    }, TICK);
    return () => clearInterval(timer);
  }, [currentSlide, isPaused, showEditor, goNext]);

  // Keyboard navigation
  useEffect(() => {
    if (showEditor) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') { e.preventDefault(); setIsPaused(p => !p); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showEditor, goNext, goPrev, onClose]);

  // ── Coming soon view (yearly mode only) ──
  // Trip mode now consumes real trip data via the API fetch above. Yearly
  // mode still aggregates across the mock `trips` array — gate it until
  // we add a real cross-trip aggregation pipeline that pulls every trip
  // for the user, computes year stats, and surfaces the highlights.
  if (showComingSoon) {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="max-w-md w-full bg-gradient-to-br from-sky-700 to-violet-800 rounded-3xl p-10 text-white text-center shadow-2xl">
          <div className="text-6xl mb-5">✨</div>
          <h2 className="font-script italic text-3xl font-semibold mb-3">
            {mode === 'yearly' ? 'Year in Review' : 'Trip Story'}
          </h2>
          <p className="text-base text-white/85 leading-relaxed mb-6">
            {mode === 'yearly'
              ? "Your year-in-review recap is being built — it'll pull from your real trips, photos, and group highlights once it's ready."
              : "Your personalized trip recap is being built — it'll pull from your real photos, group chat highlights, and expense breakdowns once it's ready."}
          </p>
          <p className="text-xs text-white/60 mb-6">
            Coming soon. Keep adding photos and notes — they'll all be woven in.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-white text-sky-900 font-semibold rounded-full hover:bg-white/90 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  // ── Slide editor view ──
  if (showEditor) {
    return (
      <SlideEditor
        mode={mode}
        enabledIds={enabledIds}
        onToggle={toggleSlide}
        onStart={() => { setShowEditor(false); setCurrentSlide(0); setProgress(0); }}
        onClose={onClose}
        slideCount={totalSlides}
      />
    );
  }

  // ── Story player view ──
  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Pause/Play */}
      <button
        onClick={() => setIsPaused(p => !p)}
        className="absolute top-4 left-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
      >
        {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
      </button>

      {/* Edit slides button */}
      <button
        onClick={() => setShowEditor(true)}
        className="absolute top-4 left-16 z-50 px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all"
      >
        Edit slides
      </button>

      {/* Prev / Next arrows */}
      <button
        onClick={goPrev}
        disabled={currentSlide === 0}
        className="absolute left-4 md:left-[calc(50%-240px)] top-1/2 -translate-y-1/2 z-40 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all disabled:opacity-0"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={goNext}
        className="absolute right-4 md:right-[calc(50%-240px)] top-1/2 -translate-y-1/2 z-40 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Story card */}
      <div
        ref={cardRef}
        className="relative w-full max-w-[min(390px,calc(100vw-2rem))] rounded-3xl overflow-hidden shadow-2xl"
        style={{ height: 'min(700px, calc(100dvh - 80px))' }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-30 flex gap-1 p-3">
          {slides.map((_, i) => (
            <div key={i} className="flex-1 h-0.5 bg-white/25 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-none"
                style={{ width: i < currentSlide ? '100%' : i === currentSlide ? `${progress}%` : '0%' }}
              />
            </div>
          ))}
        </div>

        {/* Slide content */}
        <div
          className="w-full h-full transition-transform duration-300 ease-in-out"
          style={{
            transform: isAnimating
              ? direction === 'forward' ? 'translateX(-4%)' : 'translateX(4%)'
              : 'translateX(0)',
            opacity: isAnimating ? 0.8 : 1,
          }}
        >
          {slides[currentSlide]?.render()}
        </div>

        {/* Mobile tap zones — disabled while lightbox is open */}
        <div className={`absolute left-0 top-0 w-1/3 h-full z-20 cursor-pointer ${lightboxState ? 'pointer-events-none' : ''}`} onClick={goPrev} />
        <div className={`absolute right-0 top-0 w-1/3 h-full z-20 cursor-pointer ${lightboxState ? 'pointer-events-none' : ''}`} onClick={goNext} />

        {/* Lightbox — rendered at card-root z-40 to escape slide-content stacking context */}
        {lightboxState && (
          <PhotoLightbox
            photos={lightboxState.photos}
            initialIdx={lightboxState.idx}
            reactions={photoReactions}
            onReact={addReaction}
            onClose={() => { setLightboxState(null); setIsPaused(false); }}
          />
        )}
      </div>

      {/* Dot indicators */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => { setCurrentSlide(i); setProgress(0); }}
            className={`rounded-full transition-all ${i === currentSlide ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/30'}`}
          />
        ))}
      </div>
    </div>
  );
}
