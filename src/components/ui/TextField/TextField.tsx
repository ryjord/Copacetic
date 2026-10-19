'use client';

import { Search, X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type TextFieldProps = ComponentProps<'input'>;

/** Every text input. One height, one radius, one focus treatment. */
export function TextField({ className, ...props }: TextFieldProps) {
  return (
    <input
      className={cn(
        'no-drag h-8 w-full min-w-0 rounded-sm border border-line-strong bg-raised px-2.5 text-body text-ink',
        'placeholder:text-ink-faint focus:border-ink-faint focus:outline-none disabled:opacity-40',
        className,
      )}
      {...props}
    />
  );
}

interface SearchFieldProps extends Omit<ComponentProps<'input'>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  /** Read by assistive technology, and shown when the field is empty. */
  label: string;
}

/** A text field for narrowing a list, with a way to empty it. */
export function SearchField({ value, onChange, label, className, ...props }: SearchFieldProps) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
      <TextField
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        aria-label={label}
        className="pl-8 pr-7 [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-xs text-ink-faint hover:text-ink"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
