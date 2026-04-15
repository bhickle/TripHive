import type { Metadata } from 'next';
import { Nunito, Cormorant_Garamond } from 'next/font/google';
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
  title: 'tripcoord — AI Travel Planning',
  description: 'Plan trips your whole group will love. AI-powered itineraries, group planning, and expense tracking all in one place.',
  openGraph: {
    title: 'tripcoord — AI Travel Planning',
    description: 'Plan trips your whole group will love. AI-powered itineraries, group planning, and expense tracking all in one place.',
    type: 'website',
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
        {children}
      </body>
    </html>
  );
}
