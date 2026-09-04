import { describe, expect, it } from 'vitest';
import { type SessionCandidate, sessionFrom, tabAfterClosing } from '../../electron/main/tabs/tab-choices';

const tab = (id: string, over: Partial<SessionCandidate> = {}): SessionCandidate => ({
  id,
  url: `https://${id}.example/`,
  groupId: null,
  isStartPage: false,
  isHush: false,
  ...over,
});

/**
 * `tabs.ts` owns every view, every navigation and every favicon, and at nine
 * hundred lines had no unit test at all — the only thing exercising it was the
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

  it('leaves out a Hush tab, and its group with it', () => {
    const snapshot = sessionFrom([tab('secret', { isHush: true, groupId: 'work' }), tab('a')], 'a');
    expect(snapshot.tabs.map((entry) => entry.url)).toEqual(['https://a.example/']);
  });

  /*
   * The off-by-one the original comment warned about, made into a test. Counted
   * against the order rather than the list being built, a start page to the left
   * of the active tab shifts the index by one — so tomorrow the wrong site is in
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
