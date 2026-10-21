import { describe, expect, it } from 'vitest';
import { bookmarksFromChromium } from '../../../../electron/main/import/chromium-bookmarks';

const url = (name: string, address: string, dateAdded = '13348540800000000') => ({
  type: 'url',
  name,
  url: address,
  date_added: dateAdded,
});
const folder = (name: string, children: unknown[]) => ({ type: 'folder', name, children });

describe("a Chromium profile's bookmarks", () => {
  it('finds them at every depth of every root, naming each one’s folders from the root down', () => {
    const { bookmarks } = bookmarksFromChromium({
      roots: {
        bookmark_bar: folder('Bookmarks bar', [
          url('Top', 'https://top.example/'),
          folder('Work', [folder('Deep', [url('Deep', 'https://deep.example/')])]),
        ]),
        other: folder('Other', [url('Other', 'https://other.example/')]),
        synced: folder('Mobile', []),
      },
    });
    expect(bookmarks.map((bookmark) => bookmark.url)).toEqual([
      'https://top.example/',
      'https://deep.example/',
      'https://other.example/',
    ]);
    expect(bookmarks.slice(0, 2).map((bookmark) => bookmark.folders)).toEqual([
      ['Bookmarks bar'],
      ['Bookmarks bar', 'Work', 'Deep'],
    ]);
  });

  it('keeps the date each was added, in seconds as the HTML import does', () => {
    const { bookmarks } = bookmarksFromChromium({
      roots: { other: folder('Other', [url('A', 'https://a.example/')]) },
    });
    expect(bookmarks[0]?.addedAt).toBe(Date.UTC(2024, 0, 1) / 1000);
  });

  // A bookmarklet is a script that runs on whatever page is open when it is clicked.
  it('refuses what is not a web address, and counts it', () => {
    const { bookmarks, skipped } = bookmarksFromChromium({
      roots: {
        other: folder('Other', [
          url('Run me', 'javascript:alert(1)'),
          url('Settings', 'chrome://settings'),
          url('Fine', 'https://fine.example/'),
        ]),
      },
    });
    expect(bookmarks.map((bookmark) => bookmark.url)).toEqual(['https://fine.example/']);
    expect(skipped).toBe(2);
  });

  it('takes one of each address, and the address for a missing name', () => {
    const { bookmarks } = bookmarksFromChromium({
      roots: { other: folder('Other', [url('', 'https://twice.example/'), url('Again', 'https://twice.example/')]) },
    });
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0]?.title).toBe('https://twice.example/');
  });

  it.each([null, 'nonsense', {}, { roots: 4 }])('finds nothing in %j', (raw) => {
    expect(bookmarksFromChromium(raw)).toEqual({ bookmarks: [], skipped: 0 });
  });
});
