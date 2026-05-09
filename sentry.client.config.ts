// Sentry client SDK config — runs in the browser.
//
// Initializes only when NEXT_PUBLIC_SENTRY_DSN is set in env. Without
// the DSN, this file is a harmless no-op so deploys without Sentry
// configured don't error.
//
// To enable:
//   1. Create a Sentry project at sentry.io
//   2. Add NEXT_PUBLIC_SENTRY_DSN to Vercel env vars
//   3. Deploy. Errors start flowing automatically.

import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    // Adjust before scaling — 1.0 captures every transaction; in prod
    // you'd typically want 0.1 (10% sample) once volume picks up.
    tracesSampleRate: 1.0,
    // Replays catch UI state at the moment of an error. Sample sparingly
    // to control quota — these have a higher per-event cost than
    // breadcrumbs.
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,
    debug: false,
    environment: process.env.NODE_ENV,
  });
}
