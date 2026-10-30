// Libs
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
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
const reorderBookmark = vi.fn();
const reorderFolder = vi.fn();
const api = {
  bookmarks: { list: async () => bookmarks, reorder: reorderBookmark },
  bookmarkFolders: { list: async () => folders, reorder: reorderFolder },
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
  reorderBookmark.mockClear();
  reorderFolder.mockClear();
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

/** The chip a name sits in, which is what is dragged and dropped on. */
const chipOf = (name: RegExp) => screen.getByRole('button', { name }).closest('li') as HTMLElement;

/** A drop on a chip 100px wide, on its left or right half; jsdom lays nothing out and drops clientX. */
function dropOn(chip: HTMLElement, half: 'left' | 'right') {
  vi.spyOn(chip, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 100 } as DOMRect);
  ['dragOver', 'drop'].forEach((type) => {
    const event = createEvent[type as 'dragOver' | 'drop'](chip);
    Object.defineProperty(event, 'clientX', { value: half === 'left' ? 20 : 80 });
    fireEvent(chip, event);
  });
}

describe('putting the start page in your own order', () => {
  it('puts a bookmark dropped on the left half of another before it', async () => {
    bookmarks = [bookmark('first'), bookmark('second'), bookmark('third')];
    render(<StartBookmarks tabId="t1" />);
    await screen.findByRole('button', { name: /third/ });
    fireEvent.dragStart(chipOf(/third/));
    dropOn(chipOf(/first/), 'left');
    expect(reorderBookmark).toHaveBeenCalledWith('third', 'first');
  });

  it('puts one dropped on the right half after it, and on the last one at the end', async () => {
    bookmarks = [bookmark('first'), bookmark('second'), bookmark('third')];
    render(<StartBookmarks tabId="t1" />);
    await screen.findByRole('button', { name: /third/ });
    fireEvent.dragStart(chipOf(/first/));
    dropOn(chipOf(/second/), 'right');
    expect(reorderBookmark).toHaveBeenLastCalledWith('first', 'third');

    fireEvent.dragStart(chipOf(/first/));
    dropOn(chipOf(/third/), 'right');
    expect(reorderBookmark).toHaveBeenLastCalledWith('first', null);
  });

  it('orders folders among folders', async () => {
    folders = [folder('work', 'Work'), folder('home', 'Home')];
    render(<StartBookmarks tabId="t1" />);
    await screen.findByRole('button', { name: 'Home' });
    fireEvent.dragStart(chipOf(/Home/));
    dropOn(chipOf(/Work/), 'left');
    expect(reorderFolder).toHaveBeenCalledWith('home', 'work');
  });

  // A bookmark cannot sit among the folders, which always come first.
  it('does not drop a bookmark among the folders', async () => {
    folders = [folder('work', 'Work')];
    bookmarks = [bookmark('site')];
    render(<StartBookmarks tabId="t1" />);
    await screen.findByRole('button', { name: /site/ });
    fireEvent.dragStart(chipOf(/site/));
    dropOn(chipOf(/Work/), 'left');
    expect(reorderBookmark).not.toHaveBeenCalled();
    expect(reorderFolder).not.toHaveBeenCalled();
  });
});
