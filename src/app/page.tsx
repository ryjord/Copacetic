'use client';

import dynamic from 'next/dynamic';

/**
 * The chrome reads window size and platform before its first paint and talks to
 * a preload bridge that only exists in Electron, so there is nothing useful to
 * prerender. Loading it client-side keeps the static export free of markup that
 * would only be thrown away.
 */
const Chrome = dynamic(() => import('@/components/chrome/Chrome').then((module) => module.Chrome), {
  ssr: false,
  loading: () => <div className="h-screen w-screen bg-base" />,
});

export default function Page() {
  return <Chrome />;
}
