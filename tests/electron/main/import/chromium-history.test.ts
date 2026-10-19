import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readChromiumHistory } from '../../../../electron/main/import/chromium-history';

const WINDOWS_EPOCH_OFFSET_MS = 11_644_473_600_000;
const day = 24 * 60 * 60 * 1000;

let directory = '';
let historyFile = '';

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'copacetic-chromium-history-'));
  historyFile = path.join(directory, 'History');
  const database = new DatabaseSync(historyFile);
  database.exec(`CREATE TABLE urls (
    id INTEGER PRIMARY KEY, url LONGVARCHAR, title LONGVARCHAR, visit_count INTEGER DEFAULT 0 NOT NULL,
    typed_count INTEGER DEFAULT 0 NOT NULL, last_visit_time INTEGER NOT NULL, hidden INTEGER DEFAULT 0 NOT NULL)`);
  // Written as Chromium writes it, in microseconds since 1601, which is past a JavaScript number's exact range.
  const insert = database.prepare(
    'INSERT INTO urls (url, title, visit_count, last_visit_time, hidden) VALUES (?, ?, ?, (? + ?) * 1000, ?)',
  );
  const now = Date.now();
  insert.run('https://recent.example/', 'Recent', 7, now - day, WINDOWS_EPOCH_OFFSET_MS, 0);
  insert.run('https://older.example/', 'Older', 2, now - 3 * day, WINDOWS_EPOCH_OFFSET_MS, 0);
  insert.run('https://ancient.example/', 'Ancient', 9, now - 400 * day, WINDOWS_EPOCH_OFFSET_MS, 0);
  insert.run('https://hidden.example/', 'Hidden', 1, now - day, WINDOWS_EPOCH_OFFSET_MS, 1);
  insert.run('chrome://settings/', 'Settings', 3, now - day, WINDOWS_EPOCH_OFFSET_MS, 0);
  database.close();
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

const read = (limit = 100) => readChromiumHistory(historyFile, { since: Date.now() - 90 * day, limit });

describe("a Chromium profile's history", () => {
  it('reads the pages inside the window, newest first, at the right time', async () => {
    const visits = await read();
    expect(visits.map((visit) => visit.url)).toEqual(['https://recent.example/', 'https://older.example/']);
    expect(Math.abs(visits[0]!.lastVisitedAt - (Date.now() - day))).toBeLessThan(1000);
    expect(visits[0]?.visitCount).toBe(7);
  });

  it('stops at the limit, keeping the newest', async () => {
    expect((await read(1)).map((visit) => visit.url)).toEqual(['https://recent.example/']);
  });

  // Hidden rows are subframes and redirects Chromium itself never shows as history.
  it('leaves out hidden rows and pages that are not on the web', async () => {
    const urls = (await read()).map((visit) => visit.url);
    expect(urls).not.toContain('https://hidden.example/');
    expect(urls).not.toContain('chrome://settings/');
  });

  it("leaves the other browser's file as it was, and no copy behind", async () => {
    const before = readdirSync(directory);
    const copies = () => readdirSync(tmpdir()).filter((name) => name.startsWith('copacetic-import-'));
    // Compared with what was there already, so another test reading at the same time is not counted.
    const copiesBefore = new Set(copies());
    await read();
    expect(readdirSync(directory)).toEqual(before);
    expect(copies().filter((name) => !copiesBefore.has(name))).toEqual([]);
  });

  // A file too large to be anyone's history would freeze every window while it was copied.
  it('refuses a file too large to be a real profile, before copying any of it', async () => {
    const { MAX_IMPORT_FILE_BYTES } = await import('../../../../electron/main/import/copy-aside');
    const { truncateSync } = await import('node:fs');
    truncateSync(historyFile, MAX_IMPORT_FILE_BYTES + 1);
    await expect(read()).rejects.toThrow('too large');
  });
});
