import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/discover
 * Returns all discover destinations (public, no auth required)
 * plus the top 10 destinations by event count in the last 30 days.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();

    // Run both queries in parallel
    const [destResult, trendingResult] = await Promise.all([
      supabase
        .from('discover_destinations')
        .select('*')
        .order('editor_pick', { ascending: false }),

      supabase
        .from('destination_events')
        .select('destination')
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    ]);

    const destinations = destResult.data ?? [];

    // Tally event counts per destination name
    const countMap: Record<string, number> = {};
    for (const row of trendingResult.data ?? []) {
      countMap[row.destination] = (countMap[row.destination] ?? 0) + 1;
    }

    // Top 10 destination names sorted by event count (min 1 event)
    const topSearches = Object.entries(countMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    if (!destinations.length) {
      return NextResponse.json({ destinations: [], topSearches });
    }

    return NextResponse.json({
      destinations: destinations.map(d => ({
        id: d.id,
        name: d.name,
        country: d.country,
        continent: d.continent,
        image: d.image,
        tagline: d.tagline,
        description: d.description,
        vibes: d.vibes ?? [],
        avgCost: d.avg_cost,
        bestMonths: d.best_months,
        flightHours: d.flight_hours,
        trending: d.trending,
        editorPick: d.editor_pick,
        affiliateLinks: d.affiliate_links ?? {},
      })),
      topSearches,
    });
  } catch (err) {
    console.error('discover GET error:', err);
    return NextResponse.json({ destinations: [], topSearches: [] });
  }
}

/**
 * POST /api/discover
 * Logs a destination interaction event. Fire-and-forget from the client.
 * Body: { destination: string, eventType: 'search' | 'card_click' | 'plan_click' }
 */
export async function POST(request: NextRequest) {
  try {
    const { destination, eventType } = await request.json();

    if (!destination || !['search', 'card_click', 'plan_click'].includes(eventType)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    // Resolve user if logged in (best-effort, not required)
    let userId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id ?? null;
    } catch { /* anonymous is fine */ }

    const supabase = createAdminClient();
    await supabase.from('destination_events').insert({
      destination: destination.trim(),
      event_type: eventType,
      user_id: userId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('discover POST error:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
