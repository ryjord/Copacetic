'use client';

import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  /** Required: every icon-only control needs an accessible name. */
  label: string;
  children: ReactNode;
  tone?: 'default' | 'active' | 'alert';
  size?: 'sm' | 'md';
}

export function IconButton({
  label,
  children,
  tone = 'default',
  size = 'md',
  className,
  disabled,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        'no-drag grid shrink-0 place-items-center rounded-md transition-colors duration-150',
        size === 'sm' ? 'size-6' : 'size-7',
        disabled
          ? 'cursor-default text-ink-faint/40'
          : 'text-ink-dim hover:bg-hover hover:text-ink active:bg-line-strong',
        tone === 'active' && !disabled && 'bg-hover text-ink',
        tone === 'alert' && !disabled && 'text-alert hover:text-alert',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
