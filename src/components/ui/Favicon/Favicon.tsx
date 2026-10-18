'use client';

import { cn } from '@/lib/utils';

interface FaviconProps {
  dataUrl: string | null;
  /** Used to derive the fallback monogram. */
  seed: string;
  size?: number;
  className?: string;
}

/** Site icons only ever arrive as data URLs fetched by the main process, so the chrome never makes a network request of its own. */
export function Favicon({ dataUrl, seed, size = 15, className }: FaviconProps) {
  if (dataUrl) {
    return (
      // next/image cannot serve a runtime data URL through a static export, and
      // these are already fetched, sized and cached by the main process.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={dataUrl}
        alt=""
        width={size}
        height={size}
        className={cn('shrink-0 rounded-[3px] object-contain', className)}
        style={{ width: size, height: size }}
        draggable={false}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-[3px] bg-hover font-mono font-medium text-ink-faint',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.6) }}
    >
      {monogramFor(seed)}
    </span>
  );
}

function monogramFor(seed: string): string {
  const host = seed.replace(/^https?:\/\//, '').replace(/^www\./, '');
  const firstLetter = host.match(/[a-z0-9]/i);
  return (firstLetter?.[0] ?? '?').toUpperCase();
}
