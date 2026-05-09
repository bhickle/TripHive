import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import Client from './Client';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('featured_itineraries')
      .select('title, tagline')
      .eq('slug', params.slug)
      .single();
    return {
      title: data?.title ?? 'Featured Itinerary',
      description: data?.tagline ?? undefined,
    };
  } catch {
    return { title: 'Featured Itinerary' };
  }
}

export default function Page() {
  return <Client />;
}
