'use client';

// Libs
import { useRef, type ReactNode } from 'react';

// Components
import { EmptyState as EmptyStatePrimitive } from '@/components/ui/EmptyState/EmptyState';
import { IconButton } from '@/components/ui/IconButton/IconButton';

// Icons
import { X } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { useDismissLayer } from '@/lib/dismissLayer';
import { useFocusTrap } from '@/lib/focusTrap';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

interface SurfaceShellProps {
  title: string;
  /** Controls that act on the whole surface, beside the close button. */
  actions?: ReactNode;
  /** False when the surface lays out its own scrolling areas, as Settings does. */
  scrolls?: boolean;
  children: ReactNode;
}

/**
 * The frame shared by every full-area panel.
 *
 * Rendered after the page in the DOM, so it covers it by order alone. The
 * header is fixed and only the body scrolls, so nothing passes underneath it.
 */
export function SurfaceShell({ title, actions, scrolls = true, children }: SurfaceShellProps) {
  const setSurface = useBrowserStore((state) => state.setSurface);
  const panelRef = useRef<HTMLElement>(null);

  // A surface is only ever rendered while open, so it is always a live layer.
  useDismissLayer(true, () => setSurface('none'));
  useFocusTrap(panelRef, true);

  return (
    <section
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="animate-fade absolute inset-0 flex flex-col bg-base outline-none"
    >
      <header className="flex h-12 flex-none items-center gap-3 border-b border-line px-4">
        <h1 className="min-w-0 flex-1 truncate text-title font-semibold text-ink">{title}</h1>
        {actions}
        <IconButton
          label={t('shell.surfaceShell.close', { title: title.toLowerCase() })}
          onClick={() => setSurface('none')}
        >
          <X size={16} />
        </IconButton>
      </header>

      <div className={cn('relative flex min-h-0 flex-1 flex-col', scrolls && 'scroll-thin overflow-y-auto')}>
        {children}
      </div>
    </section>
  );
}

/** Kept for the surfaces not yet moved to the shared primitive. */
export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return <EmptyStatePrimitive title={title} hint={hint} />;
}
