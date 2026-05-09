import type { MetadataRoute } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';

const BASE = 'https://www.tripcoord.ai';

// Static, public-facing routes. Authenticated routes (dashboard, settings,
// /trip/[id]/...) are intentionally omitted — they're per-user and not
// indexable.
const STATIC_ROUTES: { path: string; priority: number; freq: 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '/',               priority: 1.0, freq: 'weekly'  },
  { path: '/pricing',        priority: 0.9, freq: 'monthly' },
  { path: '/discover',       priority: 0.9, freq: 'weekly'  },
  { path: '/auth/login',     priority: 0.4, freq: 'yearly'  },
  { path: '/auth/signup',    priority: 0.6, freq: 'yearly'  },
  { path: '/legal/terms',    priority: 0.3, freq: 'yearly'  },
  { path: '/legal/privacy',  priority: 0.3, freq: 'yearly'  },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString();

  // Pull every published featured itinerary so /discover/[slug] pages
  // get indexed individually (they're real SEO landing pages with
  // hand-written 7-day itineraries).
  let featured: { slug: string; updated_at?: string }[] = [];
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('featured_itineraries')
      .select('slug')
      .eq('published', true);
    featured = data ?? [];
  } catch {
    // Sitemap should still render even if Supabase blips; static
    // routes alone are better than 500-ing the whole sitemap.
  }

  return [
    ...STATIC_ROUTES.map(r => ({
      url: `${BASE}${r.path}`,
      lastModified: now,
      changeFrequency: r.freq,
      priority: r.priority,
    })),
    ...featured.map(f => ({
      url: `${BASE}/discover/${f.slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
  ];
}
