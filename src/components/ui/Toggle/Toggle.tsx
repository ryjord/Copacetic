'use client';

import { cn } from '@/lib/utils';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

export function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <label className="flex cursor-default items-start justify-between gap-6 py-2.5">
      <span className="min-w-0">
        <span className="block text-[13px] text-ink">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-faint">{description}</span>
        )}
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-[18px] w-8 shrink-0 rounded-full transition-colors duration-150',
          checked ? 'bg-active' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] size-3 rounded-full bg-void transition-[left] duration-150',
            checked ? 'left-[17px]' : 'left-[3px]',
          )}
        />
      </button>
    </label>
  );
}
