// Sentry edge SDK config — runs in Edge runtimes (middleware, edge
// API routes). Same conditional pattern.

import * as Sentry from '@sentry/nextjs';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    debug: false,
    environment: process.env.NODE_ENV,
  });
}
