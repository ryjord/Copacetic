import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const calls: unknown[][] = [];
const api = {
  bookmarks: {
    list: async () => [{ id: 'b1', url: 'https://example.com/', title: 'Example', createdAt: 1, folderId: null }],
    update: async (...args: unknown[]) => calls.push(['update', ...args]),
    file: async (...args: unknown[]) => calls.push(['file', ...args]),
    remove: async (id: string) => calls.push(['remove', id]),
  },
  bookmarkFolders: {
    list: async () => [{ id: 'work', name: 'Work', colour: 'moss', parentId: null, collapsed: false }],
  },
  chrome: { closeBookmarkSheet: async () => calls.push(['close']) },
};
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: (bridge: typeof api) => unknown) => call(api),
  ask: async (call: (bridge: typeof api) => Promise<unknown>) => call(api),
  getBridge: () => null,
  isRunningInShell: () => false,
}));

const { BookmarkSheet } = await import('@/components/overlay/BookmarkSheet/BookmarkSheet');

beforeEach(() => {
  calls.length = 0;
});
afterEach(cleanup);

describe('the sheet after the star', () => {
  it('saves a new name, and only what changed', async () => {
    render(<BookmarkSheet bookmarkId="b1" />);
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'My example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(calls).toEqual([['update', 'b1', { title: 'My example' }], ['close']]));
  });

  it('removes what the star just added', async () => {
    render(<BookmarkSheet bookmarkId="b1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(calls).toEqual([['close'], ['remove', 'b1']]));
  });
});
