import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireTripAccess } from '@/lib/supabase/tripAccess';
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
    const { supabase } = access.ctx;

    const { data: votes, error } = await supabase
      .from('group_votes')
      .select(`
        id, title, status, closes_at, created_by_name, result, created_at,
        vote_options (id, label, display_order)
      `)
      .eq('trip_id', params.id)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ votes: [] });

    // For each vote, count responses per option
    const enriched = await Promise.all((votes ?? []).map(async (vote: any) => {
      const { data: responses } = await supabase
        .from('vote_responses')
        .select('option_id, voter_name')
        .eq('vote_id', vote.id);

      const countByOption: Record<string, number> = {};
      const votersByOption: Record<string, string[]> = {};
      for (const r of responses ?? []) {
        countByOption[r.option_id] = (countByOption[r.option_id] ?? 0) + 1;
        votersByOption[r.option_id] = [...(votersByOption[r.option_id] ?? []), r.voter_name];
      }

      const options = (vote.vote_options ?? [])
        .sort((a: any, b: any) => a.display_order - b.display_order)
        .map((opt: any) => ({
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
    const userName = profile?.name ?? profile?.email?.split('@')[0] ?? 'Unknown';

    const body = await req.json();
    const { title, options, closesAt, createdByName } = body;

    if (!title || !Array.isArray(options) || options.length < 2) {
      return NextResponse.json({ error: 'title and at least 2 options required' }, { status: 400 });
    }

    const { data: vote, error: voteError } = await supabase
      .from('group_votes')
      .insert({
        trip_id: params.id,
        title,
        status: 'open',
        closes_at: closesAt ?? null,
        created_by_name: createdByName ?? userName,
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

    await supabase.from('vote_options').insert(optionRows);

    // Fire-and-forget: notify every other trip member that a new poll exists.
    notifyTripMembers({
      supabase,
      tripId: params.id,
      excludeUserId: userId,
      type: 'new_vote',
      fromName: createdByName ?? userName,
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
    const action = body.action ?? 'cast';

    if (action === 'cast') {
      const { voteId, optionId } = body;
      if (!voteId || !optionId) {
        return NextResponse.json({ error: 'voteId and optionId required' }, { status: 400 });
      }

      // Confirm the vote belongs to THIS trip — prevents cross-trip vote tampering
      const { data: vote } = await supabase
        .from('group_votes')
        .select('trip_id')
        .eq('id', voteId)
        .maybeSingle();
      if (!vote || vote.trip_id !== params.id) {
        return NextResponse.json({ error: 'Vote not found' }, { status: 404 });
      }

      // Resolve voter name from profile (don't trust client-supplied name)
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, email')
        .eq('id', userId)
        .single();
      const voterName = profile?.name ?? profile?.email?.split('@')[0] ?? 'Member';

      // Upsert: replace previous vote from this user on this vote
      await supabase.from('vote_responses').delete()
        .eq('vote_id', voteId).eq('user_id', userId);
      await supabase.from('vote_responses').insert({
        vote_id: voteId,
        option_id: optionId,
        voter_name: voterName,
        user_id: userId,
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'close') {
      const { voteId } = body;
      if (!voteId) return NextResponse.json({ error: 'voteId required' }, { status: 400 });

      // Only the trip organizer may close a vote
      const { data: trip } = await supabase
        .from('trips')
        .select('organizer_id')
        .eq('id', params.id)
        .maybeSingle();
      if (trip?.organizer_id !== userId) {
        return NextResponse.json({ error: 'Only the organizer can close votes' }, { status: 403 });
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

      await supabase.from('group_votes').update({ status: 'closed' }).eq('id', voteId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('group-votes PATCH error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
