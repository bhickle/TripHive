import type { Metadata } from 'next';
import Client from './Client';

export const metadata: Metadata = {
  title: 'Discover',
  description: 'Curated 7-day starter itineraries — Mediterranean summers, European Christmas markets, family theme parks, fall foliage. Fork them into your own trip.',
};

export default function Page() {
  return <Client />;
}
