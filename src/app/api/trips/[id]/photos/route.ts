import { NextResponse } from 'next/server';
import { requireTripAccess } from '@/lib/supabase/tripAccess';

/**
 * GET /api/trips/[id]/photos
 * Returns all photos for a trip, plus per-photo like + comment counts and
 * whether the caller has liked each one. Caller must be the trip organizer
 * or a member.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    const { data: photos, error } = await supabase
      .from('trip_photos')
      .select('id, public_url, uploader_name, uploaded_by, day_number, caption, taken_at, created_at')
      .eq('trip_id', params.id)
      .order('created_at', { ascending: true });

    if (error) return NextResponse.json({ photos: [] });

    // Aggregate likes + comments in two batched reads so we don't fan out
    // one round-trip per photo. For a 50-photo album this keeps the GET
    // at three queries total instead of 1 + 100.
    const photoIds = (photos ?? []).map(p => p.id);
    const likesByPhoto: Record<string, number> = {};
    const commentsByPhoto: Record<string, number> = {};
    const viewerLikedSet = new Set<string>();

    if (photoIds.length > 0) {
      const [{ data: likes }, { data: comments }] = await Promise.all([
        supabase.from('photo_likes').select('photo_id, user_id').in('photo_id', photoIds),
        supabase.from('photo_comments').select('photo_id').in('photo_id', photoIds),
      ]);
      for (const l of likes ?? []) {
        likesByPhoto[l.photo_id] = (likesByPhoto[l.photo_id] ?? 0) + 1;
        if (l.user_id === userId) viewerLikedSet.add(l.photo_id);
      }
      for (const c of comments ?? []) {
        commentsByPhoto[c.photo_id] = (commentsByPhoto[c.photo_id] ?? 0) + 1;
      }
    }

    return NextResponse.json({
      photos: (photos ?? []).map(p => ({
        id: p.id,
        url: p.public_url,
        // uploaderName is the snapshot of the profile name at upload
        // time; uploaderId is the FK so the client can filter by
        // user (and resolve the live name from group members) without
        // fighting renames or the legacy "You" placeholder.
        uploadedBy: p.uploader_name ?? 'Unknown',
        uploaderId: p.uploaded_by ?? null,
        day: p.day_number ?? 1,
        activity: p.caption ?? '',
        timestamp: p.taken_at ?? p.created_at,
        likeCount: likesByPhoto[p.id] ?? 0,
        commentCount: commentsByPhoto[p.id] ?? 0,
        viewerLiked: viewerLikedSet.has(p.id),
      })),
    });
  } catch (err) {
    console.error('photos GET error:', err);
    return NextResponse.json({ photos: [] });
  }
}
