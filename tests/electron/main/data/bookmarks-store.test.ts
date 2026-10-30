import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }));

const { BookmarksStore } = await import('../../../../electron/main/data/bookmarks-store');
const { BookmarkFoldersStore } = await import('../../../../electron/main/data/bookmark-folders-store');
const { openDatabase } = await import('../../../../electron/main/data/database');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'copacetic-bookmarks-'));
});
// A new connection to the same file each time, which is what a restart is.
const open = () => openDatabase(path.join(dir, 'copacetic.db'));
const bookmarks = () => new BookmarksStore(open(), dir);
const folders = () => new BookmarkFoldersStore(open(), dir);

describe('bookmarks in the database', () => {
  it('lists the newest first, and keeps that order across a restart', () => {
    const store = bookmarks();
    store.toggle('https://first.example/', 'First');
    store.toggle('https://second.example/', 'Second');
    expect(
      bookmarks()
        .list()
        .map((bookmark) => bookmark.title),
    ).toEqual(['Second', 'First']);
  });

  it('removes on a second toggle, and says which it did', () => {
    const store = bookmarks();
    expect(store.toggle('https://example.com/', 'Example')).toBe(true);
    expect(store.toggle('https://example.com/', 'Example')).toBe(false);
    expect(store.has('https://example.com/')).toBe(false);
  });

  it('adds an import in its own order, above what was there, and counts what it already had', () => {
    const store = bookmarks();
    store.toggle('https://kept.example/', 'Kept');
    const result = store.addMany([
      { url: 'https://a.example/', title: 'A', addedAt: 1_700_000_000 },
      { url: 'https://kept.example/', title: 'Kept again', addedAt: null },
      { url: 'https://b.example/', title: 'B', addedAt: null },
    ]);
    expect(result).toEqual({ added: 2, alreadyHad: 1 });
    expect(store.list().map((bookmark) => bookmark.title)).toEqual(['A', 'B', 'Kept']);
    expect(store.list()[0]?.createdAt).toBe(1_700_000_000_000);
  });
});

describe('the bookmarks.json an earlier version kept', () => {
  it('is brought in once and put aside', () => {
    writeFileSync(
      path.join(dir, 'bookmarks.json'),
      JSON.stringify([{ id: '1', url: 'https://a.example/', title: 'A', createdAt: 1 }]),
    );
    expect(
      bookmarks()
        .list()
        .map((bookmark) => bookmark.url),
    ).toEqual(['https://a.example/']);
    expect(existsSync(path.join(dir, 'bookmarks.json.imported'))).toBe(true);
    expect(bookmarks().list()).toHaveLength(1);
  });

  // The loss an earlier migration caused, guarded where the data now crosses over.
  it('keeps every bookmark in the folder it was filed in', () => {
    writeFileSync(
      path.join(dir, 'bookmarks.json'),
      JSON.stringify([
        { id: '1', url: 'https://a.example/', title: 'A', folderId: 'work' },
        { id: '2', url: 'https://b.example/', title: 'B' },
      ]),
    );
    expect(
      bookmarks()
        .list()
        .map((bookmark) => bookmark.folderId),
    ).toEqual(['work', null]);
  });
});

describe('bookmark folders in the database', () => {
  it('keeps the tree across a restart, in the order the folders were made', () => {
    const store = folders();
    const work = store.create('Work', 'ocean', null);
    store.create('Reading', 'moss', work.id);
    const restored = folders().list();
    expect(restored.map((folder) => folder.name)).toEqual(['Work', 'Reading']);
    expect(restored[1]?.parentId).toBe(work.id);
  });

  it('refuses a move that would make a folder its own ancestor', () => {
    const store = folders();
    const outer = store.create('Outer', 'ocean', null);
    const inner = store.create('Inner', 'ocean', outer.id);
    expect(store.move(outer.id, inner.id)).toBe(false);
    expect(folders().find(outer.id)?.parentId).toBeNull();
  });

  it('changes a name, a colour or whether it is collapsed, and nothing else', () => {
    const store = folders();
    const folder = store.create('Work', 'ocean', null);
    store.update(folder.id, { collapsed: true });
    store.update(folder.id, { name: '  ' });
    expect(folders().find(folder.id)).toMatchObject({ name: 'Work', colour: 'ocean', collapsed: true });
  });

  it('brings in the bookmark-folders.json an earlier version kept', () => {
    writeFileSync(
      path.join(dir, 'bookmark-folders.json'),
      JSON.stringify([{ id: 'work', name: 'Work', colour: 'ocean', parentId: null, collapsed: false }]),
    );
    expect(
      folders()
        .list()
        .map((folder) => folder.id),
    ).toEqual(['work']);
    expect(existsSync(path.join(dir, 'bookmark-folders.json.imported'))).toBe(true);
  });
});

describe('editing a bookmark', () => {
  const saved = (store: InstanceType<typeof BookmarksStore>, url: string) =>
    store.list().find((bookmark) => bookmark.url === url);

  it('changes its title and address, and keeps them across a restart', () => {
    const store = bookmarks();
    const { id } = store.ensure('https://old.example/', 'Old');
    expect(store.update(id, { title: 'New', url: 'https://new.example/' })).toBe('saved');
    expect(saved(bookmarks(), 'https://new.example/')?.title).toBe('New');
    expect(saved(bookmarks(), 'https://old.example/')).toBeUndefined();
  });

  it('keeps its folder and its place in the list', () => {
    const store = bookmarks();
    store.ensure('https://first.example/', 'First');
    const { id } = store.ensure('https://second.example/', 'Second');
    store.ensure('https://third.example/', 'Third');
    store.update(id, { title: 'Renamed' });
    expect(store.list().map((bookmark) => bookmark.title)).toEqual(['Third', 'Renamed', 'First']);
  });

  // Two bookmarks for one address would leave the star unable to say which one it removes.
  it('refuses an address another bookmark already has', () => {
    const store = bookmarks();
    store.ensure('https://taken.example/', 'Taken');
    const { id } = store.ensure('https://mine.example/', 'Mine');
    expect(store.update(id, { url: 'https://taken.example/' })).toBe('already-saved');
    expect(saved(store, 'https://mine.example/')?.title).toBe('Mine');
  });

  it('refuses something that is not an address a page can open', () => {
    const store = bookmarks();
    const { id } = store.ensure('https://mine.example/', 'Mine');
    expect(store.update(id, { url: 'javascript:alert(1)' })).toBe('not-an-address');
    expect(store.update(id, { url: '' })).toBe('not-an-address');
    expect(saved(store, 'https://mine.example/')).toBeDefined();
  });

  it('falls back to the address when the title is emptied', () => {
    const store = bookmarks();
    const { id } = store.ensure('https://mine.example/', 'Mine');
    store.update(id, { title: '   ' });
    expect(saved(store, 'https://mine.example/')?.title).toBe('https://mine.example/');
  });

  it('says so when the bookmark is gone', () => {
    expect(bookmarks().update('nobody', { title: 'Anything' })).toBe('missing');
  });
});

describe('putting bookmarks and folders in your own order', () => {
  it('moves a bookmark before another, keeps the order across a restart, and loses nothing', () => {
    const store = bookmarks();
    ['c', 'b', 'a'].forEach((name) => store.toggle(`https://${name}.example/`, name));
    const [a, , c] = store.list();

    expect(store.reorder(c!.id, a!.id)).toBe(true);
    expect(
      bookmarks()
        .list()
        .map((bookmark) => bookmark.title),
    ).toEqual(['c', 'a', 'b']);
  });

  // Ordering is not filing; a drop between two of another folder's bookmarks must not move it there.
  it('refuses a place in another folder, and leaves the order as it was', () => {
    const store = bookmarks();
    const folder = folders().create('Work', 'ash', null);
    store.toggle('https://loose.example/', 'loose');
    store.toggle('https://filed.example/', 'filed');
    const filed = store.list().find((bookmark) => bookmark.title === 'filed')!;
    const loose = store.list().find((bookmark) => bookmark.title === 'loose')!;
    store.moveTo(filed.id, folder.id);
    const before = store.list().map((bookmark) => bookmark.id);

    expect(store.reorder(loose.id, filed.id)).toBe(false);
    expect(store.list().map((bookmark) => bookmark.id)).toEqual(before);
    expect(store.list().find((bookmark) => bookmark.id === loose.id)?.folderId).toBeNull();
  });

  it('moves a folder before another beside it, across a restart', () => {
    const store = folders();
    const first = store.create('First', 'ash', null);
    store.create('Second', 'ash', null);
    const third = store.create('Third', 'ash', null);

    expect(store.reorder(third.id, first.id)).toBe(true);
    expect(
      folders()
        .list()
        .map((folder) => folder.name),
    ).toEqual(['Third', 'First', 'Second']);
  });
});
