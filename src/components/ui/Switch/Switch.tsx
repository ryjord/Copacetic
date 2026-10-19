'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Read by assistive technology. The visible label belongs to whatever row holds the switch. */
  label: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      disabled={disabled}
      className={cn(
        'no-drag relative h-5 w-9 shrink-0 rounded-full transition-colors duration-100',
        'bg-line-strong data-[state=checked]:bg-accent disabled:opacity-40',
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block size-4 translate-x-[2px] rounded-full bg-white shadow-sm transition-transform duration-100',
          'data-[state=checked]:translate-x-[18px]',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
