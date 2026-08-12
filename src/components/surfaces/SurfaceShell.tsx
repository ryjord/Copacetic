'use client';

import { X } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { IconButton } from '@/components/ui/IconButton';
import { useDismissLayer } from '@/lib/dismissLayer';
import { useFocusTrap } from '@/lib/focusTrap';
import { useBrowserStore } from '@/store/useBrowserStore';

interface SurfaceShellProps {
  title: string;
  /** Optional line under the title explaining what the surface is for. */
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** The frame shared by every full-area panel. */
export function SurfaceShell({ title, subtitle, actions, children }: SurfaceShellProps) {
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
      className="animate-fade absolute inset-0 z-40 flex flex-col bg-base outline-none"
    >
      <header className="flex items-start gap-4 border-b border-line px-6 py-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-medium text-ink">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[12px] text-ink-faint">{subtitle}</p>}
        </div>
        {actions}
        <IconButton label={`Close ${title.toLowerCase()}`} onClick={() => setSurface('none')}>
          <X size={15} />
        </IconButton>
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
      <p className="text-[13px] text-ink-dim">{title}</p>
      <p className="text-[12px] text-ink-faint">{hint}</p>
    </div>
  );
}
