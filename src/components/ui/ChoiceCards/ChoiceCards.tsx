'use client';

// Libs
import { RadioGroup } from 'radix-ui';
import type { ReactNode } from 'react';

// Utils
import { cn } from '@/lib/utils';

interface ChoiceCardsProps<Id extends string> {
  options: readonly { id: Id; label: string; preview: ReactNode }[];
  /** Null when none of the cards is the current choice. */
  value: Id | null;
  onChange: (value: Id) => void;
  /** What the choice is about, for assistive technology. */
  label: string;
  /** Labels under the cards; without them each card's label is only its accessible name. */
  hasCaptions?: boolean;
  /** False when choosing does more than show a choice, so the arrow keys only move and Space chooses. */
  isChosenByArrowKeys?: boolean;
  className?: string;
}

/** One of a few choices, each shown as what it looks like. A radio group, so arrow keys move between them. */
export function ChoiceCards<Id extends string>({
  options,
  value,
  onChange,
  label,
  hasCaptions = true,
  isChosenByArrowKeys = true,
  className,
}: ChoiceCardsProps<Id>) {
  return (
    <RadioGroup.Root
      value={value ?? ''}
      aria-label={label}
      orientation="horizontal"
      onValueChange={(next) => {
        const chosen = options.find((option) => option.id === next);
        if (chosen) {
          onChange(chosen.id);
        }
      }}
      className={cn('no-drag flex flex-wrap gap-2.5', className)}
    >
      {options.map((option) => (
        <RadioGroup.Item
          key={option.id}
          value={option.id}
          aria-label={option.label}
          title={hasCaptions ? undefined : option.label}
          // Radix chooses an item as an arrow key focuses it, unless this handler prevents it.
          onFocus={isChosenByArrowKeys ? undefined : (event) => event.preventDefault()}
          className="group flex flex-col items-center gap-1.5 rounded-sm text-body-sm text-ink-dim outline-offset-2 data-[state=checked]:text-ink"
        >
          <span className="block overflow-hidden rounded-sm border-2 border-transparent transition-colors group-hover:border-line-strong group-data-[state=checked]:border-accent">
            {option.preview}
          </span>
          {hasCaptions && <span>{option.label}</span>}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
