import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * DELETE /api/auth/me
 * Permanently deletes the authenticated user's account and profile row.
 */
export async function DELETE() {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createAdminClient();

    // Remove profile row first (auth deletion cascades in Supabase, but belt-and-suspenders)
    await supabase.from('profiles').delete().eq('id', user.id);

    // Delete the auth user via admin client
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      console.error('Delete user error:', error);
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Delete account error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

/**
 * PATCH /api/auth/me
 * Updates mutable profile fields for the authenticated user.
 * Currently supports: notification_preferences (JSONB)
 */
export async function PATCH(request: Request) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { notification_preferences } = body;

    if (!notification_preferences || typeof notification_preferences !== 'object') {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('profiles')
      .update({ notification_preferences })
      .eq('id', user.id);

    if (error) {
      console.error('Update notification preferences error:', error);
      return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('PATCH /api/auth/me error:', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

/**
 * GET /api/auth/me
 * Returns the current authenticated user's profile.
 */
export async function GET() {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ user: null }, { status: 401 });

    const supabase = createAdminClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, email, avatar_url, subscription_tier, notification_preferences')
      .eq('id', user.id)
      .single();

    const name = profile?.name ?? profile?.email?.split('@')[0] ?? user.email?.split('@')[0] ?? 'You';

    return NextResponse.json({
      id: user.id,
      email: profile?.email ?? user.email,
      name,
      avatarUrl: profile?.avatar_url ?? null,
      subscriptionTier: profile?.subscription_tier ?? 'free',
      notificationPreferences: profile?.notification_preferences ?? null,
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
