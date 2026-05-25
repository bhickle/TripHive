import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTripRole } from '@/lib/supabase/tripAccess';
import { isFounderEmail } from '@/lib/founders';

/**
 * PATCH /api/trips/[id]/feature  — founder-only.
 * Body: { featured: boolean }
 *
 * Toggles trips.is_founder_featured, which controls whether the trip appears
 * on the public "Founder Itineraries" rail on Discover.
 *
 * Gating (both required):
 *   1. The caller is one of the four founder accounts (see lib/founders.ts).
 *   2. The caller is the organizer or co-organizer of THIS trip — a founder
 *      can only feature a trip they actually own, not a stranger's.
 *
 * Featuring (featured=true) also flips is_public_template on, because a
 * featured trip has to be publicly viewable. Unfeaturing leaves the public
 * flag untouched — the founder may still want the trip shared to the
 * community even after pulling it off the founder rail.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!isFounderEmail(user.email)) {
      return NextResponse.json({ error: 'Founder access required' }, { status: 403 });
    }

    let body: { featured?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (typeof body.featured !== 'boolean') {
      return NextResponse.json({ error: 'featured must be a boolean' }, { status: 400 });
    }
    const featured = body.featured;

    const supabase = createAdminClient();

    // Must own the trip (organizer or co-organizer), not just be a founder.
    const role = await getTripRole(supabase, params.id, user.id);
    if (role !== 'organizer' && role !== 'co_organizer') {
      return NextResponse.json(
        { error: 'Only the trip organizer can feature this trip' },
        { status: 403 },
      );
    }

    // Don't let an empty skeleton (no generated itinerary) hit the rail.
    if (featured) {
      const { data: trip } = await supabase
        .from('trips')
        .select('itinerary_generated_at')
        .eq('id', params.id)
        .single();
      if (!trip?.itinerary_generated_at) {
        return NextResponse.json(
          { error: 'Generate the itinerary before featuring this trip' },
          { status: 400 },
        );
      }
    }

    const update = featured
      ? { is_founder_featured: true, is_public_template: true }
      : { is_founder_featured: false };

    const { error } = await supabase
      .from('trips')
      .update(update)
      .eq('id', params.id);

    if (error) {
      console.error('feature toggle update error:', error);
      return NextResponse.json({ error: 'Failed to update trip' }, { status: 500 });
    }

    return NextResponse.json({ featured });
  } catch (err) {
    console.error('feature PATCH error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
