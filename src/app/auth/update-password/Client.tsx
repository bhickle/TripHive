'use client';

import Image from 'next/image';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    // Supabase picks up the #access_token from the URL hash and fires
    // PASSWORD_RECOVERY once the session is established.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
      }
    });
    // Also check if we already have a session (e.g. page was refreshed)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setIsLoading(false);
      return;
    }

    setDone(true);
    // Give the user a moment to see the success state, then redirect
    setTimeout(() => router.push('/dashboard'), 2500);
  };

  return (
    <div className="min-h-screen gradient-subtle flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center mb-10">
          <Image src="/tripcoord_logo.png" alt="tripcoord" width={180} height={56} className="h-12 w-auto" priority />
        </div>

        <div className="card p-8 sm:p-10">
          {done ? (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-script italic font-semibold text-zinc-900 mb-2">
                Password updated!
              </h1>
              <p className="text-zinc-600">
                You&apos;re all set. Taking you to your dashboard…
              </p>
            </div>
          ) : !ready ? (
            <div className="text-center py-6">
              <div className="w-10 h-10 border-4 border-sky-800 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-zinc-600">Verifying your reset link…</p>
              <p className="text-sm text-zinc-400 mt-2">
                If nothing happens, your link may have expired.{' '}
                <a href="/auth/reset-password" className="text-sky-700 hover:text-sky-800 font-medium">
                  Request a new one
                </a>
                .
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-script italic font-semibold text-zinc-900 mb-2">
                Set a new password
              </h1>
              <p className="text-zinc-600 mb-8">
                Choose something strong — at least 8 characters.
              </p>

              {error && (
                <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-zinc-700 mb-2">
                    New password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input-field pl-10 pr-10"
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm" className="block text-sm font-medium text-zinc-700 mb-2">
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                    <input
                      id="confirm"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Repeat your password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="input-field pl-10"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !password || !confirm}
                  className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Updating…' : 'Update password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
