import { NextResponse } from 'next/server';
import { createClient } from './server';
import { createAdminClient } from './admin';

/**
 * Resolves the current user's ID from the Supabase session, or null if not signed in.
 */
export async function getAuthedUserId(): Promise<string | null> {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Look up the authed user's email + claim any orphaned trip_members rows.
 *
 * Background: the /join/[id] flow lets people join a trip BEFORE they have
 * a TripCoord account — they fill out their email + name and the resulting
 * trip_members row has email set but user_id = null. When that same person
 * later signs up (or signs in), their auth.uid is a fresh value that
 * doesn't match the existing row, so every member-scoped check (vote save,
 * pack visibility, etc.) treats them as not-a-member and 403s.
 *
 * Fix: on every access check, find any trip_members rows for THIS trip
 * where email matches the authed user but user_id is null, and claim them
 * by setting user_id. After the first hit, subsequent calls are normal
 * user_id lookups.
 *
 * Returns the user's email (or null if we can't resolve it) so callers
 * can do the email-based fallback themselves on the same query.
 */
async function getEmailAndClaimOrphans(
  supabase: ReturnType<typeof createAdminClient>,
  tripId: string,
  userId: string,
): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle();
  const email = profile?.email ?? null;
  if (!email) return null;

  // Claim any rows with this email but no user_id. ilike for case-insensitive
  // match — emails are stored as the user typed them, but the auth address
  // might be normalised.
  await supabase
    .from('trip_members')
    .update({ user_id: userId })
    .eq('trip_id', tripId)
    .is('user_id', null)
    .ilike('email', email);

  return email;
}

/**
 * Returns true if the user is the trip organizer or a confirmed trip_member.
 */
export async function verifyTripAccess(
  supabase: ReturnType<typeof createAdminClient>,
  tripId: string,
  userId: string,
): Promise<boolean> {
  const { data: trip } = await supabase
    .from('trips')
    .select('organizer_id')
    .eq('id', tripId)
    .maybeSingle();

  if (!trip) return false;
  if (trip.organizer_id === userId) return true;

  // Claim any guest-flow orphan rows for this user before the lookup.
  await getEmailAndClaimOrphans(supabase, tripId, userId);

  const { data: membership } = await supabase
    .from('trip_members')
    .select('id')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle();

  return !!membership;
}

/**
 * Resolves the caller's role on a given trip.
 * - 'organizer'     → trips.organizer_id matches
 * - 'co_organizer'  → trip_members.role = 'co_organizer'
 * - 'member'        → trip_members row exists with any other role
 * - null            → not on this trip
 *
 * Used by routes that need finer-grained authorization than "are they on the
 * trip" (e.g. only co-organizers can edit destination/dates, but any member
 * can vote on activities).
 */
export type TripRole = 'organizer' | 'co_organizer' | 'member';

export async function getTripRole(
  supabase: ReturnType<typeof createAdminClient>,
  tripId: string,
  userId: string,
): Promise<TripRole | null> {
  const { data: trip } = await supabase
    .from('trips')
    .select('organizer_id')
    .eq('id', tripId)
    .maybeSingle();

  if (!trip) return null;
  if (trip.organizer_id === userId) return 'organizer';

  // Claim any guest-flow orphan rows for this user before the lookup.
  await getEmailAndClaimOrphans(supabase, tripId, userId);

  const { data: membership } = await supabase
    .from('trip_members')
    .select('role')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership) return null;
  return membership.role === 'co_organizer' ? 'co_organizer' : 'member';
}

/**
 * Combined helper: validates auth + trip membership in one call.
 * Returns { ok: true, ctx } with userId + admin supabase client on success,
 * or { ok: false, response } with a ready-to-return 401/403 NextResponse.
 *
 * Usage:
 *   const access = await requireTripAccess(params.id);
 *   if (!access.ok) return access.response;
 *   const { userId, supabase } = access.ctx;
 */
export async function requireTripAccess(tripId: string): Promise<
  | { ok: true; ctx: { userId: string; supabase: ReturnType<typeof createAdminClient> } }
  | { ok: false; response: NextResponse }
> {
  const userId = await getAuthedUserId();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const supabase = createAdminClient();
  const hasAccess = await verifyTripAccess(supabase, tripId, userId);
  if (!hasAccess) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { ok: true, ctx: { userId, supabase } };
}

/**
 * Stricter variant of requireTripAccess: also enforces that the caller is
 * the trip organizer or co-organizer. Used by AI-spending endpoints —
 * only org/co-org can burn the trip's AI credit budget (per Brandon's
 * 2026-05-16 product decision).
 *
 * Plain members can still submit preferences, vote on activities, chat,
 * upload photos, manage their own packing/souvenir lists — those are
 * non-AI actions. This guard exists specifically to prevent any of the
 * 6+ members on a trip from each firing a Suggest Another or regen and
 * burning through the pass's 50-credit budget in minutes.
 *
 * Returns 403 with a clear, member-facing error when the caller is a
 * plain member.
 */
export async function requireTripAiRole(tripId: string): Promise<
  | { ok: true; ctx: { userId: string; supabase: ReturnType<typeof createAdminClient>; role: 'organizer' | 'co_organizer' } }
  | { ok: false; response: NextResponse }
> {
  const access = await requireTripAccess(tripId);
  if (!access.ok) return access;
  const { userId, supabase } = access.ctx;
  const role = await getTripRole(supabase, tripId, userId);
  if (role !== 'organizer' && role !== 'co_organizer') {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'AI actions require organizer or co-organizer role',
          message: 'Only the trip organizer (or co-organizer) can trigger AI changes on this trip. Ask them to do it for you.',
        },
        { status: 403 },
      ),
    };
  }
  return { ok: true, ctx: { userId, supabase, role } };
}
