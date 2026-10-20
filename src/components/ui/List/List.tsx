'use client';

import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A set of rows in a bordered group, as settings and site information use. */
export function List({ className, ...props }: ComponentProps<'ul'>) {
  return (
    <ul className={cn('divide-y divide-line overflow-hidden rounded-md border border-line', className)} {...props} />
  );
}

interface RowProps extends Omit<ComponentProps<'li'>, 'title'> {
  leading?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
}

/** One line in a list: something to recognise it by, what it is, and what can be done with it. */
export function Row({ leading, title, detail, trailing, className, ...props }: RowProps) {
  return (
    <li className={cn('flex min-h-[var(--row-height)] items-center gap-3 px-3 py-1.5', className)} {...props}>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body text-ink">{title}</div>
        {detail && <div className="truncate text-body-sm text-ink-dim">{detail}</div>}
      </div>
      {trailing}
    </li>
  );
}

/** A heading between groups of rows, such as a day in history. */
export function ListHeader({ children }: { children: ReactNode }) {
  return <h3 className="label px-3 pb-1 pt-4">{children}</h3>;
}
