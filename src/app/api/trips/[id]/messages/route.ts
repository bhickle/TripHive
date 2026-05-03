import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/trips/[id]/messages
 * Returns all chat messages for a trip.
 * Requires the caller to be the trip organizer or a member.
 *
 * POST /api/trips/[id]/messages
 * Sends a new message.
 * Body: { content: string }
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    // Auth check
    let userId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id ?? null;
    } catch { /* auth failed */ }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Verify caller is organizer or member of this trip
    const { data: trip } = await supabase
      .from('trips')
      .select('organizer_id')
      .eq('id', params.id)
      .maybeSingle();

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    if (trip.organizer_id !== userId) {
      const { data: membership } = await supabase
        .from('trip_members')
        .select('id')
        .eq('trip_id', params.id)
        .eq('user_id', userId)
        .maybeSingle();

      if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { data: messages, error } = await supabase
      .from('group_messages')
      .select('id, sender_id, sender_name, content, created_at, reactions')
      .eq('trip_id', params.id)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) return NextResponse.json({ messages: [] });

    return NextResponse.json({
      messages: (messages ?? []).map(m => ({
        id: m.id,
        senderName: m.sender_name,
        senderId: m.sender_id,
        content: m.content,
        createdAt: m.created_at,
        reactions: m.reactions ?? {},
        isOwn: false, // client sets this based on auth user
      })),
    });
  } catch (err) {
    console.error('messages GET error:', err);
    return NextResponse.json({ messages: [] });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    let userId: string | null = null;
    let userName = 'Anonymous';
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id ?? null;
      if (userId) {
        const supabase = createAdminClient();
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, email')
          .eq('id', userId)
          .single();
        userName = profile?.name ?? profile?.email?.split('@')[0] ?? 'You';
      }
    } catch { /* unauthenticated */ }

    const { content } = await req.json();
    if (!content?.trim()) {
      return NextResponse.json({ error: 'content required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: message, error } = await supabase
      .from('group_messages')
      .insert({
        trip_id: params.id,
        sender_id: userId,
        sender_name: userName,
        content: content.trim(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }

    return NextResponse.json({
      message: {
        id: message.id,
        senderName: message.sender_name,
        senderId: message.sender_id,
        content: message.content,
        createdAt: message.created_at,
        isOwn: true,
      },
    });
  } catch (err) {
    console.error('messages POST error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
