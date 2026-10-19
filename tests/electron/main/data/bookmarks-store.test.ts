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

  // Asked twice, ensure must keep what toggle would remove.
  it('keeps a bookmark it is asked to ensure, with the title and folder it had', () => {
    const store = bookmarks();
    store.toggle('https://example.com/', 'Original');
    const [saved] = store.list();
    store.moveTo(saved!.id, 'work');
    expect(store.ensure('https://example.com/', 'Different')).toMatchObject({ title: 'Original', folderId: 'work' });
    expect(store.list()).toHaveLength(1);
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
