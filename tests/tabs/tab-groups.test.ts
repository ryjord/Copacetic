import { describe, expect, it } from 'vitest';
import {
  GROUP_COLOURS,
  claimOf,
  describeClaim,
  groupForDrop,
  partitionFor,
  segmentByGroup,
} from '../../electron/shared/tab-groups';
import { tabAfterCollapsing } from '../../electron/shared/tab-groups';
import type { TabGroup } from '../../electron/shared/tab-groups';

const PARTITIONS = { web: 'persist:copacetic-web', hush: 'copacetic-hush' };
const group = (over: Partial<TabGroup> = {}): TabGroup => ({
  id: 'g1',
  name: 'Work',
  colour: 'violet',
  ownSession: false,
  collapsed: false,
  ...over,
});

/**
 * The rule the whole feature turns on. A group's own session is written to
 * disk and a Hush tab's must not be, so one tab cannot have both.
 */
describe('which session a tab runs in', () => {
  it('puts an ordinary ungrouped tab in the shared session', () => {
    expect(partitionFor({ isHush: false, group: null }, PARTITIONS)).toBe(PARTITIONS.web);
  });

  it('leaves a group that shares in the shared session', () => {
    expect(partitionFor({ isHush: false, group: group() }, PARTITIONS)).toBe(PARTITIONS.web);
  });

  it('gives a group that keeps its own browsing its own session', () => {
    expect(partitionFor({ isHush: false, group: group({ ownSession: true }) }, PARTITIONS)).toBe(
      'persist:copacetic-group-g1',
    );
  });

  it('keeps two such groups apart', () => {
    const a = partitionFor({ isHush: false, group: group({ id: 'a', ownSession: true }) }, PARTITIONS);
    const b = partitionFor({ isHush: false, group: group({ id: 'b', ownSession: true }) }, PARTITIONS);
    expect(a).not.toBe(b);
  });

  /**
   * The one that matters. A group's session persists; Hush's must not. Hush
   * wins, because it is the stronger promise and the weaker one breaking it
   * would be the more expensive mistake.
   */
  it('keeps a Hush tab in Hush, whatever group it is in', () => {
    expect(partitionFor({ isHush: true, group: null }, PARTITIONS)).toBe(PARTITIONS.hush);
    expect(partitionFor({ isHush: true, group: group() }, PARTITIONS)).toBe(PARTITIONS.hush);
    expect(partitionFor({ isHush: true, group: group({ ownSession: true }) }, PARTITIONS)).toBe(PARTITIONS.hush);
  });

  it('never gives a Hush tab a session that would be written down', () => {
    const chosen = partitionFor({ isHush: true, group: group({ ownSession: true }) }, PARTITIONS);
    expect(chosen.startsWith('persist:')).toBe(false);
  });
});

/** A group holding both kinds cannot say one thing about all of them. */
describe('what a group may claim', () => {
  it('says separate only when every tab in it is', () => {
    expect(claimOf(group({ ownSession: true }), false)).toBe('separate');
  });

  it('refuses to say separate once it holds a Hush tab', () => {
    expect(claimOf(group({ ownSession: true }), true)).toBe('mixed');
    expect(describeClaim('mixed')).toContain('cannot say one thing');
  });

  it('says what a sharing group actually does', () => {
    expect(claimOf(group(), false)).toBe('shared');
    expect(describeClaim('shared')).toContain('Shares cookies');
  });

  it('is mixed whether or not the group has its own session', () => {
    expect(claimOf(group({ ownSession: false }), true)).toBe('mixed');
  });
});

/**
 * The chrome's rule is that colour carries state and each state colour means
 * one thing everywhere. A group colour carries identity instead, so it must
 * never be mistakeable for a signal.
 */
describe('group colours are not state colours', () => {
  const STATE = ['#7fd1ae', '#e8b667', '#e8796b', '#7fb2d1'];

  it('shares none of them', () => {
    for (const { hex } of GROUP_COLOURS) {
      expect(STATE).not.toContain(hex.toLowerCase());
    }
  });

  // Signals are saturated; identities are muted. That is what keeps them apart
  // at a glance rather than only in a palette file.
  it('is less saturated than every state colour', () => {
    const saturation = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
      const max = Math.max(r as number, g as number, b as number);
      const min = Math.min(r as number, g as number, b as number);
      const l = (max + min) / 2;
      return max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
    };
    const mutest = Math.min(...STATE.map(saturation));
    for (const { hex } of GROUP_COLOURS) {
      expect(saturation(hex)).toBeLessThan(mutest);
    }
  });

  it('offers a real choice without offering too many', () => {
    expect(GROUP_COLOURS.length).toBeGreaterThanOrEqual(4);
    expect(GROUP_COLOURS.length).toBeLessThanOrEqual(8);
    expect(new Set(GROUP_COLOURS.map((c) => c.hex)).size).toBe(GROUP_COLOURS.length);
  });
});

/** How the strip is drawn: runs of tabs that sit together and belong together. */
describe('splitting the strip into groups', () => {
  const strip = (...ids: (string | null)[]) => ids.map((groupId, index) => ({ id: `t${index}`, groupId }));

  it('leaves ungrouped tabs as one run', () => {
    expect(segmentByGroup(strip(null, null))).toEqual([{ groupId: null, tabs: strip(null, null) }]);
  });

  it('gathers adjacent tabs of the same group', () => {
    const runs = segmentByGroup(strip('a', 'a', null));
    expect(runs).toHaveLength(2);
    expect(runs[0]?.groupId).toBe('a');
    expect(runs[0]?.tabs).toHaveLength(2);
  });

  /**
   * A group whose tabs have been dragged apart is drawn as two bands. One band
   * stretching over the tab between them would say those tabs are in the group
   * when they are not.
   */
  it('draws a split group as two bands rather than swallowing what is between', () => {
    const runs = segmentByGroup(strip('a', null, 'a'));
    expect(runs.map((run) => run.groupId)).toEqual(['a', null, 'a']);
  });

  it('keeps two different groups apart even when adjacent', () => {
    expect(segmentByGroup(strip('a', 'b')).map((run) => run.groupId)).toEqual(['a', 'b']);
  });

  it('copes with an empty strip', () => {
    expect(segmentByGroup([])).toEqual([]);
  });

  it('keeps every tab, in order', () => {
    const tabs = strip('a', null, 'b', 'b', null);
    expect(segmentByGroup(tabs).flatMap((run) => run.tabs)).toEqual(tabs);
  });
});

/**
 * Dropping a tab somewhere. Joining is deliberate: for a group that keeps its
 * own browsing, being in it decides which session a tab loads in, so a tab must
 * never be swallowed by a group it was only parked beside.
 */
describe('where a dragged tab lands', () => {
  const strip = (...ids: (string | null)[]) => ids.map((groupId) => ({ groupId }));

  it('joins the group when it comes to rest between two of its tabs', () => {
    // [a, a, x] — dropping x at index 1 puts it between the two a's.
    expect(groupForDrop(strip('a', 'a', null), 2, 1)).toBe('a');
  });

  it('does not join by landing on the left edge', () => {
    expect(groupForDrop(strip('a', 'a', null), 2, 0)).toBeNull();
  });

  it('does not join by landing on the right edge', () => {
    expect(groupForDrop(strip(null, 'a', 'a'), 0, 3)).toBeNull();
  });

  /*
   * Dragging rightward is not the mirror of dragging leftward. TabManager.move
   * removes the tab first and then splices it in at the target index, so the
   * tab comes to rest at that index in the strip that no longer contains it.
   * Every test above drags leftward or drops in place, which is why an
   * off-by-one on the rightward path went unnoticed.
   */
  it('joins the group when dragged rightward into it', () => {
    // [x, a, a] — move() leaves [a, x, a], so x is between the two a's.
    expect(groupForDrop(strip(null, 'a', 'a'), 0, 1)).toBe('a');
  });

  it('does not join a group it is dragged rightward past', () => {
    // [x, a, a, b] — move() leaves [a, a, x, b], so x comes to rest outside.
    expect(groupForDrop(strip(null, 'a', 'a', 'b'), 0, 2)).toBeNull();
  });

  it('agrees with where move() actually puts the tab', () => {
    // The contract in one assertion: land the tab, then read its neighbours.
    const land = (ids: (string | null)[], from: number, to: number) => {
      const without = ids.filter((_, index) => index !== from);
      const at = Math.min(Math.max(0, to), ids.length - 1);
      const landed = [...without.slice(0, at), ids[from], ...without.slice(at)];
      const before = landed[at - 1];
      const after = landed[at + 1];
      return before && after && before === after ? before : null;
    };
    for (const ids of [
      [null, 'a', 'a'],
      ['a', 'a', null],
      [null, 'a', 'a', 'b'],
      ['a', null, 'a'],
      ['a', 'a', 'a', null],
    ] as (string | null)[][]) {
      for (let from = 0; from < ids.length; from += 1) {
        for (let to = 0; to < ids.length; to += 1) {
          expect(`${ids}|${from}->${to}: ${groupForDrop(strip(...ids), from, to)}`).toBe(
            `${ids}|${from}->${to}: ${land(ids, from, to)}`,
          );
        }
      }
    }
  });

  it('stays ungrouped between two different groups', () => {
    expect(groupForDrop(strip('a', 'b', null), 2, 1)).toBeNull();
  });

  it('stays ungrouped between two ungrouped tabs', () => {
    expect(groupForDrop(strip(null, null, 'a'), 2, 1)).toBeNull();
  });

  it('leaves a tab dropped where it already was alone', () => {
    expect(groupForDrop(strip('a', 'a', 'a'), 1, 1)).toBe('a');
  });

  it('copes with a single tab', () => {
    expect(groupForDrop(strip(null), 0, 0)).toBeNull();
  });
});

/**
 * Collapsing a group hides its tabs. If the tab being looked at is one of them
 * its page stays on screen with nothing in the strip pointing at it, and the
 * only way back is to expand the group again.
 */
describe('collapsing a group that holds the active tab', () => {
  const strip = (...ids: (string | null)[]) => ids.map((groupId, index) => ({ groupId, id: String(index) }));

  it('moves to the first tab after the group', () => {
    // [a, a, null, b] with the second `a` active.
    expect(tabAfterCollapsing(strip('a', 'a', null, 'b'), 1, 'a')?.id).toBe('2');
  });

  it('skips the rest of the group rather than landing inside it', () => {
    expect(tabAfterCollapsing(strip('a', 'a', 'a', null), 0, 'a')?.id).toBe('3');
  });

  it('falls back to the left when the group ends the strip', () => {
    expect(tabAfterCollapsing(strip(null, 'a', 'a'), 2, 'a')?.id).toBe('0');
  });

  it('finds nothing when every tab is in the group', () => {
    expect(tabAfterCollapsing(strip('a', 'a'), 0, 'a')).toBeNull();
  });

  it('leaves an active tab outside the group where it is', () => {
    // Nothing to move: the tab being looked at is not being hidden.
    expect(tabAfterCollapsing(strip('a', null), 1, 'a')?.id).toBe('1');
  });
});
