'use client';

/**
 * useCurrentUser — returns the active user in a shape compatible with the
 * legacy `currentUser` mock object, so pages can switch over with minimal churn.
 *
 * Behaviour:
 *  - Auth resolving        → blank placeholder (no mock data ever leaks)
 *  - Not logged in         → blank placeholder (pages should redirect to login)
 *  - Logged in as demo acct → mock user (full Iceland demo experience)
 *  - Logged in as real user → real profile from Supabase
 */

import { useAuth } from '@/context/AuthContext';
import { currentUser as mockUser } from '@/data/mock';
import { TIER_LIMITS } from '@/lib/types';
import type { SubscriptionTier } from '@/lib/types';

/** Safe blank shape returned while auth is loading or user is not logged in. */
const BLANK_USER = {
  id: '',
  email: '',
  name: '',
  avatarUrl: undefined as string | undefined,
  subscriptionTier: 'free' as SubscriptionTier,
  aiCredits: {
    total: 10,
    used: 0,
    refreshAt: new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      1,
    ).toISOString(),
  },
  tripPasses: [] as NonNullable<typeof mockUser.tripPasses>,
  isDemo: false,
  isLoading: false,
} as const;

/**
 * During the initial auth-loading window, read the Supabase session from
 * localStorage to get the user ID, then look up the cached tier key
 * (`tc_tier_${userId}`). This prevents paid users from briefly seeing
 * `free`-tier gates while the Supabase profile fetch is in flight.
 *
 * Falls back to null (→ 'free') if no session or cache exists.
 */
function getLoadingPhaseTier(): SubscriptionTier | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('sb-pqizuvmtertpxhhxyemj-auth-token');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const userId = parsed?.user?.id as string | undefined;
    if (!userId) return null;
    return (localStorage.getItem(`tc_tier_${userId}`) as SubscriptionTier | null);
  } catch {
    return null;
  }
}

export function useCurrentUser() {
  const { user, profile, isDemo, isLoading } = useAuth();

  // Auth state still resolving — blank placeholder so no mock data ever
  // flashes for a real user before auth resolves.
  // We do use the cached tier (tc_tier_${userId}) so paid users don't briefly
  // see free-tier gates while the Supabase profile fetch is in flight.
  if (isLoading) {
    const loadingTier = getLoadingPhaseTier();
    return { ...BLANK_USER, subscriptionTier: loadingTier ?? 'free', isLoading: true };
  }

  // Demo account → full mock experience (Iceland trip, all mock data).
  // This is the ONLY path where mock user data (name/email/tier) is intentional.
  if (isDemo) {
    return { ...mockUser, isDemo: true, isLoading: false };
  }

  // Not authenticated — return blank so callers can redirect to login.
  // Never fall back to mock data here; that's what caused Mallory/abby0936
  // to see Brandon's name and email.
  if (!user) {
    return { ...BLANK_USER, isLoading: false };
  }

  // Real authenticated user — build from Supabase profile.
  // Fall back to localStorage-cached tier if profile hasn't loaded yet (transient
  // Supabase failure) so paid users don't revert to free on every page load.
  const cachedTier =
    typeof window !== 'undefined'
      ? (localStorage.getItem(`tc_tier_${user.id}`) as SubscriptionTier | null)
      : null;
  const tier = (profile?.subscription_tier ?? cachedTier ?? 'free') as SubscriptionTier;
  const limits = TIER_LIMITS[tier];
  const aiTotal =
    typeof limits?.aiCreditsPerMonth === 'number' ? limits.aiCreditsPerMonth : 0;

  // Resolve display name: prefer onboarding-set profile.name (stored as "first name
  // or nickname"), fall back to OAuth full_name, then email prefix.
  // Always take the first word only so full names like "Abby Stark" (set by signup
  // rather than onboarding) become just "Abby".
  const rawName =
    profile?.name ??
    (user.user_metadata as Record<string, string> | undefined)?.full_name ??
    user.email?.split('@')[0] ??
    'Traveler';
  const displayName = rawName.split(' ')[0] || 'Traveler';

  return {
    id: user.id,
    email: user.email ?? '',
    name: displayName,
    avatarUrl: profile?.avatar_url ?? undefined,
    subscriptionTier: tier,
    aiCredits: {
      total: aiTotal,
      used: profile?.ai_credits_used ?? 0,
      refreshAt:
        profile?.ai_credits_reset_at ??
        new Date(
          new Date().getFullYear(),
          new Date().getMonth() + 1,
          1,
        ).toISOString(),
    },
    tripPasses: [] as NonNullable<typeof mockUser.tripPasses>,
    isDemo: false,
    isLoading,
  };
}
