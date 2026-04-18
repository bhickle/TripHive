import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/wishlist
 * Returns the current user's wishlist items.
 *
 * POST /api/wishlist
 * Adds a wishlist item. Body: { destination, country?, coverImage?, bestSeason?, estimatedCost?, tags? }
 *
 * DELETE /api/wishlist?id=<item_id>
 * Removes a wishlist item.
 */
async function getCurrentUserId(): Promise<string | null> {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({ items: [] });

    const supabase = createAdminClient();
    const { data: items, error } = await supabase
      .from('wishlist_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ items: [] });

    return NextResponse.json({
      items: (items ?? []).map(i => ({
        id: i.id,
        destination: i.destination,
        country: i.country,
        coverImage: i.cover_image,
        bestSeason: i.best_season,
        estimatedCost: i.estimated_cost,
        tags: i.tags ?? [],
        notes: i.notes,
      })),
    });
  } catch (err) {
    console.error('wishlist GET error:', err);
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    const { destination, country, coverImage, bestSeason, estimatedCost, tags, notes } = body;
    if (!destination?.trim()) return NextResponse.json({ error: 'destination required' }, { status: 400 });

    const supabase = createAdminClient();
    const { data: item, error } = await supabase
      .from('wishlist_items')
      .insert({
        user_id: userId,
        destination: destination.trim(),
        country: country ?? null,
        cover_image: coverImage ?? null,
        best_season: bestSeason ?? null,
        estimated_cost: estimatedCost ?? null,
        tags: tags ?? [],
        notes: notes ?? null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'Failed to add item' }, { status: 500 });

    return NextResponse.json({
      item: {
        id: item.id,
        destination: item.destination,
        country: item.country,
        coverImage: item.cover_image,
        bestSeason: item.best_season,
        estimatedCost: item.estimated_cost,
        tags: item.tags ?? [],
        notes: item.notes,
      },
    });
  } catch (err) {
    console.error('wishlist POST error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('wishlist_items')
      .delete()
      .eq('id', id)
      .eq('user_id', userId); // ensure ownership

    if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('wishlist DELETE error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
