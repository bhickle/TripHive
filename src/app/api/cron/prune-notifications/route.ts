/**
 * GET /api/cron/prune-notifications
 *
 * Vercel Cron entry point — runs daily at 08:00 UTC (see vercel.json).
 *
 * Deletes notifications older than 60 days. Without this the table grows
 * unbounded (10 messages/day × 365 = 3,650 rows/year per active user); at
 * scale that bloats notification-bell queries and Realtime fan-out. 60
 * days is a compromise: short enough to keep the table small, long enough
 * that "I missed this" recovery is realistic (longer than any user would
 * scroll back through their bell).
 *
 * Auth: protected by `Authorization: Bearer ${CRON_SECRET}` via the
 * shared verifyCronSecret helper.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronSecret } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req, 'cron/prune-notifications');
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('notifications')
    .delete()
    .lt('created_at', cutoff)
    .select('id');

  if (error) {
    console.error('[cron/prune-notifications] delete failed:', error);
    return NextResponse.json({ error: 'Bulk delete failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deletedCount: data?.length ?? 0, cutoff });
}
