import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let profile = '';

const NOW = Date.now();

// The files a 1.4.1 profile holds, in the shape 1.4.1 wrote them.
const LEGACY_FILES: Record<string, unknown> = {
  'history.json': [
    {
      id: 'h1',
      url: 'https://example.com/kept-from-1-4',
      title: 'Kept from 1.4',
      lastVisitedAt: NOW - 60_000,
      visitCount: 3,
      blockedCount: 2,
    },
  ],
  'bookmarks.json': [
    {
      id: 'b1',
      url: 'https://example.com/bookmarked-in-1-4',
      title: 'Bookmarked in 1.4',
      createdAt: NOW - 120_000,
      folderId: null,
    },
  ],
  'settings.json': {
    theme: 'moss',
    httpsFirst: true,
    permissionDecisions: { 'https://example.com|notifications': 'allow' },
    zoomLevels: { 'https://example.com': 1.5 },
    blockerAllowlist: ['example.org'],
  },
};

beforeAll(async () => {
  profile = realpathSync(mkdtempSync(path.join(tmpdir(), 'copacetic-upgrade-')));
  Object.entries(LEGACY_FILES).forEach(([name, value]) =>
    writeFileSync(path.join(profile, name), JSON.stringify(value)),
  );
  copacetic = await SmokeApp.launch({ profile });
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

/**
 * The upgrade is one way, so it was the one path that could not be put right
 * after release: unit tests proved each reviver, and nothing started the real
 * app on a profile a 1.4 user actually has.
 */
describe('a 1.4.1 profile opened by 2.0', () => {
  it('keeps its history', async () => {
    const page = await copacetic.chrome.evaluate(() => window.copacetic.history.list('Kept from 1.4'));
    expect(page.entries.map((entry) => entry.url)).toEqual(['https://example.com/kept-from-1-4']);
  });

  it('keeps its bookmarks', async () => {
    const bookmarks = await copacetic.chrome.evaluate(() => window.copacetic.bookmarks.list());
    expect(bookmarks.map((bookmark) => bookmark.url)).toContain('https://example.com/bookmarked-in-1-4');
  });

  it('keeps its settings and what it decided about sites', async () => {
    const settings = await copacetic.chrome.evaluate(() => window.copacetic.settings.get());
    expect(settings.theme).toBe('moss');
    expect(settings.permissionDecisions).toEqual({ 'https://example.com|notifications': 'allow' });
    expect(settings.zoomLevels).toEqual({ 'https://example.com': 1.5 });
    expect(settings.blockerAllowlist).toEqual(['example.org']);
  });

  it('copied the profile aside first, and marked what it imported', () => {
    expect(existsSync(path.join(profile, 'copacetic.db'))).toBe(true);
    expect(existsSync(path.join(profile, 'before-2.0', 'history.json'))).toBe(true);
    expect(existsSync(path.join(profile, 'history.json.imported'))).toBe(true);
    expect(existsSync(path.join(profile, 'history.json'))).toBe(false);
  });

  // Sites belong in the database now; the settings file is read before anything else and should name none.
  it('no longer names any site in the settings file', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ theme: 'moss' }));
    expect(
      await copacetic.until(
        () => !readFileSync(path.join(profile, 'settings.json'), 'utf8').includes('example'),
        10_000,
      ),
    ).toBe(true);
  });
});
