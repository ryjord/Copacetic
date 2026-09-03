import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => process.env.COPA_BOOKMARKS_DIR } }));

const { BrowserStore } = await import('../../electron/main/data/store');

let store: InstanceType<typeof BrowserStore>;

beforeEach(() => {
  process.env.COPA_BOOKMARKS_DIR = mkdtempSync(path.join(tmpdir(), 'copacetic-bookmarks-'));
  store = new BrowserStore();
});

/**
 * Saving a page that is already saved.
 *
 * `toggle` is a true toggle: asked twice about the same address it removes what
 * it added. Anything that means "make sure this is saved" and reaches for it
 * instead deletes the thing it was asked to keep — which is what saving a tab
 * group as a folder did to every tab in it that was already bookmarked.
 */
describe('making sure a page is bookmarked', () => {
  it('adds one that is not there', () => {
    const bookmark = store.ensureBookmark('https://example.com/', 'Example');
    expect(bookmark.url).toBe('https://example.com/');
    expect(store.listBookmarks()).toHaveLength(1);
  });

  it('keeps the one that is, rather than removing it', () => {
    const first = store.ensureBookmark('https://example.com/', 'Example');
    const again = store.ensureBookmark('https://example.com/', 'Example');
    expect(again.id).toBe(first.id);
    expect(store.listBookmarks()).toHaveLength(1);
  });

  it('keeps the title and the date the first save had', () => {
    const first = store.ensureBookmark('https://example.com/', 'The name I gave it');
    const again = store.ensureBookmark('https://example.com/', 'Something else');
    expect(again.title).toBe('The name I gave it');
    expect(again.createdAt).toBe(first.createdAt);
  });

  it('leaves the folder it was already filed in alone', () => {
    const folder = store.createBookmarkFolder('Work', 'violet', null);
    const bookmark = store.ensureBookmark('https://example.com/', 'Example');
    store.fileBookmark(bookmark.id, folder.id);

    store.ensureBookmark('https://example.com/', 'Example');
    expect(store.listBookmarks()[0]?.folderId).toBe(folder.id);
  });
});

/**
 * A folder whose parent has gone is not a folder anyone can reach: the tree is
 * walked down from the top, so it is neither a root nor anybody's child. It and
 * everything under it disappear from every view, while staying on disk.
 */
describe('a folder whose parent is missing', () => {
  it('is filed at the top level rather than nowhere', () => {
    const folder = store.createBookmarkFolder('Orphan', 'violet', null);
    store.createBookmarkFolder('Child', 'violet', folder.id);
    store.deleteBookmarkFolder(folder.id);

    const folders = store.listBookmarkFolders();
    expect(folders.map((entry) => entry.name)).toEqual(['Child']);
    expect(folders[0]?.parentId).toBeNull();
  });
});
