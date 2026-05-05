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

  const { data: membership } = await supabase
    .from('trip_members')
    .select('id')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .maybeSingle();

  return !!membership;
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
