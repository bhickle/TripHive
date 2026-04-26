import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/featured-itineraries
 * Returns all published featured itineraries ordered by sort_order.
 * Public — no auth required.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();

    const [featuredResult, seasonalResult] = await Promise.all([
      supabase
        .from('featured_itineraries')
        .select('id, slug, destination, country, title, tagline, hero_image, duration_days, vibes, persona_tags, season_tags, avg_cost_per_day, editor_pick, sort_order')
        .eq('published', true)
        .order('sort_order', { ascending: true }),

      supabase
        .from('seasonal_collections')
        .select('*')
        .eq('published', true)
        .order('sort_order', { ascending: true }),
    ]);

    return NextResponse.json({
      featured: (featuredResult.data ?? []).map(f => ({
        id: f.id,
        slug: f.slug,
        destination: f.destination,
        country: f.country,
        title: f.title,
        tagline: f.tagline,
        heroImage: f.hero_image,
        durationDays: f.duration_days,
        vibes: f.vibes ?? [],
        personaTags: f.persona_tags ?? [],
        seasonTags: f.season_tags ?? [],
        avgCostPerDay: f.avg_cost_per_day,
        editorPick: f.editor_pick,
      })),
      seasonal: (seasonalResult.data ?? []).map(s => ({
        id: s.id,
        slug: s.slug,
        title: s.title,
        description: s.description,
        season: s.season,
        accentColor: s.accent_color,
        heroImage: s.hero_image,
        destinationNames: s.destination_names ?? [],
      })),
    });
  } catch (err) {
    console.error('featured-itineraries GET error:', err);
    return NextResponse.json({ featured: [], seasonal: [] });
  }
}
