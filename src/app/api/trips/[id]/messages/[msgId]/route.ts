import { NextResponse } from 'next/server';
import { requireTripAccess } from '@/lib/supabase/tripAccess';

/**
 * PATCH /api/trips/[id]/messages/[msgId]
 * Toggle an emoji reaction on a message. Caller must be organizer or trip member.
 * Body: { emoji: string }
 *
 * Reactions are stored as { "emoji": ["userId1", "userId2", ...] } in the reactions JSONB column.
 * Adding: appends userId to the emoji array.
 * Removing: removes userId from the emoji array (if empty, key can remain as []).
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; msgId: string } }
) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    const { emoji } = await req.json();
    if (!emoji || typeof emoji !== 'string') {
      return NextResponse.json({ error: 'emoji required' }, { status: 400 });
    }

    // Fetch current message
    const { data: message, error: fetchError } = await supabase
      .from('group_messages')
      .select('id, trip_id, reactions')
      .eq('id', params.msgId)
      .eq('trip_id', params.id)
      .maybeSingle();

    if (fetchError || !message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    // Parse existing reactions: { emoji: userId[] }
    const currentReactions: Record<string, string[]> = {};
    if (message.reactions && typeof message.reactions === 'object' && !Array.isArray(message.reactions)) {
      for (const [key, val] of Object.entries(message.reactions as Record<string, unknown>)) {
        if (Array.isArray(val)) {
          currentReactions[key] = val as string[];
        }
      }
    }

    // Toggle: add if not present, remove if present
    const users = currentReactions[emoji] ?? [];
    const idx = users.indexOf(userId);
    if (idx >= 0) {
      users.splice(idx, 1);
    } else {
      users.push(userId);
    }
    currentReactions[emoji] = users;

    // Save back
    const { error: updateError } = await supabase
      .from('group_messages')
      .update({ reactions: currentReactions })
      .eq('id', params.msgId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update reaction' }, { status: 500 });
    }

    return NextResponse.json({ reactions: currentReactions });
  } catch (err) {
    console.error('reaction PATCH error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
