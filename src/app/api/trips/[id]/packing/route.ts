import { NextResponse } from 'next/server';
import { requireTripAccess } from '@/lib/supabase/tripAccess';

/**
 * GET /api/trips/[id]/packing
 *   Returns packing items for the trip, scoped by ?scope=
 *     scope=group → items shared across the group (user_id IS NULL)
 *     scope=mine  → items private to the caller (user_id = caller)
 *     scope=all (or omitted) → both, in display order
 *
 * POST /api/trips/[id]/packing
 *   Adds a packing item. Body: { name, category, scope?: 'group' | 'private' }
 *   - scope='group'   → user_id stored as NULL (visible to all trip members)
 *   - default/private → user_id stored as the caller (visible only to caller)
 *
 * PATCH /api/trips/[id]/packing
 *   Toggles packed status. Body: { itemId, packed }
 *   Group items can be toggled by any trip member; private items only by owner.
 *
 * DELETE /api/trips/[id]/packing
 *   Removes an item. Body: { itemId }
 *   Same ownership rules as PATCH.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    const url = new URL(req.url);
    const scope = url.searchParams.get('scope') ?? 'all';

    let query = supabase
      .from('packing_items')
      .select('*')
      .eq('trip_id', params.id)
      .order('display_order', { ascending: true });

    if (scope === 'group') {
      query = query.is('user_id', null);
    } else if (scope === 'mine' || scope === 'private') {
      query = query.eq('user_id', userId);
    } else {
      // scope=all → group items + the caller's private items (no other user's privates)
      query = query.or(`user_id.is.null,user_id.eq.${userId}`);
    }

    const { data: items } = await query;
    return NextResponse.json({ items: items ?? [] });
  } catch (err) {
    console.error('packing GET error:', err);
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    const { name, category, scope } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

    // Group items have NULL user_id so they're visible to every trip member's
    // GET (?scope=group). Private items belong to the caller.
    const isGroup = scope === 'group';
    const ownerForRow: string | null = isGroup ? null : userId;

    // display_order: max+1 within the same scope (group items numbered separately
    // from each user's private items so they don't collide).
    const lastQuery = supabase
      .from('packing_items')
      .select('display_order')
      .eq('trip_id', params.id)
      .order('display_order', { ascending: false })
      .limit(1);
    const { data: last } = isGroup
      ? await lastQuery.is('user_id', null).maybeSingle()
      : await lastQuery.eq('user_id', userId).maybeSingle();

    const { data: item, error } = await supabase
      .from('packing_items')
      .insert({
        trip_id: params.id,
        user_id: ownerForRow,
        name: name.trim(),
        category: category ?? 'Clothing',
        packed: false,
        display_order: (last?.display_order ?? 0) + 1,
      })
      .select()
      .single();

    if (error) {
      console.error('packing POST error:', error);
      return NextResponse.json({ error: 'Failed to add item' }, { status: 500 });
    }
    return NextResponse.json({ item });
  } catch (err) {
    console.error('packing POST error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    const { itemId, packed } = await req.json();
    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

    // Look up the item to determine ownership rules. Group items (user_id NULL)
    // are toggleable by any trip member; private items only by their owner.
    const { data: existing } = await supabase
      .from('packing_items')
      .select('user_id, trip_id')
      .eq('id', itemId)
      .maybeSingle();

    if (!existing || existing.trip_id !== params.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (existing.user_id !== null && existing.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('packing_items')
      .update({ packed: !!packed })
      .eq('id', itemId)
      .eq('trip_id', params.id);

    if (error) return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('packing PATCH error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    const { itemId } = await req.json();
    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

    const { data: existing } = await supabase
      .from('packing_items')
      .select('user_id, trip_id')
      .eq('id', itemId)
      .maybeSingle();

    if (!existing || existing.trip_id !== params.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (existing.user_id !== null && existing.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('packing_items')
      .delete()
      .eq('id', itemId)
      .eq('trip_id', params.id);

    if (error) return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('packing DELETE error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
