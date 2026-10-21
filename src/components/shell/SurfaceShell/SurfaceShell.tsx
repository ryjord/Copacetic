'use client';

// Libs
import { useRef, type ReactNode } from 'react';

// Components
import { EmptyState as EmptyStatePrimitive } from '@/components/ui/EmptyState/EmptyState';
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { PageShell } from '@/components/shell/PageShell/PageShell';

// Icons
import { X } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { useDismissLayer } from '@/lib/layers/dismissLayer';
import { useFocusTrap } from '@/lib/layers/focusTrap';
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
 * A page's frame laid over the page in front, as reader view is: a dialog that
 * closes with its button or Escape.
 *
 * Rendered after the page in the DOM, so it covers it by order alone.
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
      className="animate-fade absolute inset-0 outline-none"
    >
      <PageShell
        title={title}
        scrolls={scrolls}
        actions={
          <>
            {actions}
            <IconButton
              label={t('shell.surfaceShell.close', { title: title.toLowerCase() })}
              onClick={() => setSurface('none')}
            >
              <X size={16} />
            </IconButton>
          </>
        }
      >
        {children}
      </PageShell>
    </section>
  );
}

/** Kept for the surfaces not yet moved to the shared primitive. */
export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return <EmptyStatePrimitive title={title} hint={hint} />;
}
