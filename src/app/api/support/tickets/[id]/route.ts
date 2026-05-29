/**
 * PATCH /api/support/tickets/[id]
 *   Admin-only: update a ticket's status, priority, or admin_notes.
 *   Setting status to 'resolved' stamps resolved_at automatically.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { createAdminClient } from '@/lib/supabase/admin';

const ALLOWED_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
const ALLOWED_PRIORITIES = ['normal', 'high'] as const;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { userId } = auth.ctx;

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: 'Invalid ticket id' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: caller } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();
  if (!caller?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const update: {
    status?: string;
    priority?: string;
    admin_notes?: string | null;
    updated_at: string;
    resolved_at?: string | null;
  } = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body?.status === 'string' && (ALLOWED_STATUSES as readonly string[]).includes(body.status)) {
    update.status = body.status;
    // Stamp resolved_at when transitioning to 'resolved'; clear it if the
    // ticket is re-opened later (status moves away from resolved/closed).
    if (body.status === 'resolved') {
      update.resolved_at = new Date().toISOString();
    } else if (body.status === 'open' || body.status === 'in_progress') {
      update.resolved_at = null;
    }
  }

  if (typeof body?.priority === 'string' && (ALLOWED_PRIORITIES as readonly string[]).includes(body.priority)) {
    update.priority = body.priority;
  }

  if ('admin_notes' in body) {
    update.admin_notes = typeof body.admin_notes === 'string' ? body.admin_notes : null;
  }

  const { error } = await admin
    .from('support_tickets')
    .update(update)
    .eq('id', params.id);

  if (error) {
    console.error('[support/tickets PATCH] failed:', error);
    return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
