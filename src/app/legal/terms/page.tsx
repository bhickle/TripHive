'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function TermsPage() {
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
        <h1 className="text-4xl font-script italic font-semibold text-zinc-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-zinc-400 mb-10">Last updated: April 2026</p>

        <div className="prose prose-zinc max-w-none space-y-8 text-zinc-700 leading-relaxed">

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">1. Acceptance of Terms</h2>
            <p>
              By creating an account or using tripcoord (&quot;the Service&quot;), you agree to be bound by these
              Terms of Service. If you do not agree, please do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">2. Use of the Service</h2>
            <p>
              tripcoord is a travel-planning platform that lets individuals and groups plan, organize, and collaborate
              on trips. You agree to use the Service only for lawful purposes and in a manner that does not infringe the
              rights of others.
            </p>
            <p className="mt-3">
              You are responsible for all activity that occurs under your account. You must keep your login credentials
              secure and notify us immediately if you suspect unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">3. Accounts &amp; Subscriptions</h2>
            <p>
              tripcoord offers free and paid subscription tiers (Explorer, Nomad, and Trip Pass). Paid plans are billed
              monthly or annually as selected at purchase. You may cancel at any time; cancellation takes effect at the
              end of your current billing period. We do not offer prorated refunds for partial periods except where
              required by law.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">4. AI-Generated Content</h2>
            <p>
              tripcoord uses artificial intelligence to generate itineraries, suggestions, and other travel content.
              AI-generated content is provided &quot;as is&quot; and may contain errors or omissions. You are responsible for
              verifying all travel information, including visa requirements, health advisories, booking details, and
              local regulations, before making decisions based on AI output.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">5. User Content</h2>
            <p>
              You retain ownership of any content you upload (photos, notes, trip details). By uploading content, you
              grant tripcoord a non-exclusive, royalty-free licence to store and display that content solely to provide
              the Service to you and your trip group.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">6. Affiliate Links &amp; Third-Party Services</h2>
            <p>
              The Service may contain links to third-party booking platforms (flights, hotels, experiences). Some of
              these links are affiliate links, and tripcoord may earn a commission if you make a purchase. We are not
              responsible for the content or practices of third-party sites.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">7. Prohibited Conduct</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Use the Service to harass, abuse, or harm other users</li>
              <li>Reverse-engineer, scrape, or attempt to extract our data or AI models</li>
              <li>Attempt to gain unauthorized access to any part of the Service</li>
              <li>Use the Service for commercial purposes without our written consent</li>
              <li>Upload content that is unlawful, defamatory, or infringes third-party rights</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">8. Disclaimers &amp; Limitation of Liability</h2>
            <p>
              The Service is provided &quot;as is&quot; without warranties of any kind. To the fullest extent permitted by law,
              tripcoord is not liable for any indirect, incidental, or consequential damages arising from your use of
              the Service, including any travel decisions made based on AI-generated content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">9. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account if you violate these Terms. You may delete your
              account at any time from Settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">10. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. We will notify you of material changes via email or an
              in-app notice. Continued use of the Service after changes take effect constitutes your acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-zinc-900 mb-3">11. Contact</h2>
            <p>
              Questions about these Terms? Email us at{' '}
              <a href="mailto:hello@tripcoord.ai" className="text-sky-700 hover:underline">
                hello@tripcoord.ai
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-200 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <Link href="/legal/privacy" className="text-sm text-sky-700 hover:text-sky-800 font-medium">
            Privacy Policy →
          </Link>
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-700">
            ← Back to tripcoord
          </Link>
        </div>
      </main>
    </div>
  );
}
