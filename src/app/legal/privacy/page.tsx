'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 py-4 px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/">
            <Image src="/tripcoord_logo.png" alt="tripcoord" width={140} height={44} className="h-8 w-auto" />
          </Link>
          <Link href="/auth/login" className="text-sm font-medium text-sky-700 hover:text-sky-800">
            Sign in →
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-script italic font-semibold text-zinc-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-zinc-400 mb-10">Last updated: April 2026</p>

        <div className="prose prose-zinc max-w-none space-y-8 text-zinc-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">1. Information We Collect</h2>
            <p>When you use tripcoord, we may collect the following information:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Account data:</strong> Name, email address, and password (hashed) when you create an account</li>
              <li><strong>Trip data:</strong> Destinations, dates, group details, itineraries, and preferences you enter</li>
              <li><strong>Usage data:</strong> Pages visited, features used, and interactions with the Service</li>
              <li><strong>Photos:</strong> Images you upload to Trip Story or other features</li>
              <li><strong>Payment data:</strong> Billing information handled securely by Stripe — we do not store card numbers</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Provide, maintain, and improve the Service</li>
              <li>Personalise AI-generated itineraries and recommendations</li>
              <li>Process payments and manage subscriptions</li>
              <li>Send transactional emails (trip invites, confirmations, account alerts)</li>
              <li>Respond to support requests and communicate about the Service</li>
              <li>Detect and prevent fraud or abuse</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">3. Data Sharing</h2>
            <p>
              We do not sell your personal data. We may share data with:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li><strong>Service providers:</strong> Supabase (database/auth), Stripe (payments), SendGrid (email), Twilio (SMS), Vercel (hosting) — each bound by data-processing agreements</li>
              <li><strong>AI providers:</strong> Anthropic (Claude) to generate itinerary content — prompts may include trip details but not payment or identity data</li>
              <li><strong>Trip members:</strong> Information you choose to share within your trip group is visible to that group</li>
              <li><strong>Legal requirements:</strong> If required by law or to protect our rights</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">4. Data Retention</h2>
            <p>
              We retain your account data for as long as your account is active. If you delete your account, we will
              delete your personal data within 30 days, except where we are required to retain it for legal or billing
              purposes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">5. Cookies &amp; Tracking</h2>
            <p>
              tripcoord uses cookies and similar technologies to keep you signed in, remember preferences, and
              understand how the Service is used. We do not use third-party advertising cookies. You can control cookie
              settings through your browser, but disabling cookies may affect Service functionality.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">6. Your Rights</h2>
            <p>Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data (&quot;right to be forgotten&quot;)</li>
              <li>Object to or restrict certain processing</li>
              <li>Data portability</li>
            </ul>
            <p className="mt-3">
              To exercise these rights, email us at{' '}
              <a href="mailto:hello@tripcoord.ai" className="text-sky-700 hover:underline">
                hello@tripcoord.ai
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">7. Security</h2>
            <p>
              We use industry-standard security measures, including encryption in transit (TLS) and at rest, to protect
              your data. However, no system is completely secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">8. Children</h2>
            <p>
              tripcoord is not directed at children under 13. We do not knowingly collect personal data from children
              under 13. If you believe a child has provided us with personal data, please contact us to have it removed.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material changes via email or
              an in-app notice at least 14 days before they take effect.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">10. Contact</h2>
            <p>
              Questions or concerns about this policy? Reach us at{' '}
              <a href="mailto:hello@tripcoord.ai" className="text-sky-700 hover:underline">
                hello@tripcoord.ai
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-200 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <Link href="/legal/terms" className="text-sm text-sky-700 hover:text-sky-800 font-medium">
            Terms of Service →
          </Link>
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700">
            ← Back to tripcoord
          </Link>
        </div>
      </main>
    </div>
  );
}
