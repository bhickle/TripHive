/**
 * POST /api/support/tickets
 *   User-facing: submit a support ticket from the Settings "Contact Support"
 *   card. Auto-tags Travel Pro users priority='high' (the pricing-page promise),
 *   notifies every admin via the existing in-app notifications system.
 *
 * GET /api/support/tickets[?status=open|in_progress|resolved|closed]
 *   Admin-only: list tickets, sorted unassigned-first then priority desc then
 *   created_at desc. Returns { tickets, admins } so the client can render
 *   assignee + last-updated-by names without N+1 lookups.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeTier } from '@/lib/types';

const ALLOWED_CATEGORIES = ['general', 'bug', 'billing', 'feature', 'account'] as const;
const ALLOWED_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
type Category = (typeof ALLOWED_CATEGORIES)[number];

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { userId } = auth.ctx;

  const body = await req.json().catch(() => ({}));
  const subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
  const messageBody = typeof body?.body === 'string' ? body.body.trim() : '';
  const categoryRaw = typeof body?.category === 'string' ? body.category : 'general';
  const category: Category = (ALLOWED_CATEGORIES as readonly string[]).includes(categoryRaw)
    ? (categoryRaw as Category)
    : 'general';
  const tripId = typeof body?.tripId === 'string' && /^[0-9a-f-]{36}$/i.test(body.tripId)
    ? body.tripId
    : null;

  if (!subject || subject.length > 200) {
    return NextResponse.json({ error: 'Subject required (1–200 characters)' }, { status: 400 });
  }
  if (!messageBody || messageBody.length > 5000) {
    return NextResponse.json({ error: 'Message required (1–5000 characters)' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Pull email + name + tier for the snapshot. Tier drives priority — Travel
  // Pro users get priority='high' per the pricing-page promise. Free and Trip
  // Pass map to normal; their tickets aren't ignored, just not pre-flagged for
  // the top of the queue.
  const { data: profile } = await admin
    .from('profiles')
    .select('email, name, subscription_tier')
    .eq('id', userId)
    .single();

  // Normalize so a legacy 'nomad'/'explorer' row still resolves to travel_pro.
  const userTier = normalizeTier(profile?.subscription_tier);
  const priority: 'normal' | 'high' = userTier === 'travel_pro' ? 'high' : 'normal';

  const { data: ticket, error: insertErr } = await admin
    .from('support_tickets')
    .insert({
      user_id: userId,
      email: profile?.email ?? '',
      name: profile?.name ?? null,
      subject,
      body: messageBody,
      category,
      priority,
      user_tier: userTier,
      trip_id: tripId,
    })
    .select('id, created_at')
    .single();

  if (insertErr || !ticket) {
    console.error('[support/tickets POST] insert failed:', insertErr);
    return NextResponse.json({ error: 'Failed to submit ticket' }, { status: 500 });
  }

  // Fan-out notification to every admin so the bell icon ticks. Fire-and-
  // forget — a notification-insert failure shouldn't 500 the user-facing
  // submit.
  try {
    const { data: admins } = await admin
      .from('profiles')
      .select('id')
      .eq('is_admin', true);
    if (admins?.length) {
      const senderLabel = profile?.name ?? profile?.email ?? 'A user';
      const rows = admins.map(a => ({
        user_id: a.id,
        type: 'support_ticket' as const,
        trip_id: null,
        trip_name: null,
        inviter_name: senderLabel,
        message: `New ${priority === 'high' ? 'priority ' : ''}support ticket: "${subject}"`,
      }));
      await admin.from('notifications').insert(rows);
    }
  } catch (notifyErr) {
    console.warn('[support/tickets POST] admin notification failed (non-fatal):', notifyErr);
  }

  return NextResponse.json({ id: ticket.id });
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { userId } = auth.ctx;

  const admin = createAdminClient();

  // Admin gate. Non-admins get 403 — RLS would surface them only their own
  // tickets via SELECT, but the admin list endpoint is admin-only.
  const { data: caller } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();
  if (!caller?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const statusFilter = req.nextUrl.searchParams.get('status');
  const validStatus = statusFilter && (ALLOWED_STATUSES as readonly string[]).includes(statusFilter)
    ? statusFilter
    : null;

  // Sort: unassigned (assigned_to IS NULL) first, then priority ('high'
  // before 'normal'), then created_at desc. The priority column is text;
  // 'high' < 'normal' alphabetically (h<n), so ASCENDING gives the order
  // we want — counterintuitively. If a third priority value ever gets
  // added (e.g. 'critical', 'urgent') this will break; switch to a CASE
  // expression at that point.
  let query = admin
    .from('support_tickets')
    .select('*')
    .order('assigned_to', { ascending: true, nullsFirst: true })
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(200);

  if (validStatus) query = query.eq('status', validStatus);

  const { data: tickets, error } = await query;
  if (error) {
    console.error('[support/tickets GET] failed:', error);
    return NextResponse.json({ error: 'Failed to load tickets' }, { status: 500 });
  }

  // Surface all admins so the client can render assignee + last-updated-by
  // names without N+1 lookups. Small list (typically <10), one query.
  const { data: admins } = await admin
    .from('profiles')
    .select('id, name, email')
    .eq('is_admin', true)
    .order('name', { ascending: true });

  return NextResponse.json({
    tickets: tickets ?? [],
    admins: admins ?? [],
    callerId: userId,
  });
}
