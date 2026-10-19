'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-ink hover:opacity-90 active:opacity-80',
  secondary: 'border border-line-strong text-ink hover:bg-hover active:bg-line',
  ghost: 'text-ink-dim hover:bg-hover hover:text-ink active:bg-line',
  danger: 'border border-line-strong text-alert hover:border-alert/50 hover:bg-alert/8 active:bg-alert/12',
};

/** Every text button in the interface. Colour is for state, so only `danger` is coloured, and only red. */
export function Button({ variant = 'secondary', size = 'md', type = 'button', className, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'no-drag inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium transition-[background-color,color,opacity] duration-100',
        'disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-7 px-2.5 text-body-sm' : 'h-8 px-3 text-body',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
