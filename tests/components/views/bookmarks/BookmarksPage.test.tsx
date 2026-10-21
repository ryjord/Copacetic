import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Bookmark } from '@shared/types';

const DAY = 24 * 60 * 60 * 1000;
const bookmark = (id: string, url: string, title: string, daysAgo: number): Bookmark => ({
  id,
  url,
  title,
  createdAt: Date.now() - daysAgo * DAY,
  folderId: null,
});
const BOOKMARKS = [
  bookmark('a', 'https://zebra.example/', 'Zebra facts', 30),
  bookmark('b', 'https://apple.example/', 'Apple pie', 1),
  bookmark('c', 'https://apple.example', 'Apple pie again', 40),
];

const removedMany: string[][] = [];
const added: unknown[] = [];
const api = {
  bookmarks: {
    list: async () => BOOKMARKS,
    removeMany: (ids: string[]) => removedMany.push(ids),
    add: async (...args: unknown[]) => {
      added.push(args);
      return '';
    },
    openContextMenu: vi.fn(),
  },
  bookmarkFolders: { list: async () => [] },
  tabs: { create: async () => 'tab' },
  favicons: { forUrls: async () => ({}) },
  data: { importBookmarks: async () => '', export: async () => '' },
};
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: (bridge: typeof api) => unknown) => call(api),
  ask: async (call: (bridge: typeof api) => Promise<unknown>) => call(api),
  getBridge: () => null,
  isRunningInShell: () => false,
}));
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { activeTabId: string; tabs: [] }) => unknown) =>
    select({ activeTabId: 'tab', tabs: [] }),
}));

const { BookmarksPage } = await import('@/components/views/bookmarks/BookmarksPage');

const titles = () =>
  within(screen.getByRole('list'))
    .getAllByText(/pie|facts/)
    .map((row) => row.textContent);

beforeEach(() => {
  removedMany.length = 0;
  added.length = 0;
});
afterEach(cleanup);

describe('the bookmarks list', () => {
  it('sorts by name, and by newest', async () => {
    render(<BookmarksPage />);
    await screen.findByText('Zebra facts');
    expect(titles()[0]).toContain('Apple pie');
    expect(titles().at(-1)).toContain('Zebra facts');
  });

  it('shows only what was added this week', async () => {
    render(<BookmarksPage />);
    await screen.findByText('Zebra facts');
    fireEvent.click(screen.getByRole('radio', { name: 'Added this week' }));
    expect(screen.queryByText('Zebra facts')).toBeNull();
    expect(screen.getByText('Apple pie')).toBeTruthy();
  });

  // The same page twice, one with a trailing slash: what someone tidying would want to see.
  it('finds the same page saved twice', async () => {
    render(<BookmarksPage />);
    await screen.findByText('Zebra facts');
    fireEvent.click(screen.getByRole('radio', { name: 'Duplicates' }));
    expect(screen.queryByText('Zebra facts')).toBeNull();
    expect(screen.getByText('Apple pie again')).toBeTruthy();
  });

  it('deletes a selection at once', async () => {
    render(<BookmarksPage />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Zebra facts' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Apple pie' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(removedMany).toEqual([['b', 'a']]);
  });

  it('adds a bookmark typed by hand', async () => {
    render(<BookmarksPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add bookmark' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Docs' } });
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'docs.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(added).toEqual([['Docs', 'docs.example', null]]));
  });
});
