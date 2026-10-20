import { existsSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let profile: string;

// A profile as a 1.x build left it: history in a JSON file, no database yet.
beforeAll(async () => {
  profile = realpathSync(mkdtempSync(path.join(tmpdir(), 'copacetic-smoke-')));
  writeFileSync(
    path.join(profile, 'history.json'),
    JSON.stringify([
      {
        id: 'a',
        url: 'https://kept-from-before.example/',
        title: 'Kept from before',
        lastVisitedAt: Date.now(),
        visitCount: 4,
        blockedCount: 2,
      },
    ]),
  );
  copacetic = await SmokeApp.launch({ profile });
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

/** Upgrading must not cost anyone their history, and has to work in the built app, where the database engine is Electron's own. */
describe('history kept by a previous version', () => {
  it('is still there after the upgrade', async () => {
    const page = await copacetic.chrome.evaluate(() => window.copacetic.history.list(''));
    expect(page.entries.map((entry) => entry.title)).toEqual(['Kept from before']);
    expect(await copacetic.chrome.evaluate(() => window.copacetic.history.totalBlocked())).toBe(2);
  }, 60_000);

  it('now lives in the database, with the old file put aside rather than deleted', () => {
    expect(copacetic.historyOnDisk().map((entry) => entry.url)).toEqual(['https://kept-from-before.example/']);
    expect(existsSync(path.join(profile, 'history.json'))).toBe(false);
    expect(existsSync(path.join(profile, 'history.json.imported'))).toBe(true);
  });
});
