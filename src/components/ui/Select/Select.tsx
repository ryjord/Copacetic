'use client';

// Libs
import { Select as SelectPrimitive } from 'radix-ui';

// Icons
import { Check, ChevronDown } from 'lucide-react';

// Utils
import { cn } from '@/lib/utils';

interface SelectProps<Id extends string> {
  options: readonly { id: Id; label: string }[];
  value: Id;
  onChange: (value: Id) => void;
  /** Read by assistive technology. The visible label belongs to the row holding it. */
  label: string;
}

/** One choice from a list too long to lay out side by side. */
export function Select<Id extends string>({ options, value, onChange, label }: SelectProps<Id>) {
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(next) => {
        const chosen = options.find((option) => option.id === next);
        if (chosen) {
          onChange(chosen.id);
        }
      }}
    >
      <SelectPrimitive.Trigger
        aria-label={label}
        className="no-drag inline-flex h-8 min-w-36 items-center justify-between gap-2 rounded-sm border border-line-strong bg-raised px-2.5 text-body text-ink hover:bg-hover"
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown size={14} className="text-ink-faint" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="animate-pop max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md bg-raised p-1 shadow-popover"
        >
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.id}
                value={option.id}
                className={cn(
                  'flex h-7 items-center justify-between gap-4 rounded-xs px-2 text-body text-ink outline-none',
                  'data-[highlighted]:bg-hover',
                )}
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check size={14} className="text-ink-dim" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
