'use client';

import { ToggleGroup } from 'radix-ui';
import { cn } from '@/lib/utils';

interface SegmentedControlProps<Id extends string> {
  options: readonly { id: Id; label: string }[];
  value: Id;
  onChange: (value: Id) => void;
  /** What the choice is about, for assistive technology. */
  label: string;
}

/** One of a few choices, side by side. A radio group underneath, so arrow keys move between them. */
export function SegmentedControl<Id extends string>({ options, value, onChange, label }: SegmentedControlProps<Id>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={label}
      onValueChange={(next) => {
        const chosen = options.find((option) => option.id === next);
        if (chosen) {
          onChange(chosen.id);
        }
      }}
      className="no-drag inline-flex shrink-0 rounded-sm bg-hover p-0.5"
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.id}
          value={option.id}
          className={cn(
            'h-6 rounded-xs px-2.5 text-body-sm text-ink-dim transition-colors duration-100 hover:text-ink',
            'data-[state=on]:bg-raised data-[state=on]:text-ink data-[state=on]:shadow-sm',
          )}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
