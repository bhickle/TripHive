import { NextResponse } from 'next/server';
import { createClient } from './server';
import { createAdminClient } from './admin';
import { TIER_LIMITS, SubscriptionTier } from '@/lib/types';

export interface AuthContext {
  userId: string;
  tier: SubscriptionTier;
  tierLimits: typeof TIER_LIMITS[SubscriptionTier];
}

/**
 * Validates the current session and resolves the user's subscription tier.
 *
 * Returns { ok: true, ctx } on success, or { ok: false, response } with a
 * ready-to-return NextResponse (401/403) on failure.
 *
 * Usage:
 *   const auth = await requireAuth();
 *   if (!auth.ok) return auth.response;
 *   const { userId, tier } = auth.ctx;
 */
export async function requireAuth(): Promise<
  | { ok: true; ctx: AuthContext }
  | { ok: false; response: NextResponse }
> {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();

    if (!user?.id) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'You must be signed in to use this feature.' },
          { status: 401 },
        ),
      };
    }

    // Look up tier from profiles table via admin client (bypasses RLS)
    let tier: SubscriptionTier = 'free';
    try {
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from('profiles')
        .select('subscription_tier')
        .eq('id', user.id)
        .single();
      if (profile?.subscription_tier) {
        tier = profile.subscription_tier as SubscriptionTier;
      }
    } catch {
      // Profile fetch failed — treat as free tier
    }

    return {
      ok: true,
      ctx: {
        userId: user.id,
        tier,
        tierLimits: TIER_LIMITS[tier],
      },
    };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication check failed.' },
        { status: 401 },
      ),
    };
  }
}
