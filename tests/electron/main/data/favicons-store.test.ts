import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

const { FaviconsStore, withinBounds } = await import('../../../../electron/main/data/favicons-store');
const { openDatabase } = await import('../../../../electron/main/data/database');

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'copacetic-favicons-'));
});
const openStore = () => new FaviconsStore(openDatabase(path.join(dir, 'copacetic.db')), dir);
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

const icon = (kilobytes: number, updatedAt: number) => ({
  dataUrl: `data:image/png;base64,${'A'.repeat(kilobytes * 1024)}`,
  updatedAt,
});

/**
 * The count was bounded and the size was not.
 *
 * A favicon is fetched at up to 200KB, which is about 267KB once it is a data
 * URL, so six hundred of them is roughly 160MB - read from disk, synchronously,
 * before the first window appears. Almost every real favicon is a few
 * kilobytes; this exists for the handful that are not.
 */
describe('what the icon cache keeps', () => {
  it('keeps everything while it is small', () => {
    const kept = withinBounds({ a: icon(2, 3), b: icon(2, 2), c: icon(2, 1) });
    expect(Object.keys(kept).sort()).toEqual(['a', 'b', 'c']);
  });

  it('drops the least recently updated once there are too many', () => {
    const entries = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`site-${index}`, icon(1, index)]));
    const kept = withinBounds(entries, 4);
    // The four highest `updatedAt`, which is the four most recently seen.
    expect(Object.keys(kept).sort()).toEqual(['site-6', 'site-7', 'site-8', 'site-9']);
  });

  it('stops once the total size is spent, however few entries that is', () => {
    const entries = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`site-${index}`, icon(300, index)]));
    // Room for three of them, and the count is not the binding limit.
    const kept = withinBounds(entries, 600, 1024 * 1024);
    expect(Object.keys(kept)).toHaveLength(3);
    expect(Object.keys(kept).sort()).toEqual(['site-7', 'site-8', 'site-9']);
  });

  /*
   * One enormous icon must not evict every smaller one behind it. Stopping at
   * the first thing that does not fit would throw away a hundred usable icons
   * because one site serves a megabyte.
   */
  it('skips an icon too big to fit and keeps the ones after it', () => {
    const kept = withinBounds(
      {
        huge: icon(900, 5),
        small: icon(1, 4),
        alsoSmall: icon(1, 3),
      },
      600,
      100 * 1024,
    );
    expect(Object.keys(kept).sort()).toEqual(['alsoSmall', 'small']);
  });

  // The real shape of the problem, in one assertion: six hundred large icons.
  it('holds six hundred large icons to a size a browser can read at startup', () => {
    const entries = Object.fromEntries(
      Array.from({ length: 600 }, (_, index) => [`site-${index}`, icon(260, index)]),
    );
    const kept = withinBounds(entries);
    const megabytes = Object.values(kept).reduce((sum, record) => sum + record.dataUrl.length, 0) / 1024 / 1024;
    // Roughly 152MB before this existed.
    expect(megabytes).toBeLessThanOrEqual(8);
  });
});

describe('the icon cache in the database', () => {
  it('keeps an icon by origin, so every page of a site shares it', () => {
    const store = openStore();
    store.set('https://example.com/one', PNG);
    expect(openStore().get('https://example.com/elsewhere')).toBe(PNG);
  });

  it('holds to the count bound as icons arrive', () => {
    const store = openStore();
    Array.from({ length: 605 }, (_unused, index) => store.set(`https://site-${index}.example/`, PNG));
    expect(store.origins()).toHaveLength(600);
    // The oldest go first.
    expect(store.get('https://site-0.example/')).toBeNull();
    expect(store.get('https://site-604.example/')).toBe(PNG);
  });

  it('brings in the favicons.json an earlier version kept, once, and puts it aside', () => {
    writeFileSync(
      path.join(dir, 'favicons.json'),
      JSON.stringify({
        'https://kept.example': { dataUrl: PNG, updatedAt: 1 },
        'https://remote.example': { dataUrl: 'https://tracker.example/icon.png', updatedAt: 2 },
      }),
    );
    const store = openStore();
    expect(store.origins()).toEqual(['https://kept.example']);
    expect(existsSync(path.join(dir, 'favicons.json.imported'))).toBe(true);
  });

  // An icon cache is a list of places someone has been, so forgetting has to reach the file itself.
  it('leaves no trace on disk of a site it forgot', () => {
    const store = openStore();
    store.set('https://secret-clinic.example/', PNG);
    store.set('https://news.example/', PNG);
    store.forgetSite('secret-clinic.example');
    const bytes = ['copacetic.db', 'copacetic.db-wal']
      .map((name) => path.join(dir, name))
      .filter((file) => existsSync(file))
      .map((file) => readFileSync(file).toString('latin1'))
      .join('');
    expect(bytes).not.toContain('secret-clinic');
    expect(store.origins()).toEqual(['https://news.example']);
  });
});
