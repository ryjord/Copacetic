import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Bookmark } from '@shared/types';

const bookmark = (id: string, title: string): Bookmark => ({
  id,
  url: `https://${id}.example/`,
  title,
  createdAt: 1,
  folderId: null,
});
const BOOKMARKS = ['one', 'two', 'three', 'four'].map((id) => bookmark(id, id));

const overflow: unknown[] = [];
const api = {
  bookmarks: {
    list: async () => BOOKMARKS,
    openOverflowMenu: (...args: unknown[]) => overflow.push(args),
    openInActiveTab: vi.fn(),
  },
  bookmarkFolders: { list: async () => [] },
  favicons: { forUrls: async () => ({}) },
  chrome: { showPage: vi.fn() },
};
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: (bridge: typeof api) => unknown) => call(api),
  ask: async (call: (bridge: typeof api) => Promise<unknown>) => call(api),
  getBridge: () => null,
  isRunningInShell: () => false,
}));
const toggleSurface = vi.fn();
vi.mock('@/store/useBrowserStore', () => ({
  useBrowserStore: (select: (state: { toggleSurface: typeof toggleSurface }) => unknown) => select({ toggleSurface }),
}));

// jsdom lays nothing out, so each item is 60 wide, side by side, in a row with room for two.
const ITEM_WIDTH = 60;
const originals = {
  offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
  offsetLeft: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetLeft'),
  clientWidth: Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth'),
};
const observed = new Set<Element>();
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe(element: Element) {
      observed.add(element);
    }
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute('data-bar-item') ? ITEM_WIDTH : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
    configurable: true,
    get(this: HTMLElement) {
      const items = [...(this.parentElement?.querySelectorAll('[data-bar-item]') ?? [])];
      return items.indexOf(this) * ITEM_WIDTH;
    },
  });
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => ITEM_WIDTH * 2 + 10 });
});
afterAll(() => {
  Object.entries(originals).forEach(([name, descriptor]) => {
    if (descriptor) {
      Object.defineProperty(name === 'clientWidth' ? Element.prototype : HTMLElement.prototype, name, descriptor);
    }
  });
  cleanup();
});

const { BookmarksBar } = await import('@/components/shell/BookmarksBar/BookmarksBar');

describe('the bookmarks bar', () => {
  // Past the edge was out of reach: no scroll, no menu.
  it('keeps what does not fit behind », reachable', async () => {
    render(<BookmarksBar />);
    fireEvent.click(await screen.findByRole('button', { name: '2 more bookmarks' }));
    expect(overflow).toEqual([[[], ['three', 'four'], 0, 0]]);
    expect(screen.getByText('three').closest('button')?.getAttribute('tabindex')).toBe('-1');
  });

  // A renamed bookmark changes no count, so only its own size says the row needs measuring again.
  it('watches every item for a change of size, not only the row', async () => {
    render(<BookmarksBar />);
    await screen.findByRole('button', { name: '2 more bookmarks' });
    const items = [...document.querySelectorAll('[data-bar-item]')];
    expect(items).toHaveLength(4);
    expect(items.every((item) => observed.has(item))).toBe(true);
  });

  it('opens every bookmark from its start', async () => {
    render(<BookmarksBar />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'All bookmarks' }))[0]!);
    expect(api.chrome.showPage).toHaveBeenCalledWith('bookmarks');
  });
});
