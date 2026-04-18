import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/trips/[id]/photos
 * Returns all photos for a trip.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createAdminClient();

    const { data: photos, error } = await supabase
      .from('trip_photos')
      .select('id, public_url, uploader_name, day_number, caption, taken_at, created_at')
      .eq('trip_id', params.id)
      .order('created_at', { ascending: true });

    if (error) return NextResponse.json({ photos: [] });

    return NextResponse.json({
      photos: (photos ?? []).map(p => ({
        id: p.id,
        url: p.public_url,
        uploadedBy: p.uploader_name ?? 'Unknown',
        day: p.day_number ?? 1,
        activity: p.caption ?? '',
        timestamp: p.taken_at ?? p.created_at,
      })),
    });
  } catch (err) {
    console.error('photos GET error:', err);
    return NextResponse.json({ photos: [] });
  }
}
