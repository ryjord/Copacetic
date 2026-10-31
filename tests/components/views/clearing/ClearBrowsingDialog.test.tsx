import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ClearBrowsingDialog } from '@/components/views/clearing/ClearBrowsingDialog';

afterEach(cleanup);

const open = (range: 'hour' | 'all', onConfirm = vi.fn()) => {
  render(<ClearBrowsingDialog range={range} open onOpenChange={() => {}} onConfirm={onConfirm} />);
  return onConfirm;
};

describe('the clear browsing data dialog', () => {
  it.each([
    {
      name: 'history alone for a time range',
      range: 'hour' as const,
      expected: { history: true, siteData: false, cache: false },
    },
    {
      name: 'everything for all time',
      range: 'all' as const,
      expected: { history: true, siteData: true, cache: true },
    },
  ])('starts from $name', ({ range, expected }) => {
    const onConfirm = open(range);
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onConfirm).toHaveBeenCalledWith(expected);
  });

  it('clears only what is ticked', () => {
    const onConfirm = open('hour');
    fireEvent.click(screen.getByLabelText('History from last hour'));
    fireEvent.click(screen.getByLabelText('Cached images and files of the sites visited in the last hour'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onConfirm).toHaveBeenCalledWith({ history: false, siteData: false, cache: true });
  });

  // Chromium keeps no time for cookies or the cache, so a range reaches them by site, and says so before it runs.
  it('says a time range clears cookies and the cache of the sites visited in it, however old', () => {
    open('hour');
    expect(
      screen.getByLabelText(
        'Cookies and site data of the sites visited in the last hour, however old. You will be signed out of them.',
      ),
    ).toBeTruthy();
    cleanup();
    open('all');
    expect(
      screen.getByLabelText('Cookies and site data, from all time. You will be signed out of sites.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Cached images and files, from all time')).toBeTruthy();
  });

  it('cannot be confirmed with nothing ticked', () => {
    open('hour');
    fireEvent.click(screen.getByLabelText('History from last hour'));
    expect(screen.getByRole('button', { name: 'Clear' }).hasAttribute('disabled')).toBe(true);
  });
});
