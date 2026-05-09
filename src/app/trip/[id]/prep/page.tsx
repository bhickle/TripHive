import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import Client from './Client';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('trips')
      .select('title')
      .eq('id', params.id)
      .single();
    return { title: data?.title ? `${data.title} · Prep Hub` : 'Prep Hub' };
  } catch {
    return { title: 'Prep Hub' };
  }
}

export default function Page({ params }: { params: { id: string } }) {
  return <Client params={params} />;
}
