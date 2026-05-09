import { NextResponse } from 'next/server';
import { requireTripAccess } from '@/lib/supabase/tripAccess';

/**
 * POST   /api/trips/[id]/photos/[photoId]/like  — like a photo
 * DELETE /api/trips/[id]/photos/[photoId]/like  — unlike
 *
 * Auth: trip member (organizer or invited). Likes themselves are public-
 * read at the RLS level — counts can be aggregated in the photo list
 * endpoint without per-row gating — but inserts are gated to the caller's
 * own user_id by the RLS policy + verified here against trip membership.
 */

export async function POST(_req: Request, { params }: { params: { id: string; photoId: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    // Verify the photo lives on this trip — prevents URL-poking from
    // attaching likes to photos the caller can't see.
    const { data: photo } = await supabase
      .from('trip_photos')
      .select('id')
      .eq('id', params.photoId)
      .eq('trip_id', params.id)
      .maybeSingle();
    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    const { error: insertErr } = await supabase
      .from('photo_likes')
      .insert({ photo_id: params.photoId, trip_id: params.id, user_id: userId });

    // 23505 is the unique-constraint violation (already liked) — treat as
    // idempotent so the client can call POST repeatedly without breaking.
    if (insertErr && insertErr.code !== '23505') {
      console.error('photo like insert error:', insertErr);
      return NextResponse.json({ error: 'Failed to like' }, { status: 500 });
    }

    const { count } = await supabase
      .from('photo_likes')
      .select('id', { count: 'exact', head: true })
      .eq('photo_id', params.photoId);

    return NextResponse.json({ liked: true, count: count ?? 0 });
  } catch (err) {
    console.error('photo like POST error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; photoId: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    const { error: delErr } = await supabase
      .from('photo_likes')
      .delete()
      .eq('photo_id', params.photoId)
      .eq('trip_id', params.id)
      .eq('user_id', userId);

    if (delErr) {
      console.error('photo like delete error:', delErr);
      return NextResponse.json({ error: 'Failed to unlike' }, { status: 500 });
    }

    const { count } = await supabase
      .from('photo_likes')
      .select('id', { count: 'exact', head: true })
      .eq('photo_id', params.photoId);

    return NextResponse.json({ liked: false, count: count ?? 0 });
  } catch (err) {
    console.error('photo like DELETE error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
