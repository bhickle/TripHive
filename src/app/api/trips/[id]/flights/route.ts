import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireTripAccess } from '@/lib/supabase/tripAccess';

/**
 * Per-user, per-trip flight storage. Each user sees only their own rows
 * (RLS enforces owner-only access; admin client used here for server-side
 * predictability, but the user_id filter on every query mirrors the same
 * scope so an accidental admin-client read never leaks across users).
 *
 * GET    /api/trips/[id]/flights        → list current user's flights for trip
 * POST   /api/trips/[id]/flights        → add a new flight row
 * PATCH  /api/trips/[id]/flights        → update a row by { itemId, ...patch }
 * DELETE /api/trips/[id]/flights        → delete a row by { itemId }
 */

type FlightPatch = {
  airline?: string | null;
  flight_number?: string | null;
  confirmation_number?: string | null;
  origin?: string | null;
  destination?: string | null;
  departure_at?: string | null;
  arrival_at?: string | null;
  seat?: string | null;
  email_link?: string | null;
  notes?: string | null;
};

const PATCHABLE_FIELDS: (keyof FlightPatch)[] = [
  'airline', 'flight_number', 'confirmation_number',
  'origin', 'destination', 'departure_at', 'arrival_at',
  'seat', 'email_link', 'notes',
];

async function getAuthUserId(): Promise<string | null> {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ items: [] });

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('flight_bookings')
      .select('*')
      .eq('trip_id', params.id)
      .eq('user_id', userId)
      .order('departure_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('flights GET error:', error);
      return NextResponse.json({ items: [] });
    }
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    console.error('flights GET error:', err);
    return NextResponse.json({ items: [] });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    // requireTripAccess enforces auth + trip membership. A user can't store
    // a flight for a trip they aren't part of, even though RLS would block
    // the SELECT later — we fail fast at the POST.
    const access = await requireTripAccess(params.id);
    if (!access.ok) return access.response;
    const { userId, supabase } = access.ctx;

    const body = await req.json() as FlightPatch;
    const insert: FlightPatch & { trip_id: string; user_id: string } = {
      trip_id: params.id,
      user_id: userId,
    };
    for (const k of PATCHABLE_FIELDS) {
      if (body[k] !== undefined) insert[k] = body[k];
    }

    const { data, error } = await supabase
      .from('flight_bookings')
      .insert(insert)
      .select()
      .single();

    if (error) {
      console.error('flights POST error:', error);
      return NextResponse.json({ error: 'Failed to add flight' }, { status: 500 });
    }
    return NextResponse.json({ item: data });
  } catch (err) {
    console.error('flights POST error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const itemId = body?.itemId as string | undefined;
    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

    const updates: FlightPatch = {};
    for (const k of PATCHABLE_FIELDS) {
      if (body[k] !== undefined) updates[k] = body[k];
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const supabase = createAdminClient();
    // Scope by user_id AND trip_id so a mistyped URL or stale itemId
    // can never PATCH a row that doesn't actually belong to (this user, this trip).
    const { error } = await supabase
      .from('flight_bookings')
      .update(updates)
      .eq('id', itemId)
      .eq('user_id', userId)
      .eq('trip_id', params.id);

    if (error) {
      console.error('flights PATCH error:', error);
      return NextResponse.json({ error: 'Failed to update flight' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('flights PATCH error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await getAuthUserId();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { itemId } = await req.json();
    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('flight_bookings')
      .delete()
      .eq('id', itemId)
      .eq('user_id', userId)
      .eq('trip_id', params.id);

    if (error) {
      console.error('flights DELETE error:', error);
      return NextResponse.json({ error: 'Failed to delete flight' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('flights DELETE error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
