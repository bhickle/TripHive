/**
 * GET /api/cron/reset-ai-credits
 *
 * Vercel Cron entry point — runs daily at 06:00 UTC (see vercel.json).
 *
 * Finds every profile where `ai_credits_reset_at` is in the past and
 * `ai_credits_used > 0`, zeros the counter, and rolls the boundary forward
 * to 00:00 UTC on the first of the next month.
 *
 * Why both this cron and reset-on-read in `checkAiCredits`:
 *  - The cron keeps the dashboard credit display accurate for users who
 *    haven't tried to use AI yet this billing period.
 *  - Reset-on-read guarantees the gate is correct on the next AI call even
 *    if the cron is down or the user hits AI before the cron fires.
 *
 * Auth: protected by `Authorization: Bearer ${CRON_SECRET}`, same as the
 * other crons. Missing/wrong token → 401.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { nextCreditResetAt } from '@/lib/supabase/aiCredits';
import { verifyCronSecret } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req, 'cron/reset-ai-credits');
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();
  const nextReset = nextCreditResetAt();

  // Bulk update — one round-trip, no per-row loop. `.lte` matches both past
  // resets and exactly-now (harmless if the boundary lands on the same
  // second as the cron). `.gt` on ai_credits_used skips no-op writes for
  // anyone who's already at zero.
  const { data, error } = await supabase
    .from('profiles')
    .update({ ai_credits_used: 0, ai_credits_reset_at: nextReset })
    .lte('ai_credits_reset_at', nowIso)
    .gt('ai_credits_used', 0)
    .select('id');

  if (error) {
    console.error('[cron/reset-ai-credits] bulk update failed:', error);
    return NextResponse.json({ error: 'Bulk update failed' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    resetCount: data?.length ?? 0,
    nextReset,
  });
}
