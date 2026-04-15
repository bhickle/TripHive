/**
 * useEntitlements — central feature-gating hook for tripcoord
 *
 * Reads the current user's subscription tier (and any trip passes) and exposes
 * helper functions the UI can use to check what a user can do, how many AI
 * credits they have left, and what upgrade nudge to show.
 *
 * When Stripe / a real auth layer is wired in, swap `currentUser` from the mock
 * for the real session user — everything else stays the same.
 */

import { useMemo } from 'react';
import { currentUser } from '@/data/mock';
import {
  TIER_LIMITS,
  AI_CREDIT_COSTS,
  AiAction,
  TripPass,
  SubscriptionTier,
} from '@/lib/types';

// ─── Pricing constants (single source of truth) ───────────────────────────────

export const PRICING = {
  trip_pass: {
    base: 30,
    extraPersonFee: 4,      // per person beyond the base 6
    baseGroupSize: 6,
    maxGroupSize: 12,
    aiCredits: 30,
    validityDays: 30,       // days after trip end date
  },
  explorer: {
    monthly: 7.99,
    annual: 76.99,          // ~$6.42/mo, 20% off
    aiCreditsPerMonth: 100,
  },
  nomad: {
    monthly: 14.99,
    annual: 143.99,         // ~$12/mo, 20% off
    aiCreditsPerMonth: 350,
  },
} as const;

// ─── Upgrade messaging ────────────────────────────────────────────────────────

export type UpgradeReason =
  | 'ai_credits_low'
  | 'ai_credits_empty'
  | 'trip_limit'
  | 'traveler_limit'
  | 'feature_locked'
  | 'no_ai';

export interface UpgradePrompt {
  reason: UpgradeReason;
  headline: string;
  body: string;
  ctaLabel: string;
  suggestedTier: SubscriptionTier;
}

const UPGRADE_PROMPTS: Record<UpgradeReason, Omit<UpgradePrompt, 'suggestedTier'>> = {
  no_ai: {
    reason: 'no_ai',
    headline: 'AI planning is a paid feature',
    body: 'Grab a Trip Pass for this trip, or subscribe to Explorer for your whole travel year.',
    ctaLabel: 'See plans',
  },
  ai_credits_empty: {
    reason: 'ai_credits_empty',
    headline: "You've used your AI credits this month",
    body: "Your credits refresh on your next billing date. Upgrade to Nomad for 3.5× more headroom.",
    ctaLabel: 'Upgrade to Nomad',
  },
  ai_credits_low: {
    reason: 'ai_credits_low',
    headline: 'Running low on AI credits',
    body: "You're getting close to your monthly limit. Nomad gives you 350 credits — plenty for even the busiest planner.",
    ctaLabel: 'See Nomad',
  },
  trip_limit: {
    reason: 'trip_limit',
    headline: "You've reached your trip limit",
    body: 'Upgrade to keep planning. Explorer covers your whole travel year.',
    ctaLabel: 'Upgrade to Explorer',
  },
  traveler_limit: {
    reason: 'traveler_limit',
    headline: 'Your group is growing',
    body: 'Add more travelers with a Trip Pass add-on, or upgrade for bigger group support built in.',
    ctaLabel: 'See options',
  },
  feature_locked: {
    reason: 'feature_locked',
    headline: 'This feature is on paid plans',
    body: 'Upgrade to unlock the full tripcoord experience.',
    ctaLabel: 'See plans',
  },
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEntitlements(tripId?: string) {
  const user = currentUser;
  const tier = (user.subscriptionTier ?? 'free') as SubscriptionTier;
  const limits = TIER_LIMITS[tier];

  // Find the active trip pass for the given tripId (if any)
  const activeTripPass: TripPass | undefined = useMemo(() => {
    if (!tripId || !user.tripPasses) return undefined;
    const now = new Date().toISOString();
    return user.tripPasses.find(
      p => p.tripId === tripId && p.expiresAt > now
    );
  }, [tripId, user.tripPasses]);

  // AI credits remaining (subscription or trip pass)
  const aiCreditsRemaining = useMemo((): number => {
    if (tier === 'trip_pass') {
      if (!activeTripPass) return 0;
      return Math.max(0, activeTripPass.aiCreditsTotal - activeTripPass.aiCreditsUsed);
    }
    if (!limits.canUseAI) return 0;
    if (!user.aiCredits) return limits.aiCreditsPerMonth as number;
    return Math.max(0, user.aiCredits.total - user.aiCredits.used);
  }, [tier, activeTripPass, limits, user.aiCredits]);

  const aiCreditsTotal = useMemo((): number => {
    if (tier === 'trip_pass') return activeTripPass?.aiCreditsTotal ?? 0;
    if (!limits.canUseAI) return 0;
    return limits.aiCreditsPerMonth as number;
  }, [tier, activeTripPass, limits]);

  // ── Capability checks ──────────────────────────────────────────────────────

  function canUseAI(): boolean {
    if (!limits.canUseAI) return false;
    if (tier === 'trip_pass' && !activeTripPass) return false;
    return aiCreditsRemaining > 0;
  }

  function canAffordAction(action: AiAction): boolean {
    if (!canUseAI()) return false;
    return aiCreditsRemaining >= AI_CREDIT_COSTS[action];
  }

  function canAddTrip(currentTripCount: number): boolean {
    if (limits.activeTrips === 'plan_based') return false; // trip pass users can't add new trips
    return currentTripCount < (limits.activeTrips as number);
  }

  function canAddTraveler(currentCount: number): boolean {
    if (limits.travelersPerTrip === 'plan_based') {
      if (!activeTripPass) return false;
      const maxForPass = PRICING.trip_pass.baseGroupSize + activeTripPass.extraPeople;
      return currentCount < maxForPass;
    }
    return currentCount < (limits.travelersPerTrip as number);
  }

  function maxTravelersForTrip(): number {
    if (limits.travelersPerTrip === 'plan_based') {
      if (!activeTripPass) return PRICING.trip_pass.baseGroupSize;
      return PRICING.trip_pass.baseGroupSize + activeTripPass.extraPeople;
    }
    return limits.travelersPerTrip as number;
  }

  function isFeatureAvailable(feature: keyof typeof limits): boolean {
    return !!limits[feature];
  }

  // ── Upgrade prompts ────────────────────────────────────────────────────────

  function getUpgradePrompt(reason: UpgradeReason): UpgradePrompt {
    const base = UPGRADE_PROMPTS[reason];
    const suggestedTier: SubscriptionTier =
      tier === 'free' ? 'explorer' :
      tier === 'trip_pass' ? 'explorer' :
      tier === 'explorer' ? 'nomad' : 'nomad';
    return { ...base, suggestedTier };
  }

  function aiCreditWarningLevel(): 'ok' | 'low' | 'empty' {
    if (!limits.canUseAI) return 'empty';
    if (aiCreditsRemaining === 0) return 'empty';
    if (aiCreditsRemaining / aiCreditsTotal < 0.2) return 'low'; // below 20%
    return 'ok';
  }

  // ── Trip pass helpers ──────────────────────────────────────────────────────

  function tripPassExtraPeopleCost(extraPeople: number): number {
    return extraPeople * PRICING.trip_pass.extraPersonFee;
  }

  function tripPassTotalCost(extraPeople = 0): number {
    return PRICING.trip_pass.base + tripPassExtraPeopleCost(extraPeople);
  }

  return {
    tier,
    limits,
    activeTripPass,
    aiCreditsRemaining,
    aiCreditsTotal,
    // Capability checks
    canUseAI,
    canAffordAction,
    canAddTrip,
    canAddTraveler,
    maxTravelersForTrip,
    isFeatureAvailable,
    // Upgrade nudges
    getUpgradePrompt,
    aiCreditWarningLevel,
    // Trip pass pricing
    tripPassExtraPeopleCost,
    tripPassTotalCost,
    // Shorthand flags (for simple conditional rendering)
    hasTripStory: limits.canUseTripStory,
    hasYearInReview: limits.canUseYearInReview,
    hasTransportParser: limits.canUseTransportParser,
    hasSplitTracks: limits.canUseSplitTracks,
    hasCoOrganizer: limits.canAddCoOrganizer,
    hasWishlist: limits.canUseWishlist,
    hasFlightAlerts: limits.canUseFlightAlerts,
    hasEarlyAccess: limits.earlyAccess,
  };
}
