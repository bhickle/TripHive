import { NextResponse } from 'next/server';
import { requireTripAccess } from '@/lib/supabase/tripAccess';

/**
 * GET  /api/trips/[id]/photos/[photoId]/comments
 *   Returns all comments for a photo, oldest first.
 *
 * POST /api/trips/[id]/photos/[photoId]/comments
 *   Body: { body: string }
 *   Inserts a comment authored by the caller.
 *
 * Auth: trip member only.
 */
export async function GET(_req: Request, { params }: { params: { id: string; photoId: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { supabase } = access.ctx;

    const { data, error } = await supabase
      .from('photo_comments')
      .select('id, body, author_name, user_id, created_at, updated_at')
      .eq('photo_id', params.photoId)
      .eq('trip_id', params.id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('photo comments GET error:', error);
      return NextResponse.json({ comments: [] });
    }

    // Resolve current profile names so renaming in settings flows through
    // to existing comments — author_name was snapshotted at insert time
    // and goes stale otherwise. One batched lookup; falls back to the
    // stored snapshot if the profile is missing for any reason.
    const userIds = Array.from(new Set((data ?? []).map(c => c.user_id)));
    const liveNames: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name')
        .in('id', userIds);
      for (const p of profiles ?? []) {
        if (p.name) liveNames[p.id] = p.name;
      }
    }

    return NextResponse.json({
      comments: (data ?? []).map(c => ({
        id: c.id,
        body: c.body,
        authorName: liveNames[c.user_id] ?? c.author_name ?? 'Unknown',
        userId: c.user_id,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        edited: c.updated_at !== null,
      })),
    });
  } catch (err) {
    console.error('photo comments GET threw:', err);
    return NextResponse.json({ comments: [] });
  }
}

export async function POST(req: Request, { params }: { params: { id: string; photoId: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    const { body } = await req.json();
    const trimmed = typeof body === 'string' ? body.trim() : '';
    if (!trimmed) {
      return NextResponse.json({ error: 'body required' }, { status: 400 });
    }
    if (trimmed.length > 500) {
      return NextResponse.json({ error: 'Comment too long (500 char max)' }, { status: 400 });
    }

    // Verify the photo lives on this trip — prevents URL-poking from
    // attaching comments to photos the caller can't even see.
    const { data: photo } = await supabase
      .from('trip_photos')
      .select('id')
      .eq('id', params.photoId)
      .eq('trip_id', params.id)
      .maybeSingle();
    if (!photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });

    // Pull the commenter's display name from profiles for `author_name` —
    // denormalized so the comment list endpoint doesn't have to join.
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', userId)
      .maybeSingle();

    const { data: inserted, error: insertErr } = await supabase
      .from('photo_comments')
      .insert({
        photo_id: params.photoId,
        trip_id: params.id,
        user_id: userId,
        author_name: profile?.name ?? null,
        body: trimmed,
      })
      .select('id, body, author_name, user_id, created_at')
      .single();

    if (insertErr || !inserted) {
      console.error('photo comment insert error:', insertErr);
      return NextResponse.json({ error: 'Failed to post comment' }, { status: 500 });
    }

    return NextResponse.json({
      comment: {
        id: inserted.id,
        body: inserted.body,
        authorName: inserted.author_name ?? 'Unknown',
        userId: inserted.user_id,
        createdAt: inserted.created_at,
      },
    });
  } catch (err) {
    console.error('photo comments POST threw:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
