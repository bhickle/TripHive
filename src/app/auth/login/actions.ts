'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Server action for email/password login.
 * Running sign-in server-side guarantees the auth cookies are set in the
 * HTTP response before the browser sees the redirect — no client-side cookie
 * timing issues, no session lost on page reload.
 */
export async function signInAction(
  email: string,
  password: string,
): Promise<{ error: string } | never> {
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

  // redirect() throws internally — Next.js sends a 303 to the browser.
  // The auth cookies are already in the Set-Cookie headers at this point.
  redirect('/dashboard');
}
