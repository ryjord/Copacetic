import { describe, expect, it } from 'vitest';
import {
  type SessionCandidate,
  historyToKeep,
  sessionFrom,
  tabAfterClosing,
  pinnedFirst,
  clampToRun,
  tabsToSleep,
  type SleepCandidate,
} from '../../../../electron/main/tabs/tab-choices';

const tab = (id: string, over: Partial<SessionCandidate> = {}): SessionCandidate => ({
  id,
  url: `https://${id}.example/`,
  groupId: null,
  isStartPage: false,
  isHush: false,
  isPinned: false,
  history: null,
  ...over,
});

/**
 * `tabs.ts` owns every view, every navigation and every favicon, and at nine
 * hundred lines had no unit test at all - the only thing exercising it was the
 * smoke suite, through a running application. These are the decisions inside it
 * where being wrong is quiet.
 */
describe('which tab to show after closing the one in front', () => {
  // An index from a stale read should still land on a tab rather than nowhere.
  it.each([
    ['takes the neighbour on the right, which is what every browser does', ['a', 'c', 'd'], 1, 'c'],
    ['falls back to the left when the one that closed was last', ['a', 'b'], 2, 'b'],
    ['has nothing to show when that was the only tab', [], 0, null],
    ['takes the first when the one that closed was', ['b', 'c'], 0, 'b'],
    ['never lands past the end of the strip', ['a', 'b'], 99, 'b'],
    ['never lands before the start of the strip', ['a', 'b'], -5, 'a'],
  ])('%s', (_name, remaining, closedIndex, expected) => {
    expect(tabAfterClosing(remaining, closedIndex)).toBe(expected);
  });
});

/**
 * The session file decides what comes back tomorrow. Two exclusions, for
 * different reasons: a start page is not a place anyone navigated to, and a
 * Hush tab is left out because the file is on disk and its address there would
 * be the one trace that tab left.
 */
describe('what is written down to reopen', () => {
  it('keeps ordinary tabs, with their group', () => {
    const snapshot = sessionFrom([tab('a', { groupId: 'work' }), tab('b')], 'a');
    expect(snapshot.tabs).toEqual([
      { url: 'https://a.example/', groupId: 'work' },
      { url: 'https://b.example/', groupId: null },
    ]);
  });

  it('leaves out a start page, which is not somewhere anyone went', () => {
    const snapshot = sessionFrom([tab('start', { isStartPage: true }), tab('a')], 'a');
    expect(snapshot.tabs.map((entry) => entry.url)).toEqual(['https://a.example/']);
  });

  it('keeps a split by the places of its two tabs in what is written', () => {
    const split = { leftId: 'b', rightId: 'c', ratio: 0.4 };
    const snapshot = sessionFrom([tab('start', { isStartPage: true }), tab('b'), tab('c')], 'b', split);
    expect(snapshot.split).toEqual({ leftIndex: 0, rightIndex: 1, ratio: 0.4 });
  });

  it('forgets a split when either half is not written down', () => {
    const split = { leftId: 'a', rightId: 'secret', ratio: 0.5 };
    expect(sessionFrom([tab('a'), tab('secret', { isHush: true })], 'a', split).split).toBeUndefined();
  });

  it('leaves out a Hush tab, and its group with it', () => {
    const snapshot = sessionFrom([tab('secret', { isHush: true, groupId: 'work' }), tab('a')], 'a');
    expect(snapshot.tabs.map((entry) => entry.url)).toEqual(['https://a.example/']);
  });

  /*
   * The off-by-one the original comment warned about, made into a test. Counted
   * against the order rather than the list being built, a start page to the left
   * of the active tab shifts the index by one - so tomorrow the wrong site is in
   * front, quietly, and only for people who keep a start page open.
   */
  it.each([
    [
      'a start page',
      [tab('start', { isStartPage: true }), tab('a'), tab('b')],
      ['https://a.example/', 'https://b.example/'],
    ],
    [
      'several start pages',
      [tab('s1', { isStartPage: true }), tab('s2', { isStartPage: true }), tab('a'), tab('b')],
      ['https://a.example/', 'https://b.example/'],
    ],
    ['a Hush tab', [tab('h', { isHush: true }), tab('a'), tab('b')], ['https://a.example/', 'https://b.example/']],
  ])('counts the active tab against the list it writes, not the strip, past %s', (_name, candidates, urls) => {
    const snapshot = sessionFrom(candidates, 'b');
    expect(snapshot.tabs.map((entry) => entry.url)).toEqual(urls);
    // 'b' is second in the file; with the index taken from the strip it would be past the end.
    expect(snapshot.activeIndex).toBe(1);
  });

  // Nothing worth reopening is a valid answer, not a broken one.
  it('writes an empty session when every tab is excluded', () => {
    const snapshot = sessionFrom([tab('start', { isStartPage: true }), tab('h', { isHush: true })], 'h');
    expect(snapshot).toEqual({ tabs: [], activeIndex: 0 });
  });

  it('says the first when the active tab is one of the excluded ones', () => {
    const snapshot = sessionFrom([tab('a'), tab('h', { isHush: true })], 'h');
    expect(snapshot.tabs).toHaveLength(1);
    expect(snapshot.activeIndex).toBe(0);
  });
});

describe('pinned tabs in the strip', () => {
  const pinned = new Set(['p1', 'p2']);
  const isPinned = (id: string) => pinned.has(id);

  // The stable order is the whole rule: just pinned lands last among the pinned, just unpinned first among the rest.
  it.each([
    [
      'come before every other tab, each run keeping its own order',
      ['a', 'p1', 'b', 'p2', 'c'],
      ['p1', 'p2', 'a', 'b', 'c'],
    ],
    ['put a tab just pinned at the end of the pinned run', ['p1', 'a', 'p2', 'b'], ['p1', 'p2', 'a', 'b']],
    ['put a tab just let go at the start of the rest', ['p1', 'x', 'a'], ['p1', 'x', 'a']],
  ])('%s', (_name, order, expected) => {
    expect(pinnedFirst(order, isPinned)).toEqual(expected);
  });

  it('keep a move inside its own run', () => {
    const order = ['p1', 'p2', 'a', 'b', 'c'];
    expect(clampToRun(order, isPinned, 'a', 0)).toBe(2);
    expect(clampToRun(order, isPinned, 'p1', 4)).toBe(1);
    expect(clampToRun(order, isPinned, 'b', 4)).toBe(4);
  });

  it('are remembered as pinned, and only pinned ones say so', () => {
    const written = sessionFrom(
      [tab('p1', { url: 'https://mail.example/', isPinned: true }), tab('a', { url: 'https://news.example/' })],
      'a',
    );
    expect(written.tabs).toEqual([
      { url: 'https://mail.example/', groupId: null, isPinned: true },
      { url: 'https://news.example/', groupId: null },
    ]);
  });
});

describe('which tabs go to sleep', () => {
  const minute = 60_000;
  const now = 100 * minute;
  const tab = (over: Partial<SleepCandidate> = {}): SleepCandidate => ({
    id: 'a',
    isActive: false,
    isStartPage: false,
    isAsleep: false,
    isAudible: false,
    lastActiveAt: now - 61 * minute,
    ...over,
  });

  it.each([
    ['a tab left alone longer than the setting', 61, 60, ['a']],
    ['one looked at more recently', 59, 60, []],
    ['none at all when sleeping is turned off', 100, 0, []],
  ])('is %s', (_name, minutesIdle, setting, expected) => {
    expect(tabsToSleep([tab({ lastActiveAt: now - minutesIdle * minute })], now, setting)).toEqual(expected);
  });

  it.each([
    ['the tab in front', { isActive: true }],
    ['a tab playing sound', { isAudible: true }],
    ['a start page', { isStartPage: true }],
    ['a tab already asleep', { isAsleep: true }],
  ] as const)('is never %s', (_name, over) => {
    expect(tabsToSleep([tab(over)], now, 60)).toEqual([]);
  });
});

describe('the back history a restored tab keeps', () => {
  const pages = (count: number) =>
    Array.from({ length: count }, (_unused, index) => ({
      url: `https://example.com/${index}`,
      title: `Page ${index}`,
    }));

  it('keeps addresses and titles, and none for a single page', () => {
    expect(historyToKeep({ entries: pages(1), index: 0 })).toBeNull();
    const written = sessionFrom([tab('a', { history: { entries: pages(3), index: 2 } })], 'a');
    expect(written.tabs[0]?.history).toEqual({ entries: pages(3), index: 2 });
  });

  // Page state holds what was typed into forms, so it never reaches the session file.
  it('leaves page state behind', () => {
    const withState = pages(2).map((entry) => ({ ...entry, pageState: 'secret form text' }));
    expect(JSON.stringify(historyToKeep({ entries: withState, index: 1 }))).not.toContain('pageState');
  });

  it('keeps nothing when an entry is not a page, rather than a gap Back would fall into', () => {
    const entries = [...pages(2), { url: 'chrome-error://chromewebdata/', title: '' }];
    expect(historyToKeep({ entries, index: 1 })).toBeNull();
  });

  it('keeps the stretch around where a long history is', () => {
    const kept = historyToKeep({ entries: pages(200), index: 150 });
    expect(kept?.entries).toHaveLength(50);
    expect(kept?.entries[kept.index]?.url).toBe('https://example.com/150');
  });
});
