'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SettingGroupProps {
  title?: string;
  /** One line under the title, for what is true of every row in the group. */
  description?: string;
  children: ReactNode;
}

/** A titled group of settings, drawn as one inset panel. */
export function SettingGroup({ title, description, children }: SettingGroupProps) {
  return (
    <section className="flex flex-col gap-2" data-setting-group={title ?? ''}>
      {title && <h3 className="px-1 text-body font-semibold text-ink-dim">{title}</h3>}
      {description && <p className="-mt-1 px-1 text-body text-ink-dim">{description}</p>}
      <div className="divide-y divide-line overflow-hidden rounded-md bg-inset">{children}</div>
    </section>
  );
}

interface SettingRowProps {
  label: string;
  /** One sentence at most. Anything longer belongs on the transparency page. */
  help?: ReactNode;
  control?: ReactNode;
  /** The control on its own line under the label, for a row whose controls would squeeze the label to one word a line. */
  isStacked?: boolean;
}

/** One setting: what it is, one line about it, and the control. */
export function SettingRow({ label, help, control, isStacked = false }: SettingRowProps) {
  return (
    <div
      data-setting-row
      className={cn(
        'flex min-h-14 gap-4 px-4 py-2.5',
        isStacked ? 'flex-col items-stretch gap-2.5' : 'items-center justify-between',
      )}
    >
      <div className="min-w-0">
        <div className="text-reading font-medium text-ink">{label}</div>
        {help && <div className="mt-0.5 text-body text-ink-dim">{help}</div>}
      </div>
      {control && (
        <div className={cn('flex items-center gap-2', isStacked ? 'flex-wrap' : 'shrink-0')}>{control}</div>
      )}
    </div>
  );
}
