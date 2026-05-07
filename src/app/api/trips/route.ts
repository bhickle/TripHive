import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/trips
 * Returns trips the current user is on — both ones they organized and ones
 * they were invited to. Each row includes:
 *   - role: 'organizer' | 'co_organizer' | 'member'
 *   - organizerName / organizerEmail: who runs the trip (for "Shared with me")
 *   - memberNames: comma-list of all members on the trip (for people search)
 *
 * Returns [] for unauthenticated requests.
 */
export async function GET() {
  try {
    let userId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      // Auth check failed — return empty list
    }

    if (!userId) {
      return NextResponse.json({ trips: [] });
    }

    const supabase = createAdminClient();

    // 1) Trips where the user is the organizer
    const ownedQuery = supabase
      .from('trips')
      .select('id, title, destination, start_date, end_date, trip_length, status, group_type, group_size, cover_image, created_at, organizer_id')
      .eq('organizer_id', userId);

    // 2) Trip IDs where the user is a member (not organizer)
    const memberRowsQuery = supabase
      .from('trip_members')
      .select('trip_id, role')
      .eq('user_id', userId);

    const [ownedRes, memberRowsRes] = await Promise.all([ownedQuery, memberRowsQuery]);

    if (ownedRes.error) {
      console.error('List trips (owned) error:', JSON.stringify(ownedRes.error));
      return NextResponse.json({ error: 'Failed to load trips' }, { status: 500 });
    }

    const ownedTrips = ownedRes.data ?? [];
    const memberRows = memberRowsRes.data ?? [];

    // Fetch invited-trip rows for any trip IDs where the user is a member
    // (excluding ones they own — defensive in case both rows somehow exist)
    const ownedIds = new Set(ownedTrips.map(t => t.id));
    const invitedTripIds = memberRows
      .map(m => m.trip_id)
      .filter(id => !ownedIds.has(id));

    let invitedTrips: typeof ownedTrips = [];
    if (invitedTripIds.length > 0) {
      const { data: invited } = await supabase
        .from('trips')
        .select('id, title, destination, start_date, end_date, trip_length, status, group_type, group_size, cover_image, created_at, organizer_id')
        .in('id', invitedTripIds);
      invitedTrips = invited ?? [];
    }

    const allTripRows = [...ownedTrips, ...invitedTrips];
    if (allTripRows.length === 0) {
      return NextResponse.json({ trips: [] });
    }

    // Look up member roster + organizer profiles in one go so we can attach
    // `memberNames` (for people search) and `organizerName` (for the "Shared
    // with me" label).
    const allTripIds = allTripRows.map(t => t.id);
    const allOrganizerIds = Array.from(new Set(
      allTripRows.map(t => t.organizer_id).filter((id): id is string => !!id),
    ));

    const [membersRes, organizersRes] = await Promise.all([
      supabase
        .from('trip_members')
        .select('trip_id, name, email, role')
        .in('trip_id', allTripIds),
      allOrganizerIds.length > 0
        ? supabase
            .from('profiles')
            .select('id, name, email')
            .in('id', allOrganizerIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string | null; email: string | null }> }),
    ]);

    const membersByTrip = new Map<string, Array<{ name?: string | null; email?: string | null }>>();
    for (const m of membersRes.data ?? []) {
      const list = membersByTrip.get(m.trip_id) ?? [];
      list.push({ name: m.name, email: m.email });
      membersByTrip.set(m.trip_id, list);
    }

    const organizersById = new Map<string, { name: string | null; email: string | null }>();
    for (const p of organizersRes.data ?? []) {
      organizersById.set(p.id, { name: p.name, email: p.email });
    }

    const memberRoleByTrip = new Map<string, string>();
    for (const m of memberRows) memberRoleByTrip.set(m.trip_id, m.role);

    const trips = allTripRows.map(t => {
      const isOwner = t.organizer_id === userId;
      const role: 'organizer' | 'co_organizer' | 'member' = isOwner
        ? 'organizer'
        : (memberRoleByTrip.get(t.id) === 'co_organizer' ? 'co_organizer' : 'member');
      const memberRoster = membersByTrip.get(t.id) ?? [];
      const memberNames = memberRoster
        .map(m => m.name?.trim() || m.email?.trim())
        .filter((s): s is string => !!s)
        .join(', ');
      const organizer = organizersById.get(t.organizer_id ?? '');
      return {
        ...t,
        role,
        organizerName: organizer?.name ?? null,
        organizerEmail: organizer?.email ?? null,
        memberNames,
      };
    });

    // Sort: owned first, then most recent
    trips.sort((a, b) => {
      const ownDelta = (a.role === 'organizer' ? 0 : 1) - (b.role === 'organizer' ? 0 : 1);
      if (ownDelta !== 0) return ownDelta;
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });

    return NextResponse.json({ trips });
  } catch (err) {
    console.error('List trips error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
