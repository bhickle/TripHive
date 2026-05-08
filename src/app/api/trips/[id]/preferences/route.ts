import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TripMemberPreferences } from '@/lib/types';
import type { Json } from '@/lib/supabase/database.types';

/**
 * GET /api/trips/[id]/preferences
 * Returns the current user's preferences row for this trip, or null if they
 * are the organizer or haven't submitted yet. The buyer fills the full Trip
 * Builder, not the mini-wizard, so we treat their preferences as N/A here.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { userId } = auth.ctx;
  const supabase = createAdminClient();

  const { data: trip } = await supabase
    .from('trips')
    .select('organizer_id')
    .eq('id', params.id)
    .single();

  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  if (trip.organizer_id === userId) {
    return NextResponse.json({ isOrganizer: true, preferences: null });
  }

  const { data: member } = await supabase
    .from('trip_members')
    .select('preferences')
    .eq('trip_id', params.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: 'Not a member of this trip' }, { status: 403 });
  }

  return NextResponse.json({ isOrganizer: false, preferences: member.preferences ?? null });
}

/**
 * PATCH /api/trips/[id]/preferences
 * Save the current user's preferences row for this trip (Trip Pass mini-wizard).
 * Only members of the trip can call this — the organizer's preferences come
 * from the full Trip Builder via `trips.itinerary_data` aiMeta.
 *
 * Body: TripMemberPreferences (without submittedAt — server stamps it)
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { userId } = auth.ctx;
  const supabase = createAdminClient();

  const { data: trip } = await supabase
    .from('trips')
    .select('organizer_id')
    .eq('id', params.id)
    .single();

  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
  if (trip.organizer_id === userId) {
    return NextResponse.json(
      { error: 'Organizer preferences come from the Trip Builder, not the mini-wizard.' },
      { status: 400 },
    );
  }

  const { data: member } = await supabase
    .from('trip_members')
    .select('id, preferences')
    .eq('trip_id', params.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!member) {
    return NextResponse.json({ error: 'Not a member of this trip' }, { status: 403 });
  }

  const body = await req.json();
  const next: TripMemberPreferences = {
    priorities: Array.isArray(body.priorities) ? body.priorities.slice(0, 8) : [],
    pace: ['relaxed', 'balanced', 'packed'].includes(body.pace) ? body.pace : 'balanced',
    dietary: {
      tags: Array.isArray(body?.dietary?.tags) ? body.dietary.tags : [],
      notes: typeof body?.dietary?.notes === 'string' ? body.dietary.notes.slice(0, 500) : undefined,
    },
    accessibility: {
      needs: Array.isArray(body?.accessibility?.needs) ? body.accessibility.needs : [],
      notes: typeof body?.accessibility?.notes === 'string' ? body.accessibility.notes.slice(0, 500) : undefined,
    },
    budgetPerDay: typeof body.budgetPerDay === 'number' && body.budgetPerDay > 0 ? body.budgetPerDay : undefined,
    submittedAt: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('trip_members')
    .update({ preferences: next as unknown as Json })
    .eq('id', member.id);

  if (error) {
    console.error('[preferences PATCH]', error);
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, preferences: next });
}
