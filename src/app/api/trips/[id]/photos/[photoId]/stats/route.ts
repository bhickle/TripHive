import { NextResponse } from 'next/server';
import { requireTripAccess } from '@/lib/supabase/tripAccess';

/**
 * GET /api/trips/[id]/photos/[photoId]/stats
 * Light endpoint returning just like + comment counts and viewer-liked
 * state for a single photo. Used by the realtime subscription on the
 * open photo modal so a like change in another tab doesn't force a full
 * /photos refetch (which is wasteful for albums >50 photos).
 */
export async function GET(_req: Request, { params }: { params: { id: string; photoId: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    // Verify the photo lives on this trip — same gate the modal-side
    // routes apply, so a stats lookup can't leak counts cross-trip.
    const { data: photo } = await supabase
      .from('trip_photos')
      .select('id')
      .eq('id', params.photoId)
      .eq('trip_id', params.id)
      .maybeSingle();
    if (!photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });

    const [
      { count: likeCount },
      { count: commentCount },
      { data: viewerLike },
    ] = await Promise.all([
      supabase.from('photo_likes').select('id', { count: 'exact', head: true }).eq('photo_id', params.photoId),
      supabase.from('photo_comments').select('id', { count: 'exact', head: true }).eq('photo_id', params.photoId),
      supabase.from('photo_likes').select('id').eq('photo_id', params.photoId).eq('user_id', userId).maybeSingle(),
    ]);

    return NextResponse.json({
      likeCount: likeCount ?? 0,
      commentCount: commentCount ?? 0,
      viewerLiked: !!viewerLike,
    });
  } catch (err) {
    console.error('photo stats GET error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
