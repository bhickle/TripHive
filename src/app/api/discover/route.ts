import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/discover
 * Returns all discover destinations (public, no auth required).
 */
export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data: destinations, error } = await supabase
      .from('discover_destinations')
      .select('*')
      .order('editor_pick', { ascending: false });

    if (error || !destinations?.length) {
      return NextResponse.json({ destinations: [] });
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
    });
  } catch (err) {
    console.error('discover GET error:', err);
    return NextResponse.json({ destinations: [] });
  }
}
