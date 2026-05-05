'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowRight, Sparkles, MapPin, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ComingSoonPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');

    const supabase = createClient();
    const { error: dbError } = await supabase
      .from('waitlist')
      .insert({ email: email.trim().toLowerCase() });

    if (dbError && dbError.code !== '23505') {
      // 23505 = unique violation (already signed up) — treat as success
      setError('Something went wrong. Please try again.');
      return;
    }

    setSubmitted(true);
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #f5f1e8 0%, #eef3f8 50%, #f0f7f0 100%)' }}
    >
      {/* Nav — logo only */}
      <nav className="px-8 py-6 flex items-center">
        <Image
          src="/tripcoord_logo.png"
          alt="tripcoord"
          width={140}
          height={44}
          className="h-9 w-auto"
          priority
        />
      </nav>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 mb-8 px-4 py-2 bg-sky-50 border border-sky-100 rounded-full">
          <Sparkles className="w-3.5 h-3.5 text-sky-600" />
          <span className="text-xs font-semibold text-sky-700 uppercase tracking-widest">
            Coming Soon
          </span>
        </div>

        {/* Headline */}
        <h1
          className="text-5xl sm:text-6xl lg:text-7xl font-semibold leading-tight mb-6 text-slate-900"
          style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}
        >
          Your best trip yet
          <br />
          <span className="text-sky-700">is almost here.</span>
        </h1>

        {/* Subtext */}
        <p className="text-lg sm:text-xl text-slate-500 mb-12 max-w-xl leading-relaxed">
          We're putting the finishing touches on tripcoord — AI-powered itineraries
          that keep every traveler in your group happy.
        </p>

        {/* Email capture */}
        {!submitted ? (
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-md flex flex-col sm:flex-row gap-3"
          >
            <input
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="flex-1 px-5 py-3.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-600 focus:border-transparent"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-sky-800 hover:bg-sky-900 text-white font-semibold text-sm rounded-xl shadow-sm transition-all whitespace-nowrap"
            >
              Notify me
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <div className="w-full max-w-md py-4 px-6 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-green-800 font-semibold text-sm">
              You're on the list! 🎉
            </p>
            <p className="text-green-600 text-xs mt-0.5">
              We'll reach out as soon as we launch.
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-500 mt-2">{error}</p>
        )}
        <p className="text-xs text-slate-400 mt-4">
          No spam. Just one email when we go live.
        </p>

        {/* Feature teaser icons */}
        <div className="flex items-center gap-8 mt-16 text-slate-400">
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-sky-600" />
            </div>
            <span className="text-[11px] font-medium">AI Itineraries</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-[11px] font-medium">Group Planning</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-[11px] font-medium">Real Destinations</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-8 py-6 flex items-center justify-between">
        <p className="text-xs text-slate-400">© 2026 tripcoord, Inc.</p>
        <a
          href="mailto:hello@tripcoord.ai"
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
        >
          hello@tripcoord.ai
        </a>
      </footer>
    </div>
  );
}
