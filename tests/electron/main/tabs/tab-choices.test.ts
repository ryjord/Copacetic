import { describe, expect, it } from 'vitest';
import {
  type SessionCandidate,
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
  ...over,
});

/**
 * `tabs.ts` owns every view, every navigation and every favicon, and at nine
 * hundred lines had no unit test at all - the only thing exercising it was the
 * smoke suite, through a running application. These are the decisions inside it
 * where being wrong is quiet.
 */
describe('which tab to show after closing the one in front', () => {
  it('takes the neighbour on the right, which is what every browser does', () => {
    expect(tabAfterClosing(['a', 'c', 'd'], 1)).toBe('c');
  });

  it('falls back to the left when the one that closed was last', () => {
    expect(tabAfterClosing(['a', 'b'], 2)).toBe('b');
  });

  it('has nothing to show when that was the only tab', () => {
    expect(tabAfterClosing([], 0)).toBeNull();
  });

  it('takes the first when the one that closed was', () => {
    expect(tabAfterClosing(['b', 'c'], 0)).toBe('b');
  });

  // An index from a stale read should still land on a tab rather than nowhere.
  it('never lands outside the strip', () => {
    expect(tabAfterClosing(['a', 'b'], 99)).toBe('b');
    expect(tabAfterClosing(['a', 'b'], -5)).toBe('a');
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
  it('counts the active tab against the list it writes, not the strip', () => {
    const snapshot = sessionFrom([tab('start', { isStartPage: true }), tab('a'), tab('b')], 'b');
    expect(snapshot.tabs.map((entry) => entry.url)).toEqual(['https://a.example/', 'https://b.example/']);
    // 'b' is second in the strip and second in the file; with the index taken
    // from the strip it would be 2, which is past the end.
    expect(snapshot.activeIndex).toBe(1);
  });

  it('counts past several start pages, not just one', () => {
    const snapshot = sessionFrom(
      [tab('s1', { isStartPage: true }), tab('s2', { isStartPage: true }), tab('a'), tab('b')],
      'b',
    );
    expect(snapshot.activeIndex).toBe(1);
  });

  it('counts past a Hush tab too', () => {
    const snapshot = sessionFrom([tab('h', { isHush: true }), tab('a'), tab('b')], 'b');
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

  it('come before every other tab, each run keeping its own order', () => {
    expect(pinnedFirst(['a', 'p1', 'b', 'p2', 'c'], isPinned)).toEqual(['p1', 'p2', 'a', 'b', 'c']);
  });

  // The stable order is the whole rule: just pinned lands last among the pinned, just unpinned first among the rest.
  it('put a tab just pinned at the end of the pinned run, and one just let go at the start of the rest', () => {
    expect(pinnedFirst(['p1', 'a', 'p2', 'b'], isPinned)).toEqual(['p1', 'p2', 'a', 'b']);
    expect(pinnedFirst(['p1', 'x', 'a'], isPinned)).toEqual(['p1', 'x', 'a']);
  });

  it('keep a move inside its own run', () => {
    const order = ['p1', 'p2', 'a', 'b', 'c'];
    expect(clampToRun(order, isPinned, 'a', 0)).toBe(2);
    expect(clampToRun(order, isPinned, 'p1', 4)).toBe(1);
    expect(clampToRun(order, isPinned, 'b', 4)).toBe(4);
  });

  it('are remembered as pinned, and only pinned ones say so', () => {
    const written = sessionFrom(
      [
        { id: 'p1', url: 'https://mail.example/', groupId: null, isStartPage: false, isHush: false, isPinned: true },
        { id: 'a', url: 'https://news.example/', groupId: null, isStartPage: false, isHush: false, isPinned: false },
      ],
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

  it('is a tab left alone longer than the setting', () => {
    expect(tabsToSleep([tab()], now, 60)).toEqual(['a']);
  });

  it('is not one looked at more recently', () => {
    expect(tabsToSleep([tab({ lastActiveAt: now - 59 * minute })], now, 60)).toEqual([]);
  });

  it.each([
    ['the tab in front', { isActive: true }],
    ['a tab playing sound', { isAudible: true }],
    ['a start page', { isStartPage: true }],
    ['a tab already asleep', { isAsleep: true }],
  ] as const)('is never %s', (_name, over) => {
    expect(tabsToSleep([tab(over)], now, 60)).toEqual([]);
  });

  it('is none at all when sleeping is turned off', () => {
    expect(tabsToSleep([tab({ lastActiveAt: 0 })], now, 0)).toEqual([]);
  });
});
