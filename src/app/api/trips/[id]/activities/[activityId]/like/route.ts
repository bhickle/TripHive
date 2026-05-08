import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST   /api/trips/[id]/activities/[activityId]/like  — like an activity
 * DELETE /api/trips/[id]/activities/[activityId]/like  — unlike
 *
 * activity_id is the string ID stored inside the itinerary_days JSON
 * (not a separate table — activities live inside the itinerary blob).
 * We don't validate it exists in the JSON because: (a) parsing the
 * itinerary on every like is wasteful, (b) the worst case is an
 * orphan like row that points to a deleted activity, which is
 * harmless — the count just won't show up anywhere. CASCADE on
 * trip_id handles cleanup when the trip itself is deleted.
 */
export async function POST(_req: Request, { params }: { params: { id: string; activityId: string } }) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createAdminClient();

    const { data: trip } = await supabase
      .from('trips')
      .select('is_public_template')
      .eq('id', params.id)
      .single();

    if (!trip?.is_public_template) {
      return NextResponse.json({ error: 'Trip not available for likes' }, { status: 403 });
    }

    const { error: insertErr } = await supabase
      .from('activity_likes')
      .insert({ trip_id: params.id, activity_id: params.activityId, user_id: user.id });

    if (insertErr && insertErr.code !== '23505') {
      console.error('activity like insert error:', insertErr);
      return NextResponse.json({ error: 'Failed to like' }, { status: 500 });
    }

    const { count } = await supabase
      .from('activity_likes')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', params.id)
      .eq('activity_id', params.activityId);

    return NextResponse.json({ liked: true, count: count ?? 0 });
  } catch (err) {
    console.error('activity like POST error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; activityId: string } }) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createAdminClient();

    const { error: delErr } = await supabase
      .from('activity_likes')
      .delete()
      .eq('trip_id', params.id)
      .eq('activity_id', params.activityId)
      .eq('user_id', user.id);

    if (delErr) {
      console.error('activity like delete error:', delErr);
      return NextResponse.json({ error: 'Failed to unlike' }, { status: 500 });
    }

    const { count } = await supabase
      .from('activity_likes')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', params.id)
      .eq('activity_id', params.activityId);

    return NextResponse.json({ liked: false, count: count ?? 0 });
  } catch (err) {
    console.error('activity like DELETE error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
