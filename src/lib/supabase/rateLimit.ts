import { createAdminClient } from './admin';

/**
 * Atomic per-key rate limiter backed by Postgres (public.consume_rate_limit RPC).
 * Returns true when the call is allowed (under the limit), false when it
 * should be rejected. Window auto-resets after `windowSeconds` of elapsed
 * time since the first attempt in that window.
 *
 * Keys are arbitrary strings — caller chooses the scope. Common patterns:
 *   `reset_email:ip:${ip}`   — bound spam from a single source
 *   `reset_email:to:${addr}` — bound spam to a single recipient
 *   `feature:user:${userId}` — bound a per-user feature call
 *
 * Fail-open on RPC errors: if Supabase is down we'd rather let the request
 * through than 503 the whole endpoint. The RPC's RETURN NULL on error
 * (which we coerce to true) preserves availability at the cost of one
 * extra-burst window during a Supabase outage.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.warn('[rateLimit] RPC failed (failing open):', error);
    return true;
  }
  return data === true;
}

/**
 * Best-effort client-IP extraction from a NextRequest. Vercel and most CDNs
 * forward the original client IP in x-forwarded-for as the first entry; we
 * fall through to x-real-ip and then the connecting remote. None of these
 * are spoof-proof on their own, but for unauth abuse mitigation the bar
 * is "more friction than zero," not cryptographic certainty.
 */
export function clientIpFromRequest(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
}
