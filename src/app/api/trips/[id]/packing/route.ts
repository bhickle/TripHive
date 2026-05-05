import { NextResponse } from 'next/server';
import { requireTripAccess } from '@/lib/supabase/tripAccess';

/**
 * GET /api/trips/[id]/packing
 * Returns packing items for the current user on this trip.
 *
 * POST /api/trips/[id]/packing
 * Adds a packing item. Body: { name, category }
 *
 * PATCH /api/trips/[id]/packing
 * Toggles packed status. Body: { itemId, packed }
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    const { data: items } = await supabase
      .from('packing_items')
      .select('*')
      .eq('trip_id', params.id)
      .eq('user_id', userId)
      .order('display_order', { ascending: true });

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

    const { name, category } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

    const { data: last } = await supabase
      .from('packing_items')
      .select('display_order')
      .eq('trip_id', params.id)
      .order('display_order', { ascending: false })
      .limit(1)
      .single();

    const { data: item, error } = await supabase
      .from('packing_items')
      .insert({
        trip_id: params.id,
        user_id: userId,
        name: name.trim(),
        category: category ?? 'Clothing',
        packed: false,
        display_order: (last?.display_order ?? 0) + 1,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: 'Failed to add item' }, { status: 500 });
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

    // Scope the update to the caller's own row in this trip — no cross-row tampering
    const { error } = await supabase
      .from('packing_items')
      .update({ packed: !!packed })
      .eq('id', itemId)
      .eq('trip_id', params.id)
      .eq('user_id', userId);

    if (error) return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('packing PATCH error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
