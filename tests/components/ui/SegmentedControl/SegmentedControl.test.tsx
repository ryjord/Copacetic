import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SegmentedControl } from '@/components/ui/SegmentedControl/SegmentedControl';

afterEach(cleanup);

const OPTIONS = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
] as const;

describe('a segmented control', () => {
  // The old ChoiceGroup was a row of unrelated toggle buttons to a screen reader.
  it('is one named group with the choice marked', () => {
    render(<SegmentedControl options={OPTIONS} value="light" onChange={() => {}} label="Appearance" />);
    expect(screen.getByRole('radiogroup', { name: 'Appearance' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true');
  });

  it('reports the choice that was made', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="light" onChange={onChange} label="Appearance" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  // Clicking the chosen one again would otherwise clear the value, which a setting can never be.
  it('cannot be left with nothing chosen', () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="light" onChange={onChange} label="Appearance" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

// tailwind-merge took `text-body-sm` for a colour and dropped it beside `text-ink-dim`.
describe('the type scale', () => {
  it('survives being merged with a text colour', async () => {
    const { cn } = await import('@/lib/utils');
    expect(cn('text-body-sm text-ink-dim')).toBe('text-body-sm text-ink-dim');
    expect(cn('text-body', 'text-caption')).toBe('text-caption');
  });
});
