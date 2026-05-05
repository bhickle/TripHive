import { NextResponse } from 'next/server';
import { requireTripAccess } from '@/lib/supabase/tripAccess';

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
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { supabase } = access.ctx;

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
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', userId)
      .single();
    const userName = profile?.name ?? profile?.email?.split('@')[0] ?? 'You';

    const { content } = await req.json();
    if (!content?.trim()) {
      return NextResponse.json({ error: 'content required' }, { status: 400 });
    }

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
