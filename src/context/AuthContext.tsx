'use client';

import React, {
  createContext, useContext, useEffect, useState, useCallback,
} from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { createClient as createSupabaseBrowserClient } from '@/lib/supabase/client';
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
  home_country: string | null;
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

// ─── Supabase singleton ───────────────────────────────────────────────────────
// Use the shared browser-client singleton from src/lib/supabase/client.ts so
// every part of the app (this provider, useCurrentUser hook, anywhere else
// that needs a browser-side client) shares one instance. Multiple instances
// fight over the same Web Lock ("lock:sb-…-auth-token"), causing "lock stolen"
// errors and the app stuck in an eternal loading state.
const supabase = createSupabaseBrowserClient();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // Pre-populate profile from localStorage cache so auth-gated UI has data the moment
  // the session confirms — no waiting for the Supabase profile fetch round-trip.
  const [profile, setProfile] = useState<UserProfile | null>(() => readCachedProfile());
  // Always start loading until the session check completes.
  // The profile cache is used to hydrate data immediately once the session confirms,
  // but we never expose isLoading=false before we know whether a session exists.
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(
    async (userId: string) => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
        if (data) {
          // DB schema has subscription_tier: string but our app narrows it to
          // a union — coerce here. Anything outside the union we treat as 'free'.
          const tier = (
            ['free', 'trip_pass', 'explorer', 'nomad'].includes(data.subscription_tier)
              ? data.subscription_tier
              : 'free'
          ) as UserProfile['subscription_tier'];
          const profile: UserProfile = { ...data, subscription_tier: tier };
          setProfile(profile);
          // Cache the full profile for instant hydration on next page load,
          // and also cache the tier separately for the existing tier-only fallback.
          writeCachedProfile(profile);
          try {
            localStorage.setItem(`tc_tier_${userId}`, tier);
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
    // Belt-and-suspenders safety: if the auth init below somehow never
    // resolves (rare — usually a flaky network during the getUser() server
    // round-trip on a fresh refresh), force isLoading=false after 12s so
    // the UI doesn't sit in a loading state forever. Reported on mobile
    // refresh: dashboard rendered "0 trips" with no spinner because
    // tripsLoading defaults to true and the load effect waits on
    // currentUser.isLoading which never flipped.
    const safetyTimer = setTimeout(() => {
      setIsLoading(prev => {
        if (prev) {
          console.warn('[AuthContext] auth init exceeded 12s safety timeout — forcing isLoading=false');
          return false;
        }
        return prev;
      });
    }, 12000);

    // Hydrate from the stored session cookie.
    // getSession() reads the local cookie — fast but can return null if the
    // middleware refreshed the token server-side before the browser propagated it.
    // When that happens, fall back to getUser() which validates against the
    // Supabase server and is authoritative. This prevents the race condition
    // where a valid user (e.g. Mallory on a fresh browser tab) briefly sees
    // null user and gets shown mock/demo data.
    //
    // No inner timeout on getUser — earlier we put a 5s race on it but that
    // fired on slow mobile connections, prematurely declaring the user
    // logged-out and triggering a redirect to /auth/login that immediately
    // re-bounced back when the real session resolved. The outer 12s safety
    // timer above handles a true hang; for slow-but-eventually-succeeds
    // we let getUser run to completion so isLoading stays true through
    // the network round-trip.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setSession(session);
        // If we already have this user's profile cached, clear loading immediately
        // so the UI shows real data without waiting for the full Supabase profile fetch.
        const cached = readCachedProfile();
        if (cached?.id === session.user.id) {
          setIsLoading(false);
        }
        fetchProfile(session.user.id);
      } else {
        // Cookie read came back empty — do a server-validated fallback.
        try {
          const { data: { user: serverUser } } = await supabase.auth.getUser();
          if (serverUser) {
            const { data: { session: refreshedSession } } = await supabase.auth.getSession();
            setSession(refreshedSession);
            fetchProfile(serverUser.id);
          } else {
            setIsLoading(false);
          }
        } catch (err) {
          console.warn('[AuthContext] getUser fallback failed — treating as logged-out:', err);
          setIsLoading(false);
        }
      }
    }).catch(err => {
      // getSession itself rejected — rare, but if localStorage is corrupt
      // or the lock is stuck this is where we'd hang forever. Force the
      // app out of loading state so at least the UI is responsive.
      console.warn('[AuthContext] getSession failed — clearing loading state:', err);
      setIsLoading(false);
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
      clearTimeout(safetyTimer);
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
