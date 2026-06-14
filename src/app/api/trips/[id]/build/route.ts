import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/supabase/requireAuth';
import { requireTripAiRole } from '@/lib/supabase/tripAccess';
import { inngest } from '@/lib/inngest/client';

/**
 * POST /api/trips/[id]/build
 *
 * Kicks off the background itinerary build by emitting `itinerary/build.requested`,
 * which `buildItineraryFn` (Inngest) picks up to orchestrate the chunks server-side
 * — so the build completes even if the browser closes.
 *
 * Body: { payload: <full generation body>, freshRebuild?: boolean }
 *   `payload` is exactly what the browser would POST to /api/generate-itinerary
 *   (destinations, dailyOutlines, dayPlans, etc.) — the worker forwards it per chunk.
 *
 * Auth: organizer / co-organizer of the trip (an AI change).
 *
 * Fallback contract: returns `{ ok: false, fallback: true }` when Inngest can't
 * accept the event (no INNGEST_EVENT_KEY, or send throws). The caller then runs
 * the in-browser SSE build instead — so a missing/unhealthy Inngest never blocks
 * a build; background is the default path, the client build is the safety net.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const roleCheck = await requireTripAiRole(params.id);
  if (!roleCheck.ok) return roleCheck.response;

  // Background build is OFF by default while the paste-generation path is being
  // fixed and the designed background UX is built. The client falls back to the
  // proven in-browser SSE build on { fallback:true }. Re-enable per-environment
  // by setting BACKGROUND_BUILD_ENABLED=true in Vercel — no redeploy needed.
  if (process.env.BACKGROUND_BUILD_ENABLED !== 'true') {
    return NextResponse.json({ ok: false, fallback: true, reason: 'disabled' });
  }

  // No event key → Inngest can't accept events in this env. Signal fallback.
  if (!process.env.INNGEST_EVENT_KEY) {
    return NextResponse.json({ ok: false, fallback: true, reason: 'no_event_key' });
  }

  let body: { payload?: Record<string, unknown>; freshRebuild?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  }
  const payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};

  try {
    await inngest.send({
      name: 'itinerary/build.requested',
      data: {
        tripId: params.id,
        userId: auth.ctx.userId,
        freshRebuild: body.freshRebuild === true,
        payload,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[trips/build] inngest.send failed — client should fall back:', err);
    return NextResponse.json({ ok: false, fallback: true, reason: 'send_failed' });
  }
}
