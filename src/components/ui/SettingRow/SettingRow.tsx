'use client';

import type { ReactNode } from 'react';

interface SettingGroupProps {
  title?: string;
  children: ReactNode;
}

/** A titled group of settings, drawn as one inset panel. */
export function SettingGroup({ title, children }: SettingGroupProps) {
  return (
    <section className="flex flex-col gap-2">
      {title && <h3 className="px-1 text-body font-semibold text-ink-dim">{title}</h3>}
      <div className="divide-y divide-line overflow-hidden rounded-md bg-inset">{children}</div>
    </section>
  );
}

interface SettingRowProps {
  label: string;
  /** One sentence at most. Anything longer belongs on the transparency page. */
  help?: ReactNode;
  control?: ReactNode;
}

/** One setting: what it is, one line about it, and the control. */
export function SettingRow({ label, help, control }: SettingRowProps) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0">
        <div className="text-reading font-medium text-ink">{label}</div>
        {help && <div className="mt-0.5 text-body text-ink-dim">{help}</div>}
      </div>
      {control && <div className="flex shrink-0 items-center gap-2">{control}</div>}
    </div>
  );
}
