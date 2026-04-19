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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        setProfile(data ?? null);
      } catch {
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    // Hydrate immediately from the stored session cookie
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
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
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
