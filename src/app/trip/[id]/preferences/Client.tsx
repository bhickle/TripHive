'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import type { TripMemberPreferences, DietaryTag, AccessibilityNeed, PaceLevel } from '@/lib/types';

// Mirrors the buyer-side priorityOptions in `/trip/new/page.tsx`. Keep in sync —
// the AI prompt merger expects the same string IDs from organizer + members.
const PRIORITY_OPTIONS: { id: string; label: string; icon: string }[] = [
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
];

const DIETARY_OPTIONS: { id: DietaryTag; label: string }[] = [
  { id: 'vegetarian',         label: 'Vegetarian' },
  { id: 'vegan',              label: 'Vegan' },
  { id: 'pescatarian',        label: 'Pescatarian' },
  { id: 'gluten_free',        label: 'Gluten-free' },
  { id: 'dairy_free',         label: 'Dairy-free' },
  { id: 'halal',              label: 'Halal' },
  { id: 'kosher',             label: 'Kosher' },
  { id: 'nut_allergy',        label: 'Nut allergy' },
  { id: 'shellfish_allergy',  label: 'Shellfish allergy' },
];

const ACCESSIBILITY_OPTIONS: { id: AccessibilityNeed; label: string }[] = [
  { id: 'wheelchair',         label: 'Wheelchair access needed' },
  { id: 'no_stairs',          label: 'No stairs / step-free routes' },
  { id: 'low_stamina',        label: 'Low stamina (frequent breaks)' },
  { id: 'visual_impairment',  label: 'Visual impairment' },
  { id: 'hearing_impairment', label: 'Hearing impairment' },
  { id: 'service_animal',     label: 'Travelling with a service animal' },
];

const PACE_OPTIONS: { id: PaceLevel; label: string; sub: string }[] = [
  { id: 'relaxed',  label: 'Relaxed',  sub: '2–3 things per day, lots of downtime' },
  { id: 'balanced', label: 'Balanced', sub: '4–5 things per day, mix of doing and resting' },
  { id: 'packed',   label: 'Packed',   sub: 'Sun-up to sun-down, every minute counts' },
];

export default function PreferencesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [tripName, setTripName] = useState<string>('this trip');
  const [tripDestination, setTripDestination] = useState<string>('');

  const [priorities, setPriorities] = useState<string[]>([]);
  const [pace, setPace] = useState<PaceLevel>('balanced');
  const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>([]);
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [accessibilityNeeds, setAccessibilityNeeds] = useState<AccessibilityNeed[]>([]);
  const [accessibilityNotes, setAccessibilityNotes] = useState('');
  const [budgetPerDay, setBudgetPerDay] = useState<string>('');

  // Load trip metadata + any existing preferences for this user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tripRes, prefsRes] = await Promise.all([
          fetch(`/api/trips/${params.id}`).then(r => r.ok ? r.json() : null),
          fetch(`/api/trips/${params.id}/preferences`).then(r => r.ok ? r.json() : null),
        ]);
        if (cancelled) return;

        if (tripRes?.trip?.title) setTripName(tripRes.trip.title);
        if (tripRes?.trip?.destination) setTripDestination(tripRes.trip.destination);

        if (prefsRes?.isOrganizer) {
          // Organizer fills the full Trip Builder, not this mini-wizard.
          // Send them to the trip page rather than show an empty form.
          router.replace(`/trip/${params.id}/itinerary`);
          return;
        }

        const existing = prefsRes?.preferences as TripMemberPreferences | null;
        if (existing) {
          setPriorities(existing.priorities ?? []);
          setPace(existing.pace ?? 'balanced');
          setDietaryTags(existing.dietary?.tags ?? []);
          setDietaryNotes(existing.dietary?.notes ?? '');
          setAccessibilityNeeds(existing.accessibility?.needs ?? []);
          setAccessibilityNotes(existing.accessibility?.notes ?? '');
          setBudgetPerDay(existing.budgetPerDay ? String(existing.budgetPerDay) : '');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params.id, router]);

  const togglePriority = (id: string) => {
    setPriorities(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };
  const toggleDietary = (id: DietaryTag) => {
    setDietaryTags(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };
  const toggleAccessibility = (id: AccessibilityNeed) => {
    setAccessibilityNeeds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);

    const budgetNum = budgetPerDay.trim() ? Number(budgetPerDay) : undefined;
    const body: Omit<TripMemberPreferences, 'submittedAt'> = {
      priorities,
      pace,
      dietary: { tags: dietaryTags, notes: dietaryNotes.trim() || undefined },
      accessibility: { needs: accessibilityNeeds, notes: accessibilityNotes.trim() || undefined },
      budgetPerDay: budgetNum && !Number.isNaN(budgetNum) ? budgetNum : undefined,
    };

    try {
      const res = await fetch(`/api/trips/${params.id}/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error ?? "Couldn't save your preferences. Please try again.");
        setSaving(false);
        return;
      }
      setSaved(true);
      setSaving(false);
    } catch {
      setSaveError("Couldn't save your preferences. Check your connection and try again.");
      setSaving(false);
    }
  };

  // Shared logo header — newly added members hit this page from an
  // invite link without the usual app sidebar, so the form needs its
  // own brand mark up top (same pattern as the /join and /auth pages).
  const logoHeader = (
    <header className="bg-white border-b border-slate-200 py-4 px-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/">
          <Image src="/tripcoord_logo.png" alt="tripcoord" width={140} height={36} className="h-9 w-auto" priority />
        </Link>
      </div>
    </header>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-parchment flex flex-col">
        {logoHeader}
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
        </main>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="min-h-screen bg-parchment flex flex-col">
        {logoHeader}
        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
            <h1 className="font-script italic text-2xl font-semibold text-zinc-900 mb-2">Thanks — you&apos;re in</h1>
            <p className="text-zinc-600 mb-6">
              Your preferences are saved. The trip organizer will see them when they generate the itinerary.
            </p>
            <Link
              href={`/trip/${params.id}/itinerary`}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold rounded-full transition-colors"
            >
              Go to the trip
            </Link>
            <button
              onClick={() => setSaved(false)}
              className="block mx-auto mt-3 text-sm text-zinc-500 hover:text-zinc-700"
            >
              Update my answers
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-parchment">
      {logoHeader}
      <main className="max-w-2xl mx-auto px-4 py-8 md:py-12">
        <Link
          href={`/trip/${params.id}/itinerary`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to trip
        </Link>

        <div className="mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            Your preferences for {tripName}
          </div>
          <h1 className="font-script italic text-3xl md:text-4xl font-semibold text-zinc-900 mb-2">
            Tell us what you&apos;re into
          </h1>
          <p className="text-zinc-600">
            {tripDestination ? `${tripDestination} ·` : ''} Takes about 2 minutes. Your answers help the organizer build an itinerary that works for everyone in the group.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* ─── Top Priorities ─────────────────────────── */}
          <section className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
            <h2 className="font-script italic text-xl font-semibold text-zinc-900 mb-1">What do you love?</h2>
            <p className="text-sm text-zinc-500 mb-4">Pick the things you&apos;d most want to do — there&apos;s no limit.</p>
            <div className="flex flex-wrap gap-2">
              {PRIORITY_OPTIONS.map(p => {
                const selected = priorities.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePriority(p.id)}
                    className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-all ${
                      selected
                        ? 'bg-sky-900 border-sky-900 text-white'
                        : 'bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300'
                    }`}
                  >
                    <span className="mr-1.5">{p.icon}</span>{p.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ─── Pace ───────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
            <h2 className="font-script italic text-xl font-semibold text-zinc-900 mb-1">How packed do you like your days?</h2>
            <p className="text-sm text-zinc-500 mb-4">No wrong answer — we&apos;ll average across the group.</p>
            <div className="grid sm:grid-cols-3 gap-3">
              {PACE_OPTIONS.map(opt => {
                const selected = pace === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPace(opt.id)}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      selected
                        ? 'bg-sky-50 border-sky-300 ring-2 ring-sky-200'
                        : 'bg-white border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <div className={`font-semibold mb-1 ${selected ? 'text-sky-900' : 'text-zinc-900'}`}>{opt.label}</div>
                    <div className="text-xs text-zinc-500 leading-snug">{opt.sub}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ─── Dietary ────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
            <h2 className="font-script italic text-xl font-semibold text-zinc-900 mb-1">Anything we should know about food?</h2>
            <p className="text-sm text-zinc-500 mb-4">We&apos;ll keep these in mind when picking restaurants and food spots.</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {DIETARY_OPTIONS.map(d => {
                const selected = dietaryTags.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDietary(d.id)}
                    className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-all ${
                      selected
                        ? 'bg-emerald-700 border-emerald-700 text-white'
                        : 'bg-white border-zinc-200 text-zinc-700 hover:border-zinc-300'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <textarea
              value={dietaryNotes}
              onChange={(e) => setDietaryNotes(e.target.value)}
              placeholder="Anything else? e.g. 'really don't like spicy food'"
              rows={2}
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </section>

          {/* ─── Budget ─────────────────────────────────── */}
          <section className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
            <h2 className="font-script italic text-xl font-semibold text-zinc-900 mb-1">Your daily food budget?</h2>
            <p className="text-sm text-zinc-500 mb-4">
              Per person, per day, for meals only. We&apos;ll keep food picks within the lowest budget in the group so nobody&apos;s priced out. Activities and museums aren&apos;t affected — you can always opt out of pricey ones.
            </p>
            <div className="flex items-center gap-2 max-w-xs">
              <span className="text-zinc-500">$</span>
              <input
                type="number"
                min={0}
                value={budgetPerDay}
                onChange={(e) => setBudgetPerDay(e.target.value)}
                placeholder="60"
                className="flex-1 rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              />
              <span className="text-sm text-zinc-500">/ day</span>
            </div>
            <p className="text-xs text-zinc-400 mt-2">Leave blank if you don&apos;t want to set one.</p>
          </section>

          {/* ─── Accessibility ──────────────────────────── */}
          <section className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
            <h2 className="font-script italic text-xl font-semibold text-zinc-900 mb-1">Accessibility needs?</h2>
            <p className="text-sm text-zinc-500 mb-4">We&apos;ll work these into the itinerary as hard requirements — every shared activity will accommodate them.</p>
            <div className="space-y-2 mb-4">
              {ACCESSIBILITY_OPTIONS.map(a => {
                const selected = accessibilityNeeds.includes(a.id);
                return (
                  <label
                    key={a.id}
                    className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-zinc-200 hover:border-zinc-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleAccessibility(a.id)}
                      className="w-4 h-4 rounded border-zinc-300"
                    />
                    <span className="text-sm text-zinc-800">{a.label}</span>
                  </label>
                );
              })}
            </div>
            <textarea
              value={accessibilityNotes}
              onChange={(e) => setAccessibilityNotes(e.target.value)}
              placeholder="Anything else we should know?"
              rows={2}
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </section>

          {saveError && (
            <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl">
              <p className="text-sm text-rose-700">{saveError}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href={`/trip/${params.id}/itinerary`}
              className="px-5 py-2.5 text-sm font-medium text-zinc-600 hover:text-zinc-900"
            >
              Skip for now
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : 'Save my preferences'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
