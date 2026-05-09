import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';

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

    // Fetch members from trip_members (non-organizer rows). `preferences` is
    // included so the Crew Readiness panel can show per-member submission
    // state without a second round-trip.
    const { data: members } = await supabase
      .from('trip_members')
      .select('id, user_id, email, name, role, joined_at, preferences')
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
      preferencesSubmittedAt: string | null;
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
          // Organizer fills the full Trip Builder, not the mini-wizard, so
          // their readiness is always "ready" for the Crew Readiness panel.
          preferencesSubmittedAt: new Date().toISOString(),
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
      // Pull submittedAt off the JSON if present. Guests joining via the
      // open share-link flow always set this on submit; tokenless joins
      // before this commit may not have it, in which case we fall back to
      // joined_at so the panel doesn't flag long-standing members as pending.
      const prefs = m.preferences as { submittedAt?: string } | null;
      const preferencesSubmittedAt = prefs?.submittedAt ?? null;
      result.push({
        id: m.user_id ?? m.id,
        name: profile?.name ?? m.name ?? m.email?.split('@')[0] ?? 'Member',
        email: m.email,
        avatarUrl: profile?.avatar_url ?? null,
        role: m.role,
        joinedAt: m.joined_at,
        preferencesSubmittedAt,
      });
    }

    return NextResponse.json({ members: result });
  } catch (err) {
    console.error('members route error:', err);
    return NextResponse.json({ members: [] });
  }
}

/**
 * POST /api/trips/[id]/members
 * Adds a member to the trip. Works for both:
 *   - Authenticated users (user_id is set from session)
 *   - Guest joiners (user_id is null; name + email stored directly)
 * Body: { name: string, email?: string, preferences?: object }
 *
 * Privacy modes:
 *   - PUBLIC trip (default, trips.is_private = false): anyone with the
 *     trip UUID can POST and join — the open share-link UX. An invite
 *     token is honored if present (Phase 1 audit trail) but not required.
 *   - PRIVATE trip (trips.is_private = true, Phase 2): a valid +
 *     unconsumed invite token is REQUIRED. Tokenless joins are rejected
 *     with 403. Organizer-issued tokens come from /api/invite/email or
 *     /api/invite/sms and are passed back via the /join/[id] URL.
 *
 * Existing trips default to is_private = false so all current share
 * links keep working unchanged. Toggle is on the trip's group page.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createAdminClient();

    // Check if the trip exists + read the privacy flag for the gate below.
    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .select('id, organizer_id, is_private')
      .eq('id', params.id)
      .single();

    if (tripErr || !trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const body = await req.json();
    const { name, email, preferences, inviteToken } = body as {
      name?: string;
      email?: string;
      preferences?: object;
      inviteToken?: string;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // ── Privacy gate: private trips require a valid invite token ───────────
    // Public trips (is_private = false) preserve the open share-link UX:
    // tokens are validated when present but not required. Private trips
    // (is_private = true) reject tokenless joins with 403, and an invalid
    // / mismatched / expired / consumed token also fails. The validation
    // below runs the same logic for both modes — only the "no token at
    // all" case differs.
    let consumedInviteId: string | null = null;
    if (trip.is_private && !inviteToken) {
      return NextResponse.json(
        { error: 'This trip is private. You need an invite from the organizer to join.' },
        { status: 403 },
      );
    }
    if (inviteToken) {
      const { data: invite } = await supabase
        .from('trip_invites')
        .select('id, trip_id, status, expires_at')
        .eq('token', inviteToken)
        .maybeSingle();
      if (!invite) {
        return NextResponse.json({ error: 'Invalid invite token' }, { status: 400 });
      }
      if (invite.trip_id !== params.id) {
        return NextResponse.json({ error: 'Invite token does not match this trip' }, { status: 400 });
      }
      if (invite.status === 'accepted') {
        // Idempotent re-join is fine; return ok without re-consuming. The
        // trip_members row check below will catch dupes.
      } else if (invite.status && invite.status !== 'pending') {
        return NextResponse.json({ error: `Invite is ${invite.status}` }, { status: 400 });
      }
      if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
        return NextResponse.json({ error: 'Invite expired' }, { status: 400 });
      }
      consumedInviteId = invite.id;
    }

    // Try to detect an authenticated user
    let userId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id ?? null;
    } catch { /* unauthenticated guest — that's fine */ }

    // Don't add the organizer as a member
    if (userId && userId === trip.organizer_id) {
      return NextResponse.json({ ok: true, alreadyOrganizer: true });
    }

    // Upsert: avoid duplicates (same user_id or same email for guests)
    if (userId) {
      const { data: existing } = await supabase
        .from('trip_members')
        .select('id')
        .eq('trip_id', params.id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ ok: true, alreadyMember: true });
      }
    } else if (email?.trim()) {
      const { data: existing } = await supabase
        .from('trip_members')
        .select('id')
        .eq('trip_id', params.id)
        .eq('email', email.trim())
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ ok: true, alreadyMember: true });
      }
    }

    const { error: insertErr } = await supabase
      .from('trip_members')
      .insert({
        trip_id: params.id,
        name: name.trim(),
        email: email?.trim() ?? null,
        role: 'member',
        joined_at: new Date().toISOString(),
        user_id: userId ?? undefined,
        preferences: preferences ? (preferences as Json) : undefined,
      });

    if (insertErr) {
      console.error('POST members insert error:', insertErr);
      return NextResponse.json({ error: 'Failed to join trip' }, { status: 500 });
    }

    // Mark the invite as accepted so the same token can't be reused. Best-
    // effort: don't fail the join if this update errors — the member is in,
    // we just lose the audit signal AND lose the protection against the
    // same token being reused. Log loudly so a recurring failure surfaces
    // in logs even though we don't error to the client.
    if (consumedInviteId) {
      const { error: inviteUpdateErr } = await supabase
        .from('trip_invites')
        .update({ status: 'accepted' })
        .eq('id', consumedInviteId);
      if (inviteUpdateErr) console.error('trip_invites accepted-flag update failed:', consumedInviteId, inviteUpdateErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST members error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
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
