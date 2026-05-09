import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import Client from './Client';

// generateMetadata runs on the server before render. We fetch only the
// trip title (admin client bypasses RLS — fine for a public-ish meta
// fetch; the page itself enforces auth client-side). On miss, fall
// through to the generic suffix from the root template.
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('trips')
      .select('title')
      .eq('id', params.id)
      .single();
    return { title: data?.title ?? 'Itinerary' };
  } catch {
    return { title: 'Itinerary' };
  }
}

export default function Page() {
  return <Client />;
}
