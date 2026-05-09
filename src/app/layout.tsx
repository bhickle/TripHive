import type { Metadata } from 'next';
import { Nunito, Cormorant_Garamond } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { AuthProvider } from '@/context/AuthContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['300', '400', '500', '600', '700', '800'],
});

const cormorantGaramond = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-script',
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  // The %s slot is filled by per-page metadata.title; pages that don't set
  // one fall through to the default. Keeps "— tripcoord" suffix consistent
  // across browser tabs.
  title: { default: 'tripcoord — AI Travel Planning', template: '%s — tripcoord' },
  description: 'Plan trips your whole group will love. AI-powered itineraries, group planning, and expense tracking all in one place.',
  openGraph: {
    title: 'tripcoord — AI Travel Planning',
    description: 'Plan trips your whole group will love. AI-powered itineraries, group planning, and expense tracking all in one place.',
    type: 'website',
    url: 'https://www.tripcoord.ai',
    siteName: 'tripcoord',
    // /public/og-image.png is the 1200x630 share card. If the asset is
    // missing, link previews fall back to nothing (better than a 404 image).
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'tripcoord' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'tripcoord — AI Travel Planning',
    description: 'Plan trips your whole group will love.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${nunito.variable} ${cormorantGaramond.variable} font-sans`}>
        <ErrorBoundary>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ErrorBoundary>
        {/* Vercel Analytics + Speed Insights — both auto-collect from
            Vercel-hosted deployments. Free tier covers small-to-medium
            traffic. No env vars needed; the components no-op locally. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
