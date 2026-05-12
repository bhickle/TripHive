import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireTripAccess } from '@/lib/supabase/tripAccess';

/**
 * GET /api/trips/[id]/souvenirs
 * Returns the current user's souvenir/gift list for this trip.
 *
 * POST /api/trips/[id]/souvenirs
 * Adds a souvenir item. Body: { person, idea? }
 *
 * PATCH /api/trips/[id]/souvenirs
 * Updates an item. Body: { itemId, purchased?, idea?, person? }
 *
 * DELETE /api/trips/[id]/souvenirs
 * Removes an item. Body: { itemId }
 */

async function getAuthUserId(): Promise<string | null> {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ items: [] });

    const supabase = createAdminClient();
    const { data: items, error } = await supabase
      .from('souvenir_items')
      .select('*')
      .eq('trip_id', params.id)
      .eq('user_id', userId)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('souvenirs GET error:', error);
      return NextResponse.json({ items: [] });
    }

    return NextResponse.json({ items: items ?? [] });
  } catch (err) {
    console.error('souvenirs GET error:', err);
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    // Previously only checked auth — any signed-in user could write souvenir
    // rows into trips they weren't a member of. requireTripAccess validates
    // both auth AND that the caller is on this trip.
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    const { person, idea } = await req.json();
    if (!person?.trim()) return NextResponse.json({ error: 'person required' }, { status: 400 });

    // Use maybeSingle so first-time users (no existing rows) don't trigger a
    // PostgrestError "JSON object requested, multiple (or no) rows returned"
    // — the previous .single() emitted that error into the destructured `error`
    // slot which was being ignored, masking real issues.
    const { data: last } = await supabase
      .from('souvenir_items')
      .select('display_order')
      .eq('trip_id', params.id)
      .eq('user_id', userId)
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: item, error } = await supabase
      .from('souvenir_items')
      .insert({
        trip_id: params.id,
        user_id: userId,
        person: person.trim(),
        idea: idea?.trim() ?? '',
        purchased: false,
        display_order: (last?.display_order ?? 0) + 1,
      })
      .select()
      .single();

    if (error) {
      console.error('souvenirs POST error:', error);
      return NextResponse.json({ error: 'Failed to add item' }, { status: 500 });
    }
    return NextResponse.json({ item });
  } catch (err) {
    console.error('souvenirs POST error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { itemId, purchased, idea, person } = await req.json();
    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

    const updates: {
      purchased?: boolean;
      idea?: string;
      person?: string;
    } = {};
    if (purchased !== undefined) updates.purchased = !!purchased;
    if (idea !== undefined) updates.idea = idea;
    if (person !== undefined) updates.person = person;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const supabase = createAdminClient();
    // Scope to user_id AND the URL's trip_id so a user can't PATCH a
    // souvenir they own but that belongs to a different trip via a
    // mistyped URL. Same-user / wrong-URL writes are now 0-row no-ops.
    const { error } = await supabase
      .from('souvenir_items')
      .update(updates)
      .eq('id', itemId)
      .eq('user_id', userId)
      .eq('trip_id', params.id);

    if (error) return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('souvenirs PATCH error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { itemId } = await req.json();
    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

    const supabase = createAdminClient();
    // Scope by trip_id too (see PATCH comment above).
    const { error } = await supabase
      .from('souvenir_items')
      .delete()
      .eq('id', itemId)
      .eq('user_id', userId)
      .eq('trip_id', params.id);

    if (error) return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('souvenirs DELETE error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
