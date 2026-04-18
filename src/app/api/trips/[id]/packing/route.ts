import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
    let userId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id ?? null;
    } catch { /* unauthenticated */ }

    const supabase = createAdminClient();
    const query = supabase
      .from('packing_items')
      .select('*')
      .eq('trip_id', params.id)
      .order('display_order', { ascending: true });

    // Scope to user if authenticated
    if (userId) query.eq('user_id', userId);

    const { data: items } = await query;
    return NextResponse.json({ items: items ?? [] });
  } catch (err) {
    console.error('packing GET error:', err);
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    let userId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id ?? null;
    } catch { /* unauthenticated */ }

    const { name, category } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 });

    const supabase = createAdminClient();

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

export async function PATCH(req: Request, { params: _params }: { params: { id: string } }) {
  try {
    const { itemId, packed } = await req.json();
    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('packing_items')
      .update({ packed: !!packed })
      .eq('id', itemId);

    if (error) return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('packing PATCH error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
