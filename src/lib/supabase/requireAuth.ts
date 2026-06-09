import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createClient } from './server';
import { createAdminClient } from './admin';
import { TIER_LIMITS, SubscriptionTier, normalizeTier } from '@/lib/types';

/**
 * requireFeature — call after requireAuth to gate a feature by tier.
 *
 * Returns null if the user is allowed, or a ready-to-return 403 NextResponse
 * if they are not.
 *
 * Usage:
 *   const auth = await requireAuth();
 *   if (!auth.ok) return auth.response;
 *   const denied = requireFeature(auth.ctx.tier, 'canUseTransportParser');
 *   if (denied) return denied;
 */
export function requireFeature(
  tier: SubscriptionTier,
  feature: keyof typeof TIER_LIMITS[SubscriptionTier],
): NextResponse | null {
  const allowed = TIER_LIMITS[tier][feature];
  if (allowed) return null;
  return NextResponse.json(
    {
      error: 'FEATURE_LOCKED',
      message: 'This feature is not available on your current plan. Upgrade to unlock it.',
      feature,
      tier,
    },
    { status: 403 },
  );
}

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
    // We must NOT silently fall through to 'free' on errors here — that would
    // mean a transient profile-fetch failure on a paid user gets treated like
    // an entitlement downgrade. Better to fail the auth check entirely so the
    // route returns 503 and the client retries.
    let tier: SubscriptionTier;
    try {
      const admin = createAdminClient();
      const { data: profile, error } = await admin
        .from('profiles')
        .select('subscription_tier')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('[requireAuth] profile fetch error for user', user.id, error);
        return {
          ok: false,
          response: NextResponse.json(
            { error: 'PROFILE_LOOKUP_FAILED', message: 'Could not load your account profile. Please retry in a moment.' },
            { status: 503 },
          ),
        };
      }

      // Normalize the raw DB value: no row → free; legacy 'explorer'/'nomad'
      // → 'travel_pro'; anything unrecognized → free. This is the single
      // server-side chokepoint, so every API gate is legacy-safe.
      tier = normalizeTier(profile?.subscription_tier);
    } catch (err) {
      console.error('[requireAuth] profile fetch threw for user', user.id, err);
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'PROFILE_LOOKUP_FAILED', message: 'Could not load your account profile. Please retry in a moment.' },
          { status: 503 },
        ),
      };
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

/**
 * Internal-call auth for the background-build worker.
 *
 * The Inngest worker can't carry the user's browser cookie session, so it
 * authenticates with a server-only secret (`INTERNAL_BUILD_SECRET`) plus the
 * acting user's id — both in request headers. It returns the SAME AuthContext
 * shape as requireAuth so the route runs identically against that user (role
 * gate, credit claim, generation all unchanged).
 *
 *   x-internal-build-secret: <INTERNAL_BUILD_SECRET>
 *   x-internal-build-user:   <userId the build is for (the organizer)>
 *
 * Return contract (so callers can fall back to cookie auth):
 *   - no secret header        → null  (not an internal call; use requireAuth)
 *   - secret unset/mismatched  → { ok: false } 401  (someone tried + failed)
 *   - valid but no user id     → { ok: false } 400
 *   - valid                    → { ok: true, ctx }
 *
 * The secret is never sent to the browser; this path is dormant until
 * INTERNAL_BUILD_SECRET is set in the server env.
 */
export async function resolveInternalBuildAuth(
  req: Request,
): Promise<
  | { ok: true; ctx: AuthContext }
  | { ok: false; response: NextResponse }
  | null
> {
  const provided = req.headers.get('x-internal-build-secret');
  if (!provided) return null; // not an internal call — fall through to requireAuth

  const expected = process.env.INTERNAL_BUILD_SECRET;
  const valid =
    !!expected &&
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!valid) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Invalid internal credentials.' },
        { status: 401 },
      ),
    };
  }

  const userId = req.headers.get('x-internal-build-user');
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'BAD_REQUEST', message: 'Internal build call missing acting user id.' },
        { status: 400 },
      ),
    };
  }

  // Resolve the acting user's tier the same way requireAuth does.
  let tier: SubscriptionTier;
  try {
    const admin = createAdminClient();
    const { data: profile, error } = await admin
      .from('profiles')
      .select('subscription_tier')
      .eq('id', userId)
      .single();
    if (error) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'PROFILE_LOOKUP_FAILED', message: 'Could not load the build user profile.' },
          { status: 503 },
        ),
      };
    }
    tier = normalizeTier(profile?.subscription_tier);
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'PROFILE_LOOKUP_FAILED', message: 'Could not load the build user profile.' },
        { status: 503 },
      ),
    };
  }

  return { ok: true, ctx: { userId, tier, tierLimits: TIER_LIMITS[tier] } };
}
