import { NextRequest, NextResponse } from 'next/server';
import { requireTripAccess } from '@/lib/supabase/tripAccess';

// POST: upsert a vote (replaces previous vote for same user+activity)
export async function POST(
  request: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const access = await requireTripAccess(params.tripId);
  if (!access.ok) return access.response;
  const { userId, supabase } = access.ctx;

  const body = await request.json();
  const { activityId, vote } = body as { activityId: string; vote: 'up' | 'down' | null };

  if (!activityId) return NextResponse.json({ error: 'activityId required' }, { status: 400 });

  if (vote === null) {
    // Toggle off — delete the vote
    await supabase.from('activity_votes').delete()
      .eq('trip_id', params.tripId)
      .eq('activity_id', activityId)
      .eq('user_id', userId);
  } else {
    // Upsert — ON CONFLICT replaces the previous vote
    const { error } = await supabase.from('activity_votes').upsert(
      { trip_id: params.tripId, activity_id: activityId, user_id: userId, vote, updated_at: new Date().toISOString() },
      { onConflict: 'trip_id,activity_id,user_id' }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return fresh vote counts for this activity
  const { data: rows } = await supabase.from('activity_votes')
    .select('vote')
    .eq('trip_id', params.tripId)
    .eq('activity_id', activityId);

  const up = rows?.filter((r) => r.vote === 'up').length ?? 0;
  const down = rows?.filter((r) => r.vote === 'down').length ?? 0;
  return NextResponse.json({ up, down });
}

// GET: load current user's votes for this trip
export async function GET(
  _request: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const access = await requireTripAccess(params.tripId);
  if (!access.ok) return access.response;
  const { userId, supabase } = access.ctx;

  const { data: rows } = await supabase.from('activity_votes')
    .select('activity_id, vote')
    .eq('trip_id', params.tripId)
    .eq('user_id', userId);

  const votes: Record<string, 'up' | 'down'> = {};
  for (const r of rows ?? []) votes[r.activity_id] = r.vote as 'up' | 'down';
  return NextResponse.json({ votes });
}
