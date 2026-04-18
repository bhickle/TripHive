import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/trips/[id]/members
 * Returns all members of a trip (organizer + trip_members).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    let userId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id ?? null;
    } catch { /* unauthenticated */ }

    if (!userId) return NextResponse.json({ members: [] });

    const supabase = createAdminClient();

    // Fetch organizer from trips table
    const { data: trip } = await supabase
      .from('trips')
      .select('organizer_id')
      .eq('id', params.id)
      .single();

    // Fetch members from trip_members (non-organizer rows)
    const { data: members } = await supabase
      .from('trip_members')
      .select('id, user_id, email, name, role, joined_at')
      .eq('trip_id', params.id)
      .order('joined_at', { ascending: true });

    // Fetch organizer profile
    let organizer: { id: string; name: string | null; email: string | null; avatar_url: string | null } | null = null;
    if (trip?.organizer_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, email, avatar_url')
        .eq('id', trip.organizer_id)
        .single();
      organizer = profile;
    }

    // Build member list: organizer first, then trip_members
    const result: Array<{
      id: string;
      name: string;
      email: string | null;
      avatarUrl: string | null;
      role: string;
      joinedAt: string;
    }> = [];

    if (organizer) {
      const alreadyInMembers = (members ?? []).some(m => m.user_id === organizer!.id);
      if (!alreadyInMembers) {
        result.push({
          id: organizer.id,
          name: organizer.name ?? organizer.email?.split('@')[0] ?? 'Organizer',
          email: organizer.email,
          avatarUrl: organizer.avatar_url,
          role: 'organizer',
          joinedAt: new Date().toISOString(),
        });
      }
    }

    for (const m of members ?? []) {
      // Try to get profile if user_id exists
      let profile: { name: string | null; avatar_url: string | null } | null = null;
      if (m.user_id) {
        const { data } = await supabase
          .from('profiles')
          .select('name, avatar_url')
          .eq('id', m.user_id)
          .single();
        profile = data;
      }
      result.push({
        id: m.user_id ?? m.id,
        name: profile?.name ?? m.name ?? m.email?.split('@')[0] ?? 'Member',
        email: m.email,
        avatarUrl: profile?.avatar_url ?? null,
        role: m.role,
        joinedAt: m.joined_at,
      });
    }

    return NextResponse.json({ members: result });
  } catch (err) {
    console.error('members route error:', err);
    return NextResponse.json({ members: [] });
  }
}

/**
 * PATCH /api/trips/[id]/members
 * Updates a member's role (e.g. promote to co_organizer or demote back to member).
 * Requires the caller to be the trip organizer with a Nomad subscription.
 * Body: { memberId: string, role: 'member' | 'co_organizer' }
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    // Auth check
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createAdminClient();

    // Only the organizer may change roles
    const { data: trip } = await supabase
      .from('trips')
      .select('organizer_id')
      .eq('id', params.id)
      .single();

    if (!trip || trip.organizer_id !== user.id) {
      return NextResponse.json({ error: 'Only the trip organizer can change roles' }, { status: 403 });
    }

    // Caller must be on Nomad
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .single();

    if (profile?.subscription_tier !== 'nomad') {
      return NextResponse.json({ error: 'Co-organizer roles require a Nomad subscription' }, { status: 403 });
    }

    const { memberId, role } = await req.json();
    if (!memberId || !['member', 'co_organizer'].includes(role)) {
      return NextResponse.json({ error: 'memberId and role (member | co_organizer) required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('trip_members')
      .update({ role })
      .eq('trip_id', params.id)
      .eq('user_id', memberId);

    if (error) {
      console.error('role update error:', error);
      return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, memberId, role });
  } catch (err) {
    console.error('PATCH members error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
