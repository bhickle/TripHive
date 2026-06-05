import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';
import { getTripRole, requireTripAccess } from '@/lib/supabase/tripAccess';
import { TIER_LIMITS, normalizeTier } from '@/lib/types';
import { PRICING } from '@/hooks/useEntitlements';

/**
 * GET /api/trips/[id]/members
 * Returns all members of a trip (organizer + trip_members).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    // Membership gate: only the organizer or a member may read the roster.
    // Previously any logged-in user could read any trip's full member list
    // (names + emails) by supplying the trip UUID — an IDOR/PII leak.
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    // Fetch organizer from trips table
    const { data: trip } = await supabase
      .from('trips')
      .select('organizer_id')
      .eq('id', params.id)
      .single();

    // Member emails are contact info — only expose them to the organizer.
    // (The group UI renders names/avatars, not emails, so non-organizers
    // lose nothing visible.)
    const viewerIsOrganizer = !!trip && trip.organizer_id === userId;

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
          email: viewerIsOrganizer ? organizer.email : null,
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
        email: viewerIsOrganizer ? m.email : null,
        avatarUrl: profile?.avatar_url ?? null,
        role: m.role,
        joinedAt: m.joined_at,
        preferencesSubmittedAt,
      });
    }

    return NextResponse.json({ members: result });
  } catch (err) {
    console.error('members route error:', err);
    return NextResponse.json({ members: [], error: 'DB_ERROR' }, { status: 500 });
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
        .select('id, trip_id, status, expires_at, email')
        .eq('token', inviteToken)
        .maybeSingle();
      if (!invite) {
        return NextResponse.json({ error: 'Invalid invite token' }, { status: 400 });
      }
      if (invite.trip_id !== params.id) {
        return NextResponse.json({ error: 'Invite token does not match this trip' }, { status: 400 });
      }
      if (invite.status === 'accepted') {
        // An accepted token is single-use against its original invitee. A
        // same-person re-join is fine (the trip_members dupe check below
        // returns alreadyMember). But on a PRIVATE trip, a leaked accepted
        // link must NOT let a DIFFERENT person in — require the caller's email
        // to match the invited email. (SHARE-4)
        if (trip.is_private && invite.email) {
          let callerEmail = email?.trim() ?? '';
          if (!callerEmail) {
            try {
              const ac = await createClient();
              const { data: { user: u } } = await ac.auth.getUser();
              callerEmail = u?.email ?? '';
            } catch { /* no session email */ }
          }
          if (callerEmail.toLowerCase() !== invite.email.toLowerCase()) {
            return NextResponse.json({ error: 'This invite has already been used.' }, { status: 403 });
          }
        }
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
    } else {
      // Guest joiner (no user_id). Dedup on exact email when one is provided…
      if (email?.trim()) {
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

      // …and ALSO dedup on (trip_id, lower(name)) for guests, so a guest who
      // re-joins with no email / a different email doesn't create a duplicate
      // traveler row that burns the cap. Only match guest rows (user_id IS
      // NULL) so we don't collapse a guest into an account-holder with the
      // same display name.
      if (name?.trim()) {
        // Escape LIKE wildcards so a name with %/_ stays an exact (case-
        // insensitive) match rather than a pattern.
        const namePattern = name.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
        const { data: existingByName } = await supabase
          .from('trip_members')
          .select('id')
          .eq('trip_id', params.id)
          .is('user_id', null)
          .ilike('name', namePattern)
          .maybeSingle();

        if (existingByName) {
          return NextResponse.json({ ok: true, alreadyMember: true });
        }
      }
    }

    // Traveler cap enforcement — the Trip Builder enforces this client-side
    // but the server was relying on trust. Now we look up the organizer's
    // tier (or the trip's pass), compute the cap, and reject if adding this
    // member would push the trip over.
    //
    // Cap by tier:
    //   free       → 4 travelers   (organizer + 3)
    //   trip_pass  → 6 base + extras (varies per pass purchase)
    //   travel_pro → 8 travelers
    // (Actual caps come from TIER_LIMITS / PRICING below — this is just a map.)
    try {
      const { data: orgProfile } = await supabase
        .from('profiles')
        .select('subscription_tier')
        .eq('id', trip.organizer_id ?? '')
        .maybeSingle();
      const orgTier = (orgProfile?.subscription_tier as keyof typeof TIER_LIMITS | undefined) ?? 'free';

      let cap: number;
      if (orgTier === 'trip_pass') {
        // Trip Pass: base 6 + the extras the buyer paid for. Look up the
        // most recent active pass for this trip.
        const { data: pass } = await supabase
          .from('trip_passes')
          .select('extra_people')
          .eq('trip_id', params.id)
          .gt('expires_at', new Date().toISOString())
          .order('purchased_at', { ascending: false })
          .maybeSingle();
        cap = PRICING.trip_pass.baseGroupSize + (pass?.extra_people ?? 0);
      } else {
        const tierCap = TIER_LIMITS[orgTier].travelersPerTrip;
        cap = typeof tierCap === 'number' ? tierCap : 4;
      }

      // Members + 1 for the organizer themselves (organizer isn't in trip_members)
      const { count: memberCount } = await supabase
        .from('trip_members')
        .select('id', { count: 'exact', head: true })
        .eq('trip_id', params.id);
      const currentTravelerCount = (memberCount ?? 0) + 1;
      if (currentTravelerCount >= cap) {
        return NextResponse.json(
          {
            error: 'TRAVELER_LIMIT',
            message: `This trip has reached its ${cap}-traveler limit. The organizer can upgrade or buy a Trip Pass with more seats to add more people.`,
          },
          { status: 403 },
        );
      }
    } catch (err) {
      // Cap-lookup failure shouldn't block joins — log and proceed; better
      // to overshoot the cap by one than to lock people out due to a
      // transient DB read failure.
      console.warn('[members POST] traveler cap lookup failed, skipping:', err);
    }

    // Server-stamp `submittedAt` on the preferences blob if the client
    // forgot. The standard /join flow always sets it client-side, but a
    // malformed payload or an alternate caller (mobile app, integration)
    // could omit it — and then the trip GET's newPrefsCount logic would
    // never light up the "new member added prefs" banner for the organizer.
    // Defense in depth: stamp here whenever preferences are non-empty but
    // submittedAt is missing.
    let prefsToStore: Json | undefined;
    if (preferences && typeof preferences === 'object') {
      const prefsObj = preferences as Record<string, unknown>;
      prefsToStore = (
        prefsObj.submittedAt
          ? prefsObj
          : { ...prefsObj, submittedAt: new Date().toISOString() }
      ) as Json;
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
        preferences: prefsToStore,
      });

    if (insertErr) {
      console.error('POST members insert error:', insertErr);
      return NextResponse.json({ error: 'Failed to join trip' }, { status: 500 });
    }

    // ── Fire notifications ─────────────────────────────────────────────────
    // Home Base QA: "I'm not getting notifications when invited to itineraries."
    // The /api/invite/email flow already creates a trip_invite notification for
    // the invitee, but most joins happen via the open share-link flow which
    // previously fired zero notifications. Now we:
    //   1. Create a self-notification for the joiner (authed users only) so
    //      they see a record on Home Base after joining a trip from outside
    //      the app (text message, email link from a friend, etc.)
    //   2. Fan out a "Brandon joined the trip" ping to the organizer + every
    //      existing member so the group knows the roster grew.
    // Best-effort — failures are logged but never block the join itself.
    if (userId) {
      try {
        const { data: tripMeta } = await supabase
          .from('trips')
          .select('title')
          .eq('id', params.id)
          .maybeSingle();
        await supabase.from('notifications').insert({
          user_id: userId,
          type: 'trip_invite',
          trip_id: params.id,
          trip_name: tripMeta?.title ?? null,
          inviter_name: null,
          message: 'You joined this trip.',
        });
      } catch (err) {
        console.error('[members POST] self-notification insert failed:', err);
      }
    }
    try {
      const { notifyTripMembers } = await import('@/lib/supabase/notify');
      await notifyTripMembers({
        supabase,
        tripId: params.id,
        excludeUserId: userId ?? '',
        type: 'member_joined',
        fromName: name.trim(),
        message: `${name.trim()} joined the trip.`,
      });
    } catch (err) {
      console.error('[members POST] fan-out failed:', err);
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
 *
 * Authorization
 *   - Caller must be the trip organizer or a co-organizer (parity).
 *   - The trip organizer's subscription tier must include co-organizer
 *     entitlement (Trip Pass or Travel Pro — see lib/types.ts
 *     TIER_LIMITS.canAddCoOrganizer). Earlier this gate was top-tier-only on
 *     the CALLER's tier, which contradicted the entitlement table and
 *     blocked Trip Pass organizers from promoting anyone even
 *     though their UI showed the "+ Make co-organizer" button.
 *
 * Body: { memberId: string, role: 'member' | 'co_organizer' }
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    // Auth check
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createAdminClient();

    // Caller must be the organizer or a co-organizer of this trip.
    const callerRole = await getTripRole(supabase, params.id, user.id);
    if (callerRole !== 'organizer' && callerRole !== 'co_organizer') {
      return NextResponse.json({ error: 'Only organizers and co-organizers can change roles' }, { status: 403 });
    }

    // Look up the trip's organizer to check the plan that owns the trip.
    const { data: trip } = await supabase
      .from('trips')
      .select('organizer_id')
      .eq('id', params.id)
      .single();

    if (!trip?.organizer_id) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    // The trip organizer's tier governs whether co-organizer is unlocked
    // for this trip. Free tier doesn't include co-organizer; Trip Pass /
    // Travel Pro do.
    const { data: organizerProfile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', trip.organizer_id)
      .single();

    const organizerTier = normalizeTier(organizerProfile?.subscription_tier);
    if (organizerTier === 'free') {
      return NextResponse.json(
        { error: 'Co-organizer roles require Trip Pass or Travel Pro' },
        { status: 403 },
      );
    }

    const { memberId, role } = await req.json();
    if (!memberId || typeof memberId !== 'string' || !/^[0-9a-f-]{36}$/i.test(memberId) || !['member', 'co_organizer'].includes(role)) {
      return NextResponse.json({ error: 'memberId (uuid) and role (member | co_organizer) required' }, { status: 400 });
    }

    // The members GET returns `user_id ?? id` as each member's identifier, so a
    // guest member (no account → user_id is null) surfaces with their
    // trip_members ROW id. Matching only on user_id made the promotion a silent
    // no-op for guests (0 rows updated but ok:true → the badge flipped then
    // reverted on refresh). Match on either column. memberId is uuid-validated
    // above, so it's safe to interpolate into the .or() filter string.
    const { data: updated, error } = await supabase
      .from('trip_members')
      .update({ role })
      .eq('trip_id', params.id)
      .or(`user_id.eq.${memberId},id.eq.${memberId}`)
      .select('id');

    if (error) {
      console.error('role update error:', error);
      return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, memberId, role });
  } catch (err) {
    console.error('PATCH members error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

/**
 * DELETE /api/trips/[id]/members?memberId=<user_id|row_id>
 * Removes a member (or guest) from the trip. Organizer / co-organizer only;
 * the organizer cannot be removed. memberId matches either the member's
 * user_id (account members) or their trip_members row id (guests) — the same
 * dual identifier the GET surfaces and PATCH uses. (GROUP-5)
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createAdminClient();
    const callerRole = await getTripRole(supabase, params.id, user.id);
    if (callerRole !== 'organizer' && callerRole !== 'co_organizer') {
      return NextResponse.json({ error: 'Only organizers and co-organizers can remove members' }, { status: 403 });
    }

    const memberId = new URL(req.url).searchParams.get('memberId') ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(memberId)) {
      return NextResponse.json({ error: 'memberId (uuid) required' }, { status: 400 });
    }

    // Never remove the organizer (their id surfaces as a member id in the GET).
    const { data: trip } = await supabase
      .from('trips')
      .select('organizer_id')
      .eq('id', params.id)
      .single();
    if (trip?.organizer_id && trip.organizer_id === memberId) {
      return NextResponse.json({ error: 'The organizer cannot be removed.' }, { status: 400 });
    }

    // memberId is uuid-validated above, so it's safe in the .or() filter.
    const { data: removed, error } = await supabase
      .from('trip_members')
      .delete()
      .eq('trip_id', params.id)
      .or(`user_id.eq.${memberId},id.eq.${memberId}`)
      .select('id');

    if (error) {
      console.error('member delete error:', error);
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 });
    }
    if (!removed || removed.length === 0) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, memberId });
  } catch (err) {
    console.error('DELETE members error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
