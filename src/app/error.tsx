'use client';

// Next.js requires error.tsx to be a client component because it
// needs to receive the `reset` callback that re-renders the segment.
// Catches any unhandled error inside the App Router tree below it.

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to console + Vercel runtime logs. Sentry hook is the
    // place to plug in once SENTRY_DSN is configured (see GOLIVE_CHECKLIST).
    console.error('[error.tsx] caught:', error);
  }, [error]);

  return (
    <div className="min-h-screen gradient-subtle flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <div className="flex items-center justify-center mb-10">
          <Image src="/tripcoord_logo.png" alt="tripcoord" width={180} height={56} className="h-12 w-auto" priority />
        </div>
        <div className="card p-8 sm:p-10">
          <p className="text-5xl mb-4">⚠️</p>
          <h1 className="text-3xl font-script italic font-semibold text-zinc-900 mb-2">
            Something went sideways
          </h1>
          <p className="text-zinc-600 mb-2">
            We hit an unexpected error. Try reloading — if it keeps happening, drop us a note at{' '}
            <a href="mailto:hello@tripcoord.ai" className="font-semibold text-sky-700 hover:text-sky-900">
              hello@tripcoord.ai
            </a>
            .
          </p>
          {error.digest && (
            <p className="text-xs text-zinc-400 mb-6 font-mono">Reference: {error.digest}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            <button onClick={reset} className="btn-primary">
              Try again
            </button>
            <Link href="/" className="btn-ghost">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
