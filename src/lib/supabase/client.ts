import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';

/**
 * Browser-side Supabase client — singleton.
 *
 * IMPORTANT: createBrowserClient must only be called once per app. Calling it
 * multiple times creates competing instances that fight over the same Web Lock
 * ("lock:sb-…-auth-token"), causing "lock stolen" errors and auth deadlocks.
 * Callers should use this exported singleton instead of calling createBrowserClient directly.
 */
let _client: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (!_client) {
    _client = createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _client;
}
