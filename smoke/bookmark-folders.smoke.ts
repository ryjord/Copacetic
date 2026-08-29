import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForVisible();
});
afterAll(async () => copacetic?.close());

const onDisk = <T>(file: string): T => JSON.parse(readFileSync(path.join(copacetic.profile, file), 'utf8')) as T;

/**
 * A folder is the resting form of a tab group, so the two convert. This is the
 * whole claim, and it crosses every layer there is: the renderer asks, the main
 * process reads two files, opens real tabs and writes a group back. Nothing
 * short of running it proves it.
 */
describe('a bookmark folder opens as a tab group', () => {
  it('opens every bookmark inside it, nested ones included', async () => {
    const opened = await copacetic.chrome.evaluate(async () => {
      const outer = await window.copacetic.bookmarkFolders.create('Reading', 'moss', null);
      const inner = await window.copacetic.bookmarkFolders.create('Long form', 'moss', outer.id);

      // Bookmarks are saved the way the star saves them, then filed.
      await window.copacetic.bookmarks.toggle('https://example.com/one', 'One');
      await window.copacetic.bookmarks.toggle('https://example.com/two', 'Two');
      await window.copacetic.bookmarks.toggle('https://example.com/three', 'Three');
      const saved = await window.copacetic.bookmarks.list();
      const idFor = (url: string) => saved.find((bookmark) => bookmark.url === url)?.id ?? '';

      await window.copacetic.bookmarks.file(idFor('https://example.com/one'), outer.id);
      await window.copacetic.bookmarks.file(idFor('https://example.com/two'), outer.id);
      await window.copacetic.bookmarks.file(idFor('https://example.com/three'), inner.id);

      return window.copacetic.bookmarkFolders.openAsGroup(outer.id);
    });

    // Three, not two: what is nested inside comes too, which is the number the
    // button names before it is pressed.
    expect(opened.opened).toBe(3);

    await new Promise((resolve) => setTimeout(resolve, 3000));
    const groups = onDisk<{ name: string; colour: string }[]>('groups.json');
    expect(groups.some((group) => group.name === 'Reading' && group.colour === 'moss')).toBe(true);
  }, 120_000);

  it('does not give the group its own session, which a folder cannot decide', async () => {
    const groups = onDisk<{ name: string; ownSession: boolean }[]>('groups.json');
    expect(groups.find((group) => group.name === 'Reading')?.ownSession).toBe(false);
  }, 60_000);
});

/**
 * Deleting a folder keeps what was in it. This is the promise most likely to be
 * broken by a refactor and the least likely to be noticed, because the only
 * evidence is bookmarks that are no longer anywhere.
 */
describe('deleting a folder', () => {
  it('keeps its bookmarks and promotes what was nested inside', async () => {
    const before = onDisk<{ folderId: string | null }[]>('bookmarks.json').length;

    const moved = await copacetic.chrome.evaluate(async () => {
      const folders = await window.copacetic.bookmarkFolders.list();
      const outer = folders.find((folder) => folder.name === 'Reading');
      return outer ? window.copacetic.bookmarkFolders.remove(outer.id) : { folders: 0, bookmarks: 0 };
    });

    expect(moved).toEqual({ folders: 1, bookmarks: 2 });

    await new Promise((resolve) => setTimeout(resolve, 1500));
    const bookmarks = onDisk<{ folderId: string | null }[]>('bookmarks.json');
    expect(bookmarks).toHaveLength(before);

    // The child folder is now at the top level rather than pointing at a
    // folder that has gone, which would hide it from every view there is.
    const folders = onDisk<{ name: string; parentId: string | null }[]>('bookmark-folders.json');
    expect(folders.find((folder) => folder.name === 'Long form')?.parentId).toBeNull();
  }, 120_000);
});
