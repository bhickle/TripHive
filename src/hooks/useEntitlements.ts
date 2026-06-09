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
import { useCurrentUser } from '@/hooks/useCurrentUser';
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
    base: 36,               // raised 30→36 on 2026-06-05 (3-tier change)
    extraPersonFee: 4,      // per person beyond the base 6
    baseGroupSize: 6,
    maxGroupSize: 12,
    // 50 credits = 1 build (25) + 1 regen (10) + 5 add-days OR Suggest
    // Anothers (15). Sized to support the trip-organizing arc: generate,
    // tweak once, swap a few activities.
    aiCredits: 50,
    validityDays: 30,       // days after trip end date
  },
  // Travel Pro — the single paid subscription (collapsed Explorer + Nomad on
  // 2026-06-05). $149/yr ≈ 2 months free vs $14.99×12.
  travel_pro: {
    monthly: 14.99,
    annual: 149,
    aiCreditsPerMonth: 150, // synced with TIER_LIMITS.travel_pro
  },
} as const;

// ─── Tier feature list (single source of truth for subscription copy) ─────────

/**
 * Derives the human-readable feature list for a tier straight from
 * TIER_LIMITS (+ PRICING for credits). Use this everywhere subscription
 * features are displayed (Settings, Pricing, UpgradeModal) so a change to
 * TIER_LIMITS propagates everywhere instead of drifting out of hand-kept
 * copy. Returns the lines in a sensible display order.
 */
export function getTierFeatures(tier: SubscriptionTier): string[] {
  const t = TIER_LIMITS[tier];
  const features: string[] = [];

  // Travelers
  features.push(
    tier === 'trip_pass'
      ? `1 trip, up to ${PRICING.trip_pass.baseGroupSize} travelers`
      : `Up to ${t.travelersPerTrip} travelers`,
  );

  // AI credits (+ rough build count; a build costs 25 credits)
  const credits = tier === 'trip_pass'
    ? PRICING.trip_pass.aiCredits
    : (typeof t.aiCreditsPerMonth === 'number' ? t.aiCreditsPerMonth : 0);
  if (credits > 0) {
    if (tier === 'trip_pass') {
      features.push(`${credits} AI credits (1 build + 1 regen + 5 tweaks)`);
    } else {
      const builds = Math.max(1, Math.round(credits / 25));
      features.push(`${credits} AI credits / month (~${builds} build${builds === 1 ? '' : 's'})`);
    }
  }

  // Trip length
  features.push(`Up to ${t.maxTripDays}-day trips`);

  // Capability flags → labels (only listed when the tier actually has them)
  if (t.canUseAI) features.push('AI itinerary generation');
  if (t.canUseSplitTracks) features.push('Split-track itineraries');
  if (t.canAddCoOrganizer) features.push('Co-organizer role');
  if (t.canUseTransportParser) features.push('Transport confirmation parser');
  if (t.canUseExpenses) features.push('Group expense tracking');
  if (t.canUseAIReceiptScan) features.push('AI receipt scanning');
  if (t.canUseAIPacking) features.push('AI packing list (destination-specific)');
  if (t.canUseAIPhrasebook) features.push('AI travel phrasebook');
  if (t.canUseTripStory) features.push('Trip Story & photo gallery');
  if (t.canUseYearInReview) features.push('Year in Review');
  if (t.canUseWishlist) features.push('Wishlist & destination discovery');
  if (t.earlyAccess) features.push('Early access to new features');

  // Support level — only listed when there's an actual promise. "Community
  // support" was on the Free tier list previously, but no community support
  // channel exists. Don't promise what isn't built; free users still get
  // password reset + the support form when that ships.
  if (t.supportLevel === 'priority') features.push('Priority support');
  else if (t.supportLevel === 'email') features.push('Email support');

  return features;
}

// ─── Upgrade messaging ────────────────────────────────────────────────────────

export type UpgradeReason =
  | 'ai_credits_low'
  | 'ai_credits_empty'
  | 'trip_limit'
  | 'traveler_limit'
  | 'feature_locked'
  | 'multi_city'
  | 'trip_pass_offer'
  | 'no_ai';

export interface UpgradePrompt {
  reason: UpgradeReason;
  headline: string;
  body: string;
  ctaLabel: string;
  suggestedTier: SubscriptionTier;
  /** When true, the modal's primary CTA dismisses instead of linking to
   *  /pricing — used when the user is already on the top tier and there
   *  is no upgrade path (e.g. Travel Pro out of credits this month). */
  noUpgradePath?: boolean;
}

const UPGRADE_PROMPTS: Record<UpgradeReason, Omit<UpgradePrompt, 'suggestedTier'>> = {
  no_ai: {
    reason: 'no_ai',
    headline: 'Want more AI itineraries?',
    body: 'Free plans include one AI itinerary build per month. Upgrade to Travel Pro for about 6 builds a month all year, or grab a Trip Pass just for this trip.',
    ctaLabel: 'See plans',
  },
  ai_credits_empty: {
    reason: 'ai_credits_empty',
    // Body is overridden per-tier in getUpgradePrompt — this is the free-tier
    // fallback if the override isn't reached.
    headline: "You're out of AI credits for this month",
    body: 'Your credits refresh at the start of next month. Upgrade to Travel Pro for 150 credits a month — about 6 full builds.',
    ctaLabel: 'See plans',
  },
  ai_credits_low: {
    reason: 'ai_credits_low',
    headline: 'Running low on AI credits',
    body: 'You’re getting close to your monthly limit. Travel Pro gives you 150 credits a month — about 6 full builds.',
    ctaLabel: 'See Travel Pro',
  },
  trip_limit: {
    reason: 'trip_limit',
    headline: "You've reached your trip limit",
    body: 'Upgrade to keep planning. Travel Pro covers your whole travel year.',
    ctaLabel: 'Upgrade to Travel Pro',
  },
  traveler_limit: {
    reason: 'traveler_limit',
    headline: 'Your group is growing',
    body: 'A Trip Pass covers up to 12 travelers ($36 base for 6, +$4 each beyond that). Or go Travel Pro for up to 8 travelers on every trip.',
    ctaLabel: 'See options',
  },
  feature_locked: {
    reason: 'feature_locked',
    headline: 'This feature is on paid plans',
    body: 'Upgrade to unlock the full tripcoord experience.',
    ctaLabel: 'See plans',
  },
  // Free user tapped "Add another destination" (hand-picked multi-city). This
  // is a paid boundary, but free users still have a no-cost multi-stop path
  // (region auto-routing), so the copy leads with that before the upsell.
  multi_city: {
    reason: 'multi_city',
    headline: 'Plan a multi-city route',
    body: 'Hand-picking specific cities and setting nights per city is part of Trip Pass and Travel Pro. On Free, you can still do a multi-stop trip — just enter a whole region (e.g. “Italy” or “California, USA”) as your destination and your build auto-routes the stops for you, travel between cities included.',
    ctaLabel: 'See plans',
  },
  // Explicit "buy a Trip Pass for THIS trip" offer — triggered from a button on
  // the itinerary. The modal shows the Trip Pass purchase CTA (price computed
  // from the trip's group size) because a tripId is passed alongside it.
  trip_pass_offer: {
    reason: 'trip_pass_offer',
    headline: 'Cover this whole trip with a Trip Pass',
    body: 'One purchase unlocks split-track days, group expense splitting, a co-organizer, and AI builds for everyone on this trip — no subscription. Pay once; your whole crew is included.',
    ctaLabel: 'See all plans',
  },
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param tripId          Active trip context (enables Trip Pass overlay logic).
 * @param isTripPassTrip  True if this trip has an active trip_passes purchase
 *                        (someone paid $36 for THIS trip's group-coordination
 *                        features). When true, every invitee on the trip —
 *                        regardless of their own subscription — gets the Trip
 *                        Pass trip-scoped features (expenses, split tracks,
 *                        transport parser, co-organizer eligibility) on this
 *                        trip.
 *
 *                        Critically: this is keyed on the per-trip purchase,
 *                        NOT on the organizer's subscription. A Travel Pro
 *                        organizer's personal subscription does NOT
 *                        extend to invitees — that's a personal benefit, not
 *                        a group-trip one. Free joinees on a Travel Pro
 *                        organizer's trip stay on free.
 *
 *                        Travel Pro-only perks (receipt scan, AI packing,
 *                        AI phrasebook) are NOT included in the overlay —
 *                        those stay strictly user-scoped on the joinee's tier.
 *
 *                        Pass `undefined` / `false` (or omit) outside trip
 *                        contexts like the dashboard.
 */
export function useEntitlements(tripId?: string, isTripPassTrip?: boolean) {
  const user = useCurrentUser();
  const tier = (user.subscriptionTier ?? 'free') as SubscriptionTier;
  // Forwarded from useCurrentUser. UI consumers that render tier-conditional
  // UI (upsell cards, lock badges) should gate on this to avoid the silent-
  // downgrade flicker where a paid user briefly sees free-tier locks while
  // the profile loads.
  const tierResolved = user.tierResolved ?? false;
  const limits = TIER_LIMITS[tier];

  // Trip Pass overlay: this specific trip has an active Trip Pass purchase,
  // so group-coordination features unlock for every invitee. The `tripId`
  // guard makes the overlay only apply in trip contexts.
  const tripPassUnlocked = !!tripId && !!isTripPassTrip;
  const tripPassFeatures = TIER_LIMITS.trip_pass;

  // True once we know the user's real tier. While the profile is still loading
  // from Supabase, we must NOT gate features — otherwise paid users (Travel
  // Pro) briefly see the free-tier locked UI every page load because the
  // session cookie resolves before the profile DB fetch completes.
  const entitlementsReady = !user.isLoading;

  // Find the active trip pass for the given tripId (if any)
  const activeTripPass: TripPass | undefined = useMemo(() => {
    if (!tripId || !user.tripPasses) return undefined;
    const now = new Date().toISOString();
    return user.tripPasses.find(
      p => p.tripId === tripId && p.expiresAt > now
    );
  }, [tripId, user.tripPasses]);

  // AI credits remaining (the active trip pass's pool, else the account).
  const aiCreditsRemaining = useMemo((): number => {
    // On a trip that has an active pass, spend from the PASS pool — regardless
    // of the user's account tier (Option A: the pass is a per-trip overlay, so
    // a Free buyer sees the 50-credit pool here). The server's checkAiCredits
    // routes the charge to the same pool, so the display matches the spend.
    if (activeTripPass) {
      return Math.max(0, activeTripPass.aiCreditsTotal - activeTripPass.aiCreditsUsed);
    }
    if (!limits.canUseAI) return 0;
    // If the credit row hasn't loaded yet, fail SAFE (return 0). The previous
    // behavior — assuming the full monthly allowance — let canAffordAction()
    // green-light a Build before the real used count arrived, so the server
    // 402 fired with no client-side warning. entitlementsReady is the proper
    // loading gate; this is the belt-and-suspenders fallback.
    if (!user.aiCredits) return 0;
    return Math.max(0, user.aiCredits.total - user.aiCredits.used);
  }, [tier, activeTripPass, limits, user.aiCredits]);

  const aiCreditsTotal = useMemo((): number => {
    if (activeTripPass) return activeTripPass.aiCreditsTotal;
    if (!limits.canUseAI) return 0;
    return limits.aiCreditsPerMonth as number;
  }, [activeTripPass, limits]);

  // ── Capability checks ──────────────────────────────────────────────────────
  // All checks return true while entitlements are still loading to prevent
  // false lockouts for paid users during profile fetch.

  function canUseAI(): boolean {
    if (!entitlementsReady) return true;
    if (!limits.canUseAI) return false;
    // No trip_pass-account special case: aiCreditsRemaining already reflects the
    // pass pool on a passed trip (Option A) and the account credits otherwise.
    return aiCreditsRemaining > 0;
  }

  function canAffordAction(action: AiAction): boolean {
    if (!entitlementsReady) return true;
    if (!canUseAI()) return false;
    return aiCreditsRemaining >= AI_CREDIT_COSTS[action];
  }

  function canAddTrip(currentTripCount: number): boolean {
    if (!entitlementsReady) return true;
    if (limits.activeTrips === 'plan_based') return false;
    return currentTripCount < (limits.activeTrips as number);
  }

  function canAddTraveler(currentCount: number): boolean {
    if (!entitlementsReady) return true;
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
    if (!entitlementsReady) return true;
    return !!limits[feature];
  }

  // ── Upgrade prompts ────────────────────────────────────────────────────────

  function getUpgradePrompt(reason: UpgradeReason): UpgradePrompt {
    const base = UPGRADE_PROMPTS[reason];
    // Single paid subscription now — everyone below Travel Pro upgrades to it.
    const suggestedTier: SubscriptionTier = 'travel_pro';

    // Tier-aware override for "out of credits" — the default copy is
    // free-tier-framed, which reads wrong to a Travel Pro user who's already on
    // the top tier. They get a wait-for-reset message with no upsell path.
    if (reason === 'ai_credits_empty' && tier === 'travel_pro') {
      return {
        ...base,
        headline: "You've used your Travel Pro credits for this month",
        body: 'Your credits refresh at the start of next month. Until then, you can keep editing existing trips — only new AI builds are paused.',
        ctaLabel: 'Got it',
        suggestedTier,
        noUpgradePath: true,
      };
    }

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
    // True once we have a trusted tier (profile loaded OR last-known-good
    // cache restored). Direct tier comparisons (`tier === 'free'`, etc) that
    // affect what UI renders MUST be gated on this — without it, paid users
    // briefly see free-tier upsells/locks during the auth-loading window.
    // Distinct from `entitlementsReady` (which is just !isLoading): a user
    // can be done-loading with NO trusted tier (profile fetch failed AND no
    // prior cache), in which case the safe call is to render nothing rather
    // than guess 'free'.
    tierResolved,
    limits,
    activeTripPass,
    aiCreditsRemaining,
    aiCreditsTotal,
    // True once profile has loaded — gates should not render while false
    entitlementsReady,
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
    // All return true while loading to prevent false lockouts for paid users.
    //
    // Trip-scoped features (overlay applies): hasExpenses, hasSplitTracks,
    // hasCoOrganizer, hasTransportParser. These unlock when the trip's
    // organizer is on any paid plan, even if the caller is free-tier.
    //
    // User-scoped features (no overlay): hasWishlist, hasYearInReview,
    // hasTripStory, hasEarlyAccess. Stay on the caller's own tier.
    //
    // Higher-tier-only features (no overlay): hasAIReceiptScan, hasAIPacking,
    // hasAIPhrasebook. Trip Pass doesn't include these, so the overlay logic
    // wouldn't grant them anyway — stay on the caller's own tier.
    hasTripStory: !entitlementsReady || limits.canUseTripStory,
    hasYearInReview: !entitlementsReady || limits.canUseYearInReview,
    hasTransportParser: !entitlementsReady || limits.canUseTransportParser || (tripPassUnlocked && tripPassFeatures.canUseTransportParser),
    hasSplitTracks: !entitlementsReady || limits.canUseSplitTracks || (tripPassUnlocked && tripPassFeatures.canUseSplitTracks),
    hasCoOrganizer: !entitlementsReady || limits.canAddCoOrganizer || (tripPassUnlocked && tripPassFeatures.canAddCoOrganizer),
    hasWishlist: !entitlementsReady || limits.canUseWishlist,
    hasAIPacking: !entitlementsReady || limits.canUseAIPacking,
    hasAIPhrasebook: !entitlementsReady || limits.canUseAIPhrasebook,
    hasExpenses: !entitlementsReady || limits.canUseExpenses || (tripPassUnlocked && tripPassFeatures.canUseExpenses),
    hasAIReceiptScan: !entitlementsReady || limits.canUseAIReceiptScan,
    hasEarlyAccess: !entitlementsReady || limits.earlyAccess,
    maxTripDays: limits.maxTripDays,
  };
}
