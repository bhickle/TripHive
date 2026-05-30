import type { Metadata } from 'next';
import { Suspense } from 'react';
import Client from './Client';

export const metadata: Metadata = {
  title: 'Discover',
  description: 'Curated 7-day starter itineraries — Mediterranean summers, European Christmas markets, family theme parks, fall foliage. Fork them into your own trip.',
};

// Suspense boundary required because Client uses useSearchParams() to read
// ?q= on mount (Trending Now cards push the destination name to the URL so
// browser Back undoes the filter — see TopSearchCard onClick).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Client />
    </Suspense>
  );
}
