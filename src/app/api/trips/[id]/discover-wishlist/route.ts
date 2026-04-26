import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireAuth } from '@/lib/supabase/requireAuth';

/**
 * GET /api/trips/[id]/discover-wishlist
 * Returns all wishlist votes for a trip, grouped by item.
 * Shape: { items: WishlistItem[] }
 * where WishlistItem = { itemId, itemData, upVotes, downVotes, myVote: 'up'|'down'|null }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Auth optional — unauthenticated users get myVote: null
  let myUserId: string | null = null;
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    myUserId = user?.id ?? null;
  } catch { /* ignore */ }

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any)
    .from('discover_wishlist')
    .select('item_id, item_data, vote, user_id')
    .eq('trip_id', params.id);

  if (error) return NextResponse.json({ items: [] });

  // Group by item_id
  const byItem: Record<string, {
    itemData: unknown;
    upVotes: number;
    downVotes: number;
    myVote: 'up' | 'down' | null;
  }> = {};

  for (const row of (rows ?? [])) {
    if (!byItem[row.item_id]) {
      byItem[row.item_id] = { itemData: row.item_data, upVotes: 0, downVotes: 0, myVote: null };
    }
    if (row.vote === 'up') byItem[row.item_id].upVotes++;
    if (row.vote === 'down') byItem[row.item_id].downVotes++;
    if (row.user_id === myUserId) byItem[row.item_id].myVote = row.vote;
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
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { itemId, itemData, vote } = body as {
    itemId: string;
    itemData: unknown;
    vote: 'up' | 'down' | null;
  };

  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = (supabase as any).from('discover_wishlist');

  if (vote === null) {
    await table.delete()
      .eq('trip_id', params.id)
      .eq('user_id', user.id)
      .eq('item_id', itemId);
  } else {
    const { error } = await table.upsert(
      {
        trip_id: params.id,
        user_id: user.id,
        item_id: itemId,
        item_data: itemData ?? {},
        vote,
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
