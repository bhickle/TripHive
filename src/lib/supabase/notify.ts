import { createAdminClient } from './admin';

type AdminClient = ReturnType<typeof createAdminClient>;

interface FanOutInput {
  supabase: AdminClient;
  tripId: string;
  /** User ID who triggered the action — excluded from recipients. */
  excludeUserId: string;
  /** Notification type. Currently used: 'trip_invite', 'new_message', 'new_vote'. */
  type: string;
  /** Display name shown in the notification card. */
  fromName: string;
  /** Short body text (e.g. message snippet, vote title). */
  message: string;
}

/**
 * Fan out an in-app notification to every member of a trip (organizer +
 * trip_members rows with a populated user_id), excluding the user who
 * triggered the action. Best-effort — errors are logged but never thrown.
 *
 * Used by chat POST and group-votes POST so teammates get a notification
 * bell ping without each route having to re-implement member resolution.
 */
export async function notifyTripMembers({
  supabase,
  tripId,
  excludeUserId,
  type,
  fromName,
  message,
}: FanOutInput): Promise<void> {
  try {
    // Look up trip metadata + organizer
    const { data: trip } = await supabase
      .from('trips')
      .select('organizer_id, title')
      .eq('id', tripId)
      .maybeSingle();

    if (!trip) return;

    // Collect recipient user IDs: organizer + trip_members with a user_id,
    // minus the actor.
    const recipientIds = new Set<string>();
    if (trip.organizer_id && trip.organizer_id !== excludeUserId) {
      recipientIds.add(trip.organizer_id);
    }

    const { data: members } = await supabase
      .from('trip_members')
      .select('user_id')
      .eq('trip_id', tripId);

    for (const m of members ?? []) {
      if (m.user_id && m.user_id !== excludeUserId) {
        recipientIds.add(m.user_id);
      }
    }

    if (recipientIds.size === 0) return;

    // Truncate the message body so notifications stay scannable
    const truncated = message.length > 140 ? `${message.slice(0, 137)}…` : message;

    const rows = Array.from(recipientIds).map(user_id => ({
      user_id,
      type,
      trip_id: tripId,
      trip_name: trip.title ?? null,
      inviter_name: fromName,
      message: truncated,
    }));

    const { error } = await supabase.from('notifications').insert(rows);
    if (error) {
      console.error('[notifyTripMembers] insert failed:', error);
    }
  } catch (err) {
    console.error('[notifyTripMembers] unexpected error:', err);
  }
}
