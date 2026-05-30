/**
 * GET /api/cron/expire-venue-cache
 *
 * Vercel Cron entry point — runs daily at 07:00 UTC (see vercel.json).
 *
 * Deletes rows older than 30 days from BOTH venue caches:
 *   - venue_verification_cache (open/closed status — verifyVenues.ts)
 *   - venue_location_cache    (resolved address — verifyDayLocations.ts)
 * Both helpers already treat stale entries as a cache miss on read, so the
 * cron is purely about keeping the tables small — without it, they'd grow
 * unbounded and eventually slow the bulk SELECT IN at the top of every pass.
 *
 * Auth: protected by `Authorization: Bearer ${CRON_SECRET}`, same as
 * the other crons.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronSecret } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req, 'cron/expire-venue-cache');
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: statusData, error: statusErr } = await supabase
    .from('venue_verification_cache')
    .delete()
    .lt('checked_at', cutoff)
    .select('cache_key');

  if (statusErr) {
    console.error('[cron/expire-venue-cache] venue_verification_cache delete failed:', statusErr);
    return NextResponse.json({ error: 'Bulk delete failed' }, { status: 500 });
  }

  const { data: locationData, error: locationErr } = await supabase
    .from('venue_location_cache')
    .delete()
    .lt('checked_at', cutoff)
    .select('cache_key');

  if (locationErr) {
    console.error('[cron/expire-venue-cache] venue_location_cache delete failed:', locationErr);
    return NextResponse.json({ error: 'Bulk delete failed' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deletedCount: (statusData?.length ?? 0) + (locationData?.length ?? 0),
    statusDeleted: statusData?.length ?? 0,
    locationDeleted: locationData?.length ?? 0,
    cutoff,
  });
}
