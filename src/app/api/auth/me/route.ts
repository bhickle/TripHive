import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
      .select('id, name, email, avatar_url, subscription_tier')
      .eq('id', user.id)
      .single();

    const name = profile?.name ?? profile?.email?.split('@')[0] ?? user.email?.split('@')[0] ?? 'You';

    return NextResponse.json({
      id: user.id,
      email: profile?.email ?? user.email,
      name,
      avatarUrl: profile?.avatar_url ?? null,
      subscriptionTier: profile?.subscription_tier ?? 'free',
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
