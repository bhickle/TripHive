/**
 * Server-to-server call to the EXISTING generation route for one chunk, used by
 * the background-build worker. This is the heart of "Option B": the worker
 * drives the same proven `/api/generate-itinerary` endpoint the browser uses —
 * it just authenticates with the internal secret instead of a cookie, and reads
 * the SSE stream to know when the chunk is done (the route persists the days to
 * the DB itself, exactly as it does for the browser).
 *
 * Returns the days + the day-1 `meta` block (title, practical notes, sidebar
 * lists). Throws on an `error` SSE event or a non-2xx response so the caller's
 * Inngest step retries.
 */

import type { ItineraryDay } from '@/lib/types';

export async function callGenerateChunk(
  body: Record<string, unknown>,
  userId: string,
): Promise<{ days: ItineraryDay[]; meta: Record<string, unknown> | null }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.tripcoord.ai';
  const secret = process.env.INTERNAL_BUILD_SECRET ?? '';

  const res = await fetch(`${appUrl}/api/generate-itinerary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Internal-auth path (resolveInternalBuildAuth) — the worker acts on
      // behalf of the build's organizer. The secret is server-only.
      'x-internal-build-secret': secret,
      'x-internal-build-user': userId,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => '');
    throw new Error(`generate-itinerary HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }

  // Drain the SSE stream the same way the browser does: collect `day` events,
  // capture the day-1 `meta`, stop on `done`, throw on `error`.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const days: ItineraryDay[] = [];
  let meta: Record<string, unknown> | null = null;
  let errored: string | null = null;
  let finished = false;

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split('\n\n');
    buf = events.pop() ?? '';
    for (const rawEvent of events) {
      for (const line of rawEvent.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(line.slice(6)); } catch { continue; }
        if (parsed.type === 'meta') {
          meta = parsed;
        } else if (parsed.type === 'day') {
          days.push(parsed.data as ItineraryDay);
        } else if (parsed.type === 'done') {
          finished = true;
          break;
        } else if (parsed.type === 'error') {
          errored = (parsed.message as string) || 'Generation failed';
          finished = true;
          break;
        }
      }
      if (finished) break;
    }
  }

  if (errored) throw new Error(errored);
  return { days, meta };
}
