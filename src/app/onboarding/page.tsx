'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import Link from 'next/link';
import Image from 'next/image';
import {
  Mountain, Waves, Compass, Utensils, Music, Scale,
  ArrowRight, ArrowLeft, Check, Sparkles,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type TravelVibe = 'adventure' | 'relaxed' | 'cultural' | 'foodie' | 'party' | 'balanced';
type GroupType = 'friends' | 'couple' | 'family' | 'solo' | 'work';

interface ProfileState {
  yourName: string;
  avatarEmoji: string;
  groupType: GroupType;
  vibes: TravelVibe[];
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
      {[0, 1].map((i) => (
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

      {/* CTA hint */}
      <div className="p-4 bg-gradient-to-r from-sky-50 to-green-50 border border-sky-100 rounded-xl">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-sky-600 flex-shrink-0" />
          <p className="text-sm text-slate-600">
            Next up: tell us where you want to go and we'll build a full AI-powered itinerary in seconds.
          </p>
        </div>
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
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [state, setState] = useState<ProfileState>(INITIAL);

  const patchState = useCallback((patch: Partial<ProfileState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const canAdvance = () => {
    if (step === 0) return state.yourName.trim().length >= 1;
    if (step === 1) return state.vibes.length >= 1;
    return false;
  };

  const saveProfile = async () => {
    const profileData = {
      name: state.yourName,
      avatarEmoji: state.avatarEmoji,
      groupType: state.groupType,
      vibes: state.vibes,
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('tripcoord_profile', JSON.stringify(profileData));
    }
    // Persist name + full travel persona to Supabase for logged-in users
    // so the data is available on any device, not just this browser's localStorage
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Use the /api/auth/me PATCH endpoint so validation + admin client are consistent
        await fetch('/api/auth/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: state.yourName,
            travel_persona: {
              vibes: state.vibes,
              groupType: state.groupType,
              priorities: [], // priorities are set in Settings after onboarding
            },
          }),
        });
      }
    } catch {
      // Supabase save failed — localStorage fallback already set, continue
    }
  };

  const handleNext = async () => {
    if (step === 0) {
      setStep(1);
      return;
    }
    await saveProfile();
    router.push('/trip/new?firsttrip=true');
  };

  const handleGoToDashboard = async () => {
    await saveProfile();
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex flex-col bg-parchment">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <Link href="/">
          <Image src="/tripcoord_logo.png" alt="tripcoord" width={140} height={44} className="h-9 w-auto" priority />
        </Link>
        <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-700 transition-colors">
          Skip for now →
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center px-4 pt-4 pb-8">
        <div className="w-full max-w-lg">
          <StepDots step={step} />

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
            {step === 0 && <ProfileStep state={state} onChange={patchState} />}
            {step === 1 && <StyleStep state={state} onChange={patchState} />}

            {/* Navigation */}
            <div className="flex items-center gap-3 mt-8">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors font-medium"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
              )}
              {step === 1 ? (
                <div className="flex-1 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!canAdvance()}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-sky-700 to-sky-600 text-white font-display font-semibold text-base shadow hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
                  >
                    <Sparkles className="w-4 h-4" />
                    Create Your First Trip
                  </button>
                  <button
                    type="button"
                    onClick={handleGoToDashboard}
                    disabled={!canAdvance()}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
                  >
                    Confirm and go to Home Base →
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!canAdvance()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-sky-700 to-sky-600 text-white font-display font-semibold text-base shadow hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
                >
                  My Travel Style
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <p className="text-center text-sm text-slate-400 mt-4">
            Step {step + 1} of 2 — {step === 0 ? 'Your Profile' : 'Travel Style'}
          </p>
        </div>
      </main>
    </div>
  );
}
