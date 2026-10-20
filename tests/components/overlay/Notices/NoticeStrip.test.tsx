import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const NOTICE = {
  id: 'u1',
  tone: 'undo',
  key: 'undo-1',
  message: 'Removed “Example” from bookmarks.',
  confirm: 'Undo',
};
vi.mock('@/lib/bridge/bridge', () => ({
  send: () => {},
  ask: async (call: (api: unknown) => Promise<unknown>) => call({ notices: { pending: async () => [NOTICE] } }),
  getBridge: () => null,
  isRunningInShell: () => false,
}));

const { NoticeStrip } = await import('@/components/overlay/Notices/NoticeStrip');

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a notice with something to press', () => {
  // Reaching for Undo should never race the notice away.
  it('stays while the pointer is on it, and goes once it leaves', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<NoticeStrip />);
    const notice = await screen.findByText(NOTICE.message);
    fireEvent.pointerEnter(notice.closest('[role="status"]')!.parentElement!);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText(NOTICE.message)).toBeTruthy();

    fireEvent.pointerLeave(notice.closest('[role="status"]')!.parentElement!);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.queryByText(NOTICE.message)).toBeNull();
  });
});
