/**
 * Inngest serve endpoint.
 *
 * Inngest calls this endpoint to (a) sync the app's function list on deploy and
 * (b) invoke functions step-by-step. The SDK verifies every request with
 * `INNGEST_SIGNING_KEY`, so this route is safe to leave publicly reachable (the
 * coming-soon middleware already exempts all /api/* routes).
 *
 * Each step runs as its own invocation; coherence makes AI + Places calls, so
 * pin the function-class timeout ceiling.
 */

import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { inngestFunctions } from '@/lib/inngest/functions';

export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
