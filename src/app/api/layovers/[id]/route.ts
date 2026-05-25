import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';

/**
 * PATCH  /api/layovers/[id]   → update a saved layover (owner-scoped)
 *   body: { title?, items?, layoverHours? }
 * DELETE /api/layovers/[id]   → remove a saved layover (owner-scoped)
 *
 * Both re-scope every query by user_id so one user can't touch another's row
 * even if they guess an id (RLS is a second layer).
 */

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const update: { updated_at: string; items?: Json; suggestions?: Json; title?: string | null; layover_hours?: number } = {
    updated_at: new Date().toISOString(),
  };
  if (Array.isArray(body.items)) update.items = body.items as unknown as Json;
  if ('suggestions' in body) update.suggestions = (body.suggestions ?? null) as Json;
  if (typeof body.title === 'string') update.title = body.title.trim() || null;
  if (typeof body.layoverHours === 'number' && body.layoverHours > 0) update.layover_hours = body.layoverHours;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('layover_plans')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', auth.ctx.userId);

  if (error) {
    console.error('layovers PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update layover' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('layover_plans')
    .delete()
    .eq('id', params.id)
    .eq('user_id', auth.ctx.userId);

  if (error) {
    console.error('layovers DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete layover' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
