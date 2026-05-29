import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminSupportClient } from './Client';

export const dynamic = 'force-dynamic';

/**
 * /admin/support
 *   Admin-only list of support tickets. Server-side gates on
 *   profiles.is_admin before rendering — non-admins redirect to /dashboard
 *   so the route doesn't even surface its existence.
 */
export default async function AdminSupportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login?redirect=/admin/support');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_admin) redirect('/dashboard');

  return <AdminSupportClient />;
}
