'use client';

import React, {
  createContext, useContext, useEffect, useState, useCallback,
} from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { User, Session } from '@supabase/supabase-js';
import { DEMO_USER_EMAIL } from '@/lib/demo';

// ─── Profile shape ────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  subscription_tier: 'free' | 'trip_pass' | 'explorer' | 'nomad';
  ai_credits_used: number;
  ai_credits_reset_at: string | null;
}

// ─── Context shape ────────────────────────────────────────────────────────────

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  /** true when the logged-in account is the shared demo account */
  isDemo: boolean;
  isLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  profile: null,
  isDemo: false,
  isLoading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

// ─── Profile cache helpers ─────────────────────────────────────────────────────
const PROFILE_CACHE_KEY = 'tc_profile_cache';
// Supabase persists the active session in localStorage under this key.
// Reading it synchronously lets us validate the cache without an async round-trip.
const SUPABASE_SESSION_KEY = 'sb-pqizuvmtertpxhhxyemj-auth-token';

/** Read the current user ID out of Supabase's own localStorage session (synchronous). */
function getSessionUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SUPABASE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Supabase stores the session as { access_token, user: { id, ... }, ... }
    return parsed?.user?.id ?? null;
  } catch {
    return null;
  }
}

function readCachedProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as UserProfile;

    // Guard against cross-user bleed: only return the cache when it belongs
    // to whoever Supabase currently thinks is logged in.
    const sessionUserId = getSessionUserId();
    if (!sessionUserId || sessionUserId !== cached.id) {
      // No active session, or a different user — drop the stale cache immediately.
      try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch { /* ignore */ }
      return null;
    }

    return cached;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: UserProfile) {
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile)); } catch { /* ignore */ }
}

function clearCachedProfile() {
  try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch { /* ignore */ }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // Pre-populate profile from localStorage cache so auth-gated UI renders immediately
  // on page load without waiting for the Supabase round-trip.
  const [profile, setProfile] = useState<UserProfile | null>(() => readCachedProfile());
  // Only show loading state if there is no cached profile to show
  const [isLoading, setIsLoading] = useState(() => readCachedProfile() === null);

  // One stable Supabase browser client for the lifetime of the provider
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const fetchProfile = useCallback(
    async (userId: string) => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
        if (data) {
          setProfile(data);
          // Cache the full profile for instant hydration on next page load,
          // and also cache the tier separately for the existing tier-only fallback.
          writeCachedProfile(data);
          try {
            localStorage.setItem(`tc_tier_${userId}`, data.subscription_tier);
          } catch {
            // localStorage unavailable (e.g. private browsing with storage blocked) — ignore
          }
        } else {
          // Preserve the cached profile ONLY when it belongs to the same user
          // (handles network hiccups on tab-focus re-fetches without dropping the tier).
          // If a different user has logged in, clear immediately — never show
          // one user's name or data to a different account.
          setProfile(prev => (prev?.id === userId ? prev : null));
        }
      } catch (err) {
        // Query threw — apply same same-user preservation logic.
        console.warn('[AuthContext] fetchProfile error (profile preserved for same user):', err);
        setProfile(prev => (prev?.id === userId ? prev : null));
      } finally {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    // Hydrate from the stored session cookie.
    // NOTE: getSession() reads the cookie without server validation, but the
    // Next.js middleware already runs getUser() on every request and refreshes
    // the token, so by the time this runs the cookie is guaranteed fresh.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    // Keep in sync with auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setIsLoading(false);
        }
      },
    );

    // Re-fetch profile when the user returns to the tab (catches tier changes
    // made server-side — e.g. a Stripe webhook or manual Supabase update —
    // without requiring the user to sign out and back in).
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.user) fetchProfile(session.user.id);
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = async () => {
    // Clear cached profile and tier before signing out so they don't leak to the next user
    if (session?.user?.id) {
      try { localStorage.removeItem(`tc_tier_${session.user.id}`); } catch {}
    }
    clearCachedProfile();
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setIsLoading(false);
  };

  const refreshProfile = async () => {
    if (session?.user) await fetchProfile(session.user.id);
  };

  const isDemo = session?.user?.email === DEMO_USER_EMAIL;

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      isDemo,
      isLoading,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useAuth = () => useContext(AuthContext);
