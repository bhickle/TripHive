import type { Metadata } from 'next';
import { Suspense } from 'react';
import Client from './Client';

export const metadata: Metadata = { title: 'My Trips' };

// useSearchParams() in the client component requires a Suspense boundary
// at the page level for static prerendering to work. Without this, Next.js
// fails the build with "useSearchParams() should be wrapped in a suspense
// boundary at page '/trips'" — added when QA 5/11 introduced the
// ?status= deep-link from the dashboard stat cards.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Client />
    </Suspense>
  );
}
