'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, AlertCircle, Sparkles, Utensils, MapPin, Coffee, Zap } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GeneratedDay {
  day: number;
  theme: string;
  breakfast?: string;
  activity?: string;
  dinner?: string;
}

interface TripMeta {
  title?: string;
  practicalNotes?: unknown;
  departureInfo?: unknown;
  hotelSuggestions?: unknown;
  foodieTips?: unknown;
  nightlifeHighlights?: unknown;
  shoppingGuide?: unknown;
}

// ─── Destination photo map ────────────────────────────────────────────────────

const DESTINATION_PHOTOS: Record<string, string> = {
  iceland:    'https://images.unsplash.com/photo-1504829857797-ddff29c27927?w=1600&h=900&fit=crop',
  tokyo:      'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1600&h=900&fit=crop',
  japan:      'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1600&h=900&fit=crop',
  barcelona:  'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=1600&h=900&fit=crop',
  bali:       'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=1600&h=900&fit=crop',
  paris:      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1600&h=900&fit=crop',
  italy:      'https://images.unsplash.com/photo-1555992336-03a23c7b20ee?w=1600&h=900&fit=crop',
  default:    'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1600&h=900&fit=crop',
};

function getPhoto(destination: string): string {
  const d = destination.toLowerCase();
  for (const key of Object.keys(DESTINATION_PHOTOS)) {
    if (key !== 'default' && d.includes(key)) return DESTINATION_PHOTOS[key];
  }
  return DESTINATION_PHOTOS.default;
}

// ─── Extract summary fields from a raw day object ────────────────────────────

// The raw day shape at this point is whatever the streaming SSE chunk
// produced — typed as GeneratedDayRaw rather than `any` so the field
// reads below are checked.
type RawTrackItem = {
  isRestaurant?: boolean;
  mealType?: string;
  name?: string;
  title?: string;
};
type GeneratedDayRaw = {
  day?: unknown;
  theme?: string;
  tracks?: {
    shared?: RawTrackItem[];
    track_a?: RawTrackItem[];
  };
};

function summariseDay(raw: GeneratedDayRaw): GeneratedDay {
  const shared: RawTrackItem[] = raw?.tracks?.shared ?? [];
  const trackA: RawTrackItem[] = raw?.tracks?.track_a ?? [];
  const all = [...shared, ...trackA];

  const getName = (item: { name?: string; title?: string }) =>
    item.name || item.title || '';

  const breakfast = shared.find(a => a.isRestaurant && a.mealType === 'breakfast');
  const dinner    = shared.find(a => a.isRestaurant && a.mealType === 'dinner');
  const activity  = all.find(a => !a.isRestaurant);

  return {
    day:       typeof raw.day === 'number' ? raw.day : 0,
    theme:     raw.theme ?? '',
    breakfast: breakfast ? getName(breakfast) : undefined,
    activity:  activity  ? getName(activity)  : undefined,
    dinner:    dinner    ? getName(dinner)    : undefined,
  };
}

// ─── Day summary card ─────────────────────────────────────────────────────────

function DayCard({ d, isGenerating }: { d: GeneratedDay; isGenerating: boolean }) {
  return (
    <div
      className="group bg-white/90 backdrop-blur-sm border border-slate-200/80 rounded-2xl px-5 py-4 shadow-sm
                 animate-in fade-in slide-in-from-bottom-3 duration-500"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">
              Day {d.day}
            </span>
            {isGenerating ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                Writing…
              </span>
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            )}
          </div>

          {d.theme ? (
            <p className="font-script italic font-semibold text-zinc-900 text-base leading-snug mb-3">
              {d.theme}
            </p>
          ) : (
            <div className="h-5 bg-slate-100 rounded-full animate-pulse w-48 mb-3" />
          )}

          {isGenerating ? (
            /* Skeleton rows while this day is writing */
            <div className="space-y-2">
              <div className="h-3.5 bg-slate-100 rounded-full animate-pulse w-64" />
              <div className="h-3.5 bg-slate-100 rounded-full animate-pulse w-48" />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {d.breakfast && (
                <span className="flex items-center gap-1.5 text-xs text-zinc-600">
                  <Coffee className="w-3 h-3 text-amber-500 flex-shrink-0" />
                  {d.breakfast}
                </span>
              )}
              {d.activity && (
                <>
                  {d.breakfast && <span className="text-slate-300 text-xs">·</span>}
                  <span className="flex items-center gap-1.5 text-xs text-zinc-600">
                    <MapPin className="w-3 h-3 text-sky-500 flex-shrink-0" />
                    {d.activity}
                  </span>
                </>
              )}
              {d.dinner && (
                <>
                  {(d.breakfast || d.activity) && <span className="text-slate-300 text-xs">·</span>}
                  <span className="flex items-center gap-1.5 text-xs text-zinc-600">
                    <Utensils className="w-3 h-3 text-rose-400 flex-shrink-0" />
                    {d.dinner}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GeneratingPage() {
  const router = useRouter();

  const [tripTitle, setTripTitle]         = useState('');
  const [destination, setDestination]     = useState('your destination');
  const [totalDays, setTotalDays]         = useState(7);
  const [days, setDays]                   = useState<GeneratedDay[]>([]);
  const [currentDayIdx, setCurrentDayIdx] = useState<number | null>(null); // which day index is actively writing
  const [doneCount, setDoneCount]         = useState(0);
  const [phase, setPhase]                 = useState<'starting' | 'streaming' | 'saving' | 'done' | 'error'>('starting');
  const [errorMsg, setErrorMsg]           = useState('');
  const [errorType, setErrorType]         = useState<'generic' | 'credits'>('generic');
  const [bgPhoto, setBgPhoto]             = useState(DESTINATION_PHOTOS.default);

  const bottomRef = useRef<HTMLDivElement>(null);
  const hasStarted = useRef(false);

  // Auto-scroll so new cards are always visible
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [days.length, currentDayIdx]);

  const run = useCallback(async () => {
    // ── Read params from sessionStorage ──────────────────────────────────────
    let payload: Record<string, unknown>;
    let metaBase: Record<string, unknown>;
    try {
      const raw = sessionStorage.getItem('tripcoord_gen_payload');
      const rawMeta = sessionStorage.getItem('tripcoord_gen_meta');
      if (!raw || !rawMeta) throw new Error('No generation params found');
      payload  = JSON.parse(raw);
      metaBase = JSON.parse(rawMeta);
    } catch {
      setErrorMsg('Generation session expired. Please go back and try again.');
      setPhase('error');
      return;
    }

    const dest = (payload.destination as string) || 'your destination';
    const length = (payload.tripLength as number) || 7;
    setDestination(dest);
    setTotalDays(length);
    setBgPhoto(getPhoto(dest));

    // ── Call the SSE endpoint ─────────────────────────────────────────────────
    let res: Response;
    try {
      res = await fetch('/api/generate-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Network error');
      setPhase('error');
      return;
    }

    // Pre-stream errors (NO_API_KEY, tier limit, credit limit, etc.) come back as plain JSON
    const ct = res.headers.get('content-type') ?? '';
    if (!res.ok || !ct.includes('text/event-stream')) {
      let msg = 'Generation failed';
      try {
        const d = await res.json();
        if (d.error === 'NO_API_KEY') {
          // No Anthropic key configured — surface the error rather than
          // redirecting authed users to the trip_1 mock Iceland sample.
          setErrorMsg('AI generation is temporarily unavailable. Please try again in a few minutes.');
          setErrorType('credits');
          setPhase('error');
          return;
        }
        if (d.error === 'CREDIT_LIMIT') {
          // Out of AI credits — show a clear message with the actual reset date, then redirect
          const total = d.creditsTotal ?? 'your';
          const resetDate = d.creditsResetAt
            ? new Date(d.creditsResetAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
            : 'the start of next month';
          setErrorMsg(`You've used all ${total} AI credits for this period. They reset on ${resetDate} — or upgrade now for more.`);
          setErrorType('credits');
          setPhase('error');
          // Auto-redirect after 5s so users can read the message
          setTimeout(() => router.push('/pricing?reason=credits'), 5000);
          return;
        }
        msg = d.message || msg;
      } catch { /* ignore */ }
      setErrorMsg(msg);
      setPhase('error');
      return;
    }

    setPhase('streaming');

    const reader  = res.body!.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    const collectedDays: GeneratedDayRaw[] = [];
    let tripMeta: TripMeta = {};

    try {
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split('\n\n');
        sseBuffer = events.pop() ?? '';

        for (const rawEvent of events) {
          for (const line of rawEvent.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            let parsed: Record<string, unknown>;
            try { parsed = JSON.parse(line.slice(6)); } catch { continue; }

            switch (parsed.type) {
              case 'meta':
                tripMeta = {
                  title:               parsed.title as string | undefined,
                  practicalNotes:      parsed.practicalNotes,
                  departureInfo:       parsed.departureInfo,
                  hotelSuggestions:    parsed.hotelSuggestions,
                  foodieTips:          parsed.foodieTips ?? null,
                  nightlifeHighlights: parsed.nightlifeHighlights ?? null,
                  shoppingGuide:       parsed.shoppingGuide ?? null,
                };
                if (tripMeta.title) setTripTitle(tripMeta.title);
                break;

              case 'day': {
                const idx = parsed.index as number;
                const dayData = parsed.data as GeneratedDayRaw;
                collectedDays[idx] = dayData;
                const summary = summariseDay(dayData);

                // Mark the previous "writing" day as done, add the new completed day
                setCurrentDayIdx(idx + 1 < length ? idx + 1 : null);
                setDoneCount(idx + 1);
                setDays(prev => {
                  const next = [...prev];
                  next[idx] = summary;
                  return next;
                });
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
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong');
      setPhase('error');
      return;
    }

    // ── All days received — save to Supabase ─────────────────────────────────
    setPhase('saving');
    setCurrentDayIdx(null);

    // Deduplicate by day field (same logic as trip/new)
    const byDayNum: Record<number, GeneratedDayRaw> = {};
    for (const d of collectedDays) {
      if (d && typeof d.day === 'number') byDayNum[d.day] = d;
      else if (d) byDayNum[Object.keys(byDayNum).length + 1] = d;
    }
    const dedupedDays = Object.values(byDayNum).sort(
      (a, b) => (typeof a.day === 'number' ? a.day : 0) - (typeof b.day === 'number' ? b.day : 0),
    );

    const tripMetaFull = {
      ...metaBase,
      title:               tripMeta.title               || null,
      practicalNotes:      tripMeta.practicalNotes      || null,
      departureInfo:       tripMeta.departureInfo       || null,
      hotelSuggestions:    tripMeta.hotelSuggestions    || null,
      foodieTips:          tripMeta.foodieTips          || null,
      nightlifeHighlights: tripMeta.nightlifeHighlights || null,
      shoppingGuide:       tripMeta.shoppingGuide       || null,
    };

    // localStorage fallback while we persist
    localStorage.setItem('generatedItinerary', JSON.stringify(dedupedDays));
    localStorage.setItem('generatedTripMeta', JSON.stringify(tripMetaFull));

    let tripId = 'trip_1';
    const existingTripId = payload.existingTripId as string | undefined;
    try {
      if (existingTripId && /^[0-9a-f-]{36}$/i.test(existingTripId)) {
        // Regenerate flow: update the existing trip's itinerary + stamp generation time
        const patchRes = await fetch(`/api/trips/${existingTripId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            days: dedupedDays,
            metaPatch: { ...tripMetaFull },
            tripPatch: { itinerary_generated_at: new Date().toISOString() },
          }),
        });
        if (patchRes.ok) {
          tripId = existingTripId;
          localStorage.setItem('currentTripId', tripId);
          localStorage.removeItem('generatedItinerary');
          localStorage.removeItem('generatedTripMeta');
        }
      } else {
        const saveRes = await fetch('/api/trips/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tripMeta: tripMetaFull, itinerary: dedupedDays }),
        });
        if (saveRes.ok) {
          const saveData = await saveRes.json();
          if (saveData.tripId) {
            tripId = saveData.tripId;
            localStorage.setItem('currentTripId', tripId);
            localStorage.removeItem('generatedItinerary');
            localStorage.removeItem('generatedTripMeta');
          }
        }
      }
    } catch { /* localStorage fallback stays */ }

    // Clean up sessionStorage
    sessionStorage.removeItem('tripcoord_gen_payload');
    sessionStorage.removeItem('tripcoord_gen_meta');

    setPhase('done');
    // Brief pause so the user sees "done" state, then navigate
    await new Promise(r => setTimeout(r, 900));
    router.push(`/trip/${tripId}/itinerary`);
  }, [router]);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    run();
  }, [run]);

  // ── Progress ──────────────────────────────────────────────────────────────
  const pct = phase === 'saving' || phase === 'done'
    ? 100
    : totalDays > 0
    ? Math.round((doneCount / totalDays) * 100)
    : 0;

  const statusLine =
    phase === 'starting' ? 'Connecting to AI planner…'
    : phase === 'saving'  ? 'Saving your trip…'
    : phase === 'done'    ? 'Your itinerary is ready ✦'
    : phase === 'error'   ? 'Something went wrong'
    : doneCount === 0     ? `Crafting your itinerary…`
    : doneCount < totalDays
    ? `Building Day ${doneCount + 1} of ${totalDays}…`
    : 'Wrapping up…';

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundImage: `url(${bgPhoto})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Blurred overlay */}
      <div className="fixed inset-0 bg-parchment/[.88] backdrop-blur-sm" />

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-20 bg-parchment/95 backdrop-blur border-b border-slate-200/60 px-4 py-4">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <Image src="/tripcoord_logo.png" alt="tripcoord" width={120} height={40} className="h-8 w-auto" priority />
              <div className="flex items-center gap-2">
                {phase === 'streaming' || phase === 'starting' ? (
                  <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
                ) : phase === 'done' || phase === 'saving' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : null}
                <span className="text-xs font-medium text-zinc-500 transition-all duration-300">
                  {statusLine}
                </span>
              </div>
            </div>

            {/* Trip title */}
            <div className="mb-3">
              {tripTitle ? (
                <h1 className="font-script italic font-semibold text-xl text-zinc-900 leading-tight">
                  {tripTitle}
                </h1>
              ) : (
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-orange-500 animate-pulse flex-shrink-0" />
                  <span className="text-sm text-zinc-500">
                    Crafting your {destination} itinerary…
                  </span>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-zinc-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${pct}%`,
                  animation: pct === 0 ? 'pulse 1.5s ease-in-out infinite' : 'none',
                }}
              />
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">
              {doneCount} of {totalDays} {totalDays === 1 ? 'day' : 'days'} ready
            </p>
          </div>
        </div>

        {/* ── Day cards ──────────────────────────────────────────────────── */}
        <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-3">

          {/* Rendered days */}
          {days.map((d, i) => (
            <DayCard key={i} d={d} isGenerating={false} />
          ))}

          {/* Active skeleton (the day being written right now) */}
          {phase === 'streaming' && currentDayIdx !== null && currentDayIdx < totalDays && (
            <DayCard
              key="writing"
              d={{ day: currentDayIdx + 1, theme: '' }}
              isGenerating={true}
            />
          )}

          {/* Error state */}
          {phase === 'error' && errorType === 'credits' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
              <Zap className="w-8 h-8 text-amber-400 mx-auto mb-3" />
              <p className="font-semibold text-amber-900 mb-1">AI Credits Used Up</p>
              <p className="text-sm text-amber-700 mb-5">{errorMsg}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => router.push('/pricing?reason=credits')}
                  className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  See upgrade plans
                </button>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="px-5 py-2.5 bg-white border border-amber-200 hover:bg-amber-50 text-amber-800 text-sm font-semibold rounded-xl transition-colors"
                >
                  Back to dashboard
                </button>
              </div>
              <p className="text-xs text-amber-500 mt-4">Redirecting to pricing in a moment…</p>
            </div>
          )}

          {phase === 'error' && errorType === 'generic' && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
              <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
              <p className="font-semibold text-red-800 mb-1">Something went wrong</p>
              <p className="text-sm text-red-600 mb-4">{errorMsg}</p>
              <button
                onClick={() => {
                  // Regenerate flow includes existingTripId in the payload
                  // — bounce back to the trip page rather than the Trip
                  // Builder so the user lands where they came from.
                  try {
                    const raw = sessionStorage.getItem('tripcoord_gen_payload');
                    if (raw) {
                      const p = JSON.parse(raw) as { existingTripId?: string };
                      const eid = p?.existingTripId;
                      if (eid && /^[0-9a-f-]{36}$/i.test(eid)) {
                        router.push(`/trip/${eid}/itinerary`);
                        return;
                      }
                    }
                  } catch { /* fall through to Trip Builder */ }
                  router.push('/trip/new');
                }}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                ← Go back and try again
              </button>
            </div>
          )}

          {/* Done state */}
          {(phase === 'done' || phase === 'saving') && (
            <div className="flex items-center justify-center gap-2 py-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <span className="text-sm font-semibold text-emerald-700">
                {phase === 'saving' ? 'Saving your trip…' : 'All done! Loading your itinerary…'}
              </span>
            </div>
          )}

          <div ref={bottomRef} className="h-8" />
        </div>
      </div>
    </div>
  );
}
