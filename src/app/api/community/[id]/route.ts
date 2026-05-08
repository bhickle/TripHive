import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/community/[id]
 *
 * Returns the read-only public view of a single trip — only when the trip's
 * organizer has set is_public_template = true. Includes itinerary days,
 * itinerary like count + viewer's like state, and per-activity like counts
 * keyed by activity id.
 *
 * Caller need not be authenticated. If they are, we resolve their user_id
 * to surface "did I like this?" state for the like button toggle.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    let userId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id ?? null;
    } catch { /* anonymous OK */ }

    const supabase = createAdminClient();

    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .select('id, title, destination, start_date, end_date, trip_length, group_size, cover_image, cover_image_meta, organizer_id, is_public_template, fork_source_id, created_at')
      .eq('id', params.id)
      .single();

    if (tripErr || !trip) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!trip.is_public_template) {
      return NextResponse.json({ error: 'Trip is not public' }, { status: 403 });
    }

    const [itinRes, likeCountRes, viewerLikeRes, activityLikesRes, organizerRes] = await Promise.all([
      supabase.from('itineraries').select('days, meta').eq('trip_id', params.id).maybeSingle(),
      supabase.from('itinerary_likes').select('id', { count: 'exact', head: true }).eq('trip_id', params.id),
      userId
        ? supabase.from('itinerary_likes').select('id').eq('trip_id', params.id).eq('user_id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('activity_likes').select('activity_id, user_id').eq('trip_id', params.id),
      trip.organizer_id
        ? supabase.from('profiles').select('id, name, avatar_url').eq('id', trip.organizer_id).single()
        : Promise.resolve({ data: null }),
    ]);

    // Aggregate activity likes: count + viewer-liked-set
    const activityLikeCounts: Record<string, number> = {};
    const viewerLikedActivities: string[] = [];
    for (const row of activityLikesRes.data ?? []) {
      activityLikeCounts[row.activity_id] = (activityLikeCounts[row.activity_id] ?? 0) + 1;
      if (userId && row.user_id === userId) viewerLikedActivities.push(row.activity_id);
    }

    return NextResponse.json({
      trip: {
        id: trip.id,
        title: trip.title,
        destination: trip.destination,
        startDate: trip.start_date,
        endDate: trip.end_date,
        tripLength: trip.trip_length,
        groupSize: trip.group_size,
        coverImage: trip.cover_image,
        coverImageMeta: trip.cover_image_meta,
        organizer: organizerRes.data
          ? { name: (organizerRes.data as { name?: string | null }).name ?? null, avatarUrl: (organizerRes.data as { avatar_url?: string | null }).avatar_url ?? null }
          : null,
        forkSourceId: trip.fork_source_id,
        createdAt: trip.created_at,
      },
      itinerary: {
        days: itinRes.data?.days ?? [],
        meta: itinRes.data?.meta ?? null,
      },
      likes: {
        itineraryCount: likeCountRes.count ?? 0,
        viewerLiked: !!viewerLikeRes.data,
        activityCounts: activityLikeCounts,
        viewerLikedActivities,
      },
    });
  } catch (err) {
    console.error('community GET [id] error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
