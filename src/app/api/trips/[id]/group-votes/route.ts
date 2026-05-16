import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireTripAccess, getTripRole } from '@/lib/supabase/tripAccess';
import { notifyTripMembers } from '@/lib/supabase/notify';

/**
 * GET /api/trips/[id]/group-votes
 * Returns all votes for a trip with options and vote counts.
 *
 * POST /api/trips/[id]/group-votes
 * Creates a new vote with options.
 * Body: { title, options: string[], closesAt?: string, createdByName: string }
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    const { data: votes, error } = await supabase
      .from('group_votes')
      .select(`
        id, title, status, closes_at, created_by_name, result, created_at, vote_type, max_picks,
        vote_options (id, label, display_order)
      `)
      .eq('trip_id', params.id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ votes: [] });

    // For each vote, count responses per option
    type VoteOptionRow = { id: string; label: string; display_order: number };
    type VoteRow = {
      id: string;
      title: string;
      status: string;
      closes_at: string | null;
      created_by_name: string;
      result: string | null;
      created_at: string;
      vote_type: string;
      max_picks: number | null;
      vote_options: VoteOptionRow[] | null;
    };
    const enriched = await Promise.all(((votes ?? []) as VoteRow[]).map(async (vote) => {
      const { data: responses } = await supabase
        .from('vote_responses')
        .select('option_id, voter_name, user_id')
        .eq('vote_id', vote.id);

      const countByOption: Record<string, number> = {};
      const votersByOption: Record<string, string[]> = {};
      const distinctVoters = new Set<string>();
      const myPicks: string[] = [];
      for (const r of responses ?? []) {
        countByOption[r.option_id] = (countByOption[r.option_id] ?? 0) + 1;
        votersByOption[r.option_id] = [...(votersByOption[r.option_id] ?? []), r.voter_name];
        if (r.user_id) distinctVoters.add(r.user_id);
        if (r.user_id === userId) myPicks.push(r.option_id);
      }

      const options = (vote.vote_options ?? [])
        .sort((a, b) => a.display_order - b.display_order)
        .map((opt) => ({
          id: opt.id,
          label: opt.label,
          votes: countByOption[opt.id] ?? 0,
          voters: votersByOption[opt.id] ?? [],
        }));

      return {
        id: vote.id,
        title: vote.title,
        status: vote.status,
        closesAt: vote.closes_at,
        createdBy: vote.created_by_name,
        result: vote.result,
        voteType: vote.vote_type,         // 'single' | 'multi'
        maxPicks: vote.max_picks,          // null when unlimited or single
        distinctVoterCount: distinctVoters.size,
        userPicks: myPicks,                // option_ids the current user has picked
        options,
      };
    }));

    return NextResponse.json({ votes: enriched });
  } catch (err) {
    console.error('group-votes GET error:', err);
    return NextResponse.json({ votes: [] });
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
    // 'Unknown' was being persisted to created_by_name when profile
     // resolution hiccupped. Fall through to the email local-part so the
     // worst-case display is a person-ish handle rather than literally
     // "Unknown" attached to votes others can see.
    const userName = profile?.name ?? profile?.email?.split('@')[0] ?? 'A traveler';

    const body = await req.json();
    const { title, options, closesAt, voteType, maxPicks } = body;

    if (!title || !Array.isArray(options) || options.length < 2) {
      return NextResponse.json({ error: 'title and at least 2 options required' }, { status: 400 });
    }

    // Validate vote_type. Anything other than 'multi' falls back to 'single'
    // — safer to coerce unknown values than 400, and matches the column
    // default. max_picks is only honored on multi votes.
    const resolvedType: 'single' | 'multi' = voteType === 'multi' ? 'multi' : 'single';
    let resolvedMaxPicks: number | null = null;
    if (resolvedType === 'multi' && maxPicks !== null && maxPicks !== undefined) {
      const n = Number(maxPicks);
      if (Number.isFinite(n) && n >= 1 && n <= options.length) {
        resolvedMaxPicks = Math.floor(n);
      }
      // Out-of-range or non-numeric → null (no cap). Don't 400, just drop.
    }

    // created_by_name is always the server-resolved display name now.
    // Previously the body could supply `createdByName`, which a client
    // could spoof to attribute a vote to someone else.
    const { data: vote, error: voteError } = await supabase
      .from('group_votes')
      .insert({
        trip_id: params.id,
        title,
        status: 'open',
        closes_at: closesAt ?? null,
        created_by_name: userName,
        vote_type: resolvedType,
        max_picks: resolvedMaxPicks,
      })
      .select()
      .single();

    if (voteError || !vote) {
      return NextResponse.json({ error: 'Failed to create vote' }, { status: 500 });
    }

    const optionRows = options
      .filter((o: string) => o.trim())
      .map((label: string, i: number) => ({
        vote_id: vote.id,
        label: label.trim(),
        display_order: i,
      }));

    const { error: optionsErr } = await supabase.from('vote_options').insert(optionRows);
    if (optionsErr) {
      // Vote row was created but options didn't persist — the poll would
      // appear with no answers to click on. Roll back the parent vote.
      console.error('vote_options insert failed:', optionsErr);
      const { error: rollbackErr } = await supabase.from('group_votes').delete().eq('id', vote.id);
      if (rollbackErr) console.error('group_votes rollback also failed (orphan vote left):', vote.id, rollbackErr);
      return NextResponse.json({ error: 'Failed to create vote options' }, { status: 500 });
    }

    // Fire-and-forget: notify every other trip member that a new poll exists.
    notifyTripMembers({
      supabase,
      tripId: params.id,
      excludeUserId: userId,
      type: 'new_vote',
      fromName: userName,
      message: title,
    });

    return NextResponse.json({ success: true, voteId: vote.id });
  } catch (err) {
    console.error('group-votes POST error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

/**
 * PATCH /api/trips/[id]/group-votes
 * Cast a vote or close a vote.
 * Body: { action: 'cast', voteId, optionId, voterName } | { action: 'close', voteId }
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    const body = await req.json();
    // Default to 'cast' when no action is supplied — the existing client only
    // ever sends { voteId, optionId } for casts. 'close' must be opted into.
    // Validate the enum explicitly so an unknown value 400s instead of
    // silently falling through to 'cast' (which was the prior behaviour).
    const action = body.action ?? 'cast';
    if (action !== 'cast' && action !== 'close') {
      return NextResponse.json({ error: "action must be 'cast' or 'close'" }, { status: 400 });
    }

    if (action === 'cast') {
      // Two body shapes are accepted now:
      //   single-pick votes: { voteId, optionId }          (existing)
      //   multi-pick votes:  { voteId, optionId, picked }  (toggle one)
      // The server picks the right code path based on the vote's vote_type,
      // not based on which body field is present — that keeps the contract
      // honest if a single client sends the wrong shape by accident.
      const { voteId, optionId, picked } = body;
      if (!voteId || !optionId) {
        return NextResponse.json({ error: 'voteId and optionId required' }, { status: 400 });
      }

      // Confirm the vote belongs to THIS trip + load its mode.
      const { data: vote } = await supabase
        .from('group_votes')
        .select('trip_id, vote_type, max_picks, status')
        .eq('id', voteId)
        .maybeSingle();
      if (!vote || vote.trip_id !== params.id) {
        return NextResponse.json({ error: 'Vote not found' }, { status: 404 });
      }
      if (vote.status === 'closed') {
        return NextResponse.json({ error: 'This poll is closed' }, { status: 400 });
      }

      // Confirm the option actually belongs to this vote — server-side
      // tampering guard. Without it a client could vote with an option_id
      // borrowed from a different poll.
      const { data: optionRow } = await supabase
        .from('vote_options')
        .select('id, vote_id')
        .eq('id', optionId)
        .maybeSingle();
      if (!optionRow || optionRow.vote_id !== voteId) {
        return NextResponse.json({ error: 'Option not found for this vote' }, { status: 404 });
      }

      // Resolve voter name from profile (don't trust client-supplied name)
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, email')
        .eq('id', userId)
        .single();
      const voterName = profile?.name ?? profile?.email?.split('@')[0] ?? 'Member';

      if (vote.vote_type === 'multi') {
        // Multi-pick: each click toggles one option for this user. Server
        // enforces max_picks before insert so a fast double-click can't
        // sneak the user over the cap.
        const shouldPick = picked === undefined ? true : !!picked;

        if (!shouldPick) {
          const { error: delErr } = await supabase.from('vote_responses').delete()
            .eq('vote_id', voteId).eq('user_id', userId).eq('option_id', optionId);
          if (delErr) {
            console.error('vote_responses delete failed (multi):', delErr);
            return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 });
          }
        } else {
          // Cap check — read current pick count for this user on this poll.
          if (vote.max_picks !== null && vote.max_picks !== undefined) {
            const { data: existingPicks } = await supabase
              .from('vote_responses')
              .select('option_id')
              .eq('vote_id', voteId).eq('user_id', userId);
            const alreadyPicked = (existingPicks ?? []).some(p => p.option_id === optionId);
            if (!alreadyPicked && (existingPicks?.length ?? 0) >= vote.max_picks) {
              return NextResponse.json({
                error: `You can pick at most ${vote.max_picks} option${vote.max_picks === 1 ? '' : 's'} on this poll`,
              }, { status: 400 });
            }
          }
          // Idempotent insert — if the row already exists, no-op via the
          // (vote_id, user_id, option_id) duplicate-check first. There's
          // no unique constraint on the triple yet, so an unconditional
          // insert would happily duplicate rows on rapid double-clicks.
          const { data: dupCheck } = await supabase
            .from('vote_responses')
            .select('id')
            .eq('vote_id', voteId).eq('user_id', userId).eq('option_id', optionId)
            .maybeSingle();
          if (!dupCheck) {
            const { error: insErr } = await supabase.from('vote_responses').insert({
              vote_id: voteId,
              option_id: optionId,
              voter_name: voterName,
              user_id: userId,
            });
            if (insErr) {
              console.error('vote_responses insert failed (multi):', insErr);
              return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 });
            }
          }
        }
      } else {
        // Single-pick: contract requires NO `picked` field on the body. A
        // client sending `picked: false` on a single-pick poll would otherwise
        // be interpreted as "replace your vote with optionId" via the
        // delete-then-insert flow, which is a triple-voting abuse vector
        // when chained with rapid clicks. Reject explicitly.
        if (picked !== undefined) {
          return NextResponse.json(
            { error: "BAD_REQUEST", message: "This poll is single-pick — don't send a 'picked' field." },
            { status: 400 },
          );
        }
        // Existing behavior: replace any previous response.
        const { error: delErr } = await supabase.from('vote_responses').delete()
          .eq('vote_id', voteId).eq('user_id', userId);
        if (delErr) {
          console.error('vote_responses delete failed:', delErr);
          return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 });
        }
        const { error: insErr } = await supabase.from('vote_responses').insert({
          vote_id: voteId,
          option_id: optionId,
          voter_name: voterName,
          user_id: userId,
        });
        if (insErr) {
          console.error('vote_responses insert failed:', insErr);
          return NextResponse.json({ error: 'Failed to record vote' }, { status: 500 });
        }
      }

      // Return canonical counts so the client can reconcile against any
      // concurrent votes from other members. Without this, two users
      // voting simultaneously each see only their own +1 / -1 arithmetic
      // until the next Realtime tick lands.
      const { data: countRows } = await supabase
        .from('vote_responses')
        .select('option_id, user_id')
        .eq('vote_id', voteId);
      const counts: Record<string, number> = {};
      const distinctVoters = new Set<string>();
      for (const row of countRows ?? []) {
        counts[row.option_id] = (counts[row.option_id] ?? 0) + 1;
        if (row.user_id) distinctVoters.add(row.user_id);
      }
      return NextResponse.json({ success: true, counts, distinctVoterCount: distinctVoters.size });
    }

    if (action === 'close') {
      const { voteId } = body;
      if (!voteId) return NextResponse.json({ error: 'voteId required' }, { status: 400 });

      // Organizer or co-organizer may close a vote.
      const role = await getTripRole(supabase, params.id, userId);
      if (role !== 'organizer' && role !== 'co_organizer') {
        return NextResponse.json({ error: 'Only organizers and co-organizers can close votes' }, { status: 403 });
      }

      // Confirm the vote belongs to this trip
      const { data: vote } = await supabase
        .from('group_votes')
        .select('trip_id')
        .eq('id', voteId)
        .maybeSingle();
      if (!vote || vote.trip_id !== params.id) {
        return NextResponse.json({ error: 'Vote not found' }, { status: 404 });
      }

      const { error: closeErr } = await supabase.from('group_votes').update({ status: 'closed' }).eq('id', voteId);
      if (closeErr) {
        console.error('group_votes close failed:', closeErr);
        return NextResponse.json({ error: 'Failed to close vote' }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('group-votes PATCH error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
