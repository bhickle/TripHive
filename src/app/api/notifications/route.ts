import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET  /api/notifications   — fetch unread notifications for the current user
 * POST /api/notifications   — mark a notification as read  { id }
 */

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { userId } = auth.ctx;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, trip_id, trip_name, inviter_name, message, read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('[notifications] fetch error:', error);
    return NextResponse.json({ notifications: [] });
  }

  return NextResponse.json({ notifications: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { userId } = auth.ctx;

  const { id, markAllRead } = await req.json();

  const supabase = createAdminClient();

  if (markAllRead) {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
    return NextResponse.json({ success: true });
  }

  if (id) {
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .eq('user_id', userId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'id or markAllRead required' }, { status: 400 });
}
