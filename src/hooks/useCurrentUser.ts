'use client';

/**
 * useCurrentUser — returns the active user in a shape compatible with the
 * legacy `currentUser` mock object, so pages can switch over with minimal churn.
 *
 * Behaviour:
 *  - Not logged in          → mock user (nomad tier, full demo experience)
 *  - Logged in as demo acct → mock user  (full Iceland demo experience)
 *  - Logged in as real user → real profile from Supabase
 */

import { useAuth } from '@/context/AuthContext';
import { currentUser as mockUser } from '@/data/mock';
import { TIER_LIMITS } from '@/lib/types';
import type { SubscriptionTier } from '@/lib/types';

export function useCurrentUser() {
  const { user, profile, isDemo, isLoading } = useAuth();

  // Auth state still resolving — return a blank placeholder so no mock
  // data (name, email, tier) ever flashes for a real user before auth resolves.
  if (isLoading) {
    return {
      ...mockUser,
      name: '',
      email: '',
      avatarUrl: undefined,
      subscriptionTier: 'free' as SubscriptionTier,
      isDemo: false,
      isLoading: true,
    };
  }

  // Not authenticated OR demo account → full mock experience
  if (!user || isDemo) {
    return {
      ...mockUser,
      isDemo: !!isDemo,
      isLoading: false,
    };
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
