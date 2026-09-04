import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

const { withinBounds } = await import('../../electron/main/data/favicons-store');

const icon = (kilobytes: number, updatedAt: number) => ({
  dataUrl: `data:image/png;base64,${'A'.repeat(kilobytes * 1024)}`,
  updatedAt,
});

/**
 * The count was bounded and the size was not.
 *
 * A favicon is fetched at up to 200KB, which is about 267KB once it is a data
 * URL, so six hundred of them is roughly 160MB — read from disk, synchronously,
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

  it('never exceeds the budget it was given', () => {
    const entries = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`site-${index}`, icon(100, index)]));
    const budget = 512 * 1024;
    const kept = withinBounds(entries, 600, budget);
    const total = Object.values(kept).reduce((sum, record) => sum + record.dataUrl.length, 0);
    expect(total).toBeLessThanOrEqual(budget);
    expect(total).toBeGreaterThan(0);
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
