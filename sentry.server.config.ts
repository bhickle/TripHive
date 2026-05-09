// Sentry server SDK config — runs in Node.js (API routes, server
// components, server actions). Conditional init same as client.

import * as Sentry from '@sentry/nextjs';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    debug: false,
    environment: process.env.NODE_ENV,
  });
}
