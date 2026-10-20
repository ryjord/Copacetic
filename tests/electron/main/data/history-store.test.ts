import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => process.env.COPA_HISTORY_DIR } }));

const { HistoryStore } = await import('../../../../electron/main/data/history-store');
const { openDatabase } = await import('../../../../electron/main/data/database');

let dir: string;
const historyPath = () => path.join(dir, 'history.json');
// A new connection to the same file each time, which is what a restart is.
const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
const openStore = () =>
  new HistoryStore(openDatabase(path.join(dir, 'copacetic.db')), dir, () => Date.now() - NINETY_DAYS);

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'copacetic-history-'));
  process.env.COPA_HISTORY_DIR = dir;
});

/**
 * The store that holds every address visited, and had no tests at all.
 *
 * The one below is not hypothetical: the blocked-request count was written to
 * disk correctly and then dropped by the reviver on the way back in, so the
 * running total the interface shows reset to nothing on every start while the
 * real numbers sat in the file. Nothing noticed, because the only thing that
 * checked it read the file directly rather than through the store.
 */
describe('what survives a restart', () => {
  it('keeps the blocked-request count, which is the whole point of recording it', () => {
    const first = openStore();
    first.recordVisit('https://example.com/one', 'One');
    first.addBlocked('https://example.com/one', 12);
    first.flush();

    // A second store is a restart: the same file, read back.
    const second = openStore();
    expect(second.totalBlocked()).toBe(12);
  });

  it('adds up across pages rather than reporting only the last', () => {
    const store = openStore();
    store.recordVisit('https://a.example/', 'A');
    store.recordVisit('https://b.example/', 'B');
    store.addBlocked('https://a.example/', 3);
    store.addBlocked('https://b.example/', 4);
    store.flush();

    expect(openStore().totalBlocked()).toBe(7);
  });

  it('keeps the title, the time and the visit count too', () => {
    const store = openStore();
    store.recordVisit('https://example.com/page', 'A page');
    store.flush();

    const restarted = openStore().listHistory();
    const entry = restarted.entries.find((candidate) => candidate.url.includes('/page'));
    expect(entry?.title).toBe('A page');
    expect(entry?.visitCount).toBe(1);
    expect(entry?.lastVisitedAt).toBeGreaterThan(0);
  });

  /*
   * A file someone edited, or a file from a version that did not have the
   * field, must not become a store that refuses to load. Missing reads as
   * none - never as a reason to throw away the entry.
   */
  it('reads an entry written before the count existed', () => {
    writeFileSync(
      historyPath(),
      JSON.stringify([
        { id: 'a', url: 'https://old.example/', title: 'Old', lastVisitedAt: Date.now(), visitCount: 1 },
      ]),
    );
    const store = openStore();
    expect(store.totalBlocked()).toBe(0);
    expect(store.listHistory().entries).toHaveLength(1);
  });

  /*
   * Recent, deliberately. Written first with `lastVisitedAt: 1`, where both
   * entries were pruned as older than ninety days before anything read them -
   * so the store was empty, the total was nought, and the test passed while
   * proving nothing. It only bites on entries that actually survive loading.
   */
  it('refuses a nonsense count rather than carrying it', () => {
    const recent = Date.now();
    writeFileSync(
      historyPath(),
      JSON.stringify([
        { id: 'a', url: 'https://x.example/', title: 'X', lastVisitedAt: recent, visitCount: 1, blockedCount: -5 },
        {
          id: 'b',
          url: 'https://y.example/',
          title: 'Y',
          lastVisitedAt: recent,
          visitCount: 1,
          blockedCount: 'lots',
        },
      ]),
    );

    const store = openStore();
    // Both entries load; neither contributes a count that was not a count.
    expect(store.listHistory().entries).toHaveLength(2);
    expect(store.totalBlocked()).toBe(0);
  });
});

/**
 * Two behaviours worth pinning because a test written against the obvious
 * assumption gets both wrong, which is how they were found.
 */
describe('what history refuses to do', () => {
  // Reloading a page, or bouncing back to it, is not a second visit. The count
  // drives top sites, so inflating it would reorder someone's start page from
  // one page being refreshed.
  it('does not count a reload as another visit', () => {
    const store = openStore();
    store.recordVisit('https://example.com/page', 'A page');
    store.recordVisit('https://example.com/page', 'A page');
    store.flush();

    const entry = openStore()
      .listHistory()
      .entries.find((candidate) => candidate.url.includes('/page'));
    expect(entry?.visitCount).toBe(1);
  });

  // Nothing older than ninety days is kept, and that is applied on load rather
  // than only when something asks.
  it('drops what is older than ninety days when it starts', () => {
    const ancient = Date.now() - 91 * 24 * 60 * 60 * 1000;
    writeFileSync(
      historyPath(),
      JSON.stringify([
        { id: 'a', url: 'https://old.example/', title: 'Old', lastVisitedAt: ancient, visitCount: 1 },
        { id: 'b', url: 'https://new.example/', title: 'New', lastVisitedAt: Date.now(), visitCount: 1 },
      ]),
    );

    const urls = openStore()
      .listHistory()
      .entries.map((entry) => entry.url);
    expect(urls).toEqual(['https://new.example/']);
  });
});

describe('the history.json a previous version kept', () => {
  it('is brought in once, and put aside rather than deleted', () => {
    writeFileSync(
      historyPath(),
      JSON.stringify([
        { id: 'a', url: 'https://kept.example/', title: 'Kept', lastVisitedAt: Date.now(), visitCount: 3 },
      ]),
    );
    expect(
      openStore()
        .listHistory()
        .entries.map((entry) => entry.url),
    ).toEqual(['https://kept.example/']);
    expect(existsSync(historyPath())).toBe(false);
    expect(existsSync(`${historyPath()}.imported`)).toBe(true);
    // A second start does not bring it in again, or read the set-aside copy.
    expect(openStore().listHistory().total).toBe(1);
  });

  it('is left alone, and nothing is lost, when it cannot be read', () => {
    writeFileSync(historyPath(), '{ not json');
    expect(openStore().listHistory().total).toBe(0);
    expect(readFileSync(historyPath(), 'utf8')).toBe('{ not json');
  });
});

describe('searching history', () => {
  const seeded = () => {
    const store = openStore();
    store.recordVisit('https://docs.example.com/guide/getting-started', 'Getting started');
    store.recordVisit('https://news.example.org/', 'Morning briefing');
    return store;
  };

  it('finds part of an address or a title, ignoring case', () => {
    const store = seeded();
    expect(store.listHistory('GUIDE').entries.map((entry) => entry.title)).toEqual(['Getting started']);
    expect(store.listHistory('brief').entries.map((entry) => entry.title)).toEqual(['Morning briefing']);
  });

  // Too short for the trigram index, so these take the other path and must still work.
  it('finds a one or two letter query', () => {
    expect(seeded().listHistory('or').total).toBe(1);
  });

  // Typed text is matched as text; quotes or operators in it are never read as query syntax.
  it('treats what was typed as text, whatever it contains', () => {
    const store = seeded();
    expect(() => store.listHistory('"guide" OR news*')).not.toThrow();
    expect(store.listHistory('"guide" OR news*').total).toBe(0);
    expect(store.listHistory('100%').total).toBe(0);
  });

  it('counts every match, not just the page it returns', () => {
    const store = openStore();
    Array.from({ length: 5 }, (_unused, index) =>
      store.recordVisit(`https://example.com/page-${index}`, `Page ${index}`),
    );
    const page = store.listHistory('page', 2);
    expect(page.entries).toHaveLength(2);
    expect(page.total).toBe(5);
  });
});

/**
 * Forgetting has to mean the address is gone from the files, not just from the
 * table: SQLite keeps deleted rows in free pages, its write-ahead log and the
 * search index until something overwrites them.
 */
describe('what forgetting leaves on disk', () => {
  const onDisk = () =>
    ['copacetic.db', 'copacetic.db-wal']
      .map((name) => path.join(dir, name))
      .filter((file) => existsSync(file))
      .map((file) => readFileSync(file).toString('latin1'))
      .join('');

  it('leaves no trace of a forgotten site', () => {
    const store = openStore();
    store.recordVisit('https://secret-clinic.example/appointments', 'Appointments');
    store.recordVisit('https://news.example.org/', 'News');
    expect(onDisk()).toContain('secret-clinic');

    expect(store.forgetSite('secret-clinic.example')).toBe(1);
    expect(onDisk()).not.toContain('secret-clinic');
    expect(store.listHistory().total).toBe(1);
  });

  /*
   * The search index holds three-letter pieces rather than whole addresses, so
   * looking for the address cannot see what the index kept. A name made of
   * pieces nothing else has is looked for piece by piece instead.
   */
  it('leaves none of the pieces the search index kept of it', () => {
    const store = openStore();
    store.recordVisit('https://qzvkxw.example/jqxzvq', 'Wbqxjz');
    store.recordVisit('https://news.example.org/', 'News');
    const pieces = ['qzv', 'zvk', 'jqx', 'bqx'];
    expect(pieces.some((piece) => onDisk().includes(piece))).toBe(true);

    store.forgetSite('qzvkxw.example');
    expect(pieces.filter((piece) => onDisk().includes(piece))).toEqual([]);
  });

  // Securely deleting from a trigram index rewrote every row sharing a piece with the one removed: 3.4s here.
  it('forgets a site in a full history without stalling the browser', () => {
    const store = openStore();
    Array.from({ length: 10_000 }, (_unused, index) =>
      store.recordVisit(`https://site-${index % 3000}.example.com/article-${index}`, `Article ${index}`),
    );
    const start = performance.now();
    store.forgetSite('site-77.example.com');
    expect(performance.now() - start).toBeLessThan(1_000);
    // The bound that matters is the one above; filling ten thousand visits is slow on a shared runner.
  }, 30_000);

  it('leaves no trace of a cleared history', () => {
    const store = openStore();
    store.recordVisit('https://private-matter.example/', 'Private');
    store.clearHistory('all');
    expect(onDisk()).not.toContain('private-matter');
  });

  it('leaves no trace of one removed entry', () => {
    const store = openStore();
    store.recordVisit('https://one-off.example/', 'One off');
    const [entry] = store.listHistory().entries;
    store.removeHistory(entry!.id);
    expect(onDisk()).not.toContain('one-off');
  });
});

describe("bringing in another browser's history", () => {
  const day = 24 * 60 * 60 * 1000;
  const visit = (url: string, daysAgo: number, visitCount = 1, title = url) => ({
    url,
    title,
    lastVisitedAt: Date.now() - daysAgo * day,
    visitCount,
  });

  it('adds pages it did not have, and they survive a restart', () => {
    const result = openStore().importVisits([visit('https://new.example/', 2, 5, 'New')]);
    expect(result).toEqual({ added: 1, alreadyHad: 0 });
    const entry = openStore()
      .allHistory()
      .find((candidate) => candidate.url === 'https://new.example/');
    expect(entry?.title).toBe('New');
    expect(entry?.visitCount).toBe(5);
  });

  // Importing twice, or a page both browsers saw, must not add the counts together.
  it('keeps the later visit and the higher count for a page it already had', () => {
    const store = openStore();
    store.recordVisit('https://both.example/', 'Here');
    expect(store.importVisits([visit('https://both.example/', 10, 40, 'There')])).toEqual({
      added: 0,
      alreadyHad: 1,
    });
    store.importVisits([visit('https://both.example/', 10, 40, 'There')]);
    const entry = store.allHistory().find((candidate) => candidate.url === 'https://both.example/');
    expect(entry?.visitCount).toBe(40);
    expect(entry?.title).toBe('Here');
    expect(Date.now() - (entry?.lastVisitedAt ?? 0)).toBeLessThan(day);
  });

  it('is searchable straight away', () => {
    const store = openStore();
    store.importVisits([visit('https://findable.example/', 1, 1, 'Something findable')]);
    expect(store.searchHistory('findable', 5).map((entry) => entry.url)).toEqual(['https://findable.example/']);
  });

  it('keeps to the same age limit as its own history', () => {
    const store = openStore();
    store.importVisits([visit('https://ancient.example/', 400)]);
    expect(store.allHistory().some((entry) => entry.url === 'https://ancient.example/')).toBe(false);
  });
});

describe('how long history is kept', () => {
  const DAY = 24 * 60 * 60 * 1000;

  // A shorter limit chosen in Settings is a promise that the older visits are gone.
  it('drops what is older than the limit at the next prune', () => {
    let keptFor = 90 * DAY;
    const store = new HistoryStore(openDatabase(path.join(dir, 'copacetic.db')), dir, () => Date.now() - keptFor);
    store.importVisits([
      { url: 'https://old.example/', title: 'Old', lastVisitedAt: Date.now() - 60 * DAY, visitCount: 1 },
      { url: 'https://new.example/', title: 'New', lastVisitedAt: Date.now() - DAY, visitCount: 1 },
    ]);
    expect(store.listHistory().entries).toHaveLength(2);

    keptFor = 30 * DAY;
    store.prune();
    expect(store.listHistory().entries.map((entry) => entry.url)).toEqual(['https://new.example/']);
  });

  it('keeps everything when it is kept until cleared', () => {
    const store = new HistoryStore(openDatabase(path.join(dir, 'copacetic.db')), dir, () => 0);
    store.importVisits([
      { url: 'https://ancient.example/', title: 'Ancient', lastVisitedAt: Date.now() - 900 * DAY, visitCount: 1 },
    ]);
    store.prune();
    expect(store.listHistory().entries).toHaveLength(1);
  });
});

describe('narrowing and ordering the list', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('shows only the days asked for', () => {
    const store = new HistoryStore(openDatabase(path.join(dir, 'copacetic.db')), dir, () => 0);
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    store.importVisits([
      { url: 'https://today.example/', title: 'Today', lastVisitedAt: midnight + 60_000, visitCount: 1 },
      { url: 'https://yesterday.example/', title: 'Yesterday', lastVisitedAt: midnight - 60_000, visitCount: 1 },
      { url: 'https://old.example/', title: 'Old', lastVisitedAt: midnight - 40 * DAY, visitCount: 1 },
    ]);
    const urls = (range: 'today' | 'yesterday' | 'week' | 'all') =>
      store.listHistory('', 50, 0, { range, order: 'recent' }).entries.map((entry) => entry.url);
    expect(urls('today')).toEqual(['https://today.example/']);
    expect(urls('yesterday')).toEqual(['https://yesterday.example/']);
    expect(urls('week')).toEqual(['https://today.example/', 'https://yesterday.example/']);
    expect(urls('all')).toHaveLength(3);
  });

  // A search with a range must not leak entries outside it through its OR.
  it('keeps the range when searching', () => {
    const store = new HistoryStore(openDatabase(path.join(dir, 'copacetic.db')), dir, () => 0);
    store.importVisits([
      { url: 'https://ab.example/', title: 'ab', lastVisitedAt: Date.now() - 400 * DAY, visitCount: 1 },
    ]);
    expect(store.listHistory('ab', 50, 0, { range: 'today', order: 'recent' }).total).toBe(0);
  });

  it('puts the most visited first when asked', () => {
    const store = new HistoryStore(openDatabase(path.join(dir, 'copacetic.db')), dir, () => 0);
    store.importVisits([
      { url: 'https://often.example/', title: 'Often', lastVisitedAt: Date.now() - DAY, visitCount: 40 },
      { url: 'https://once.example/', title: 'Once', lastVisitedAt: Date.now(), visitCount: 1 },
    ]);
    expect(store.listHistory('', 50, 0, { range: 'all', order: 'visits' }).entries[0]?.url).toBe(
      'https://often.example/',
    );
  });
});
