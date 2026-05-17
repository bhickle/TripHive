import { createAdminClient } from './admin';

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Maps a notification type → the user-facing preference toggle that gates it.
 * Types NOT in this map are always delivered (critical: trip_invite,
 * payment_failed, partner_added — you NEED to know these regardless of
 * settings). Toggleable types respect the user's profiles.notification_
 * preferences JSON; missing or null prefs default to "true" (opt-in by
 * default — matches DEFAULT_NOTIFICATIONS in settings/Client.tsx).
 *
 * The settings page exposes 6 toggles total; only the ones with a
 * corresponding event currently get gated. Others (email, push, marketing,
 * expenseAlerts) are wired into the UI but don't gate any notification
 * type because their underlying features aren't implemented yet.
 */
const NOTIFICATION_TYPE_TO_PREF_KEY: Record<string, string | undefined> = {
  new_vote:           'voteAlerts',
  pass_pending_prefs: 'tripReminders',
  // Always-delivered (omitted intentionally):
  //   trip_invite, partner_added, payment_failed, member_joined,
  //   badge_earned, new_message
};

/**
 * Single-user pref check for code paths that insert a notification directly
 * (not via notifyTripMembers). E.g. the preferences-fallback cron inserts a
 * pass_pending_prefs notification for the trip's organizer; this helper
 * lets that code respect the organizer's notification settings.
 *
 * Returns true (allowed) for any type NOT in the gating map — same fail-
 * open behavior as notifyTripMembers (critical types bypass; missing prefs
 * default to opted-in).
 */
export async function isNotificationAllowedForUser(
  supabase: AdminClient,
  userId: string,
  type: string,
): Promise<boolean> {
  const prefKey = NOTIFICATION_TYPE_TO_PREF_KEY[type];
  if (!prefKey) return true; // type isn't gated
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('notification_preferences')
      .eq('id', userId)
      .maybeSingle();
    const prefs = (profile?.notification_preferences ?? {}) as Record<string, unknown>;
    return prefs[prefKey] !== false;
  } catch {
    // Fail-open: don't drop notifications on a profile-fetch hiccup.
    return true;
  }
}

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

    // Honor notification preferences — only for types in the gating map.
    // Critical types (trip_invite, payment_failed) bypass this check entirely.
    // Missing-prefs / null-prefs default to "allowed" (opt-out, not opt-in).
    const prefKey = NOTIFICATION_TYPE_TO_PREF_KEY[type];
    let filteredRecipientIds = Array.from(recipientIds);
    if (prefKey) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, notification_preferences')
        .in('id', filteredRecipientIds);
      const allowed = new Set<string>();
      for (const p of profiles ?? []) {
        const prefs = (p.notification_preferences ?? {}) as Record<string, unknown>;
        // Explicit false suppresses; everything else (true, missing, null)
        // counts as opted-in. This matches the settings UI default state.
        if (prefs[prefKey] !== false) allowed.add(p.id);
      }
      // Profiles we couldn't fetch (deleted user, RLS oddity) still count as
      // allowed — we'd rather notify than silently drop. The .insert below
      // will FK-fail for non-existent profiles, which is the right outcome.
      for (const id of filteredRecipientIds) {
        if (!profiles?.find(p => p.id === id)) allowed.add(id);
      }
      filteredRecipientIds = Array.from(allowed);
      if (filteredRecipientIds.length === 0) return;
    }

    // Truncate the message body so notifications stay scannable
    const truncated = message.length > 140 ? `${message.slice(0, 137)}…` : message;

    const rows = filteredRecipientIds.map(user_id => ({
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
