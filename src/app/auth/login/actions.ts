'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server action for email/password login.
 * Running sign-in server-side guarantees the auth cookies are set in the
 * HTTP response before the browser sees the navigation.
 *
 * NOTE: We intentionally do NOT call redirect() here. If we did, Next.js
 * performs a client-side navigation which keeps AuthContext mounted with its
 * old state (session = null, isLoading = false). The dashboard then sees no
 * user and immediately bounces back to /auth/login before onAuthStateChange
 * fires. Returning { success: true } and doing window.location.href on the
 * client forces a full browser reload — AuthContext re-initialises from
 * scratch, reads the freshly-set session cookies, and the auth check passes.
 */
export async function signInAction(
  email: string,
  password: string,
): Promise<{ error: string } | { success: true }> {
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

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  // Auth cookies are now in the Set-Cookie response headers.
  // The client will do a full hard navigation to /dashboard.
  return { success: true };
}
