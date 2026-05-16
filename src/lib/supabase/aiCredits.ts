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
 * `exempt: true` means this tier is not subject to the profile-level credit
 * counter — currently only trip_pass, which has its own per-pass billing
 * via the trip_passes table. incrementAiCreditsUsed is a no-op when exempt.
 */
export interface AiCreditCheckResult {
  used: number;
  limit: number;
  cost: number;
  exempt: boolean;
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
 * Fail-open on Supabase lookup failure: if the profile fetch errors, we
 * return ok rather than 503. The Anthropic call is the real cost — surfacing
 * a 503 to the user for a transient profile-read flake gives a worse
 * experience than allowing one extra request through.
 */
export async function checkAiCredits(
  userId: string,
  tier: SubscriptionTier,
  action: AiAction,
): Promise<{ ok: true; ctx: AiCreditCheckResult } | { ok: false; response: NextResponse }> {
  const cost = AI_CREDIT_COSTS[action];

  // trip_pass: per-pass billing tracked separately on trip_passes.ai_credits_used.
  // The profile-level counter doesn't apply. TODO(launch): when an action
  // targets a specific trip with an active pass, decrement that pass's
  // counter instead — for now we let trip_pass through without enforcement.
  if (tier === 'trip_pass') {
    return { ok: true, ctx: { used: 0, limit: 0, cost, exempt: true } };
  }

  const limitRaw = TIER_LIMITS[tier].aiCreditsPerMonth;
  if (typeof limitRaw !== 'number') {
    // 'plan_based' should only apply to trip_pass (handled above). Defensive
    // fallthrough — exempt rather than block on unexpected enum value.
    return { ok: true, ctx: { used: 0, limit: 0, cost, exempt: true } };
  }
  const limit = limitRaw;

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('ai_credits_used, ai_credits_reset_at')
    .eq('id', userId)
    .single();
  if (error) {
    console.error('[aiCredits] profile lookup failed:', error);
    return { ok: true, ctx: { used: 0, limit, cost, exempt: true } };
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
        },
        { status: 402 },
      ),
    };
  }

  return { ok: true, ctx: { used, limit, cost, exempt: false } };
}

/**
 * Two-phase credit gate, phase 2: charge the user after the AI work succeeded.
 *
 * Race condition: two simultaneous calls both pass the check (read same
 * baseline) then both increment, allowing one over-charge. Acceptable on
 * the small numeric caps we enforce (10–300). For atomic increments use
 * a Postgres RPC; supabase-js doesn't expose `+= 1` directly.
 */
export async function incrementAiCreditsUsed(
  userId: string,
  ctx: AiCreditCheckResult,
): Promise<void> {
  if (ctx.exempt) return;
  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ ai_credits_used: ctx.used + ctx.cost })
    .eq('id', userId);
  if (error) {
    // Charge failure is non-blocking — the AI work already completed and
    // the user has their result. Worst case: they get a free credit. Logged
    // so we can spot if this happens at scale.
    console.error('[aiCredits] increment failed:', error);
  }
}
