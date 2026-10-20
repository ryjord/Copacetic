import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

const WINDOWS_EPOCH_OFFSET_MS = 11_644_473_600_000;

let copacetic: SmokeApp;
let home: string;

/** Where Chrome keeps its default profile under a home folder, on the platform running this. */
const chromeProfileIn = (folder: string) => {
  if (process.platform === 'darwin') {
    return path.join(folder, 'Library', 'Application Support', 'Google', 'Chrome', 'Default');
  }
  if (process.platform === 'win32') {
    return path.join(folder, 'local', 'Google', 'Chrome', 'User Data', 'Default');
  }
  return path.join(folder, '.config', 'google-chrome', 'Default');
};

// A Chrome profile as Chrome leaves it: a JSON bookmarks file and a SQLite history database.
beforeAll(async () => {
  home = realpathSync(mkdtempSync(path.join(tmpdir(), 'copacetic-smoke-home-')));
  const chrome = chromeProfileIn(home);
  mkdirSync(chrome, { recursive: true });
  writeFileSync(
    path.join(chrome, 'Bookmarks'),
    JSON.stringify({
      roots: {
        bookmark_bar: {
          type: 'folder',
          children: [{ type: 'url', name: 'From Chrome', url: 'https://from-chrome.example/', date_added: '0' }],
        },
      },
    }),
  );
  const history = new DatabaseSync(path.join(chrome, 'History'));
  history.exec(
    'CREATE TABLE urls (id INTEGER PRIMARY KEY, url TEXT, title TEXT, visit_count INTEGER NOT NULL, last_visit_time INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0)',
  );
  history
    .prepare('INSERT INTO urls (url, title, visit_count, last_visit_time) VALUES (?, ?, ?, (? + ?) * 1000)')
    .run('https://visited-in-chrome.example/', 'Visited in Chrome', 3, Date.now() - 60_000, WINDOWS_EPOCH_OFFSET_MS);
  history.close();

  copacetic = await SmokeApp.launch({
    env: { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), LOCALAPPDATA: path.join(home, 'local') },
  });
  await copacetic.waitForReady();
});

afterAll(async () => {
  await copacetic?.close();
  rmSync(home, { recursive: true, force: true });
});

/** Read through the app's own SQLite inside Electron, which is the part a Node test cannot stand in for. */
describe("importing another browser's profile", () => {
  it('finds the Chrome profile on this computer', async () => {
    const sources = await copacetic.chrome.evaluate(() => window.copacetic.data.importSources());
    expect(sources.map((source) => source.label)).toEqual(['Google Chrome']);
  }, 60_000);

  it('brings in its bookmarks and its history', async () => {
    const message = await copacetic.chrome.evaluate(async () => {
      const [source] = await window.copacetic.data.importSources();
      return window.copacetic.data.importFromBrowser(source!.id);
    });
    expect(message).toBe('From Google Chrome: 1 bookmark, and 1 page of history.');

    const bookmarks = await copacetic.chrome.evaluate(() => window.copacetic.bookmarks.list());
    expect(bookmarks.map((bookmark) => bookmark.url)).toContain('https://from-chrome.example/');
    const history = await copacetic.chrome.evaluate(() => window.copacetic.history.list('visited-in-chrome'));
    expect(history.entries.map((entry) => entry.url)).toEqual(['https://visited-in-chrome.example/']);
  }, 60_000);
});
