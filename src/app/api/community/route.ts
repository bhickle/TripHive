import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '12', 10) || 12, 30);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

    const supabase = createAdminClient();

    // Public-template trips with their cover info. Itinerary day count
    // requires a separate join — we keep it light here and only return
    // what the discovery card needs.
    const { data: trips, error: tripsErr } = await supabase
      .from('trips')
      .select('id, title, destination, start_date, end_date, trip_length, cover_image, cover_image_meta, group_size, organizer_id, created_at')
      .eq('is_public_template', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit + 19); // pull a small overshoot so we can sort by likes after counting

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
      .select('trip_id')
      .in('trip_id', tripIds);

    const likeCounts = new Map<string, number>();
    for (const row of likeRows ?? []) {
      likeCounts.set(row.trip_id, (likeCounts.get(row.trip_id) ?? 0) + 1);
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

    // Itinerary day counts so the card can show "5 days · Tokyo"
    const { data: itinRows } = await supabase
      .from('itineraries')
      .select('trip_id, days')
      .in('trip_id', tripIds);
    const dayCounts = new Map<string, number>();
    for (const row of itinRows ?? []) {
      const days = Array.isArray(row.days) ? row.days.length : 0;
      dayCounts.set(row.trip_id, days);
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
      planClickCount: planCounts.get(t.destination) ?? 0,
      createdAt: t.created_at,
    }));

    enriched.sort((a, b) => {
      if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
      if (b.planClickCount !== a.planClickCount) return b.planClickCount - a.planClickCount;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({ trips: enriched.slice(0, limit) });
  } catch (err) {
    console.error('community GET error:', err);
    return NextResponse.json({ trips: [] });
  }
}
