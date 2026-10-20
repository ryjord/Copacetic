'use client';

import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

/** Where rows will be, while they load, so nothing claims to be empty before it knows. */
export function SkeletonRows({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div
      className={cn('flex flex-col gap-2 px-3 py-3', className)}
      aria-busy="true"
      aria-label={t('shell.ui.skeleton.loading')}
    >
      {Array.from({ length: count }, (_unused, index) => (
        <div key={index} className="flex h-6 items-center gap-3">
          <div className="size-4 rounded-xs bg-hover" />
          <div className="h-3 rounded-xs bg-hover" style={{ width: `${40 + ((index * 17) % 45)}%` }} />
        </div>
      ))}
    </div>
  );
}
