import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';

/**
 * Saved layover plans — a lightweight "mini-trip" a user can keep and revisit
 * (airport + layover time + the activities they've added). Owner-scoped.
 *
 * GET  /api/layovers          → list the caller's saved layovers
 * POST /api/layovers          → create one
 *   body: { airportCode, airportName?, city?, country?, layoverHours?, title?, items? }
 */

// Row → client shape (camelCase).
function toClient(row: {
  id: string;
  airport_code: string;
  airport_name: string | null;
  city: string | null;
  country: string | null;
  layover_hours: number | null;
  title: string | null;
  items: Json;
  suggestions: Json | null;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: row.id,
    airportCode: row.airport_code,
    airportName: row.airport_name,
    city: row.city,
    country: row.country,
    layoverHours: row.layover_hours,
    title: row.title,
    items: Array.isArray(row.items) ? row.items : [],
    // The generated suggestions snapshot (LayoverResult) so loading a saved
    // layover restores the options the user was choosing from — no re-gen.
    suggestions: row.suggestions ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('layover_plans')
    .select('*')
    .eq('user_id', auth.ctx.userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('layovers GET error:', error);
    return NextResponse.json({ layovers: [], error: 'DB_ERROR' }, { status: 500 });
  }
  return NextResponse.json({ layovers: (data ?? []).map(toClient) });
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const airportCode = typeof body.airportCode === 'string' ? body.airportCode.trim().toUpperCase() : '';
  if (!airportCode) {
    return NextResponse.json({ error: 'airportCode required' }, { status: 400 });
  }
  const layoverHours = typeof body.layoverHours === 'number' && body.layoverHours > 0 ? body.layoverHours : null;
  const items = Array.isArray(body.items) ? body.items : [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('layover_plans')
    .insert({
      user_id: auth.ctx.userId,
      airport_code: airportCode,
      airport_name: typeof body.airportName === 'string' ? body.airportName : null,
      city: typeof body.city === 'string' ? body.city : null,
      country: typeof body.country === 'string' ? body.country : null,
      layover_hours: layoverHours,
      title: typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null,
      items: items as unknown as Json,
      suggestions: (body.suggestions ?? null) as Json,
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('layovers POST error:', error);
    return NextResponse.json({ error: 'Failed to save layover' }, { status: 500 });
  }
  return NextResponse.json({ layover: toClient(data) });
}
