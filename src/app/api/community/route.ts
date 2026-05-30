import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { extractPreviewDays, type PreviewDay } from '@/lib/itinerary-preview';

/**
 * GET /api/community
 *
 * Returns the top public-template itineraries — trips whose organizer has
 * opted in via trips.is_public_template = true. Sorted by like count
 * desc, then plan_click count (last 30d) desc, then creation date desc.
 *
 * Public endpoint — no auth required, no membership check. The trip's
 * own organizer/members can view + edit through the regular routes;
 * everyone else sees a read-only preview at /community/[id].
 *
 * Query params:
 *   limit  default 12, max 30
 *   offset default 0  (basic pagination — bump when we add infinite scroll)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '9', 10) || 9, 30);

    const supabase = createAdminClient();

    // Resolve the viewer (if logged in) so we can flag which trips they've
    // already liked. Without this the client starts with no liked-state, so
    // every heart renders empty on load — and re-toggling silently removes an
    // existing like (the "my heart didn't stay" bug).
    const { data: { user: viewer } } = await (await createClient()).auth.getUser();
    const viewerId = viewer?.id ?? null;

    // Public-template trips with their cover info. Itinerary day count
    // requires a separate join — we keep it light here and only return
    // what the discovery card needs.
    const { data: trips, error: tripsErr } = await supabase
      .from('trips')
      .select('id, title, destination, start_date, end_date, trip_length, cover_image, cover_image_meta, group_size, organizer_id, created_at')
      .eq('is_public_template', true)
      .order('created_at', { ascending: false })
      .limit(60); // pull a recent pool; we randomly sample `limit` from it below

    if (tripsErr) {
      console.error('community list error:', tripsErr);
      return NextResponse.json({ trips: [] });
    }

    if (!trips || trips.length === 0) {
      return NextResponse.json({ trips: [] });
    }

    const tripIds = trips.map(t => t.id);

    // Aggregate like counts per trip in one pass
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

    // Plan-click counts from destination_events, last 30 days, keyed by destination string.
    // We aggregate by destination name (not trip_id) because that's how plan
    // clicks are tracked today — multiple trips to "Tokyo" share the count.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const destinations = Array.from(new Set(trips.map(t => t.destination)));
    const { data: planRows } = await supabase
      .from('destination_events')
      .select('destination')
      .eq('event_type', 'plan_click')
      .gte('created_at', since)
      .in('destination', destinations);

    const planCounts = new Map<string, number>();
    for (const row of planRows ?? []) {
      planCounts.set(row.destination, (planCounts.get(row.destination) ?? 0) + 1);
    }

    // Resolve organizer names for the credit byline ("by Brandon H.")
    const organizerIds = Array.from(new Set(trips.map(t => t.organizer_id).filter((id): id is string => !!id)));
    const organizerNames = new Map<string, string | null>();
    if (organizerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', organizerIds);
      for (const p of profiles ?? []) organizerNames.set(p.id, p.name);
    }

    // Itinerary day counts so the card can show "5 days · Tokyo", plus a
    // lightweight 4-day preview that the discover-rail cards render as a
    // hint of what's inside the trip — same visual shape as
    // FeaturedItineraryCard. extractPreviewDays() strips the rich days
    // jsonb down to per-day title + 3 activity titles.
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
      planClickCount: planCounts.get(t.destination) ?? 0,
      createdAt: t.created_at,
      previewDays: dayPreviews.get(t.id) ?? [],
    }));

    // Random sample — the community rail should feel fresh and varied, not
    // always the same top-liked trips, and shouldn't dump every public trip
    // on screen. Fisher-Yates shuffle, then cap at `limit`.
    for (let i = enriched.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [enriched[i], enriched[j]] = [enriched[j], enriched[i]];
    }

    return NextResponse.json({ trips: enriched.slice(0, limit) });
  } catch (err) {
    console.error('community GET error:', err);
    return NextResponse.json({ trips: [] });
  }
}
