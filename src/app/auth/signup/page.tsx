'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { User, Mail, Lock } from 'lucide-react';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

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

    router.push('/onboarding');
    router.refresh();
  };

  const handleGoogleSignup = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const handleAppleSignup = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="min-h-screen gradient-subtle flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center mb-10">
          <Image src="/tripcoord_logo.png" alt="tripcoord" width={180} height={56} className="h-12 w-auto" priority />
        </div>

        {/* Card */}
        <div className="card p-8 sm:p-10">
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
                  minLength={8}
                />
              </div>
              <p className="text-xs text-zinc-500 mt-2">At least 8 characters recommended</p>
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
              {isLoading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          {/* OAuth (Google/Apple) hidden until providers are configured in Supabase. */}

          {/* Sign In Link */}
          <p className="text-center text-zinc-600">
            Already have an account?{' '}
            <Link href="/auth/login" className="font-semibold text-sky-700 hover:text-sky-800">
              Log in
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
