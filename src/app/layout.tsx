import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['300', '400', '500', '600', '700'],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'triphive — AI Travel Planning',
  description: 'Plan trips your whole group will love. AI-powered itineraries, group planning, and expense tracking all in one place.',
  openGraph: {
    title: 'triphive — AI Travel Planning',
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
      <body className={`${inter.variable} ${plusJakartaSans.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
