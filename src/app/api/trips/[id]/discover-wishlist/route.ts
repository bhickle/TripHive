import { NextRequest, NextResponse } from 'next/server';
import { requireTripAccess } from '@/lib/supabase/tripAccess';

/**
 * GET /api/trips/[id]/discover-wishlist
 * Returns all wishlist votes for a trip, grouped by item.
 * Caller must be the trip organizer or a confirmed member.
 * Shape: { items: WishlistItem[] }
 * where WishlistItem = { itemId, itemData, upVotes, downVotes, myVote: 'up'|'down'|null }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const access = await requireTripAccess(params.id);
  if (!access.ok) return access.response;
  const { userId: myUserId, supabase } = access.ctx;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any)
    .from('discover_wishlist')
    .select('item_id, item_data, vote, saved, user_id')
    .eq('trip_id', params.id);

  if (error) return NextResponse.json({ items: [] });

  // Group by item_id
  const byItem: Record<string, {
    itemData: unknown;
    upVotes: number;
    downVotes: number;
    myVote: 'up' | 'down' | null;
    mySaved: boolean;
  }> = {};

  for (const row of (rows ?? [])) {
    if (!byItem[row.item_id]) {
      byItem[row.item_id] = { itemData: row.item_data, upVotes: 0, downVotes: 0, myVote: null, mySaved: false };
    }
    if (row.vote === 'up') byItem[row.item_id].upVotes++;
    if (row.vote === 'down') byItem[row.item_id].downVotes++;
    if (row.user_id === myUserId) {
      byItem[row.item_id].myVote = row.vote;
      byItem[row.item_id].mySaved = row.saved ?? false;
    }
  }

  const items = Object.entries(byItem).map(([itemId, v]) => ({ itemId, ...v }));
  return NextResponse.json({ items });
}

/**
 * POST /api/trips/[id]/discover-wishlist
 * Upsert the current user's vote for a discover item.
 * Body: { itemId: string, itemData: object, vote: 'up' | 'down' | null }
 * vote: null = remove the vote
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const access = await requireTripAccess(params.id);
  if (!access.ok) return access.response;
  const { userId, supabase } = access.ctx;

  const body = await req.json();
  const { itemId, itemData, vote, saved } = body as {
    itemId: string;
    itemData: unknown;
    vote?: 'up' | 'down' | null;
    saved?: boolean;
  };

  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = (supabase as any).from('discover_wishlist');

  // Delete row only when both vote is null AND saved is false
  if (vote === null && saved === false) {
    await table.delete()
      .eq('trip_id', params.id)
      .eq('user_id', userId)
      .eq('item_id', itemId);
  } else if (vote !== undefined || saved !== undefined) {
    // Fetch existing row to preserve fields not being updated
    const { data: existing } = await table
      .select('vote, saved')
      .eq('trip_id', params.id)
      .eq('user_id', userId)
      .eq('item_id', itemId)
      .maybeSingle();

    const newVote = vote !== undefined ? vote : (existing?.vote ?? null);
    const newSaved = saved !== undefined ? saved : (existing?.saved ?? false);

    const { error } = await table.upsert(
      {
        trip_id: params.id,
        user_id: userId,
        item_id: itemId,
        item_data: itemData ?? existing?.item_data ?? {},
        vote: newVote,
        saved: newSaved,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'trip_id,user_id,item_id' }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return fresh counts for this item
  const { data: fresh } = await table
    .select('vote, user_id')
    .eq('trip_id', params.id)
    .eq('item_id', itemId);

  const upVotes = (fresh ?? []).filter((r: { vote: string }) => r.vote === 'up').length;
  const downVotes = (fresh ?? []).filter((r: { vote: string }) => r.vote === 'down').length;
  const myVote = vote;

  return NextResponse.json({ upVotes, downVotes, myVote });
}
