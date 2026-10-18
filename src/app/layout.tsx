import type { Metadata, Viewport } from 'next';
import './globals.css';

/*
 * The system's own fonts, in both the interface and the address bar, so the
 * chrome reads as part of the machine it runs on. Nothing is bundled or
 * fetched for it, which also keeps the build off the network.
 */

export const metadata: Metadata = {
  title: 'Copacetic',
  description: 'A calm, honest browser that shows you the true state of every page.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0f14' },
  ],
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="deep">
      <body>{children}</body>
    </html>
  );
}
