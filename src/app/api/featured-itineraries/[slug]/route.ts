import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/featured-itineraries/[slug]
 * Returns a single featured itinerary with full day-by-day itinerary data.
 * Public — no auth required.
 */
export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('featured_itineraries')
      .select('*')
      .eq('slug', params.slug)
      .eq('published', true)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      itinerary: {
        id: data.id,
        slug: data.slug,
        destination: data.destination,
        country: data.country,
        title: data.title,
        tagline: data.tagline,
        heroImage: data.hero_image,
        durationDays: data.duration_days,
        vibes: data.vibes ?? [],
        personaTags: data.persona_tags ?? [],
        seasonTags: data.season_tags ?? [],
        avgCostPerDay: data.avg_cost_per_day,
        editorPick: data.editor_pick,
        days: (data.itinerary as { days?: unknown[] })?.days ?? [],
        affiliateLinks: data.affiliate_links ?? {},
      },
    });
  } catch (err) {
    console.error('featured-itineraries/[slug] GET error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
