import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// `store.ts` reaches electron through `persistence.ts` only for the userData
// path, so pointing that at a temp directory is enough to exercise it for real.
vi.mock('electron', () => ({ app: { getPath: () => process.env.COPA_TEST_DIR } }));

const { BrowserStore } = await import('../electron/main/store');

let dir: string;

function seedHistory(entries: Array<Record<string, unknown>>) {
  writeFileSync(path.join(dir, 'history.json'), JSON.stringify(entries));
}

const entry = (id: string, url: string, title: string, daysAgo = 0, visitCount = 1) => ({
  id,
  url,
  title,
  visitCount,
  lastVisitedAt: Date.now() - daysAgo * 24 * 60 * 60 * 1000,
});

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'copacetic-suggest-'));
  process.env.COPA_TEST_DIR = dir;
  vi.resetModules();
});

describe('omnibox suggestions', () => {
  it('ranks a host prefix above a title match', async () => {
    seedHistory([
      entry('a', 'https://example.com/', 'Something mentioning github in the title'),
      entry('b', 'https://github.com/', 'GitHub'),
    ]);
    const store = new BrowserStore();

    const targets = store.suggest('github').map((suggestion) => suggestion.target);
    expect(targets).toContain('https://github.com/');
    expect(targets.indexOf('https://github.com/')).toBeLessThan(targets.indexOf('https://example.com/'));
  });

  it('ignores a leading www. when matching the host', async () => {
    seedHistory([entry('a', 'https://www.bbc.co.uk/news', 'News')]);
    const store = new BrowserStore();

    expect(store.suggest('bbc').map((s) => s.target)).toContain('https://www.bbc.co.uk/news');
  });

  // The parsed forms are cached per entry, so the same query asked twice must
  // not drift — this is the regression guard on that cache.
  it('returns identical results when the same query is repeated', async () => {
    seedHistory([
      entry('a', 'https://github.com/', 'GitHub', 1, 9),
      entry('b', 'https://gitlab.com/', 'GitLab', 3, 2),
      entry('c', 'https://news.ycombinator.com/', 'Hacker News', 0, 40),
    ]);
    const store = new BrowserStore();

    const first = store.suggest('git');
    expect(store.suggest('git')).toEqual(first);
    expect(store.suggest('git')).toEqual(first);
  });

  it('picks up a title that changed on a revisit rather than serving the old one', async () => {
    seedHistory([entry('a', 'https://example.com/', 'Old title')]);
    const store = new BrowserStore();

    expect(store.suggest('old').map((s) => s.target)).toContain('https://example.com/');

    store.recordVisit('https://example.com/', 'Completely different heading');

    expect(store.suggest('completely').map((s) => s.target)).toContain('https://example.com/');
    // The stale form must no longer match, or the cache is serving old data.
    expect(store.suggest('old').map((s) => s.target)).not.toContain('https://example.com/');
  });

  it('drops an entry from results once it is removed from history', async () => {
    seedHistory([entry('a', 'https://example.com/', 'Example'), entry('b', 'https://other.com/', 'Other')]);
    const store = new BrowserStore();

    expect(store.suggest('example').map((s) => s.target)).toContain('https://example.com/');
    store.removeHistory('a');
    expect(store.suggest('example').map((s) => s.target)).not.toContain('https://example.com/');
  });

  it('always offers a search, and a URL when the input resolves to one', async () => {
    seedHistory([]);
    const store = new BrowserStore();

    expect(store.suggest('some search words').map((s) => s.kind)).toEqual(['search']);
    expect(store.suggest('example.com').map((s) => s.kind)).toEqual(['url', 'search']);
  });

  it('stays responsive with a large history', async () => {
    seedHistory(
      Array.from({ length: 10_000 }, (_, i) =>
        entry(`h${i}`, `https://site${i % 900}.example.com/page/${i}`, `Article ${i}`, i % 90, (i % 9) + 1),
      ),
    );
    const store = new BrowserStore();

    store.suggest('s'); // warm the parsed forms
    const start = performance.now();
    for (const query of ['s', 'si', 'sit', 'site', 'site4']) {
      store.suggest(query);
    }
    const perKeystroke = (performance.now() - start) / 5;

    // Before the parsed forms were cached this was ~150ms per keystroke, all of
    // it `new URL()`, synchronously in the process that also drives the page.
    expect(perKeystroke).toBeLessThan(25);
  });
});
