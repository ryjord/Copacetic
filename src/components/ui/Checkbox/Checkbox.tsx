'use client';

import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { Check } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** For a box whose row already says what it is, such as one selecting a list item. */
  isLabelHidden?: boolean;
}

export function Checkbox({ checked, onChange, label, isLabelHidden = false }: CheckboxProps) {
  const id = useId();
  return (
    <span className="no-drag inline-flex items-center gap-2">
      <CheckboxPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={(state) => onChange(state === true)}
        className={cn(
          'grid size-4 shrink-0 place-items-center rounded-xs border border-line-strong transition-colors duration-100',
          'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
        )}
      >
        <CheckboxPrimitive.Indicator>
          <Check size={12} strokeWidth={2.5} className="text-accent-ink" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <label htmlFor={id} className={isLabelHidden ? 'sr-only' : 'text-body-sm text-ink-dim'}>
        {label}
      </label>
    </span>
  );
}
