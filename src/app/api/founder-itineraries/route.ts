import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { extractPreviewDays, type PreviewDay } from '@/lib/itinerary-preview';

/**
 * GET /api/founder-itineraries
 *
 * Returns the trips the founders have flagged for the "Founder Itineraries"
 * rail on Discover (trips.is_founder_featured = true). These are real trips,
 * shaped like the community cards so the rail can reuse that card.
 *
 * Unlike /api/community this is NOT randomly sampled — founder picks are a
 * deliberate, curated row, so order is stable (newest featured first).
 * Public endpoint — no auth required; viewerLiked is flagged when signed in.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: { user: viewer } } = await (await createClient()).auth.getUser();
    const viewerId = viewer?.id ?? null;

    const { data: trips, error: tripsErr } = await supabase
      .from('trips')
      .select('id, title, destination, start_date, end_date, trip_length, cover_image, cover_image_meta, group_size, organizer_id, created_at')
      .eq('is_founder_featured', true)
      .eq('is_public_template', true)
      .order('created_at', { ascending: false })
      .limit(12);

    if (tripsErr) {
      console.error('founder-itineraries list error:', tripsErr);
      return NextResponse.json({ trips: [] });
    }
    if (!trips || trips.length === 0) {
      return NextResponse.json({ trips: [] });
    }

    const tripIds = trips.map(t => t.id);

    // Like counts + which ones the viewer already liked.
    const { data: likeRows } = await supabase
      .from('itinerary_likes')
      .select('trip_id, user_id')
      .in('trip_id', tripIds);
    const likeCounts = new Map<string, number>();
    const viewerLikedTripIds = new Set<string>();
    for (const row of likeRows ?? []) {
      likeCounts.set(row.trip_id, (likeCounts.get(row.trip_id) ?? 0) + 1);
      if (viewerId && row.user_id === viewerId) viewerLikedTripIds.add(row.trip_id);
    }

    // Organizer names for the byline.
    const organizerIds = Array.from(new Set(trips.map(t => t.organizer_id).filter((id): id is string => !!id)));
    const organizerNames = new Map<string, string | null>();
    if (organizerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', organizerIds);
      for (const p of profiles ?? []) organizerNames.set(p.id, p.name);
    }

    // Itinerary day counts + 4-day preview so the founder card can show the
    // same activity-strip hint as FeaturedItineraryCard. See
    // src/lib/itinerary-preview.ts for the extraction shape.
    const { data: itinRows } = await supabase
      .from('itineraries')
      .select('trip_id, days')
      .in('trip_id', tripIds);
    const dayCounts = new Map<string, number>();
    const dayPreviews = new Map<string, PreviewDay[]>();
    for (const row of itinRows ?? []) {
      const days = Array.isArray(row.days) ? row.days : [];
      dayCounts.set(row.trip_id, days.length);
      dayPreviews.set(row.trip_id, extractPreviewDays(days));
    }

    const enriched = trips.map(t => ({
      id: t.id,
      title: t.title,
      destination: t.destination,
      startDate: t.start_date,
      endDate: t.end_date,
      tripLength: t.trip_length ?? dayCounts.get(t.id) ?? 0,
      groupSize: t.group_size,
      coverImage: t.cover_image,
      coverImageMeta: t.cover_image_meta,
      organizerName: t.organizer_id ? (organizerNames.get(t.organizer_id) ?? null) : null,
      likeCount: likeCounts.get(t.id) ?? 0,
      viewerLiked: viewerLikedTripIds.has(t.id),
      planClickCount: 0,
      createdAt: t.created_at,
      previewDays: dayPreviews.get(t.id) ?? [],
    }));

    return NextResponse.json({ trips: enriched });
  } catch (err) {
    console.error('founder-itineraries GET error:', err);
    return NextResponse.json({ trips: [] });
  }
}
