'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { useState } from 'react';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/send-reset-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && data.error) {
        setError(data.error);
        setIsLoading(false);
        return;
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setIsLoading(false);
      return;
    }

    setSent(true);
    setIsLoading(false);
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
          {sent ? (
            /* Success state */
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-script italic font-semibold text-zinc-900 mb-2">
                Check your email
              </h1>
              <p className="text-zinc-600 mb-6">
                We&apos;ve sent a password reset link to <strong>{email}</strong>. The link expires in 1 hour.
              </p>
              <p className="text-sm text-zinc-500 mb-8">
                Didn&apos;t receive it? Check your spam folder, or{' '}
                <button
                  onClick={() => setSent(false)}
                  className="text-sky-700 hover:text-sky-800 font-medium"
                >
                  try again
                </button>
                .
              </p>
              <Link
                href="/auth/login"
                className="btn-primary w-full inline-flex items-center justify-center"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            /* Form state */
            <>
              <h1 className="text-3xl font-script italic font-semibold text-zinc-900 mb-2">
                Forgot password?
              </h1>
              <p className="text-zinc-600 mb-8">
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>

              {/* Error message */}
              {error && (
                <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
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

                <button
                  type="submit"
                  disabled={isLoading || !email.trim()}
                  className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Back link */}
        <p className="text-center text-zinc-600 text-sm mt-8">
          <Link href="/auth/login" className="hover:text-zinc-900 font-medium inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
