'use client';

// Libs
import type { ReactNode } from 'react';

// Utils
import { cn } from '@/lib/utils';

interface PageShellProps {
  title: string;
  /** Controls that act on the whole page, at the end of its header. */
  actions?: ReactNode;
  /** False when the page lays out its own scrolling areas, as Settings does. */
  scrolls?: boolean;
  children: ReactNode;
}

/**
 * The frame for a page Copacetic draws in a tab of its own: Settings, History,
 * Bookmarks, Downloads. Closing it is closing the tab, so it has no close
 * button and Escape is left to whatever has focus inside it.
 */
export function PageShell({ title, actions, scrolls = true, children }: PageShellProps) {
  return (
    <section aria-label={title} className="absolute inset-0 flex flex-col bg-base">
      <header className="flex h-12 flex-none items-center gap-3 border-b border-line px-4">
        <h1 className="min-w-0 flex-1 truncate text-title font-semibold text-ink">{title}</h1>
        {actions}
      </header>
      <div className={cn('relative flex min-h-0 flex-1 flex-col', scrolls && 'scroll-thin overflow-y-auto')}>
        {children}
      </div>
    </section>
  );
}
