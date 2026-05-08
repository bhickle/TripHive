import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST   /api/trips/[id]/like  — like the trip's itinerary
 * DELETE /api/trips/[id]/like  — unlike
 *
 * Authed only — anonymous likes aren't supported in v1.
 * Likes are read-public via RLS so unauthenticated visitors still see counts.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createAdminClient();

    // Verify the trip is actually a public template — we don't want users
    // to like private trips they're not members of.
    const { data: trip } = await supabase
      .from('trips')
      .select('is_public_template')
      .eq('id', params.id)
      .single();

    if (!trip?.is_public_template) {
      return NextResponse.json({ error: 'Trip not available for likes' }, { status: 403 });
    }

    // Upsert: if the user already liked, this is idempotent and we can
    // still report the current count.
    const { error: insertErr } = await supabase
      .from('itinerary_likes')
      .insert({ trip_id: params.id, user_id: user.id })
      .select()
      .single();

    // 23505 = unique violation — already liked. Treat as success.
    if (insertErr && insertErr.code !== '23505') {
      console.error('itinerary like insert error:', insertErr);
      return NextResponse.json({ error: 'Failed to like' }, { status: 500 });
    }

    const { count } = await supabase
      .from('itinerary_likes')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', params.id);

    return NextResponse.json({ liked: true, count: count ?? 0 });
  } catch (err) {
    console.error('itinerary like POST error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createAdminClient();

    const { error: delErr } = await supabase
      .from('itinerary_likes')
      .delete()
      .eq('trip_id', params.id)
      .eq('user_id', user.id);

    if (delErr) {
      console.error('itinerary like delete error:', delErr);
      return NextResponse.json({ error: 'Failed to unlike' }, { status: 500 });
    }

    const { count } = await supabase
      .from('itinerary_likes')
      .select('id', { count: 'exact', head: true })
      .eq('trip_id', params.id);

    return NextResponse.json({ liked: false, count: count ?? 0 });
  } catch (err) {
    console.error('itinerary like DELETE error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
