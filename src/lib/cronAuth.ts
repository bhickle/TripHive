/**
 * Constant-time CRON_SECRET validation for Vercel cron endpoints.
 *
 * String equality (`!==`) reveals the matched-prefix length through timing,
 * which lets an attacker recover CRON_SECRET byte-by-byte by measuring
 * response times across many requests. crypto.timingSafeEqual compares all
 * bytes in constant time regardless of where the mismatch falls, closing
 * that channel.
 *
 * Use at the top of every /api/cron/* route — the helper short-circuits if
 * CRON_SECRET isn't configured (500) or if the Authorization header
 * doesn't match (401), returning the response object directly so the
 * caller can `if (!auth.ok) return auth.response`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';

export function verifyCronSecret(
  req: NextRequest,
  routeName: string,
): { ok: true } | { ok: false; response: NextResponse } {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error(`[${routeName}] CRON_SECRET is not set`);
    return {
      ok: false,
      response: NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 }),
    };
  }
  const authHeader = req.headers.get('authorization') ?? '';
  const expectedHeader = `Bearer ${expected}`;
  // Length mismatch IS observable via timingSafeEqual (it throws). Pad the
  // shorter buffer to match by failing the check before the constant-time
  // compare — but only after we've checked length equality. The length
  // itself leaks (an attacker learns the secret length), but that's a
  // small leak compared to byte-by-byte recovery.
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expectedHeader);
  const matches = a.length === b.length && timingSafeEqual(a, b);
  if (!matches) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true };
}
