import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { consumeRateLimit, clientIpFromRequest } from '@/lib/supabase/rateLimit';

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
    // Same swallow pattern as messages + expenses (fixed elsewhere) —
    // returning empty arrays on a Supabase error makes a transient DB
    // blip look like "no destinations in our system." Now: log + 500
    // so the client can show a retry banner instead of false-empty.
    console.error('discover GET error:', err);
    return NextResponse.json(
      { error: 'Failed to load discover destinations. Please retry.' },
      { status: 500 },
    );
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
    // Defensive cap. The endpoint is intentionally open for anonymous
    // event logging — without a length limit, a bot could write
    // multi-KB payloads into destination_events forever.
    if (typeof destination !== 'string' || destination.length > 100) {
      return NextResponse.json({ ok: false, error: 'destination too long' }, { status: 400 });
    }

    // Rate-limit anonymous event logging by IP (DB-4). The table is open by
    // design; this just bounds bot spam volume. 120/min is far above real
    // browsing, and the limiter fails open if Supabase is unavailable.
    const ip = clientIpFromRequest(request);
    if (!(await consumeRateLimit(`discover_event:ip:${ip}`, 120, 60))) {
      return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
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
