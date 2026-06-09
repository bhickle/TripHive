'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { detectLocaleCountry } from '@/lib/world/countries';
import CountryPicker from '@/components/CountryPicker';
import Link from 'next/link';
import Image from 'next/image';
import {
  Mountain, Waves, Compass, Utensils, Music, Scale,
  ArrowRight, ArrowLeft, Check, Sparkles, Map as MapIcon,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type TravelVibe = 'adventure' | 'relaxed' | 'cultural' | 'foodie' | 'party' | 'balanced';
type GroupType = 'friends' | 'couple' | 'family' | 'solo' | 'work';

interface ProfileState {
  yourName: string;
  avatarEmoji: string;
  groupType: GroupType;
  vibes: TravelVibe[];
  homeCountry: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AVATAR_EMOJIS = ['🧳', '✈️', '🏄', '🧗', '🎒', '🏕️', '🤿', '🎭', '🍜', '📸', '🎵', '🌍'];

const VIBE_OPTIONS: { id: TravelVibe; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: 'adventure', label: 'Adventure', icon: <Mountain className="w-4 h-4" />, desc: 'Hikes, thrills, outdoors' },
  { id: 'relaxed', label: 'Relaxed', icon: <Waves className="w-4 h-4" />, desc: 'Slow pace, recharge' },
  { id: 'cultural', label: 'Cultural', icon: <Compass className="w-4 h-4" />, desc: 'History, art, museums' },
  { id: 'foodie', label: 'Foodie', icon: <Utensils className="w-4 h-4" />, desc: 'Restaurants, markets' },
  { id: 'party', label: 'Nightlife', icon: <Music className="w-4 h-4" />, desc: 'Bars, clubs, events' },
  { id: 'balanced', label: 'Balanced', icon: <Scale className="w-4 h-4" />, desc: 'A bit of everything' },
];

const GROUP_TYPES: { id: GroupType; label: string; emoji: string }[] = [
  { id: 'friends', label: 'Friend Group', emoji: '🎉' },
  { id: 'couple', label: 'Couple', emoji: '💑' },
  { id: 'family', label: 'Family', emoji: '👨\u200d👩\u200d👧\u200d👦' },
  { id: 'solo', label: 'Solo', emoji: '🧍' },
  { id: 'work', label: 'Work Trip', emoji: '💼' },
];

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepDots({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`transition-all duration-300 rounded-full ${
            i < step ? 'w-6 h-2 bg-sky-600' :
            i === step ? 'w-8 h-2 bg-sky-700' : 'w-2 h-2 bg-slate-200'
          }`}
        />
      ))}
    </div>
  );
}

// ─── Step 1: Profile ──────────────────────────────────────────────────────────

function ProfileStep({
  state,
  onChange,
}: {
  state: ProfileState;
  onChange: (patch: Partial<ProfileState>) => void;
}) {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-script italic font-semibold text-slate-900 mb-2">Welcome to tripcoord</h1>
        <p className="text-slate-500">Let's set up your profile so your crew knows who's planning.</p>
      </div>

      {/* Emoji picker */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">Pick your travel emoji</label>
        <div className="grid grid-cols-6 gap-2">
          {AVATAR_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onChange({ avatarEmoji: emoji })}
              className={`h-12 rounded-xl text-2xl transition-all duration-150 ${
                state.avatarEmoji === emoji
                  ? 'bg-sky-100 ring-2 ring-sky-600 scale-105'
                  : 'bg-slate-100 hover:bg-slate-200'
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Your name</label>
        <input
          type="text"
          placeholder="First name or nickname"
          value={state.yourName}
          onChange={(e) => onChange({ yourName: e.target.value })}
          className="input-field"
          autoFocus
        />
      </div>

      {/* Home country — personalizes visa/entry tips in Trip Essentials */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Where do you call home?</label>
        <CountryPicker value={state.homeCountry} onChange={(c) => onChange({ homeCountry: c })} inputClassName="input-field" />
        <p className="text-xs text-slate-400 mt-1.5">We use this to tailor visa &amp; entry tips for your trips. You can change it anytime in Settings.</p>
      </div>

      {/* Preview */}
      {state.yourName && (
        <div className="flex items-center gap-3 p-4 bg-sky-50 border border-sky-100 rounded-xl">
          <div className="w-12 h-12 rounded-full bg-white border-2 border-sky-200 flex items-center justify-center text-2xl">
            {state.avatarEmoji}
          </div>
          <div>
            <p className="font-semibold text-slate-900">{state.yourName}</p>
            <p className="text-sm text-slate-500">Trip organizer</p>
          </div>
          <Check className="w-5 h-5 text-sky-600 ml-auto" />
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Travel Style ─────────────────────────────────────────────────────

function StyleStep({
  state,
  onChange,
}: {
  state: ProfileState;
  onChange: (patch: Partial<ProfileState>) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-script italic font-semibold text-slate-900 mb-2">Your travel style</h1>
        <p className="text-slate-500">We'll use this to personalise every trip recommendation.</p>
      </div>

      {/* Group Type */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">I usually travel as…</label>
        <div className="grid grid-cols-5 gap-2">
          {GROUP_TYPES.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onChange({ groupType: g.id })}
              className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 text-center transition-all duration-150 ${
                state.groupType === g.id
                  ? 'border-sky-600 bg-sky-50 text-sky-700'
                  : 'border-slate-200 hover:border-slate-300 text-slate-600'
              }`}
            >
              <span className="text-xl">{g.emoji}</span>
              <span className="text-xs font-medium leading-tight">{g.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Vibes */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">
          Travel vibe <span className="text-slate-400 font-normal">(pick all that apply)</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {VIBE_OPTIONS.map((v) => {
            const selected = state.vibes.includes(v.id);
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  const next = selected
                    ? state.vibes.filter((x) => x !== v.id)
                    : [...state.vibes, v.id];
                  onChange({ vibes: next });
                }}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all duration-150 ${
                  selected
                    ? 'border-sky-600 bg-sky-50 text-sky-700'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                <span className={selected ? 'text-sky-600' : 'text-slate-400'}>{v.icon}</span>
                <div>
                  <p className="text-sm font-medium leading-tight">{v.label}</p>
                  <p className="text-xs text-slate-400">{v.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* CTA hint — flow ends on a fork screen that asks the user what
          they want to do next; this hint sets that expectation. */}
      <div className="p-4 bg-sky-50 border border-sky-100 rounded-xl">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-sky-600 flex-shrink-0" />
          <p className="text-sm text-slate-600">
            Almost done — next, pick what you want to do first.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Fork screen ──────────────────────────────────────────────────────
// Terminal step after registration + onboarding. Asks the user what they
// want to do next instead of auto-routing them into the Trip Builder.
// Three CTA cards: Build a trip (primary), Browse Discover, Look around.
// Brandon's 2026-05-29 directive — the auto-route into /trip/new felt
// pushy on cold-signup users who landed via the marketing site and just
// wanted to look around first.

function ForkStep({
  yourName,
  onBuild,
  onDiscover,
  onLookAround,
}: {
  yourName: string;
  onBuild: () => void;
  onDiscover: () => void;
  onLookAround: () => void;
}) {
  const firstName = yourName.trim().split(/\s+/)[0] || 'friend';
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-sky-50 flex items-center justify-center">
          <Check className="w-7 h-7 text-sky-700" />
        </div>
        <h1 className="text-3xl font-script italic font-semibold text-slate-900 mb-2">
          You&apos;re in, {firstName}.
        </h1>
        <p className="text-slate-500">What do you want to do first?</p>
      </div>

      <div className="space-y-3">
        {/* Primary: build a trip. Bigger, sky-700, sparkle icon — same
            shape as the existing primary CTAs on this page. */}
        <button
          type="button"
          onClick={onBuild}
          className="w-full flex items-center gap-4 p-5 rounded-2xl border-2 border-sky-700 bg-sky-50 hover:bg-sky-100 transition-colors text-left"
        >
          <div className="w-11 h-11 rounded-full bg-sky-700 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900">Build a trip</p>
            <p className="text-sm text-slate-600">Tell us where you&apos;re going. tripcoord drafts a full day-by-day plan.</p>
          </div>
          <ArrowRight className="w-5 h-5 text-sky-700 flex-shrink-0" />
        </button>

        {/* Secondary: Discover. Curated browse-first path for users who
            don't know where to go yet. */}
        <button
          type="button"
          onClick={onDiscover}
          className="w-full flex items-center gap-4 p-5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-left"
        >
          <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Compass className="w-5 h-5 text-slate-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900">Browse Discover</p>
            <p className="text-sm text-slate-600">Curated trips, seasonal collections, founder picks. Save what catches your eye.</p>
          </div>
          <ArrowRight className="w-5 h-5 text-slate-500 flex-shrink-0" />
        </button>

        {/* Tertiary: Home Base. For users who registered to claim a spot
            and want to poke around before committing. */}
        <button
          type="button"
          onClick={onLookAround}
          className="w-full flex items-center gap-4 p-5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-left"
        >
          <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
            <MapIcon className="w-5 h-5 text-slate-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900">Look around</p>
            <p className="text-sm text-slate-600">Land on your Home Base. Build a trip whenever you&apos;re ready.</p>
          </div>
          <ArrowRight className="w-5 h-5 text-slate-500 flex-shrink-0" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const INITIAL: ProfileState = {
  yourName: '',
  avatarEmoji: '🧳',
  groupType: 'friends',
  vibes: ['balanced'],
  homeCountry: '',
};

export default function OnboardingPage() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<ProfileState>(INITIAL);

  // Onboarding is a registered-user surface — the profile/persona it
  // collects only makes sense when there's a Supabase user to attach it
  // to. The old behavior let anonymous users fill out the wizard,
  // localStorage-persist the result, then hit the /dashboard auth gate
  // and lose the form. Redirect to signup up front instead (carries the
  // /onboarding return target so the user lands back here after auth).
  useEffect(() => {
    if (!currentUser.isLoading && !currentUser.id && !currentUser.isDemo) {
      router.replace(`/auth/signup?redirect=${encodeURIComponent('/onboarding')}`);
    }
  }, [currentUser.isLoading, currentUser.id, currentUser.isDemo, router]);

  const patchState = useCallback((patch: Partial<ProfileState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  // Pre-fill home country from the browser locale (client-only so SSR stays
  // stable). The user can change it — it's just a sensible default.
  useEffect(() => {
    const guess = detectLocaleCountry();
    if (guess) setState(prev => (prev.homeCountry ? prev : { ...prev, homeCountry: guess }));
  }, []);

  const canAdvance = () => {
    if (step === 0) return state.yourName.trim().length >= 1;
    if (step === 1) return state.vibes.length >= 1;
    // step === 2 is the terminal fork screen — no Next button, the
    // three CTA cards handle navigation themselves.
    return false;
  };

  const saveProfile = async () => {
    const profileData = {
      name: state.yourName,
      avatarEmoji: state.avatarEmoji,
      groupType: state.groupType,
      vibes: state.vibes,
      homeCountry: state.homeCountry,
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('tripcoord_profile', JSON.stringify(profileData));
    }
    // Persist name + full travel persona to Supabase for logged-in users
    // so the data is available on any device, not just this browser's
    // localStorage. Retry once on transient failure — a silent fetch error
    // here means the user lands on the trip wizard with their profile
    // stuck in localStorage only, which won't survive a device switch.
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Preserve any priorities the user already set in Settings. Onboarding
        // doesn't collect priorities, but the travel_persona PATCH replaces the
        // whole object — a hardcoded [] here wiped existing priorities on a
        // re-run. Read the current value and carry it through.
        let existingPriorities: string[] = [];
        try {
          const { data: prof } = await supabase.from('profiles').select('travel_persona').eq('id', user.id).maybeSingle();
          const tp = prof?.travel_persona as { priorities?: unknown } | null;
          if (Array.isArray(tp?.priorities)) existingPriorities = tp.priorities as string[];
        } catch { /* default to [] */ }
        const body = JSON.stringify({
          name: state.yourName,
          // home_country personalizes visa/entry tips in Trip Essentials.
          home_country: state.homeCountry,
          travel_persona: {
            vibes: state.vibes,
            groupType: state.groupType,
            priorities: existingPriorities,
          },
        });
        const doSave = () =>
          fetch('/api/auth/me', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body,
          });
        let res = await doSave().catch(() => null);
        if (!res || !res.ok) {
          // Profile-save isn't time-critical but losing it means the user
          // has to re-set their persona later. Three retries with growing
          // backoff (600ms / 1.5s) — most transient failures (network blip,
          // cold-start Supabase RLS evaluation) resolve in that window.
          // Stashing a flag in localStorage lets the dashboard pick up the
          // failure on next load and re-attempt the save without surfacing
          // an error to the user mid-onboarding.
          await new Promise(r => setTimeout(r, 600));
          res = await doSave().catch(() => null);
        }
        if (!res || !res.ok) {
          await new Promise(r => setTimeout(r, 1500));
          res = await doSave().catch(() => null);
        }
        if (!res || !res.ok) {
          console.warn('[onboarding] profile save failed three times; flagging for dashboard re-attempt');
          try {
            localStorage.setItem('tripcoord_pending_profile_save', '1');
          } catch { /* private browsing */ }
        }
      }
    } catch (err) {
      // Supabase save failed — localStorage fallback already set, continue
      console.warn('[onboarding] profile save threw:', err);
    }
  };

  const handleNext = async () => {
    if (step === 0) {
      setStep(1);
      return;
    }
    if (step === 1) {
      // Persist the profile NOW (not on the fork CTAs) so even if the
      // user bails out via the "Skip for now" header link, their persona
      // is saved. The fork-screen CTAs only handle navigation.
      await saveProfile();
      setStep(2);
      return;
    }
  };

  const handleGoToDashboard = async () => {
    await saveProfile();
    router.push('/dashboard');
  };

  // Fork-screen CTAs (step 2). Profile is already saved by handleNext on
  // the step-1 transition, so these are pure navigation. Brandon's
  // 2026-05-29 directive: after registration + onboarding, ASK whether
  // the user wants to build a trip — don't auto-route them into the
  // Trip Builder.
  const handleForkBuild = () => router.push('/trip/new?firsttrip=true');
  const handleForkDiscover = () => router.push('/discover');
  const handleForkLookAround = () => router.push('/dashboard');

  return (
    <div className="min-h-screen flex flex-col bg-parchment">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/">
          <Image src="/tripcoord_logo.png" alt="tripcoord" width={140} height={44} className="h-9 w-auto" priority />
        </Link>
        {/* Skip-for-now hidden on the fork screen — that IS the resolution,
            and "Look around" is already one of the three options. */}
        {step < 2 && (
          <button
            type="button"
            onClick={handleGoToDashboard}
            className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Skip for now →
          </button>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center px-4 pt-4 pb-8">
        <div className="w-full max-w-lg">
          <StepDots step={step} />

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
            {step === 0 && <ProfileStep state={state} onChange={patchState} />}
            {step === 1 && <StyleStep state={state} onChange={patchState} />}
            {step === 2 && (
              <ForkStep
                yourName={state.yourName}
                onBuild={handleForkBuild}
                onDiscover={handleForkDiscover}
                onLookAround={handleForkLookAround}
              />
            )}

            {/* Navigation — hidden on the fork screen (step 2); the three
                CTA cards inside ForkStep handle navigation themselves. */}
            {step < 2 && (
              <div className="flex items-center gap-3 mt-8">
                {step > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep(step - 1)}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors font-medium"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canAdvance()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-sky-700 to-sky-600 text-white font-display font-semibold text-base shadow hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
                >
                  {step === 0 ? 'My Travel Style' : 'Continue'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {step < 2 && (
            <p className="text-center text-sm text-slate-400 mt-4">
              Step {step + 1} of 3 — {step === 0 ? 'Your Profile' : 'Travel Style'}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
