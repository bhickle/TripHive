import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/trips/[id]/public
 * Returns a minimal, safe subset of trip data for the join / invite flow.
 * Uses the admin client so it bypasses RLS — only safe fields are returned
 * (no itinerary content, no personal data, no member lists).
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  // Validate UUID format before hitting the database
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('trips')
      .select('id, title, destination, start_date, end_date, group_size, cover_image')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: data.id,
      title: data.title,
      destination: data.destination,
      startDate: data.start_date,
      endDate: data.end_date,
      groupSize: data.group_size,
      coverImage: data.cover_image,
    });
  } catch (err) {
    console.error('[trips/public] error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
