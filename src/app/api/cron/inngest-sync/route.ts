/**
 * GET /api/cron/inngest-sync
 *
 * Vercel Cron — re-registers the Inngest app by PUTting our own serve endpoint
 * from the stable PRODUCTION URL. This is the code-side "auto-resync" so we
 * don't have to `curl -X PUT` after deploys.
 *
 * Why this exists: the Vercel↔Inngest integration syncs using the per-deployment
 * `*.vercel.app` URL, which is behind Vercel Deployment Protection (SSO) and so
 * can't be reached by Inngest. The production custom domain (www.tripcoord.ai)
 * is NOT SSO-protected, so a self-PUT from here re-syncs successfully.
 *
 * Idempotent: the serve PUT returns `{ modified: false }` when nothing changed.
 *
 * NOTE: this is a periodic safety net (see vercel.json schedule), so there can
 * be up to one interval of lag after a deploy that changes function definitions.
 * For zero-lag on-deploy sync, set up Vercel "Protection Bypass for Automation"
 * and give the secret to the Inngest Vercel integration instead.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (Vercel adds this for cron runs).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { verifyCronSecret } from '@/lib/cronAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = verifyCronSecret(req, 'cron/inngest-sync');
  if (!auth.ok) return auth.response;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tripcoord.ai';
  try {
    const res = await fetch(`${appUrl}/api/inngest`, { method: 'PUT' });
    const body = await res.text().catch(() => '');
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      body: body.slice(0, 300),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'resync failed';
    console.error('[cron/inngest-sync]', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
