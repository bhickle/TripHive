import { NextResponse } from 'next/server';
import { requireTripAccess } from '@/lib/supabase/tripAccess';

/**
 * PATCH  /api/trips/[id]/photos/[photoId]/comments/[commentId]
 *   Author-only edit. Body: { body: string }. Stamps updated_at so the UI
 *   can show an "edited" marker.
 *
 * DELETE /api/trips/[id]/photos/[photoId]/comments/[commentId]
 *   Authors can delete their own comments. Trip organizers can delete any
 *   comment on the trip (basic moderation). Anyone else gets 403.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; photoId: string; commentId: string } },
) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    const { body } = await req.json();
    const trimmed = typeof body === 'string' ? body.trim() : '';
    if (!trimmed) return NextResponse.json({ error: 'body required' }, { status: 400 });
    if (trimmed.length > 500) {
      return NextResponse.json({ error: 'Comment too long (500 char max)' }, { status: 400 });
    }

    // Confirm the comment exists on this trip+photo and the caller is the
    // author. Edit is author-only — organizers can delete (moderation)
    // but rewriting another person's words is a different problem and
    // not exposed.
    const { data: comment } = await supabase
      .from('photo_comments')
      .select('user_id, trip_id, photo_id')
      .eq('id', params.commentId)
      .maybeSingle();
    if (!comment || comment.trip_id !== params.id || comment.photo_id !== params.photoId) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }
    if (comment.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: updated, error } = await supabase
      .from('photo_comments')
      .update({ body: trimmed, updated_at: new Date().toISOString() })
      .eq('id', params.commentId)
      .select('id, body, author_name, user_id, created_at, updated_at')
      .single();

    if (error || !updated) {
      console.error('photo comment PATCH error:', error);
      return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
    }

    // Surface the current display name so an edit-then-render in the
    // same session reflects the user's latest profile name, matching
    // the GET endpoint's behavior.
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', updated.user_id)
      .maybeSingle();

    return NextResponse.json({
      comment: {
        id: updated.id,
        body: updated.body,
        authorName: profile?.name ?? updated.author_name ?? 'Unknown',
        userId: updated.user_id,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
        edited: !!updated.updated_at,
      },
    });
  } catch (err) {
    console.error('photo comment PATCH threw:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; photoId: string; commentId: string } },
) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    // Look up the comment first so we can authorize the delete. Without
    // this, RLS would still gate inserts but a trip organizer wouldn't be
    // able to moderate comments they didn't author.
    const { data: comment } = await supabase
      .from('photo_comments')
      .select('user_id, trip_id, photo_id')
      .eq('id', params.commentId)
      .maybeSingle();

    if (!comment || comment.trip_id !== params.id || comment.photo_id !== params.photoId) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    let canDelete = comment.user_id === userId;
    if (!canDelete) {
      // Allow trip organizer to moderate
      const { data: trip } = await supabase
        .from('trips')
        .select('organizer_id')
        .eq('id', params.id)
        .maybeSingle();
      canDelete = !!trip && trip.organizer_id === userId;
    }
    if (!canDelete) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('photo_comments')
      .delete()
      .eq('id', params.commentId);

    if (error) {
      console.error('photo comment DELETE error:', error);
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('photo comment DELETE threw:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
