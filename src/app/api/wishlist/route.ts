import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth, requireFeature } from '@/lib/supabase/requireAuth';

/**
 * GET /api/wishlist
 * Returns the current user's wishlist items, including the saved-link
 * preview cards (links column).
 *
 * POST /api/wishlist  [Explorer+ required]
 * Adds a wishlist item. Body: { destination, country?, coverImage?,
 *   bestSeason?, estimatedCost?, tags?, notes?, links? }
 *
 * PATCH /api/wishlist  [Explorer+ required]
 * Adds or removes a single link from a wishlist item's links array.
 * Body: { itemId, action: 'add' | 'remove', link?: WishlistLink, url?: string }
 *   - action='add' → append `link` to links array
 *   - action='remove' → drop the entry whose url matches `url`
 *
 * DELETE /api/wishlist?id=<item_id>  [Explorer+ required]
 * Removes a wishlist item.
 */

interface WishlistLink {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  fetchedAt: string;
}

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
        links: Array.isArray(i.links) ? (i.links as unknown as WishlistLink[]) : [],
      })),
    });
  } catch (err) {
    console.error('wishlist GET error:', err);
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const denied = requireFeature(auth.ctx.tier, 'canUseWishlist');
  if (denied) return denied;

  try {
    const userId = auth.ctx.userId;

    const body = await req.json();
    const { destination, country, coverImage, bestSeason, estimatedCost, tags, notes, links } = body;
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
        links: Array.isArray(links) ? links : [],
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
        links: Array.isArray(item.links) ? (item.links as unknown as WishlistLink[]) : [],
      },
    });
  } catch (err) {
    console.error('wishlist POST error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const denied = requireFeature(auth.ctx.tier, 'canUseWishlist');
  if (denied) return denied;

  try {
    const userId = auth.ctx.userId;
    const body = await req.json();
    const { itemId, action, link, url } = body as {
      itemId?: string;
      action?: 'add' | 'remove';
      link?: WishlistLink;
      url?: string;
    };
    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });
    if (action !== 'add' && action !== 'remove') {
      return NextResponse.json({ error: "action must be 'add' or 'remove'" }, { status: 400 });
    }

    const supabase = createAdminClient();
    // Fetch existing row + verify ownership in one shot
    const { data: existing, error: fetchErr } = await supabase
      .from('wishlist_items')
      .select('id, user_id, links')
      .eq('id', itemId)
      .single();
    if (fetchErr || !existing) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    if (existing.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const currentLinks: WishlistLink[] = Array.isArray(existing.links)
      ? (existing.links as unknown as WishlistLink[])
      : [];

    let nextLinks: WishlistLink[];
    if (action === 'add') {
      if (!link?.url) return NextResponse.json({ error: 'link.url required' }, { status: 400 });
      // Dedupe by url so re-pasting the same link doesn't stack duplicates
      nextLinks = [link, ...currentLinks.filter(l => l.url !== link.url)];
    } else {
      if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });
      nextLinks = currentLinks.filter(l => l.url !== url);
    }

    const { error: updateErr } = await supabase
      .from('wishlist_items')
      .update({ links: nextLinks as unknown as import('@/lib/supabase/database.types').Json })
      .eq('id', itemId)
      .eq('user_id', userId);

    if (updateErr) {
      console.error('wishlist PATCH update error:', updateErr);
      return NextResponse.json({ error: 'Failed to update links' }, { status: 500 });
    }

    return NextResponse.json({ links: nextLinks });
  } catch (err) {
    console.error('wishlist PATCH error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const denied = requireFeature(auth.ctx.tier, 'canUseWishlist');
  if (denied) return denied;

  try {
    const userId = auth.ctx.userId;

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
