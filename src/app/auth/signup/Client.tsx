'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { User, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Suspense, useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';

// Next.js 14 requires useSearchParams() consumers to live inside a Suspense
// boundary so the static prerender can bail to client rendering for just
// the search-param-dependent slice. Hoisting the page body into a separate
// component lets us wrap it without restructuring everything else.
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // True after a successful signup that requires email confirmation.
  // Replaces the form with a "check your email" panel.
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();

  // Honor an explicit ?redirect=... param after signup so flows that bounce
  // anonymous users through signup (e.g. /pricing → /auth/signup → back) can
  // resume where they left off. Defaults to /onboarding for organic signups.
  // Only same-origin paths are accepted to prevent open-redirect.
  const safeRedirect = (() => {
    const raw = searchParams?.get('redirect');
    if (!raw) return '/onboarding';
    if (!raw.startsWith('/') || raw.startsWith('//')) return '/onboarding';
    return raw;
  })();

  // If the user is already authenticated, skip the signup form and send
  // them on. Same back-button trap as /auth/login — without this, hitting
  // Back from a post-signup destination would land them back on the
  // signup form despite already being logged in. router.replace removes
  // /auth/signup from history so Back doesn't bounce them here again.
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    if (awaitingConfirmation) return; // post-signup confirm panel — leave alone
    router.replace(safeRedirect);
  }, [authLoading, user, awaitingConfirmation, safeRedirect, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreedToTerms) return;
    setIsLoading(true);
    setError('');

    const supabase = createClient();

    // Create the Supabase auth user
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Pass name so the DB trigger can populate the profiles row
        data: { full_name: name.trim() },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setIsLoading(false);
      return;
    }

    // Update the profile name immediately (the trigger sets it from metadata,
    // but let's ensure it's written even if the trigger runs later)
    if (data.user) {
      await supabase
        .from('profiles')
        .update({ name: name.trim() })
        .eq('id', data.user.id);
    }

    // When Supabase email confirmation is on, signUp returns a user but no
    // session — the user must click the email link before they can log in.
    // Without this branch, the previous code pushed to /onboarding unauthed
    // and the user got a flash of unauthenticated state, then a bounce to
    // login with no explanation. Now: surface the "check your email" UI.
    if (data.user && !data.session) {
      setAwaitingConfirmation(true);
      setIsLoading(false);
      return;
    }

    router.push(safeRedirect);
    router.refresh();
  };

  // Google/Apple OAuth handlers were here but the buttons are not rendered.
  // Restore both — the handler and the button — together when the Supabase
  // Google provider is configured per CLAUDE.md #183.

  return (
    <div className="min-h-screen gradient-subtle flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center mb-10">
          <Image src="/tripcoord_logo.png" alt="tripcoord" width={180} height={56} className="h-12 w-auto" priority />
        </div>

        {/* Card */}
        <div className="card p-8 sm:p-10">
          {awaitingConfirmation ? (
            // ── Post-signup, email-confirmation-required state ─────────────
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📧</span>
              </div>
              <h1 className="text-2xl font-script italic font-semibold text-zinc-900 mb-2">
                Check your inbox
              </h1>
              <p className="text-zinc-600 text-sm mb-6">
                We sent a confirmation link to <span className="font-semibold text-zinc-900">{email}</span>.
                Click it to finish creating your account.
              </p>
              <p className="text-xs text-zinc-400 mb-6">
                Didn&apos;t get it? Check spam or wait a minute and refresh your inbox.
              </p>
              <a
                href={`/auth/login${searchParams?.get('redirect') ? `?redirect=${encodeURIComponent(searchParams.get('redirect') as string)}` : ''}`}
                className="inline-block text-sm font-semibold text-sky-700 hover:text-sky-900 underline-offset-2 hover:underline"
              >
                Already confirmed? Log in →
              </a>
            </div>
          ) : (
            <>
          <h1 className="text-3xl font-script italic font-semibold text-zinc-900 mb-2">
            Create your account
          </h1>
          <p className="text-zinc-600 mb-8">Join thousands of travelers planning amazing trips together</p>

          {/* Error message */}
          {error && (
            <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-zinc-700 mb-2">
                Full name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                <input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field pl-10"
                  required
                />
              </div>
            </div>

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
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
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
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {/* Live strength meter — three buckets keyed off length and
                  character variety. Cheap to compute, far better feedback
                  than the previous "8+ recommended" hint. */}
              {(() => {
                if (!password) return <p className="text-xs text-zinc-500 mt-2">At least 8 characters</p>;
                const hasLower = /[a-z]/.test(password);
                const hasUpper = /[A-Z]/.test(password);
                const hasDigit = /\d/.test(password);
                const hasSymbol = /[^A-Za-z0-9]/.test(password);
                const variety = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
                let strength: 'weak' | 'okay' | 'strong' = 'weak';
                if (password.length >= 12 && variety >= 3) strength = 'strong';
                else if (password.length >= 8 && variety >= 2) strength = 'okay';
                const cfg = {
                  weak:   { fill: 'w-1/3 bg-rose-500',    text: 'text-rose-600',   label: 'Weak — try a longer password or add a number/symbol' },
                  okay:   { fill: 'w-2/3 bg-amber-500',   text: 'text-amber-700',  label: 'Good — adding length or a symbol would make it stronger' },
                  strong: { fill: 'w-full bg-emerald-500', text: 'text-emerald-700', label: 'Strong password' },
                }[strength];
                return (
                  <div className="mt-2 space-y-1">
                    <div className="h-1 w-full bg-zinc-100 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-200 ${cfg.fill}`} />
                    </div>
                    <p className={`text-xs ${cfg.text}`}>{cfg.label}</p>
                  </div>
                );
              })()}
            </div>

            {/* Terms Checkbox */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 mt-0.5"
                required
              />
              <span className="text-sm text-zinc-600">
                I agree to tripcoord&apos;s{' '}
                <Link href="/legal/terms" className="font-medium text-sky-700 hover:text-sky-800">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/legal/privacy" className="font-medium text-sky-700 hover:text-sky-800">
                  Privacy Policy
                </Link>
              </span>
            </label>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !agreedToTerms}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          {/* OAuth (Google/Apple) hidden until providers are configured in Supabase. */}

          {/* Log In Link — preserves ?redirect= so a user who bounced into
              signup from /onboarding (or anywhere else) and clicks "Log in"
              instead lands back on the same return target after login. The
              previous bare /auth/login link dropped the param and the user
              ended up on /dashboard regardless. (QA-pass finding 2026-05-29.) */}
          <p className="text-center text-zinc-600">
            Already have an account?{' '}
            <Link
              href={`/auth/login${searchParams?.get('redirect') ? `?redirect=${encodeURIComponent(searchParams.get('redirect') as string)}` : ''}`}
              className="font-semibold text-sky-700 hover:text-sky-800"
            >
              Log in
            </Link>
          </p>
            </>
          )}
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
