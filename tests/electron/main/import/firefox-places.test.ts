import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readFirefoxBookmarks, readFirefoxHistory } from '../../../../electron/main/import/firefox-places';

const day = 24 * 60 * 60 * 1000;
let directory = '';
let places = '';

// The parts of Firefox's schema the reader touches, filled the way Firefox fills them: microseconds since 1970.
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'copacetic-firefox-'));
  places = path.join(directory, 'places.sqlite');
  const database = new DatabaseSync(places);
  database.exec(`
    CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url LONGVARCHAR, title LONGVARCHAR,
      visit_count INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0 NOT NULL, last_visit_date INTEGER);
    CREATE TABLE moz_bookmarks (id INTEGER PRIMARY KEY, type INTEGER, fk INTEGER DEFAULT NULL, parent INTEGER,
      position INTEGER, title LONGVARCHAR, dateAdded INTEGER, guid TEXT);`);
  const now = Date.now();
  const place = database.prepare(
    'INSERT INTO moz_places (id, url, title, visit_count, hidden, last_visit_date) VALUES (?, ?, ?, ?, ?, ?)',
  );
  place.run(1, 'https://toolbar.test/', 'On the toolbar', 4, 0, (now - day) * 1000);
  place.run(2, 'https://deep.test/', 'Deep', 1, 0, (now - 2 * day) * 1000);
  place.run(3, 'https://tagged.test/', 'Tagged', 1, 0, (now - 400 * day) * 1000);
  place.run(4, 'javascript:alert(1)', 'Bookmarklet', 0, 0, null);
  place.run(5, 'https://hidden.test/', 'Hidden', 1, 1, (now - day) * 1000);

  const bookmark = database.prepare(
    'INSERT INTO moz_bookmarks (id, type, fk, parent, position, title, dateAdded, guid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  bookmark.run(1, 2, null, 0, 0, '', 0, 'root________');
  bookmark.run(2, 2, null, 1, 0, 'menu', 0, 'menu________');
  bookmark.run(3, 2, null, 1, 1, 'toolbar', 0, 'toolbar_____');
  bookmark.run(4, 2, null, 1, 2, 'tags', 0, 'tags________');
  bookmark.run(10, 1, 1, 3, 0, 'On the toolbar', 1_690_000_000_000_000, 'a');
  bookmark.run(11, 2, null, 2, 0, 'Work', 0, 'b');
  bookmark.run(12, 1, 2, 11, 0, 'Deep', null, 'c');
  bookmark.run(13, 2, null, 4, 0, 'reading', 0, 'd');
  bookmark.run(14, 1, 3, 13, 0, null, null, 'e');
  bookmark.run(15, 1, 4, 2, 1, 'Bookmarklet', null, 'f');
  database.close();
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("a Firefox profile's bookmarks", () => {
  it('names the folders as Firefox shows them, and leaves tags out', () => {
    const { bookmarks, skipped } = readFirefoxBookmarks(places);
    expect(bookmarks).toEqual([
      {
        url: 'https://toolbar.test/',
        title: 'On the toolbar',
        addedAt: 1_690_000_000,
        folders: ['Bookmarks Toolbar'],
      },
      { url: 'https://deep.test/', title: 'Deep', addedAt: null, folders: ['Bookmarks Menu', 'Work'] },
    ]);
    expect(skipped).toBe(1);
  });

  it('reads a copy and leaves nothing behind', () => {
    readFirefoxBookmarks(places);
    expect(readdirSync(directory)).toEqual(['places.sqlite']);
  });
});

describe("a Firefox profile's history", () => {
  it('takes recent, visible web pages, newest first', () => {
    const visits = readFirefoxHistory(places, { since: Date.now() - 90 * day, limit: 100 });
    expect(visits.map((visit) => visit.url)).toEqual(['https://toolbar.test/', 'https://deep.test/']);
    expect(visits[0]?.visitCount).toBe(4);
    expect(Math.abs((visits[0]?.lastVisitedAt ?? 0) - (Date.now() - day))).toBeLessThan(60_000);
  });
});
