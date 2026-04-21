import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TablesUpdate } from '@/lib/supabase/database.types';

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
 * Supports: name (string), avatar_url (string), notification_preferences (JSONB), travel_persona (JSONB)
 * Note: email changes require Supabase re-auth and are handled separately.
 */
export async function PATCH(request: Request) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { name, avatar_url, notification_preferences, travel_persona } = body;

    // Build the update payload — only include fields that were sent
    const updates: TablesUpdate<'profiles'> = {};
    if (typeof name === 'string' && name.trim().length > 0) {
      updates.name = name.trim();
    }
    if (typeof avatar_url === 'string') {
      updates.avatar_url = avatar_url;
    }
    if (notification_preferences && typeof notification_preferences === 'object') {
      updates.notification_preferences = notification_preferences;
    }
    if (travel_persona && typeof travel_persona === 'object') {
      updates.travel_persona = travel_persona;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (error) {
      console.error('PATCH profiles error:', error);
      return NextResponse.json({ error: 'Failed to save changes' }, { status: 500 });
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
      .select('id, name, email, avatar_url, subscription_tier, notification_preferences, travel_persona')
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
      travelPersona: profile?.travel_persona ?? null,
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
