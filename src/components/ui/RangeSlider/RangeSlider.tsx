'use client';

// Libs
import { useState } from 'react';

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

// The keys a range input moves on; Tab and the rest leave it where it is.
const MOVING_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

export function RangeSlider({ value, min, max, label, onInput, onChange, className }: RangeSliderProps) {
  const [isMoved, setIsMoved] = useState(false);
  const commit = (target: HTMLInputElement) => {
    setIsMoved(false);
    onChange(Number(target.value));
  };
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      aria-label={label}
      onChange={(event) => {
        setIsMoved(true);
        onInput?.(Number(event.target.value));
      }}
      onPointerUp={(event) => commit(event.currentTarget)}
      onKeyUp={(event) => MOVING_KEYS.has(event.key) && commit(event.currentTarget)}
      // Moved some other way, such as by assistive technology, it is still kept once focus leaves.
      onBlur={(event) => isMoved && commit(event.currentTarget)}
      className={cn('no-drag w-36 accent-[var(--color-accent)]', className)}
    />
  );
}
