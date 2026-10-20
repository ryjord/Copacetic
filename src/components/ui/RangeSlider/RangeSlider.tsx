'use client';

// Utils
import { cn } from '@/lib/utils';

interface RangeSliderProps {
  value: number;
  min: number;
  max: number;
  label: string;
  /** Every step while it moves, for a preview. */
  onInput?: (value: number) => void;
  /** Once, when it is let go: a drag is one change, not a hundred. */
  onChange: (value: number) => void;
  className?: string;
}

export function RangeSlider({ value, min, max, label, onInput, onChange, className }: RangeSliderProps) {
  const commit = (target: HTMLInputElement) => onChange(Number(target.value));
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      aria-label={label}
      onChange={(event) => onInput?.(Number(event.target.value))}
      onPointerUp={(event) => commit(event.currentTarget)}
      onKeyUp={(event) => commit(event.currentTarget)}
      className={cn('no-drag w-36 accent-[var(--color-accent)]', className)}
    />
  );
}
