import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/trips
 * Returns all trips owned by the current authenticated user.
 * Returns [] for unauthenticated requests.
 */
export async function GET() {
  try {
    // Identify the current user via cookie-based auth
    let userId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      userId = user?.id ?? null;
    } catch {
      // Auth check failed — return empty list
    }

    if (!userId) {
      return NextResponse.json({ trips: [] });
    }

    // DB reads use the admin client (bypasses RLS, no cookie dependency)
    const supabase = createAdminClient();

    const { data: trips, error } = await supabase
      .from('trips')
      .select('id, title, destination, start_date, end_date, trip_length, status, group_type, group_size, cover_image, created_at')
      .eq('organizer_id', userId)
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
