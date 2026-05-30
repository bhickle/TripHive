import { NextResponse } from 'next/server';
import { requireTripAccess } from '@/lib/supabase/tripAccess';
import { notifyTripMembers } from '@/lib/supabase/notify';

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

    if (error) {
      // Previously returned `{ messages: [] }` silently — that made a
      // transient DB blip look like "nobody has chatted yet" forever, with
      // no log to diagnose and no user-facing signal. Surface the failure
      // so the client can retry and we can spot it in Vercel logs.
      console.error('[messages GET] supabase error for trip', params.id, error);
      return NextResponse.json(
        { error: 'Failed to load chat messages. Please retry.' },
        { status: 500 },
      );
    }

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
    return NextResponse.json({ messages: [], error: 'DB_ERROR' }, { status: 500 });
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
    // Never persist the literal string "You" — it shows up in OTHER
    // group members' chat feeds as the sender name. Fall back through
    // profile.name → email local-part → "A traveler" so the worst-case
    // is a generic but person-shaped label, not a confusing pronoun.
    const userName = profile?.name ?? profile?.email?.split('@')[0] ?? 'A traveler';

    const { content } = await req.json();
    if (!content?.trim()) {
      return NextResponse.json({ error: 'content required' }, { status: 400 });
    }
    // Cap chat content at 4000 chars. Chat is meant for conversation,
    // not pasting essays; without a cap a single user could shove
    // arbitrary-size blobs into the realtime feed.
    const trimmed = (content as string).trim();
    if (trimmed.length > 4000) {
      return NextResponse.json({ error: 'content too long (max 4000 chars)' }, { status: 400 });
    }

    const { data: message, error } = await supabase
      .from('group_messages')
      .insert({
        trip_id: params.id,
        sender_id: userId,
        sender_name: userName,
        content: trimmed,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }

    // Fire-and-forget: notify every other trip member that a message arrived.
    // Don't await — the chat reply shouldn't block on notification fan-out.
    notifyTripMembers({
      supabase,
      tripId: params.id,
      excludeUserId: userId,
      type: 'new_message',
      fromName: userName,
      message: message.content,
    });

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
