import { NextResponse } from 'next/server';
import { createAdminClient } from './admin';
import { TIER_LIMITS, AI_CREDIT_COSTS, AiAction, SubscriptionTier } from '@/lib/types';

/**
 * Next reset boundary, as an ISO timestamp at 00:00 UTC on the first of the
 * following month. Kept in one place so the cron and the reset-on-read path
 * write the same value.
 */
export function nextCreditResetAt(from: Date = new Date()): string {
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  return next.toISOString();
}

/**
 * Snapshot of a user's credit state at the moment of the check. Returned
 * from checkAiCredits and passed back into incrementAiCreditsUsed so the
 * increment lands on the same baseline value the check saw.
 *
 * `source` tells the increment which counter to bump:
 *   - 'profile'  → profiles.ai_credits_used (the user's personal monthly pool)
 *   - 'trip_pass' → trip_passes.ai_credits_used (the trip's pass-pool)
 *   - 'exempt'   → don't bump anything (action passed through ungated)
 *
 * `passId` is required when source='trip_pass' so the increment knows
 * which row to update.
 */
export interface AiCreditCheckResult {
  used: number;
  limit: number;
  cost: number;
  source: 'profile' | 'trip_pass' | 'exempt';
  passId?: string;
}

/**
 * Two-phase credit gate, phase 1: verify the user can afford the action.
 *
 * Returns { ok: true, ctx } when the user has enough remaining credits, or
 * { ok: false, response } with a ready-to-return 402 NextResponse when they
 * don't. The caller proceeds with the AI work on success and then calls
 * incrementAiCreditsUsed(userId, ctx) after that work completes.
 *
 * Why two-phase: failed AI calls (Anthropic 5xx, parse errors, mid-stream
 * abort) should NOT consume credits. Splitting check from increment lets
 * the route gate first, then commit only on success.
 *
 * Trip Pass credit pooling (2026-05-16):
 *   When `tripId` is supplied AND the trip has an active Trip Pass purchase,
 *   charge the pass's pool instead of the user's personal credits. This
 *   applies to trip-scoped actions — build, regen, add-day, suggest,
 *   transport-parse, discover, hotels, enrich. User-scoped actions
 *   (packing, phrasebook, receipt-scan, layover) should NOT pass tripId
 *   so they hit the user's personal pool.
 *
 * Fail-open on Supabase lookup failure: if the profile fetch errors, we
 * return ok rather than 503. The Anthropic call is the real cost — surfacing
 * a 503 to the user for a transient profile-read flake gives a worse
 * experience than allowing one extra request through.
 */
export async function checkAiCredits(
  userId: string,
  tier: SubscriptionTier,
  action: AiAction,
  tripId?: string,
): Promise<{ ok: true; ctx: AiCreditCheckResult } | { ok: false; response: NextResponse }> {
  const cost = AI_CREDIT_COSTS[action];
  const admin = createAdminClient();

  // ── Step 1: Trip Pass pool takes precedence when applicable ──────────────
  // If this is a trip-scoped action AND the trip has an active pass, charge
  // the pass — regardless of the user's personal tier. The pass IS the
  // trip's AI budget.
  if (tripId) {
    // The pass pool is the trip's AI budget. A once-passed trip stays a pass
    // trip forever (decision 2026-06-11), so charges keep routing to the pool
    // regardless of the service window — no expires_at filter. The fixed
    // 50-credit pool is the natural cap, not time.
    const { data: pass } = await admin
      .from('trip_passes')
      .select('id, ai_credits_total, ai_credits_used')
      .eq('trip_id', tripId)
      .order('purchased_at', { ascending: false })
      .maybeSingle();

    if (pass) {
      const passUsed = pass.ai_credits_used ?? 0;
      const passLimit = pass.ai_credits_total ?? 0;
      if (passUsed + cost > passLimit) {
        return {
          ok: false,
          response: NextResponse.json(
            {
              error: 'TRIP_PASS_CREDITS_EXHAUSTED',
              message: `This trip's pass has used ${passUsed} of ${passLimit} AI credits. The organizer can buy another pass to keep building.`,
              used: passUsed,
              limit: passLimit,
              action,
              cost,
              scope: 'trip_pass',
            },
            { status: 402 },
          ),
        };
      }
      return { ok: true, ctx: { used: passUsed, limit: passLimit, cost, source: 'trip_pass', passId: pass.id } };
    }
    // No active pass on this trip — fall through to personal-credit gate.
  }

  // ── Step 2: Personal-credit gate ─────────────────────────────────────────
  // For users whose own tier is trip_pass but there's no pass on this trip
  // (or this isn't a trip-scoped action), let them through ungated — they
  // bought a pass somewhere, this isn't their pass-trip, no charge.
  // TODO(launch): when trip_pass users hit user-scoped AI features (packing,
  // phrasebook), decide whether to gate against their other passes' credits.
  if (tier === 'trip_pass') {
    return { ok: true, ctx: { used: 0, limit: 0, cost, source: 'exempt' } };
  }

  const limitRaw = TIER_LIMITS[tier].aiCreditsPerMonth;
  if (typeof limitRaw !== 'number') {
    // 'plan_based' only applies to trip_pass (handled above). Defensive
    // fallthrough — exempt rather than block on an unexpected enum value.
    return { ok: true, ctx: { used: 0, limit: 0, cost, source: 'exempt' } };
  }
  const limit = limitRaw;

  const { data: profile, error } = await admin
    .from('profiles')
    .select('ai_credits_used, ai_credits_reset_at')
    .eq('id', userId)
    .single();
  if (error) {
    console.error('[aiCredits] profile lookup failed:', error);
    return { ok: true, ctx: { used: 0, limit, cost, source: 'exempt' } };
  }

  // Reset-on-read: if the profile's reset boundary is in the past, zero out
  // the counter and roll the boundary forward before checking. Belt-and-
  // suspenders with the daily cron at /api/cron/reset-ai-credits — that cron
  // keeps dashboard credit displays accurate; this branch guarantees the gate
  // is correct even if the cron is down or runs after the user clicks Build.
  let used = profile?.ai_credits_used ?? 0;
  const resetAt = profile?.ai_credits_reset_at;
  if (used > 0 && resetAt && new Date(resetAt).getTime() <= Date.now()) {
    const nextReset = nextCreditResetAt();
    const { error: resetErr } = await admin
      .from('profiles')
      .update({ ai_credits_used: 0, ai_credits_reset_at: nextReset })
      .eq('id', userId);
    if (resetErr) {
      console.error('[aiCredits] lazy reset failed:', resetErr);
    } else {
      used = 0;
    }
  }

  if (used + cost > limit) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'CREDITS_EXHAUSTED',
          message: `You've used your ${limit} AI credits for this period. Upgrade or wait for the next reset.`,
          used,
          limit,
          action,
          cost,
          scope: 'profile',
        },
        { status: 402 },
      ),
    };
  }

  return { ok: true, ctx: { used, limit, cost, source: 'profile' } };
}

/**
 * Two-phase credit gate, phase 2: charge the user (or the pass) after the AI
 * work succeeded.
 *
 * Atomic increment via Postgres RPC: previously this read ctx.used (the
 * baseline from phase 1) and wrote ctx.used + ctx.cost back, which races
 * on parallel calls — both reads see the same baseline, both writes
 * clobber each other, net +cost instead of +2*cost. The RPC does
 * `ai_credits_used = ai_credits_used + p_amount` in a single locked
 * UPDATE, so concurrent calls serialize and accumulate correctly.
 *
 * Check-time race remains (two calls both pass checkAiCredits at the same
 * baseline before either increments), but is now bounded — a user can
 * over-spend by at most (N parallel calls - 1) * cost credits before the
 * gate catches up, instead of running away unboundedly.
 */
export async function incrementAiCreditsUsed(
  userId: string,
  ctx: AiCreditCheckResult,
): Promise<void> {
  if (ctx.source === 'exempt') return;
  const admin = createAdminClient();

  if (ctx.source === 'trip_pass' && ctx.passId) {
    const { error } = await admin.rpc('increment_trip_pass_credits', {
      p_pass_id: ctx.passId,
      p_amount: ctx.cost,
    });
    if (error) {
      console.error('[aiCredits] trip_pass increment failed:', error);
    }
    return;
  }

  // source === 'profile'
  const { error } = await admin.rpc('increment_user_ai_credits', {
    p_user_id: userId,
    p_amount: ctx.cost,
  });
  if (error) {
    // Charge failure is non-blocking — the AI work already completed and
    // the user has their result. Worst case: they get a free credit. Logged
    // so we can spot if this happens at scale.
    console.error('[aiCredits] profile increment failed:', error);
  }
}
