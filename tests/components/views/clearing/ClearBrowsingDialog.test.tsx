import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ClearBrowsingDialog } from '@/components/views/clearing/ClearBrowsingDialog';

afterEach(cleanup);

const open = (range: 'hour' | 'all', onConfirm = vi.fn()) => {
  render(<ClearBrowsingDialog range={range} open onOpenChange={() => {}} onConfirm={onConfirm} />);
  return onConfirm;
};

describe('the clear browsing data dialog', () => {
  it('starts from history alone for a time range', () => {
    const onConfirm = open('hour');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onConfirm).toHaveBeenCalledWith({ history: true, siteData: false, cache: false });
  });

  it('starts from everything for all time', () => {
    const onConfirm = open('all');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onConfirm).toHaveBeenCalledWith({ history: true, siteData: true, cache: true });
  });

  it('clears only what is ticked', () => {
    const onConfirm = open('hour');
    fireEvent.click(screen.getByLabelText('History from last hour'));
    fireEvent.click(screen.getByLabelText('Cached images and files, from all time'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onConfirm).toHaveBeenCalledWith({ history: false, siteData: false, cache: true });
  });

  it('cannot be confirmed with nothing ticked', () => {
    open('hour');
    fireEvent.click(screen.getByLabelText('History from last hour'));
    expect(screen.getByRole('button', { name: 'Clear' }).hasAttribute('disabled')).toBe(true);
  });
});
