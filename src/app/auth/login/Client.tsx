'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Mail, Lock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { signInAction } from './actions';

const REMEMBERED_EMAIL_KEY = 'tc_remembered_email';

// Whitelist of return paths the login flow honors. Open redirects are a
// well-known phishing vector — bouncing the user to wherever the URL
// param says would let an attacker craft tripcoord.ai/auth/login?redirect=
// evil.example.com. We only allow same-origin paths starting with "/".
function safeRedirect(raw: string | null): string {
  if (!raw) return '/dashboard';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
  return raw;
}

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Default off — opting in should be intentional. Returning users who
  // already ticked it once still get prefill from localStorage; this only
  // affects first-time visitors so a shared device doesn't silently leak
  // the previous user's email to the next.
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // If the user is already authenticated, send them on. Without this,
  // hitting Back from /dashboard after a successful login dropped them
  // back on this form — confusing because they were already logged in.
  // Use router.replace so /auth/login is removed from history and Back
  // doesn't bounce them back here in a loop.
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    router.replace(safeRedirect(params.get('redirect')));
  }, [authLoading, user, router]);

  // Prefill email from a previous "Remember me" if one is stored. Supabase
  // already handles session persistence — this checkbox controls whether we
  // remember the email *address* (not the password) for the login form.
  useEffect(() => {
    try {
      const remembered = localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (remembered) { setEmail(remembered); setRememberMe(true); }
    } catch { /* localStorage unavailable */ }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // signInAction runs server-side: calls Supabase and sets the auth cookies
    // in the HTTP response. On success it returns { success: true } — we then
    // do a hard navigation so the page fully reloads and AuthContext is
    // re-initialised from scratch. A client-side router.push() would keep
    // AuthContext mounted with its stale session=null state, causing the
    // dashboard to immediately bounce back to /auth/login.
    const result = await signInAction(email.trim(), password);

    if ('error' in result) {
      setError(result.error);
      setIsLoading(false);
    } else {
      try {
        if (rememberMe) localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
        else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      } catch { /* localStorage unavailable */ }
      // Hard redirect — forces a full page reload so auth cookies are picked up.
      // Honors ?redirect= when present (e.g. clicked Like on /community/abc
      // while logged out → bounced through login → returned to the same
      // trip page). Reading from window.location keeps this client-only
      // and avoids the Suspense boundary that useSearchParams would
      // require. Only same-origin paths are allowed; everything else
      // falls back to /dashboard.
      const params = new URLSearchParams(window.location.search);
      window.location.href = safeRedirect(params.get('redirect'));
    }
  };

  // Google/Apple OAuth handlers were here but the buttons are not rendered
  // (see "OAuth (Google/Apple) hidden until providers are configured" in
  // the JSX). Restore both — the handler and the button — together when
  // the Supabase Google provider is configured per CLAUDE.md #183.

  return (
    <div className="min-h-screen gradient-subtle flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center mb-10">
          <Image src="/tripcoord_logo.png" alt="tripcoord" width={180} height={56} className="h-12 w-auto" priority />
        </div>

        {/* Card */}
        <div className="card p-8 sm:p-10">
          <h1 className="text-3xl font-script italic font-semibold text-zinc-900 mb-2">
            Welcome back
          </h1>
          <p className="text-zinc-600 mb-8">Sign in to your account to continue planning</p>

          {/* Error message */}
          {error && (
            <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-2">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>

            {/* Remember & Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm text-zinc-600">Remember me</span>
              </label>
              <Link href="/auth/reset-password" className="text-sm font-medium text-sky-700 hover:text-sky-800">
                Forgot password?
              </Link>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Log In'}
            </button>
          </form>

          {/* OAuth (Google/Apple) hidden until providers are configured in Supabase. */}

          {/* Sign Up Link */}
          <p className="text-center text-zinc-600">
            Don&apos;t have an account?{' '}
            <Link href="/auth/signup" className="font-semibold text-sky-700 hover:text-sky-800">
              Sign up
            </Link>
          </p>
        </div>

        {/* Footer Link */}
        <p className="text-center text-zinc-600 text-sm mt-8">
          <Link href="/" className="hover:text-zinc-900 font-medium">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
