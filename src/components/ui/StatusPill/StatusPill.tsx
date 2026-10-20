'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Status = 'secure' | 'warning' | 'danger' | 'hush' | 'neutral';

const TONES: Record<Status, string> = {
  secure: 'text-clear bg-clear/10',
  warning: 'text-caution bg-caution/10',
  danger: 'text-alert bg-alert/10',
  hush: 'text-hush bg-hush/10',
  neutral: 'text-ink-dim bg-hover',
};

/** The one component allowed to be coloured, and only by the state it reports. */
export function StatusPill({ status, children }: { status: Status; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-caption font-medium whitespace-nowrap',
        TONES[status],
      )}
    >
      {children}
    </span>
  );
}
