import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/trips
 * Returns all trips owned by the current authenticated user.
 * Returns [] for unauthenticated requests.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ trips: [] });
    }

    const { data: trips, error } = await supabase
      .from('trips')
      .select('id, title, destination, start_date, end_date, trip_length, status, group_type, group_size, cover_image, created_at')
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('List trips error:', JSON.stringify(error));
      return NextResponse.json({ error: 'Failed to load trips' }, { status: 500 });
    }

    return NextResponse.json({ trips: trips ?? [] });
  } catch (err) {
    console.error('List trips error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
