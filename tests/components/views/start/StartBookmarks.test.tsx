// Libs
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { BookmarkFolder } from '@shared/data/bookmark-folders';
import type { Bookmark } from '@shared/types';

const bookmark = (id: string, folderId: string | null = null): Bookmark => ({
  id,
  url: `https://${id}.example/`,
  title: id,
  createdAt: 1,
  folderId,
});
const folder = (id: string, name: string, parentId: string | null = null): BookmarkFolder => ({
  id,
  name,
  colour: 'ash',
  parentId,
  collapsed: false,
});

let bookmarks: Bookmark[] = [];
let folders: BookmarkFolder[] = [];
const changeListeners: (() => void)[] = [];
const navigate = vi.fn();
const api = {
  bookmarks: { list: async () => bookmarks },
  bookmarkFolders: { list: async () => folders },
  favicons: { forUrls: async () => ({}) },
  tabs: { navigate },
};
vi.mock('@/lib/bridge/bridge', () => ({
  send: (call: (bridge: typeof api) => unknown) => call(api),
  ask: async (call: (bridge: typeof api) => Promise<unknown>) => call(api),
  getBridge: () => ({
    on: {
      bookmarksChanged: (listener: () => void) => {
        changeListeners.push(listener);
        return () => {};
      },
    },
  }),
  isRunningInShell: () => false,
}));

const { StartBookmarks } = await import('@/components/views/start/StartBookmarks');

beforeEach(() => {
  bookmarks = [];
  folders = [];
  changeListeners.length = 0;
  navigate.mockClear();
});

afterEach(cleanup);

describe('bookmarks on the start page', () => {
  // It showed the newest eight and nothing else, so most of what was saved could not be reached here.
  it('shows more than eight, and the rest behind Show all rather than nowhere', async () => {
    bookmarks = Array.from({ length: 20 }, (_unused, index) => bookmark(`site-${index}`));
    folders = [folder('work', 'Work')];
    render(<StartBookmarks tabId="t1" />);

    expect(await screen.findByRole('button', { name: 'Work' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /site-14/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /site-15/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show all 21' }));
    expect(screen.getByRole('button', { name: /site-19/ })).toBeTruthy();
  });

  it('opens a folder in place, nested as deep as it goes, with the way back above it', async () => {
    folders = [folder('work', 'Work'), folder('projects', 'Projects', 'work')];
    bookmarks = [bookmark('loose'), bookmark('inside', 'work'), bookmark('deep', 'projects')];
    render(<StartBookmarks tabId="t1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Work' }));
    expect(screen.getByRole('button', { name: /inside/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /loose/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    expect(screen.getByRole('button', { name: /deep/ })).toBeTruthy();
    expect(screen.getByText('Projects').getAttribute('aria-current')).toBe('location');

    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    expect(screen.getByRole('button', { name: /inside/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Bookmarks' }));
    expect(screen.getByRole('button', { name: /loose/ })).toBeTruthy();
  });

  // It was read once, so a bookmark saved while the start page was open never appeared on it.
  it('shows a bookmark saved while the page is open', async () => {
    bookmarks = [bookmark('first')];
    render(<StartBookmarks tabId="t1" />);
    expect(await screen.findByRole('button', { name: /first/ })).toBeTruthy();

    bookmarks = [bookmark('second'), bookmark('first')];
    await act(async () => changeListeners.forEach((listener) => listener()));
    expect(screen.getByRole('button', { name: /second/ })).toBeTruthy();
  });

  it('goes back to the top when the open folder is deleted', async () => {
    folders = [folder('work', 'Work')];
    bookmarks = [bookmark('loose'), bookmark('inside', 'work')];
    render(<StartBookmarks tabId="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Work' }));

    folders = [];
    bookmarks = [bookmark('loose')];
    await act(async () => changeListeners.forEach((listener) => listener()));
    expect(screen.getByRole('button', { name: /loose/ })).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('opens a bookmark in this tab', async () => {
    bookmarks = [bookmark('site')];
    render(<StartBookmarks tabId="t1" />);
    fireEvent.click(await screen.findByRole('button', { name: /site/ }));
    expect(navigate).toHaveBeenCalledWith('t1', 'https://site.example/');
  });
});
