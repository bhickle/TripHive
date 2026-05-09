import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = { title: 'Page Not Found' };

// Default Next 404 is unbranded. This matches the parchment palette
// used by /auth/login and the marketing pages so a missed link doesn't
// drop testers (or future users) into a stark white screen.
export default function NotFound() {
  return (
    <div className="min-h-screen gradient-subtle flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="flex items-center justify-center mb-10">
          <Image src="/tripcoord_logo.png" alt="tripcoord" width={180} height={56} className="h-12 w-auto" priority />
        </div>
        <div className="card p-8 sm:p-10">
          <p className="text-6xl mb-4">🧭</p>
          <h1 className="text-3xl font-script italic font-semibold text-zinc-900 mb-2">
            Off the map
          </h1>
          <p className="text-zinc-600 mb-8">
            We couldn&apos;t find that page. The link might be old, or the trip you&apos;re looking for has been deleted.
          </p>
          <Link href="/" className="btn-primary inline-block">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
