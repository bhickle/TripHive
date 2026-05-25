'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { Avatar } from '@/components/Avatar';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuth } from '@/context/AuthContext';
import { PRICING, getTierFeatures } from '@/hooks/useEntitlements';
import { TIER_LIMITS, type SubscriptionTier } from '@/lib/types';
import {
  User, Bell, Lock, Download, Trash2, CreditCard, Wifi, Upload, Check, Settings as SettingsIcon,
  ThumbsUp, MessageSquare, ChevronUp, Send, Sparkles, Zap, Loader2,
} from 'lucide-react';
import Image from 'next/image';

type ActiveSection = 'profile' | 'persona' | 'subscription' | 'notifications' | 'apps' | 'privacy';

interface NotificationSettings {
  email: boolean;
  push: boolean;
  tripReminders: boolean;
  voteAlerts: boolean;
  expenseAlerts: boolean;
  marketing: boolean;
}

// ─── Persona options — must match onboarding + trip builder exactly ──────────

const VIBE_OPTIONS = [
  { id: 'adventure', label: 'Adventure',  desc: 'Hikes, thrills, outdoors' },
  { id: 'relaxed',   label: 'Relaxed',    desc: 'Slow pace, recharge' },
  { id: 'cultural',  label: 'Cultural',   desc: 'History, art, museums' },
  { id: 'foodie',    label: 'Foodie',     desc: 'Restaurants, markets' },
  { id: 'party',     label: 'Nightlife',  desc: 'Bars, clubs, events' },
  { id: 'balanced',  label: 'Balanced',   desc: 'A bit of everything' },
];

const GROUP_TYPE_OPTIONS = [
  { id: 'friends', label: 'Friend Group', emoji: '🎉' },
  { id: 'couple',  label: 'Couple',       emoji: '💑' },
  { id: 'family',  label: 'Family',       emoji: '👨‍👩‍👧‍👦' },
  { id: 'solo',    label: 'Solo',         emoji: '🧍' },
  { id: 'work',    label: 'Work Trip',    emoji: '💼' },
];

// Keep in sync with trip/new/page.tsx priorityOptions
const PRIORITY_OPTIONS = [
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
  // 'budget' chip removed — overlaps with the budget-tier slider in the Trip
  // Builder. 'accessibility' chip removed — collected as a dedicated wizard
  // question, not a priority chip.
];

// ─── Subscription display helpers ─────────────────────────────────────────────

const PLAN_DISPLAY: Record<string, { name: string; price: string; per: string; gradient: string }> = {
  free:      { name: 'Free',      price: '$0',    per: '',        gradient: 'bg-gradient-to-br from-slate-600 to-slate-800' },
  explorer:  { name: 'Explorer',  price: `$${PRICING.explorer.monthly}`, per: '/month', gradient: 'bg-gradient-to-br from-sky-600 to-sky-800' },
  nomad:     { name: 'Nomad',     price: `$${PRICING.nomad.monthly}`,    per: '/month', gradient: 'bg-gradient-to-br from-emerald-700 to-sky-800' },
  trip_pass: { name: 'Trip Pass', price: `$${PRICING.trip_pass.base}`,   per: '/trip',  gradient: 'bg-gradient-to-br from-amber-600 to-rose-700' },
};

// Subscription feature lists are derived from TIER_LIMITS via getTierFeatures()
// (in useEntitlements) so Settings, Pricing, and the upgrade modal all stay in
// sync with the actual tier definitions instead of hand-maintained copy.

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const { user, profile: authProfile, isLoading: authLoading } = useAuth();
  const [activeSection, setActiveSection] = useState<ActiveSection>('profile');
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingPersona, setEditingPersona] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCookiePanel, setShowCookiePanel] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(() => {
    try { return localStorage.getItem('tc_analytics') !== 'false'; } catch { return true; }
  });
  const [exportingData, setExportingData] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState(false);
  const [pwResetSending, setPwResetSending] = useState(false);
  const [pwResetSent, setPwResetSent] = useState(false);
  const [personaSaved, setPersonaSaved] = useState(false);
  // Surface persona save failures inline. Was previously a window.alert(),
  // which broke visual flow and felt jarring; now a small banner near the
  // Save button matches the rest of the settings surfaces.
  const [personaSaveError, setPersonaSaveError] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  // Stores the last Supabase-fetched persona so Cancel can restore it correctly
  const lastSavedPersonaRef = useRef<{ vibes: string[]; groupType: string; priorities: string[] } | null>(null);

  const [profile, setProfile] = useState({
    name: '',
    email: '',
    avatarUrl: undefined as string | undefined,
    homeCountry: '' as string,
  });

  // Default travel partner — when set, every new trip auto-shares with
  // this person at create time. Two parallel pieces of state: the email
  // the user typed (editable in the form) and the resolved partner
  // record (display-only, returned by /api/auth/me on load and refreshed
  // after a successful save).
  const [defaultPartnerEmail, setDefaultPartnerEmail] = useState('');
  const [defaultPartner, setDefaultPartner] = useState<{ id: string; name: string; email: string } | null>(null);
  const [partnerError, setPartnerError] = useState<string | null>(null);

  // Settings is an authenticated page — redirect to login if auth resolves with no user.
  // This prevents any mock/demo data (including hardcoded emails) from appearing.
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/login');
    }
  }, [authLoading, user, router]);

  // Populate profile from real auth data once it loads. homeCountry comes
  // from a separate /api/auth/me fetch below (the AuthContext profile carries
  // it but we use the same fetch path for both fields), so we preserve any
  // already-loaded homeCountry on this update.
  useEffect(() => {
    if (!authLoading && user) {
      setProfile(prev => ({
        ...prev,
        name: authProfile?.name ?? (user.user_metadata as Record<string, string> | undefined)?.full_name ?? user.email?.split('@')[0] ?? '',
        email: user.email ?? authProfile?.email ?? '',
        avatarUrl: authProfile?.avatar_url ?? undefined,
        homeCountry: authProfile?.home_country ?? prev.homeCountry ?? '',
      }));
    }
  }, [authLoading, user, authProfile]);

  // ── Persona — load from Supabase for real users, localStorage for guests ──
  const [persona, setPersona] = useState({
    vibes:      [] as string[],
    groupType:  'friends',
    priorities: [] as string[],
  });

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      // Real user — fetch from Supabase. The /api/auth/me response carries
      // both `travelPersona` (the personal Travel Persona — distinct from
      // per-trip priorities collected in the Trip Builder) and `homeCountry`
      // which we use to exclude domestic trips from the dashboard's
      // "Countries Visited" lifetime count.
      fetch('/api/auth/me')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.homeCountry) {
            setProfile(prev => ({ ...prev, homeCountry: data.homeCountry }));
          }
          if (data?.defaultPartner) {
            setDefaultPartner(data.defaultPartner);
            setDefaultPartnerEmail(data.defaultPartner.email ?? '');
          } else {
            setDefaultPartner(null);
            setDefaultPartnerEmail('');
          }
          if (data?.travelPersona) {
            const p = data.travelPersona;
            const loaded = {
              vibes:      Array.isArray(p.vibes)      ? p.vibes      : [],
              groupType:  p.groupType  ?? 'friends',
              priorities: Array.isArray(p.priorities) ? p.priorities : [],
            };
            setPersona(loaded);
            lastSavedPersonaRef.current = loaded;
          } else {
            // Fall back to localStorage if Supabase has nothing yet
            try {
              const stored = localStorage.getItem('tripcoord_profile');
              if (stored) {
                const p = JSON.parse(stored);
                setPersona({
                  vibes:      Array.isArray(p.vibes)      ? p.vibes      : [],
                  groupType:  p.groupType  ?? 'friends',
                  priorities: Array.isArray(p.priorities) ? p.priorities : [],
                });
              }
            } catch { /* ignore */ }
          }
        })
        .catch(() => { /* keep defaults */ });
    } else {
      // Guest / demo — use localStorage
      try {
        const stored = localStorage.getItem('tripcoord_profile');
        if (stored) {
          const p = JSON.parse(stored);
          setPersona({
            vibes:      Array.isArray(p.vibes)      ? p.vibes      : [],
            groupType:  p.groupType  ?? 'friends',
            priorities: Array.isArray(p.priorities) ? p.priorities : [],
          });
        }
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      if (user) {
        // Route through /api/profile/avatar so both Settings and the Group
        // page share one upload path (server-side admin client, no browser-
        // side Storage RLS to mis-configure). Previously this page uploaded
        // direct to Storage from the browser, which silently failed for some
        // accounts and caused avatars to vanish on refresh.
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/profile/avatar', { method: 'POST', body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setAvatarError(body?.error ?? 'Upload failed — please try again.');
        } else {
          const { url } = await res.json() as { url: string };
          // Cache-buster so the <img> re-fetches after re-upload (the
          // server-side path includes a timestamp, but mid-session swaps
          // benefit from the extra query string).
          setProfile(prev => ({ ...prev, avatarUrl: `${url}?t=${Date.now()}` }));
        }
      } else {
        // Guest / no Supabase — show local preview only
        const reader = new FileReader();
        reader.onload = ev => setProfile(prev => ({ ...prev, avatarUrl: ev.target?.result as string }));
        reader.readAsDataURL(file);
      }
    } catch {
      setAvatarError('Something went wrong. Please try again.');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  const saveProfile = async () => {
    setProfileSaving(true);
    setProfileSaveError(false);
    setPartnerError(null);
    let savedOk = true;
    // Compute the partner-email patch. Only send the field if it
    // actually changed — otherwise the server might fail an unchanged
    // value as "self-pair" if the user typed their own email then
    // reverted.
    const trimmedPartner = defaultPartnerEmail.trim();
    const partnerChanged = trimmedPartner.toLowerCase() !== (defaultPartner?.email ?? '').toLowerCase();
    if (user) {
      try {
        const body: Record<string, unknown> = {
          name: profile.name,
          home_country: profile.homeCountry?.trim() ?? '',
        };
        if (partnerChanged) {
          body.default_partner_email = trimmedPartner;
        }
        const res = await fetch('/api/auth/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          savedOk = false;
          // Surface partner-specific failures inline rather than the
          // generic "Save failed" — helps the user fix the email vs.
          // assuming the whole save broke.
          if (partnerChanged) {
            try {
              const data = await res.json();
              if (data?.error) setPartnerError(data.error);
            } catch { /* ignore */ }
          }
        } else {
          // Refresh the resolved partner from /me so the read-only view
          // reflects what was actually saved (linked to whom).
          try {
            const meRes = await fetch('/api/auth/me');
            if (meRes.ok) {
              const me = await meRes.json();
              if (me?.defaultPartner) {
                setDefaultPartner(me.defaultPartner);
                setDefaultPartnerEmail(me.defaultPartner.email ?? '');
              } else {
                setDefaultPartner(null);
                setDefaultPartnerEmail('');
              }
            }
          } catch { /* swallow — best-effort refresh */ }
        }
      } catch { savedOk = false; }
    }
    setProfileSaving(false);
    if (savedOk) {
      setEditingProfile(false);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } else {
      setProfileSaveError(true);
      setTimeout(() => setProfileSaveError(false), 3000);
    }
  };

  const savePersona = async () => {
    // Always write to localStorage so trip builder / onboarding can read this
    // as a default for new trips. NOTE: this is the user's PERSONAL Travel
    // Persona — completely separate from per-trip priorities the Trip Builder
    // collects (which save to trip.preferences and trip_members.preferences).
    // Trip Builder reads this localStorage as a starting point only and never
    // writes back to it, so editing trip-specific priorities will not change
    // the user's personal persona.
    try {
      const existing = JSON.parse(localStorage.getItem('tripcoord_profile') || '{}');
      localStorage.setItem('tripcoord_profile', JSON.stringify({
        ...existing,
        vibes:      persona.vibes,
        groupType:  persona.groupType,
        priorities: persona.priorities,
      }));
    } catch { /* ignore */ }

    // For real logged-in users, also persist to Supabase so it survives across
    // devices/logins. Now we check res.ok and surface failures via the
    // existing personaSaved/cancel UI — previously the call was fire-and-
    // forget so a server-side validation reject would silently leave the
    // user staring at "✓ Saved!" while nothing actually saved.
    let serverSavedOk = true;
    if (user) {
      try {
        const res = await fetch('/api/auth/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            travel_persona: {
              vibes:      persona.vibes,
              groupType:  persona.groupType,
              priorities: persona.priorities,
            },
          }),
        });
        if (!res.ok) serverSavedOk = false;
      } catch { serverSavedOk = false; }
    }

    if (!serverSavedOk) {
      // Surface inline so the user can retry without breaking visual flow.
      // Auto-dismisses after 4s so a failed save doesn't permanently
      // block the panel header.
      setPersonaSaveError(true);
      setTimeout(() => setPersonaSaveError(false), 4000);
      return;
    }

    // Persist the just-saved state so Cancel later restores to THIS, not the
    // older value from initial load. Without this, editing → save → re-edit
    // → cancel would revert to the original load, losing the saved value.
    lastSavedPersonaRef.current = {
      vibes:      [...persona.vibes],
      groupType:  persona.groupType,
      priorities: [...persona.priorities],
    };

    setEditingPersona(false);
    setPersonaSaved(true);
    setTimeout(() => setPersonaSaved(false), 2000);
  };

  const cancelPersona = () => {
    // Restore from the last Supabase-fetched state if available; otherwise fall back to localStorage
    if (lastSavedPersonaRef.current) {
      setPersona(lastSavedPersonaRef.current);
    } else {
      try {
        const stored = localStorage.getItem('tripcoord_profile');
        if (stored) {
          const p = JSON.parse(stored);
          setPersona({
            vibes:      Array.isArray(p.vibes)      ? p.vibes      : [],
            groupType:  p.groupType  ?? 'friends',
            priorities: Array.isArray(p.priorities) ? p.priorities : [],
          });
        }
      } catch { /* ignore */ }
    }
    setEditingPersona(false);
  };

  const toggleVibe = (id: string) =>
    setPersona(prev => ({
      ...prev,
      vibes: prev.vibes.includes(id) ? prev.vibes.filter(v => v !== id) : [...prev.vibes, id],
    }));

  const togglePriority = (id: string) =>
    setPersona(prev => {
      const already = prev.priorities.includes(id);
      // Cap matches the visible "X/8 selected" badge + "Pick up to 8" copy
      // shown next to the field. Was 4 — copy/cap mismatch reported on
      // 2026-05-09.
      if (!already && prev.priorities.length >= 8) return prev;
      return {
        ...prev,
        priorities: already ? prev.priorities.filter(p => p !== id) : [...prev.priorities, id],
      };
    });

  // ── Subscription derived values ────────────────────────────────────────────
  // Use real auth profile tier when available; fall back to currentUser (mock) for demo/guest.
  // If the user is authenticated but authProfile hasn't yet hydrated (slow
  // network during the profile fetch, or fetchProfile failed), read the
  // TTL-checked tier cache (`tc_tier_${userId}`) that AuthContext writes
  // after every successful fetch. Without this fallback, paid users briefly
  // saw "Free plan" on Settings between page paint and profile arrival.
  // The TTL prevents the opposite bug — a downgraded user seeing a stale
  // months-old paid tier flash on this page.
  const cachedUserTier = (() => {
    if (!user || typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(`tc_tier_${user.id}`);
      if (!raw || !raw.startsWith('{')) return null;
      const parsed = JSON.parse(raw) as { tier?: string; ts?: number };
      const TTL_MS = 24 * 60 * 60 * 1000;
      if (typeof parsed.ts !== 'number' || Date.now() - parsed.ts > TTL_MS) return null;
      return parsed.tier ?? null;
    } catch {
      return null;
    }
  })();
  const rawTier = authLoading
    ? (cachedUserTier ?? 'free')
    : (user
        ? (authProfile?.subscription_tier ?? cachedUserTier ?? 'free')
        : (currentUser.subscriptionTier ?? 'free'));
  const tier = (rawTier in PLAN_DISPLAY) ? rawTier : 'free';
  const plan = PLAN_DISPLAY[tier];
  const planFeatures = getTierFeatures(tier as SubscriptionTier);
  // True only when we have a trusted tier source — either the live
  // authProfile or a previously-written cache. Without this flag, a
  // paid user whose profile hasn't loaded and has no cache flashes the
  // 'Free' label + Upgrade CTA on the Subscription tab. Mirrors the
  // gate already used on /world and Sidebar.
  // Unauthenticated viewers are always considered resolved — 'free' is
  // the correct tier for that case.
  const tierResolved = !user || !!authProfile?.subscription_tier || !!cachedUserTier;

  // Credit totals derived from tier limits (single source of truth in
  // lib/types.ts). Previously hardcoded `{ free: 10, ... trip_pass: 30 }`
  // which went stale on 2026-05-16 when free was bumped 10→25 and Trip Pass
  // 30→50 — meaning the settings page showed the wrong denominator on the
  // usage bar (50% when actually 20%, etc.).
  const aiUsed  = authLoading ? 0 : (user ? (authProfile?.ai_credits_used ?? 0) : (currentUser.aiCredits?.used ?? 0));
  // Compute denominator only once tier is trusted — without this guard, a
  // paid user briefly saw "X / 25" (the hardcoded free fallback below)
  // before tier resolves. Empty denominator suppresses the display row
  // entirely until we know the right total.
  const aiTotal = (authLoading || !tierResolved) ? 0 : (() => {
    if (tier === 'trip_pass') return PRICING.trip_pass.aiCredits;
    const limit = TIER_LIMITS[tier as keyof typeof TIER_LIMITS]?.aiCreditsPerMonth;
    return typeof limit === 'number' ? limit : 0;
  })();
  const aiDisplay = aiTotal > 0 ? `${aiUsed} / ${aiTotal}` : '—';
  const aiPct     = aiTotal > 0 ? Math.min(100, Math.round((aiUsed / aiTotal) * 100)) : 0;

  // Show an em-dash placeholder when the tier isn't resolved yet so a
  // paid user doesn't see "Free plan" flash. Once resolved, the real
  // label snaps in.
  const tierLabel = !tierResolved ? '—'
    : tier === 'free' ? 'Free plan'
    : tier === 'trip_pass' ? 'Trip Pass'
    : `${plan.name} plan`;

  // ── Notification state ─────────────────────────────────────────────────────
  const DEFAULT_NOTIFICATIONS: NotificationSettings = {
    email: true, push: true, tripReminders: true,
    voteAlerts: true, expenseAlerts: true, marketing: false,
  };
  const [notifications, setNotifications] = useState<NotificationSettings>(DEFAULT_NOTIFICATIONS);
  const [notifSaved, setNotifSaved] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);

  // Load notification prefs from Supabase profile once auth is ready.
  // Falls back to localStorage for guests/demo users.
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      // Fetch from /api/auth/me which now returns notificationPreferences
      fetch('/api/auth/me')
        .then(r => r.json())
        .then(data => {
          if (data?.notificationPreferences) {
            setNotifications({ ...DEFAULT_NOTIFICATIONS, ...data.notificationPreferences });
          }
        })
        .catch(() => { /* keep defaults */ });
    } else {
      // Guest / demo — fall back to localStorage
      try {
        const stored = localStorage.getItem('tripcoord_notifications');
        if (stored) setNotifications(JSON.parse(stored));
      } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  const saveNotifications = async () => {
    setNotifSaving(true);
    if (user) {
      try {
        await fetch('/api/auth/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notification_preferences: notifications }),
        });
      } catch { /* ignore network errors */ }
    } else {
      // Guest — persist to localStorage
      try { localStorage.setItem('tripcoord_notifications', JSON.stringify(notifications)); } catch { /* ignore */ }
    }
    setNotifSaving(false);
    setNotifSaved(true);
    setTimeout(() => setNotifSaved(false), 2000);
  };

  // ── Integration voting ─────────────────────────────────────────────────────
  interface Integration { id: string; name: string; description: string; icon: string; votes: number; }

  // Initial vote counts are zero across the board — earlier we shipped
  // these with seed values (Airbnb 52, Google Calendar 67, etc.) which
  // read as "other users have already voted" to real visitors. Real
  // counts will accumulate as users vote (votes are anonymous, persisted
  // via /api/integration-vote → DB). Until pre-launch traffic kicks in,
  // every integration starts at 0.
  const INTEGRATIONS: Integration[] = [
    { id: 'splitwise', name: 'Splitwise',       description: 'Sync expenses so splits show up automatically in your trip budget.',     icon: '💸', votes: 0 },
    { id: 'revolut',   name: 'Revolut',         description: 'Pull real-time exchange rates and card transactions into your budget.',   icon: '💳', votes: 0 },
    { id: 'paypal',    name: 'PayPal',          description: 'Pay for trip add-ons and split costs via PayPal balance.',                icon: '🅿️', votes: 0 },
    { id: 'tripit',    name: 'TripIt',          description: 'Import confirmed bookings from TripIt into your itinerary automatically.', icon: '✈️', votes: 0 },
    { id: 'airbnb',    name: 'Airbnb',          description: 'Import Airbnb reservations straight into your accommodation step.',        icon: '🏠', votes: 0 },
    { id: 'google',    name: 'Google Calendar', description: 'Push your itinerary to Google Calendar and get trip reminders.',          icon: '📅', votes: 0 },
    { id: 'spotify',   name: 'Spotify',         description: 'Auto-generate a trip playlist based on the destination vibe.',            icon: '🎵', votes: 0 },
    { id: 'other',     name: 'Something else?', description: "Don't see what you need? Tell us below.",                                icon: '💡', votes: 0 },
  ];

  const LS_KEY = 'tripcoord_integration_votes';
  const LS_COMMENTS_KEY = 'tripcoord_integration_comments';
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>(
    Object.fromEntries(INTEGRATIONS.map(i => [i.id, i.votes]))
  );
  const [expandedComment, setExpandedComment] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [submittedComments, setSubmittedComments] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const ids: string[] = JSON.parse(stored);
        setVotedIds(new Set(ids));
      }
    } catch { /* ignore */ }
    try {
      const storedComments = localStorage.getItem(LS_COMMENTS_KEY);
      if (storedComments) {
        const ids: string[] = JSON.parse(storedComments);
        setSubmittedComments(new Set(ids));
      }
    } catch { /* ignore */ }
  }, []);

  const postVote = (integrationId: string, integrationName: string, action: 'vote' | 'unvote' | 'comment', comment?: string) => {
    fetch('/api/integration-vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integrationId, integrationName, action, comment }),
    }).catch(() => {});
  };

  const handleVote = (id: string, name: string) => {
    setVotedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setVoteCounts(c => ({ ...c, [id]: c[id] - 1 }));
        postVote(id, name, 'unvote');
      } else {
        next.add(id);
        setVoteCounts(c => ({ ...c, [id]: c[id] + 1 }));
        postVote(id, name, 'vote');
      }
      try { localStorage.setItem(LS_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  };

  const handleSubmitComment = (id: string, name: string) => {
    const text = comments[id]?.trim();
    if (!text) return;
    postVote(id, name, 'comment', text);
    setSubmittedComments(prev => {
      const next = new Set(prev).add(id);
      try { localStorage.setItem(LS_COMMENTS_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
    setComments(prev => ({ ...prev, [id]: '' }));
    setExpandedComment(null);
  };

  const toggleNotification = (key: keyof NotificationSettings) =>
    setNotifications({ ...notifications, [key]: !notifications[key] });

  const openBillingPortal = async () => {
    setBillingLoading(true);
    setBillingError(null);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      if (!res.ok) {
        let detail = `request failed (${res.status})`;
        try {
          const errBody = await res.json() as { error?: string };
          if (errBody?.error) detail = errBody.error;
        } catch { /* response wasn't JSON */ }
        throw new Error(detail);
      }
      const data = await res.json() as { url?: string };
      if (data.url && /^https:\/\/(checkout\.stripe\.com|billing\.stripe\.com)\//.test(data.url)) {
        window.location.href = data.url;
      } else {
        throw new Error('Stripe did not return a valid portal URL.');
      }
    } catch (err) {
      console.error('Billing portal failed:', err);
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setBillingError(`Couldn't open billing — ${msg} Please try again.`);
      setBillingLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!profile.email) return;
    setPwResetSending(true);
    try {
      await fetch('/api/auth/send-reset-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: profile.email }),
      });
    } finally {
      setPwResetSending(false);
      setPwResetSent(true);
      setTimeout(() => setPwResetSent(false), 5000);
    }
  };

  const handleExportData = async () => {
    setExportingData(true);
    try {
      // Fetch profile from Supabase (or use mock for guests)
      const profileRes = await fetch('/api/auth/me').catch(() => null);
      const profileData = profileRes?.ok ? await profileRes.json() : null;

      // Collect localStorage trip data
      let trips: unknown[] = [];
      try { trips = JSON.parse(localStorage.getItem('tripcoord_user_trips') || '[]'); } catch { /* ignore */ }

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        profile: profileData ?? { note: 'Not logged in — no profile data' },
        trips,
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tripcoord-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
    setExportingData(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch('/api/auth/me', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete account');
      // Clear all local data and redirect home
      localStorage.clear();
      window.location.href = '/';
    } catch {
      setDeleteError('Something went wrong. Please try again or contact support.');
      setDeleting(false);
    }
  };

  const SectionButton = ({ section, label, icon: Icon }: { section: ActiveSection; label: string; icon: React.ComponentType<{ className?: string }> }) => (
    <button
      onClick={() => setActiveSection(section)}
      className={`w-full text-left px-4 py-3 rounded-lg font-medium transition-all flex items-center space-x-3 ${
        activeSection === section ? 'bg-sky-100 text-sky-900' : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
    </button>
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-parchment">
      <Sidebar activePage="settings" user={currentUser} />

      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-script italic font-semibold text-slate-900">Settings</h1>
            <p className="text-slate-600 mt-2">Manage your profile and preferences</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Navigation */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 space-y-2">
                <SectionButton section="profile"      label="Profile"          icon={User} />
                <SectionButton section="persona"      label="Travel Persona"   icon={SettingsIcon} />
                <SectionButton section="subscription" label="Subscription"     icon={CreditCard} />
                <SectionButton section="notifications" label="Notifications"   icon={Bell} />
                <SectionButton section="apps"         label="Connected Apps"   icon={Wifi} />
                <SectionButton section="privacy"      label="Privacy & Data"   icon={Lock} />
              </div>
            </div>

            {/* Content */}
            <div className="lg:col-span-3">

              {/* ── PROFILE ── */}
              {activeSection === 'profile' && (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
                  <h2 className="font-script italic text-2xl font-semibold text-slate-900 mb-6">Your Profile</h2>

                  {/* Loading skeleton — only shown while auth is resolving AND we have no
                      user name yet. Falls through immediately if currentUser already has data
                      (e.g. name from session metadata or mock fallback), so it can never hang. */}
                  {authLoading && !currentUser.name ? (
                    <div className="animate-pulse flex items-center gap-6 pb-6 border-b border-slate-200">
                      <div className="w-16 h-16 rounded-full bg-slate-200" />
                      <div className="space-y-2">
                        <div className="h-4 w-32 bg-slate-200 rounded" />
                        <div className="h-3 w-48 bg-slate-100 rounded" />
                        <div className="h-3 w-24 bg-slate-100 rounded" />
                      </div>
                    </div>
                  ) : editingProfile ? (
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-3">Profile Picture</label>
                        <div className="flex items-end space-x-6">
                          <Avatar src={profile.avatarUrl} name={profile.name} size="lg" />
                          {/* Hidden file input — triggered by the button below */}
                          <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleAvatarUpload}
                          />
                          <div className="flex flex-col gap-1">
                            <button
                              onClick={() => avatarInputRef.current?.click()}
                              disabled={avatarUploading}
                              className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all font-medium disabled:opacity-50"
                            >
                              <Upload className="w-4 h-4 inline mr-2" />
                              {avatarUploading ? 'Uploading…' : 'Upload Photo'}
                            </button>
                            {avatarError && (
                              <p className="text-xs text-red-600">{avatarError}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-2">Full Name</label>
                        <input
                          type="text"
                          value={profile.name}
                          onChange={e => setProfile({ ...profile, name: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-2">Email</label>
                        <input
                          type="email"
                          value={profile.email}
                          readOnly
                          className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed"
                        />
                        <p className="text-xs text-slate-400 mt-1">Email is your login credential and can't be changed here.</p>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-2">Home Country</label>
                        <input
                          type="text"
                          value={profile.homeCountry}
                          onChange={e => setProfile({ ...profile, homeCountry: e.target.value })}
                          placeholder="e.g. United States"
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                        />
                        <p className="text-xs text-slate-400 mt-1">Used for trip personalization. Doesn&apos;t affect the Places Visited count.</p>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-2">Default travel partner</label>
                        <input
                          type="email"
                          value={defaultPartnerEmail}
                          onChange={e => { setDefaultPartnerEmail(e.target.value); setPartnerError(null); }}
                          placeholder="partner@example.com"
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700"
                        />
                        <p className="text-xs text-slate-400 mt-1">
                          New trips will auto-share with this person. They need a TripCoord account; leave blank to clear.
                        </p>
                        {partnerError && (
                          <p className="text-xs text-rose-600 mt-1">{partnerError}</p>
                        )}
                      </div>
                      <div className="flex space-x-3 pt-4">
                        <button
                          onClick={saveProfile}
                          disabled={profileSaving}
                          className={`px-6 py-2 rounded-lg transition-all font-semibold disabled:opacity-60 ${profileSaved ? 'bg-green-600 text-white' : profileSaveError ? 'bg-rose-600 text-white' : 'bg-sky-800 text-white hover:bg-sky-900'}`}
                        >
                          {profileSaved ? '✓ Saved!' : profileSaving ? 'Saving…' : profileSaveError ? '✕ Save failed' : 'Save Changes'}
                        </button>
                        <button
                          onClick={() => {
                            // Preserve homeCountry on cancel — currentUser
                            // doesn't carry it, so spreading would clear it.
                            setProfile(prev => ({
                              ...prev,
                              name: currentUser.name,
                              email: currentUser.email,
                              avatarUrl: currentUser.avatarUrl,
                            }));
                            setEditingProfile(false);
                          }}
                          className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all font-medium"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-200">
                        <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1">
                          <Avatar src={profile.avatarUrl} name={profile.name} size="lg" />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-900 truncate">{profile.name || '—'}</p>
                            <p className="text-slate-600 truncate">{profile.email || '—'}</p>
                            <p className="text-sm text-slate-500 mt-1 capitalize">{tierLabel}</p>
                            {profile.homeCountry && (
                              <p className="text-xs text-slate-400 mt-0.5 truncate">Home: {profile.homeCountry}</p>
                            )}
                            {defaultPartner && (
                              <p className="text-xs text-slate-400 mt-0.5 truncate">
                                Default partner: {defaultPartner.name}{defaultPartner.email ? ` (${defaultPartner.email})` : ''}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setEditingProfile(true)}
                          className="flex-shrink-0 px-4 sm:px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all font-medium text-sm sm:text-base"
                        >
                          Edit
                        </button>
                      </div>
                      {/* Change Password */}
                      <div className="flex items-center justify-between py-2">
                        <div>
                          <p className="font-semibold text-slate-900">Password</p>
                          <p className="text-sm text-slate-500 mt-0.5">Send a reset link to {profile.email || 'your email'}</p>
                        </div>
                        <button
                          onClick={handlePasswordReset}
                          disabled={pwResetSending || pwResetSent}
                          className={`px-4 py-2 border rounded-lg transition-all font-medium text-sm disabled:cursor-not-allowed ${
                            pwResetSent
                              ? 'border-green-300 bg-green-50 text-green-700'
                              : 'border-slate-300 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          {pwResetSent ? '✓ Link sent!' : pwResetSending ? 'Sending…' : 'Change Password'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── TRAVEL PERSONA ── */}
              {activeSection === 'persona' && (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
                  <h2 className="font-script italic text-2xl font-semibold text-slate-900 mb-1">Travel Persona</h2>
                  <p className="text-sm text-slate-500 mb-6">
                    Your personal travel identity — how you tend to travel in general. Different from any specific trip&apos;s priorities, which you&apos;ll set per-trip in the Trip Builder.
                  </p>

                  {editingPersona ? (
                    <div className="space-y-6">
                      {/* Travel Vibe */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-1">Travel Vibe</label>
                        <p className="text-xs text-slate-500 mb-3">Pick all that apply</p>
                        <div className="grid grid-cols-3 gap-2">
                          {VIBE_OPTIONS.map(v => (
                            <button
                              key={v.id}
                              onClick={() => toggleVibe(v.id)}
                              className={`flex flex-col items-start gap-0.5 p-3 rounded-xl border-2 text-left transition-all ${
                                persona.vibes.includes(v.id)
                                  ? 'border-sky-500 bg-sky-50 text-sky-800'
                                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              <span className="text-sm font-semibold">{v.label}</span>
                              <span className="text-xs text-slate-400">{v.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Travel With */}
                      <div>
                        <label className="block text-sm font-semibold text-slate-900 mb-3">Travel With</label>
                        <div className="grid grid-cols-5 gap-2">
                          {GROUP_TYPE_OPTIONS.map(g => (
                            <button
                              key={g.id}
                              onClick={() => setPersona(prev => ({ ...prev, groupType: g.id }))}
                              className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 text-center transition-all ${
                                persona.groupType === g.id
                                  ? 'border-sky-500 bg-sky-50 text-sky-700'
                                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              <span className="text-xl">{g.emoji}</span>
                              <span className="text-xs font-medium leading-tight">{g.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Top Priorities */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-sm font-semibold text-slate-900">Top Priorities</label>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            persona.priorities.length >= 1
                              ? 'bg-green-100 text-green-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {persona.priorities.length}/8 selected
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mb-3">Pick up to 8 — these describe how you generally travel, not any specific trip.</p>
                        <div className="flex flex-wrap gap-2">
                          {PRIORITY_OPTIONS.map(p => {
                            const isSelected = persona.priorities.includes(p.id);
                            const isDisabled = !isSelected && persona.priorities.length >= 8;
                            return (
                            <button
                              key={p.id}
                              onClick={() => togglePriority(p.id)}
                              disabled={isDisabled}
                              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                                isSelected
                                  ? 'border-sky-500 bg-sky-50 text-sky-800'
                                  : isDisabled
                                  ? 'border-slate-100 text-slate-300 cursor-not-allowed bg-slate-50'
                                  : 'border-slate-200 text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              <span>{p.icon}</span>{p.label}
                            </button>
                          );
                          })}
                        </div>
                      </div>

                      <div className="flex space-x-3 pt-4">
                        <button
                          onClick={savePersona}
                          className={`px-6 py-2 rounded-lg transition-all font-semibold ${
                            personaSaved
                              ? 'bg-green-600 text-white'
                              : personaSaveError
                                ? 'bg-rose-600 text-white'
                                : 'bg-sky-800 text-white hover:bg-sky-900'
                          }`}
                        >
                          {personaSaved ? '✓ Saved!' : personaSaveError ? "✕ Couldn't save" : 'Save Changes'}
                        </button>
                        <button onClick={cancelPersona} className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all font-medium">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Display view */}
                      <div className="pb-5 border-b border-slate-200">
                        <p className="text-sm text-slate-500 mb-2">Travel Vibe</p>
                        {persona.vibes.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {persona.vibes.map(id => {
                              const v = VIBE_OPTIONS.find(o => o.id === id);
                              return (
                                <span key={id} className="px-3 py-1 bg-sky-100 text-sky-800 rounded-full text-sm font-medium">
                                  {v?.label ?? id}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-400 italic">Not set — edit to add your travel vibe</p>
                        )}
                      </div>

                      <div className="pb-5 border-b border-slate-200">
                        <p className="text-sm text-slate-500 mb-2">Travel With</p>
                        {persona.groupType ? (
                          <p className="font-semibold text-slate-900">
                            {GROUP_TYPE_OPTIONS.find(g => g.id === persona.groupType)?.label ?? persona.groupType}
                          </p>
                        ) : (
                          <p className="text-sm text-slate-400 italic">Not set</p>
                        )}
                      </div>

                      <div className="pb-5 border-b border-slate-200">
                        <p className="text-sm text-slate-500 mb-2">Top Priorities</p>
                        {persona.priorities.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {persona.priorities.map(id => {
                              const p = PRIORITY_OPTIONS.find(o => o.id === id);
                              return (
                                <span key={id} className="flex items-center gap-1 px-3 py-1 bg-sky-100 text-sky-800 rounded-full text-sm font-medium">
                                  <span>{p?.icon}</span>{p?.label ?? id}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-400 italic">Not set — edit to add your priorities</p>
                        )}
                      </div>

                      <button onClick={() => setEditingPersona(true)} className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all font-medium">
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── SUBSCRIPTION ── */}
              {activeSection === 'subscription' && (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
                  <h2 className="font-script italic text-2xl font-semibold text-slate-900 mb-6">Subscription</h2>

                  {/* Plan card */}
                  <div className={`${plan.gradient} rounded-xl p-6 text-white mb-6`}>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-sm opacity-80">Current Plan</p>
                        <h3 className="text-3xl font-bold mt-0.5">{plan.name}</h3>
                      </div>
                      <div className="text-right">
                        {plan.price !== '$0' ? (
                          <>
                            <p className="text-3xl font-bold">{plan.price}</p>
                            <p className="text-sm opacity-80">{plan.per}</p>
                          </>
                        ) : (
                          <span className="text-sm font-semibold px-3 py-1.5 bg-white/20 rounded-lg">Free</span>
                        )}
                      </div>
                    </div>
                    {/* Skeleton placeholder until tier is trusted —
                        otherwise a Nomad user briefly sees "Upgrade to
                        Explorer or Nomad". aria-busy + sr-only label so
                        screen readers announce the loading state instead
                        of jumping silently to the resolved CTA. */}
                    {!tierResolved ? (
                      <div className="w-44 h-10 rounded-lg bg-white/10 animate-pulse" aria-busy="true" aria-live="polite">
                        <span className="sr-only">Loading subscription details</span>
                      </div>
                    ) : tier === 'free' ? (
                      <a
                        href="/pricing"
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-slate-800 hover:bg-slate-100 rounded-lg font-semibold text-sm transition-colors"
                      >
                        <Sparkles className="w-4 h-4 text-sky-600" />
                        Upgrade to Explorer or Nomad
                      </a>
                    ) : (
                      <div className="flex flex-col items-end gap-2">
                        <button
                          onClick={openBillingPortal}
                          disabled={billingLoading}
                          className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/20 hover:bg-white/30 rounded-lg font-semibold text-sm transition-all disabled:opacity-70"
                        >
                          {billingLoading
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening…</>
                            : <><CreditCard className="w-4 h-4" /> Manage Billing</>
                          }
                        </button>
                        {billingError && (
                          <p className="text-xs text-rose-200 text-right max-w-xs">{billingError}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Usage */}
                  <div className="mb-6">
                    <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-sky-700" /> Usage This Month
                    </h3>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-sm font-medium text-slate-700">AI Credits Used</p>
                        <p className="text-sm font-semibold text-slate-900">{aiDisplay}</p>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div className="bg-sky-800 h-2 rounded-full transition-all" style={{ width: `${aiPct}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Features */}
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-4">Plan Features</h3>
                    <ul className="space-y-3">
                      {planFeatures.map(feature => (
                        <li key={feature} className="flex items-center space-x-3 text-slate-700">
                          <Check className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    {tierResolved && tier === 'free' && (
                      <a href="/pricing" className="inline-flex items-center gap-2 mt-5 text-sm font-semibold text-sky-700 hover:text-sky-900 transition-colors">
                        See what Explorer &amp; Nomad unlock →
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* ── NOTIFICATIONS ── */}
              {activeSection === 'notifications' && (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
                  <h2 className="font-script italic text-2xl font-semibold text-slate-900 mb-6">Notification Preferences</h2>
                  <div className="space-y-4">
                    {[
                      { key: 'email',         label: 'Email Notifications',  desc: 'Receive updates via email' },
                      { key: 'push',          label: 'Push Notifications',   desc: 'Get alerts on your devices' },
                      { key: 'tripReminders', label: 'Trip Reminders',       desc: 'Reminders for upcoming trip dates' },
                      { key: 'voteAlerts',    label: 'Vote Alerts',          desc: 'Notifications for group votes' },
                      { key: 'expenseAlerts', label: 'Expense Alerts',       desc: 'Updates on trip expenses' },
                      { key: 'marketing',     label: 'Marketing Emails',     desc: 'Tips, deals, and new features' },
                    ].map(({ key, label, desc }) => (
                      <div key={key} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                        <div>
                          <p className="font-semibold text-slate-900">{label}</p>
                          <p className="text-sm text-slate-600">{desc}</p>
                        </div>
                        <button
                          onClick={() => toggleNotification(key as keyof NotificationSettings)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ${
                            notifications[key as keyof NotificationSettings] ? 'bg-sky-800' : 'bg-slate-300'
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all ${
                            notifications[key as keyof NotificationSettings] ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={saveNotifications}
                    disabled={notifSaving}
                    className={`mt-6 px-6 py-2 rounded-lg transition-all font-semibold disabled:opacity-60 ${notifSaved ? 'bg-green-600 text-white' : 'bg-sky-800 text-white hover:bg-sky-900'}`}
                  >
                    {notifSaved ? '✓ Saved!' : notifSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              )}

              {/* ── CONNECTED APPS ── */}
              {activeSection === 'apps' && (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
                  <h2 className="font-script italic text-2xl font-semibold text-slate-900 mb-1">Integrations</h2>
                  <p className="text-sm text-slate-500 mb-6">
                    We're building integrations next — vote for what you want most and we'll prioritise accordingly.
                  </p>
                  <div className="space-y-3">
                    {INTEGRATIONS.sort((a, b) => voteCounts[b.id] - voteCounts[a.id]).map(integration => {
                      const voted = votedIds.has(integration.id);
                      const isExpanded = expandedComment === integration.id;
                      const submitted = submittedComments.has(integration.id);
                      return (
                        <div key={integration.id} className={`border rounded-xl transition-all ${voted ? 'border-sky-200 bg-sky-50/40' : 'border-slate-200'}`}>
                          <div className="flex items-center gap-4 p-4">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl flex-shrink-0">
                              {integration.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-slate-900 text-sm">{integration.name}</p>
                              <p className="text-xs text-slate-500 mt-0.5 leading-snug">{integration.description}</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => setExpandedComment(isExpanded ? null : integration.id)}
                                className={`p-2 rounded-lg transition-colors ${submitted ? 'text-emerald-600 bg-emerald-50' : isExpanded ? 'text-sky-700 bg-sky-100' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                              >
                                <MessageSquare className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleVote(integration.id, integration.name)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${voted ? 'bg-sky-700 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                              >
                                <ThumbsUp className={`w-3.5 h-3.5 ${voted ? 'fill-white' : ''}`} />
                                <span>{voteCounts[integration.id]}</span>
                              </button>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="px-4 pb-4 space-y-2">
                              {submitted && (
                                <p className="text-xs text-emerald-600 font-medium flex items-center gap-1.5">
                                  <Check className="w-3.5 h-3.5" /> Your comment was submitted — feel free to add more!
                                </p>
                              )}
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  placeholder={submitted ? `Add another thought about ${integration.name}…` : `Tell us more about how you'd use ${integration.name}…`}
                                  value={comments[integration.id] || ''}
                                  onChange={e => setComments(prev => ({ ...prev, [integration.id]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') handleSubmitComment(integration.id, integration.name); }}
                                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-700 bg-white"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSubmitComment(integration.id, integration.name)}
                                  disabled={!comments[integration.id]?.trim()}
                                  className="px-3 py-2 bg-sky-800 hover:bg-sky-900 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg transition-colors"
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400 mt-5 leading-relaxed">
                    Votes are anonymous and help us decide what to build next.
                  </p>
                </div>
              )}

              {/* ── PRIVACY ── */}
              {activeSection === 'privacy' && (
                <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-6">
                  <h2 className="font-script italic text-2xl font-semibold text-slate-900 mb-6">Privacy & Data</h2>
                  <div className="space-y-4">
                    <div className="p-4 border border-slate-200 rounded-lg hover:border-sky-400 transition-all">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">Download Your Data</p>
                          <p className="text-sm text-slate-600 mt-1">Export all your trips, itineraries, and settings as JSON</p>
                        </div>
                        <button
                          onClick={handleExportData}
                          disabled={exportingData}
                          className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all font-medium disabled:opacity-60"
                        >
                          <Download className="w-4 h-4 inline mr-2" />{exportingData ? 'Exporting…' : 'Export'}
                        </button>
                      </div>
                    </div>
                    <div className="p-4 border border-red-200 rounded-lg bg-red-50">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-red-900">Delete Account</p>
                          <p className="text-sm text-red-700 mt-1">Permanently delete your account and all associated data. This cannot be undone.</p>
                        </div>
                        {!showDeleteConfirm && (
                          <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all font-medium flex-shrink-0 ml-4"
                          >
                            <Trash2 className="w-4 h-4 inline mr-2" />Delete
                          </button>
                        )}
                      </div>
                      {showDeleteConfirm && (
                        <div className="mt-3 space-y-3">
                          <p className="text-sm text-red-800 font-medium">Type <strong>DELETE</strong> to confirm:</p>
                          <input
                            type="text"
                            value={deleteConfirmText}
                            onChange={e => setDeleteConfirmText(e.target.value)}
                            placeholder="DELETE"
                            className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                          />
                          {deleteError && <p className="text-xs text-red-700">{deleteError}</p>}
                          <div className="flex gap-2">
                            <button
                              onClick={handleDeleteAccount}
                              disabled={deleteConfirmText !== 'DELETE' || deleting}
                              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-all"
                            >
                              {deleting ? 'Deleting…' : 'Permanently Delete My Account'}
                            </button>
                            <button
                              onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); setDeleteError(''); }}
                              className="px-4 py-2 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100 transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-4 border border-slate-200 rounded-lg">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">Cookie Preferences</p>
                          <p className="text-sm text-slate-600 mt-1">Manage which cookies we use on your device</p>
                        </div>
                        <button
                          onClick={() => setShowCookiePanel(!showCookiePanel)}
                          className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-all font-medium"
                        >
                          {showCookiePanel ? 'Close' : 'Manage'}
                        </button>
                      </div>
                      {showCookiePanel && (
                        <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-slate-900">Essential Cookies</p>
                              <p className="text-xs text-slate-500">Required for login and core functionality</p>
                            </div>
                            <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded">Always on</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-slate-900">Analytics Cookies</p>
                              <p className="text-xs text-slate-500">Help us understand how the app is used. Your preference is saved and respected on this device.</p>
                            </div>
                            <button
                              onClick={() => {
                                const next = !analyticsEnabled;
                                setAnalyticsEnabled(next);
                                try {
                                  localStorage.setItem('tc_analytics', String(next));
                                  // Expose opt-out to any analytics scripts running in this window
                                  if (typeof window !== 'undefined') {
                                    (window as unknown as Record<string, unknown>)['tc_analytics_enabled'] = next;
                                  }
                                } catch { /* ignore */ }
                              }}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ${analyticsEnabled ? 'bg-sky-800' : 'bg-slate-300'}`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all ${analyticsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}


            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
