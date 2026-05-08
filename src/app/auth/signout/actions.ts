'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side sign-out action — mirrors signInAction at /auth/login/actions.ts.
 *
 * Why we need this in addition to the client-side `supabase.auth.signOut()`:
 * the auth cookies are set by the server action at sign-in via Set-Cookie
 * response headers. The client-side `signOut()` from `@supabase/ssr` clears
 * what it can reach via `document.cookie`, but in some flows (especially
 * sign-in → sign-out → sign-in again) the Web Lock and cookie state can
 * desync. Symptom: the second sign-out click does nothing visible because
 * the await never resolves OR the cookie isn't actually cleared, leaving
 * the user authenticated server-side after the hard reload.
 *
 * Belt-and-suspenders fix: hit this action FIRST so cookies are cleared via
 * Set-Cookie response headers, THEN call the client-side signOut to reset
 * AuthContext state, THEN hard-nav. Either path alone is fragile; together
 * they're robust to the lock/cookie desync edge cases.
 */
export async function signOutAction(): Promise<{ ok: true }> {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  // Best-effort signOut — even if Supabase errors (no session, network blip),
  // we still want the response to clear the client-side state because the
  // user clicked sign out. The client-side signOut + hard reload handles
  // anything we miss here.
  try {
    await supabase.auth.signOut();
  } catch {
    /* swallow — client-side cleanup follows */
  }

  return { ok: true };
}
