import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => process.env.COPA_BOOKMARKS_DIR } }));

const { BrowserStore } = await import('../../../../electron/main/data/store');

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
 * instead deletes the thing it was asked to keep - which is what saving a tab
 * group as a folder did to every tab in it that was already bookmarked.
 */
describe('making sure a page is bookmarked', () => {
  it('adds once and never alters or removes an existing bookmark (id, title, createdAt, folder)', () => {
    const folder = store.createBookmarkFolder('Work', 'violet', null);
    const first = store.ensureBookmark('https://example.com/', 'The name I gave it');
    expect(first.url).toBe('https://example.com/');
    expect(store.listBookmarks()).toHaveLength(1);
    store.fileBookmark(first.id, folder.id);

    const again = store.ensureBookmark('https://example.com/', 'Something else');
    expect(again.id).toBe(first.id);
    expect(again.title).toBe('The name I gave it');
    expect(again.createdAt).toBe(first.createdAt);
    expect(store.listBookmarks()).toHaveLength(1);
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

describe('importing bookmarks with their folders', () => {
  const imported = (url: string, folders: string[]) => ({ url, title: url, addedAt: null, folders });

  it('rebuilds the folders inside one folder of their own', () => {
    store.importBookmarks(
      [imported('https://top.test/', []), imported('https://deep.test/', ['Work', 'Clients'])],
      'Imported from Chrome',
    );
    const folders = store.listBookmarkFolders();
    const byName = (name: string) => folders.find((folder) => folder.name === name);
    expect(byName('Work')?.parentId).toBe(byName('Imported from Chrome')?.id);
    expect(byName('Clients')?.parentId).toBe(byName('Work')?.id);

    const folderOf = (url: string) => store.listBookmarks().find((bookmark) => bookmark.url === url)?.folderId;
    expect(folderOf('https://top.test/')).toBe(byName('Imported from Chrome')?.id);
    expect(folderOf('https://deep.test/')).toBe(byName('Clients')?.id);
  });

  it('leaves a bookmark already saved where it was, and makes no folder for nothing', () => {
    const existing = store.ensureBookmark('https://kept.test/', 'Kept');
    const result = store.importBookmarks([imported('https://kept.test/', ['Elsewhere'])], 'Imported bookmarks');
    expect(result).toEqual({ added: 0, alreadyHad: 1 });
    expect(store.listBookmarkFolders()).toEqual([]);
    expect(store.listBookmarks().find((bookmark) => bookmark.id === existing.id)?.folderId).toBeNull();
  });
});
