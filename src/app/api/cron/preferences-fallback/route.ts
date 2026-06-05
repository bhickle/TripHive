/**
 * GET /api/cron/preferences-fallback
 *
 * Vercel Cron entry point — runs daily at 09:00 UTC (see vercel.json).
 *
 * For every trip that:
 *   - starts within the next ~30 hours (catches a wide enough window that
 *     daily granularity doesn't miss any), AND
 *   - has at least one member who hasn't submitted preferences,
 * insert a one-time `pass_pending_prefs` notification for the organizer so
 * they know who's outstanding before the trip kicks off and the AI prompt
 * merger ends up generating without that member's input.
 *
 * Idempotency: dedupes on (user_id, type='pass_pending_prefs', trip_id) so
 * re-runs of the same day don't pile up duplicate notifications.
 *
 * Auth: protected by `Authorization: Bearer ${CRON_SECRET}`. Vercel adds
 * this header automatically for cron requests when the env var is set.
 * Missing/incorrect token → 401, so the route can't be triggered manually
 * by anyone without the secret.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyCronSecret } from '@/lib/cronAuth';
import { isNotificationAllowedForUser } from '@/lib/supabase/notify';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req, 'cron/preferences-fallback');
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 60 * 60 * 1000); // 30h from now

  let processed = 0;
  let notificationsCreated = 0;
  let skippedDuplicates = 0;

  try {
    // Find trips starting in the upcoming window. We deliberately don't
    // filter by tier here — Trip Pass is the primary use case, but Travel Pro
    // organizers benefit from the same heads-up if their group hasn't
    // submitted. The feature is harmless for solo trips (no members → no
    // pending → no notification fires).
    const { data: trips, error: tripsErr } = await supabase
      .from('trips')
      .select('id, title, organizer_id, start_date')
      .gte('start_date', now.toISOString().slice(0, 10))
      .lte('start_date', horizon.toISOString().slice(0, 10))
      .not('organizer_id', 'is', null);

    if (tripsErr) {
      console.error('[cron/preferences-fallback] trips query failed:', tripsErr);
      return NextResponse.json({ error: 'Trips query failed' }, { status: 500 });
    }

    for (const trip of trips ?? []) {
      processed++;
      if (!trip.organizer_id) continue;

      // Pull all members for this trip and count those without submittedAt.
      const { data: members } = await supabase
        .from('trip_members')
        .select('name, preferences')
        .eq('trip_id', trip.id);

      const pending = (members ?? []).filter(m => {
        const p = m.preferences as { submittedAt?: string } | null;
        return !p?.submittedAt;
      });

      if (pending.length === 0) continue;

      // Idempotency: skip if we've already notified this organizer about
      // this trip's pending preferences. The check is tight to (user_id,
      // type, trip_id) — a future re-run won't double-notify.
      const { count: existing } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', trip.organizer_id)
        .eq('trip_id', trip.id)
        .eq('type', 'pass_pending_prefs');

      if ((existing ?? 0) > 0) {
        skippedDuplicates++;
        continue;
      }

      // Compose the body — name a couple of people so the buyer doesn't
      // have to click into the trip just to see who's missing.
      const namesPreview = pending
        .map(m => m.name?.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');
      const overflow = pending.length - 3;
      const namesText = pending.length === 0
        ? ''
        : overflow > 0
          ? `${namesPreview} and ${overflow} other${overflow === 1 ? '' : 's'}`
          : namesPreview;
      const bodyMessage = `Trip starts soon — ${pending.length} ${pending.length === 1 ? 'member hasn\'t' : "members haven't"} shared preferences yet${namesText ? ` (${namesText})` : ''}. They'll default to no preferences if you generate.`;

      // Honor the organizer's notification preferences. pass_pending_prefs
      // is gated on the `tripReminders` toggle in Settings.
      const allowed = await isNotificationAllowedForUser(
        supabase, trip.organizer_id, 'pass_pending_prefs',
      );
      if (!allowed) {
        skippedDuplicates++;  // bucket muted-by-prefs into the same skip
        continue;             // counter so the response stays single-number
      }

      const { error: insertErr } = await supabase.from('notifications').insert({
        user_id: trip.organizer_id,
        trip_id: trip.id,
        trip_name: trip.title ?? null,
        type: 'pass_pending_prefs',
        message: bodyMessage,
        inviter_name: 'tripcoord',
      });

      if (insertErr) {
        console.error('[cron/preferences-fallback] notification insert failed for trip', trip.id, insertErr);
        continue;
      }
      notificationsCreated++;
    }

    return NextResponse.json({
      ok: true,
      processed,
      notificationsCreated,
      skippedDuplicates,
      windowEnd: horizon.toISOString(),
    });
  } catch (err) {
    console.error('[cron/preferences-fallback] unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
