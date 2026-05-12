import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { destinationToCountry, countryToContinent } from '@/lib/world/countryLookup';
import Client from './Client';

/**
 * Public share landing for /share/world/[userId].
 *
 * Anyone with the URL can view this page. The page renders the share
 * card image (server-generated) plus stats + a friendly CTA pulling
 * cold viewers into a tripcoord signup.
 *
 * generateMetadata wires the share-card PNG as the OG image so the URL
 * previews richly on Twitter / iMessage / Slack / WhatsApp / etc.
 */

interface PageProps {
  params: { userId: string };
}

async function fetchSummary(userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  try {
    const supabase = createAdminClient();
    const [profileRes, tripsRes] = await Promise.all([
      supabase.from('profiles').select('name').eq('id', userId).single(),
      supabase
        .from('trips')
        .select('destination, start_date, end_date')
        .eq('organizer_id', userId)
        .not('end_date', 'is', null),
    ]);

    const userName = (profileRes.data?.name ?? '').split(' ')[0] || 'A traveler';
    const todayMs = Date.now();
    const completedTrips = (tripsRes.data ?? []).filter(
      t => t.end_date && new Date(t.end_date + 'T12:00:00').getTime() < todayMs,
    );

    const countries = new Set<string>();
    const cities = new Set<string>();
    const continents = new Set<string>();
    let daysAbroad = 0;
    for (const t of completedTrips) {
      const country = destinationToCountry(t.destination);
      if (country) {
        countries.add(country);
        const continent = countryToContinent(country);
        if (continent) continents.add(continent);
      }
      const city = t.destination.split(',')[0]?.trim();
      if (city) cities.add(city);
      if (t.start_date && t.end_date) {
        const ms = new Date(t.end_date + 'T12:00:00').getTime() - new Date(t.start_date + 'T12:00:00').getTime();
        const days = Math.round(ms / 86400000);
        if (days > 0) daysAbroad += days;
      }
    }

    return {
      userName,
      countryCount: countries.size,
      cityCount: cities.size,
      continentCount: continents.size,
      daysAbroad,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const summary = await fetchSummary(params.userId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tripcoord.ai';
  const cardUrl = `${appUrl}/api/world/share-card/${params.userId}`;
  const pageUrl = `${appUrl}/share/world/${params.userId}`;

  const title = summary
    ? `${summary.userName}'s World on tripcoord`
    : 'My World · tripcoord';
  const description = summary && summary.countryCount > 0
    ? `${summary.userName} has explored ${summary.countryCount} ${summary.countryCount === 1 ? 'country' : 'countries'} and ${summary.cityCount} ${summary.cityCount === 1 ? 'city' : 'cities'} across ${summary.continentCount} ${summary.continentCount === 1 ? 'continent' : 'continents'} on tripcoord.`
    : `${summary?.userName ?? 'A traveler'} is planning their next adventure on tripcoord.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: 'tripcoord',
      images: [{ url: cardUrl, width: 1200, height: 630, alt: title }],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [cardUrl],
    },
  };
}

export default async function Page({ params }: PageProps) {
  const summary = await fetchSummary(params.userId);
  return <Client userId={params.userId} summary={summary} />;
}
