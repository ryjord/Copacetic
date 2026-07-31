import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';

/*
 * Plex Sans for interface text and Plex Mono for anything the user needs to
 * read precisely: addresses, byte counts, error codes, timings. Setting URLs
 * in a monospace face is not only a look — even letter widths make a lookalike
 * domain much harder to disguise.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Copacetic',
  description: 'A calm, honest browser that shows you the true state of every page.',
};

export const viewport: Viewport = {
  themeColor: '#0b0f14',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="deep" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
