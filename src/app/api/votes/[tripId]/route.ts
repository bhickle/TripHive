import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/supabase/requireAuth';

// POST: upsert a vote (replaces previous vote for same user+activity)
export async function POST(
  request: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { activityId, vote } = body as { activityId: string; vote: 'up' | 'down' | null };

  if (!activityId) return NextResponse.json({ error: 'activityId required' }, { status: 400 });

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const votesTable = (supabase as any).from('activity_votes');

  if (vote === null) {
    // Toggle off — delete the vote
    await votesTable.delete()
      .eq('trip_id', params.tripId)
      .eq('activity_id', activityId)
      .eq('user_id', user.id);
  } else {
    // Upsert — ON CONFLICT replaces the previous vote
    const { error } = await votesTable.upsert(
      { trip_id: params.tripId, activity_id: activityId, user_id: user.id, vote, updated_at: new Date().toISOString() },
      { onConflict: 'trip_id,activity_id,user_id' }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return fresh vote counts for this activity
  const { data: rows } = await votesTable
    .select('vote')
    .eq('trip_id', params.tripId)
    .eq('activity_id', activityId);

  const up = rows?.filter((r: any) => r.vote === 'up').length ?? 0;
  const down = rows?.filter((r: any) => r.vote === 'down').length ?? 0;
  return NextResponse.json({ up, down });
}

// GET: load current user's votes for this trip
export async function GET(
  _request: NextRequest,
  { params }: { params: { tripId: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ votes: {} });

  const supabase = createAdminClient();
  const votesTable = (supabase as any).from('activity_votes');
  const { data: rows } = await votesTable
    .select('activity_id, vote')
    .eq('trip_id', params.tripId)
    .eq('user_id', user.id);

  const votes: Record<string, 'up' | 'down'> = {};
  for (const r of rows ?? []) votes[r.activity_id] = r.vote;
  return NextResponse.json({ votes });
}
