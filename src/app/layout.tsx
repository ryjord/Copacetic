import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

/*
 * Plex Sans for interface text and Plex Mono for anything the user needs to
 * read precisely: addresses, byte counts, error codes, timings. Setting URLs
 * in a monospace face is not only a look — even letter widths make a lookalike
 * domain much harder to disguise.
 *
 * The files are committed rather than fetched. `next/font/google` downloads
 * them at build time, which made every build depend on Google being reachable:
 * a release failed on exactly that, and a browser arguing about who your
 * machine talks to should not need Google's permission to compile. 84KB of
 * woff2 is a small price for a build that works on a train.
 */
const plexSans = localFont({
  src: [
    { path: './fonts/IBMPlexSans-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/IBMPlexSans-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/IBMPlexSans-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexMono = localFont({
  src: [
    { path: './fonts/IBMPlexMono-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/IBMPlexMono-500.woff2', weight: '500', style: 'normal' },
  ],
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
