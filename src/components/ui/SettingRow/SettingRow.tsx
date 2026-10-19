'use client';

import type { ReactNode } from 'react';

interface SettingGroupProps {
  title?: string;
  children: ReactNode;
}

/** A titled group of settings, drawn as one bordered list. */
export function SettingGroup({ title, children }: SettingGroupProps) {
  return (
    <section className="flex flex-col gap-1.5">
      {title && <h3 className="label px-0.5">{title}</h3>}
      <div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-raised">{children}</div>
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
    <div className="flex min-h-12 items-center justify-between gap-4 px-3.5 py-2.5">
      <div className="min-w-0">
        <div className="text-body text-ink">{label}</div>
        {help && <div className="mt-0.5 text-body-sm text-ink-dim">{help}</div>}
      </div>
      {control && <div className="flex shrink-0 items-center gap-2">{control}</div>}
    </div>
  );
}
