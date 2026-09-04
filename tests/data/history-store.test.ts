import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({ app: { getPath: () => process.env.COPA_HISTORY_DIR } }));

const { HistoryStore } = await import('../../electron/main/data/history-store');

let dir: string;
const historyPath = () => path.join(dir, 'history.json');
const onDisk = () => JSON.parse(readFileSync(historyPath(), 'utf8')) as Record<string, unknown>[];

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
    const first = new HistoryStore();
    first.recordVisit('https://example.com/one', 'One');
    first.addBlocked('https://example.com/one', 12);
    first.flush();

    expect(onDisk()[0]?.blockedCount).toBe(12);

    // A second store is a restart: same file, read back through the reviver.
    const second = new HistoryStore();
    expect(second.totalBlocked()).toBe(12);
  });

  it('adds up across pages rather than reporting only the last', () => {
    const store = new HistoryStore();
    store.recordVisit('https://a.example/', 'A');
    store.recordVisit('https://b.example/', 'B');
    store.addBlocked('https://a.example/', 3);
    store.addBlocked('https://b.example/', 4);
    store.flush();

    expect(new HistoryStore().totalBlocked()).toBe(7);
  });

  it('keeps the title, the time and the visit count too', () => {
    const store = new HistoryStore();
    store.recordVisit('https://example.com/page', 'A page');
    store.flush();

    const restarted = new HistoryStore().listHistory();
    const entry = restarted.entries.find((candidate) => candidate.url.includes('/page'));
    expect(entry?.title).toBe('A page');
    expect(entry?.visitCount).toBe(1);
    expect(entry?.lastVisitedAt).toBeGreaterThan(0);
  });

  /*
   * A file someone edited, or a file from a version that did not have the
   * field, must not become a store that refuses to load. Missing reads as
   * none — never as a reason to throw away the entry.
   */
  it('reads an entry written before the count existed', () => {
    writeFileSync(
      historyPath(),
      JSON.stringify([
        { id: 'a', url: 'https://old.example/', title: 'Old', lastVisitedAt: Date.now(), visitCount: 1 },
      ]),
    );
    const store = new HistoryStore();
    expect(store.totalBlocked()).toBe(0);
    expect(store.listHistory().entries).toHaveLength(1);
  });

  /*
   * Recent, deliberately. Written first with `lastVisitedAt: 1`, where both
   * entries were pruned as older than ninety days before anything read them —
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

    const store = new HistoryStore();
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
    const store = new HistoryStore();
    store.recordVisit('https://example.com/page', 'A page');
    store.recordVisit('https://example.com/page', 'A page');
    store.flush();

    const entry = new HistoryStore().listHistory().entries.find((candidate) => candidate.url.includes('/page'));
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

    const urls = new HistoryStore().listHistory().entries.map((entry) => entry.url);
    expect(urls).toEqual(['https://new.example/']);
  });
});
