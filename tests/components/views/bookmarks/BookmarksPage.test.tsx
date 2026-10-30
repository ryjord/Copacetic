import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
const reordered: [string, string | null][] = [];
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
    reorder: (id: string, beforeId: string | null) => reordered.push([id, beforeId]),
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
  useBrowserStore: (select: (state: { tabs: [] }) => unknown) => select({ tabs: [] }),
}));

const { BookmarksPage } = await import('@/components/views/bookmarks/BookmarksPage');

const titles = () =>
  within(screen.getByRole('list'))
    .getAllByText(/pie|facts/)
    .map((row) => row.textContent);

beforeEach(() => {
  removedMany.length = 0;
  reordered.length = 0;
  added.length = 0;
});
afterEach(cleanup);

describe('the bookmarks list', () => {
  // The order the start page shows, and the only one dragging can change.
  it('shows your own order first, and sorts by name on request', async () => {
    // Radix's select asks for pointer capture and scrolls its options, neither of which jsdom has.
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => {};
    Element.prototype.scrollIntoView ??= () => {};
    render(<BookmarksPage tabId="tab" />);
    await screen.findByText('Zebra facts');
    expect(titles().filter((title) => !title?.startsWith('Select'))).toEqual([
      'Zebra facts',
      'Apple pie',
      'Apple pie again',
    ]);

    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Sort bookmarks' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    fireEvent.click(await screen.findByRole('option', { name: 'Name, A to Z' }));
    expect(titles()[0]).toContain('Apple pie');
    expect(titles().at(-1)).toContain('Zebra facts');
  });

  it('shows only what was added this week', async () => {
    render(<BookmarksPage tabId="tab" />);
    await screen.findByText('Zebra facts');
    fireEvent.click(screen.getByRole('radio', { name: 'Added this week' }));
    expect(screen.queryByText('Zebra facts')).toBeNull();
    expect(screen.getByText('Apple pie')).toBeTruthy();
  });

  // The same page twice, one with a trailing slash: what someone tidying would want to see.
  it('finds the same page saved twice', async () => {
    render(<BookmarksPage tabId="tab" />);
    await screen.findByText('Zebra facts');
    fireEvent.click(screen.getByRole('radio', { name: 'Duplicates' }));
    expect(screen.queryByText('Zebra facts')).toBeNull();
    expect(screen.getByText('Apple pie again')).toBeTruthy();
  });

  it('deletes a selection at once', async () => {
    render(<BookmarksPage tabId="tab" />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Zebra facts' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Apple pie' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(removedMany).toEqual([['a', 'b']]);
  });

  it('adds a bookmark typed by hand', async () => {
    render(<BookmarksPage tabId="tab" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add bookmark' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Docs' } });
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'docs.example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(added).toEqual([['Docs', 'docs.example', null]]));
  });
});

/** The row a title sits in, which is what is dragged and dropped on. */
const rowOf = (title: string) => screen.getByText(title).closest('li') as HTMLElement;

/** Starting a drag files the bookmark's id on the drag, which jsdom has nowhere to keep. */
const startDragging = (row: HTMLElement) => fireEvent.dragStart(row, { dataTransfer: { setData: () => {} } });

/** A drag event over a row 40px tall, in its upper or lower half; jsdom lays nothing out and drops clientY. */
function dragOnto(row: HTMLElement, type: 'dragOver' | 'drop', half: 'upper' | 'lower') {
  vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top: 0, height: 40 } as DOMRect);
  const event = createEvent[type](row);
  Object.defineProperty(event, 'clientY', { value: half === 'upper' ? 10 : 30 });
  fireEvent(row, event);
}

describe('putting bookmarks in your own order', () => {
  it('puts a bookmark dropped on the upper half of a row before it', async () => {
    render(<BookmarksPage tabId="tab" />);
    await screen.findByText('Zebra facts');
    startDragging(rowOf('Apple pie again'));
    dragOnto(rowOf('Zebra facts'), 'dragOver', 'upper');
    dragOnto(rowOf('Zebra facts'), 'drop', 'upper');
    expect(reordered).toEqual([['c', 'a']]);
  });

  it('puts one dropped on the lower half after that row, before the next', async () => {
    render(<BookmarksPage tabId="tab" />);
    await screen.findByText('Zebra facts');
    startDragging(rowOf('Apple pie again'));
    dragOnto(rowOf('Zebra facts'), 'drop', 'lower');
    expect(reordered).toEqual([['c', 'b']]);
  });

  // Otherwise nothing could ever be moved to the bottom.
  it('moves one to the end when dropped on the lower half of the last row', async () => {
    render(<BookmarksPage tabId="tab" />);
    await screen.findByText('Zebra facts');
    startDragging(rowOf('Zebra facts'));
    dragOnto(rowOf('Apple pie again'), 'drop', 'lower');
    expect(reordered).toEqual([['a', null]]);
  });

  // A filtered list hides rows between the ones shown, so a place in it is not a place in your order.
  it('does not reorder a filtered list', async () => {
    render(<BookmarksPage tabId="tab" />);
    await screen.findByText('Zebra facts');
    fireEvent.click(screen.getByRole('radio', { name: 'Duplicates' }));
    startDragging(rowOf('Apple pie again'));
    dragOnto(rowOf('Apple pie'), 'drop', 'upper');
    expect(reordered).toEqual([]);
  });
});
