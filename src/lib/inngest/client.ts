/**
 * Inngest client — the durable background-job runtime for tripcoord.
 *
 * Auth is via env vars the SDK reads automatically (set by the Vercel
 * integration): `INNGEST_EVENT_KEY` (to send events) and `INNGEST_SIGNING_KEY`
 * (to verify requests Inngest makes back to /api/inngest). No keys are passed
 * here — keep it that way so they never land in the bundle.
 *
 * The `id` is the Inngest "app" name; functions registered against this client
 * are synced to that app on each deploy via the serve endpoint.
 */

import { Inngest } from 'inngest';

export const inngest = new Inngest({ id: 'tripcoord' });
