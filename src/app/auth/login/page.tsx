'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Mail, Lock } from 'lucide-react';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { signInAction } from './actions';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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
      // Hard redirect — forces a full page reload so auth cookies are picked up
      window.location.href = '/dashboard';
    }
  };

  const handleGoogleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const handleAppleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

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
                <input type="checkbox" className="w-4 h-4 rounded border-slate-300" />
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
