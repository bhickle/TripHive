import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/trips/[id]/public
 * Returns a minimal, safe subset of trip data for the join / invite flow.
 * Uses the admin client so it bypasses RLS — only safe fields are returned
 * (no itinerary content, no personal data, no member lists).
 *
 * Privacy gate (added 2026-05-30): a trip the organizer marked `is_private`
 * still leaks its destination + dates + group size to anyone who knows the
 * UUID. For private trips we now require a valid, non-expired invite token
 * for THIS trip (passed as `?token=`); otherwise 404 — indistinguishable
 * from a non-existent trip. Non-private trips (open share links / templates)
 * remain previewable tokenless, as before.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  // Validate UUID format before hitting the database
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('trips')
      .select('id, title, destination, start_date, end_date, group_size, cover_image, is_private')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Private trips require a valid invite token bound to this trip.
    if (data.is_private) {
      const token = new URL(req.url).searchParams.get('token');
      let tokenOk = false;
      if (token) {
        const { data: invite } = await supabase
          .from('trip_invites')
          .select('trip_id, expires_at')
          .eq('token', token)
          .eq('trip_id', id)
          .maybeSingle();
        tokenOk = !!invite && (!invite.expires_at || new Date(invite.expires_at) > new Date());
      }
      if (!tokenOk) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
    }

    return NextResponse.json({
      id: data.id,
      title: data.title,
      destination: data.destination,
      startDate: data.start_date,
      endDate: data.end_date,
      groupSize: data.group_size,
      coverImage: data.cover_image,
    });
  } catch (err) {
    console.error('[trips/public] error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
