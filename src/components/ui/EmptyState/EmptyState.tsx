'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}

/** What a list says when there is nothing in it, and what would put something there. */
export function EmptyState({ icon: Icon, title, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {Icon && <Icon size={20} strokeWidth={1.75} className="mb-3 text-ink-faint" aria-hidden />}
      <p className="text-body font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-body-sm text-ink-dim">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
