/**
 * PATCH /api/support/tickets/[id]
 *   Admin-only: update a ticket's status, priority, assignment, or admin_notes.
 *   Always stamps last_updated_by = caller. Setting status to 'resolved'
 *   stamps resolved_at automatically. Assignment changes ping the new
 *   assignee via the in-app notifications bell.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { createAdminClient } from '@/lib/supabase/admin';

const ALLOWED_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
const ALLOWED_PRIORITIES = ['normal', 'high'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { userId } = auth.ctx;

  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Invalid ticket id' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: caller } = await admin
    .from('profiles')
    .select('is_admin, name, email')
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
    assigned_to?: string | null;
    last_updated_by: string;
    updated_at: string;
    resolved_at?: string | null;
  } = {
    last_updated_by: userId,
    updated_at: new Date().toISOString(),
  };

  if (typeof body?.status === 'string' && (ALLOWED_STATUSES as readonly string[]).includes(body.status)) {
    update.status = body.status;
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

  // Assignment: null clears, uuid sets. Must point at another admin if not
  // null — silently coerce non-admin assignments to null rather than 400,
  // since the client shouldn't be sending them in the first place.
  let newAssignee: string | null | undefined;
  if ('assigned_to' in body) {
    if (body.assigned_to === null) {
      newAssignee = null;
    } else if (typeof body.assigned_to === 'string' && UUID_RE.test(body.assigned_to)) {
      const { data: assigneeProfile } = await admin
        .from('profiles')
        .select('id, is_admin')
        .eq('id', body.assigned_to)
        .single();
      newAssignee = assigneeProfile?.is_admin ? body.assigned_to : null;
    } else {
      newAssignee = null;
    }
    update.assigned_to = newAssignee;
  }

  // Fetch prior state so we can decide whether to fire the "assigned to
  // you" notification. Done before the UPDATE so we don't race against
  // a concurrent PATCH stamping the same field.
  const { data: prior } = await admin
    .from('support_tickets')
    .select('assigned_to, subject')
    .eq('id', params.id)
    .single();

  const { error } = await admin
    .from('support_tickets')
    .update(update)
    .eq('id', params.id);

  if (error) {
    console.error('[support/tickets PATCH] failed:', error);
    return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
  }

  // Notification: when the ticket is assigned to a DIFFERENT admin (not the
  // caller themselves, not the same person it was already assigned to),
  // ping that admin via the bell. Fire-and-forget; a notification failure
  // shouldn't 500 the PATCH.
  if (
    newAssignee !== undefined &&
    newAssignee !== null &&
    newAssignee !== userId &&
    newAssignee !== prior?.assigned_to
  ) {
    try {
      const senderLabel = caller.name ?? caller.email ?? 'An admin';
      await admin.from('notifications').insert({
        user_id: newAssignee,
        type: 'support_ticket',
        trip_id: null,
        trip_name: null,
        inviter_name: senderLabel,
        message: `${senderLabel} assigned you ticket: "${prior?.subject ?? 'a support ticket'}"`,
      });
    } catch (notifyErr) {
      console.warn('[support/tickets PATCH] assignee notify failed (non-fatal):', notifyErr);
    }
  }

  return NextResponse.json({ ok: true });
}
