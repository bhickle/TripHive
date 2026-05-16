/**
 * GET /api/cron/expire-venue-cache
 *
 * Vercel Cron entry point — runs daily at 07:00 UTC (see vercel.json).
 *
 * Deletes venue_verification_cache rows older than 30 days. The cache
 * helper in lib/places/verifyVenues.ts already treats stale entries as
 * a cache miss on read, so the cron is purely about keeping the table
 * small — without it, the cache would grow unbounded over time and
 * eventually slow the bulk SELECT IN at the top of every verification
 * pass.
 *
 * Auth: protected by `Authorization: Bearer ${CRON_SECRET}`, same as
 * the other crons.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error('[cron/expire-venue-cache] CRON_SECRET is not set');
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('venue_verification_cache')
    .delete()
    .lt('checked_at', cutoff)
    .select('cache_key');

  if (error) {
    console.error('[cron/expire-venue-cache] delete failed:', error);
    return NextResponse.json({ error: 'Bulk delete failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deletedCount: data?.length ?? 0, cutoff });
}
