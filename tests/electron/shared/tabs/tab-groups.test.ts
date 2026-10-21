import { describe, expect, it } from 'vitest';
import {
  GROUP_COLOURS,
  claimOf,
  groupForDrop,
  partitionFor,
  segmentByGroup,
} from '../../../../electron/shared/tabs/tab-groups';
import { tabAfterCollapsing } from '../../../../electron/shared/tabs/tab-groups';
import type { TabGroup } from '../../../../electron/shared/tabs/tab-groups';
import {
  FIRST_PROFILE_ID,
  groupPartition,
  orphanedGroupPartitions,
  partitionsFor,
} from '../../../../electron/shared/data/partitions';

const PARTITIONS = partitionsFor(FIRST_PROFILE_ID);
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
  it.each([
    ['an ordinary ungrouped tab', false, null, PARTITIONS.web],
    ['a tab in a group that shares', false, group(), PARTITIONS.web],
    [
      'a tab in a group that keeps its own browsing',
      false,
      group({ ownSession: true }),
      'persist:copacetic-group-g1',
    ],
    [
      'a second group that keeps its own browsing',
      false,
      group({ id: 'other', ownSession: true }),
      'persist:copacetic-group-other',
    ],
  ])('puts %s in the right session', (_caseName, isHush, tabGroup, expected) => {
    expect(partitionFor({ isHush, group: tabGroup }, PARTITIONS)).toBe(expected);
  });

  /**
   * The one that matters. A group's session persists; Hush's must not. Hush
   * wins, because it is the stronger promise and the weaker one breaking it
   * would be the more expensive mistake.
   */
  it('keeps a Hush tab in Hush, whatever group it is in', () => {
    const groups = [null, group(), group({ ownSession: true })];
    for (const tabGroup of groups) {
      const chosen = partitionFor({ isHush: true, group: tabGroup }, PARTITIONS);
      expect(chosen).toBe(PARTITIONS.hush);
      expect(chosen.startsWith('persist:')).toBe(false);
    }
  });
});

/** A group holding both kinds cannot say one thing about all of them. */
describe('what a group may claim', () => {
  it.each([
    ['its own session and no Hush tab', true, false, 'separate'],
    ['its own session and a Hush tab', true, true, 'mixed'],
    ['a shared session and no Hush tab', false, false, 'shared'],
    ['a shared session and a Hush tab', false, true, 'mixed'],
  ])('is %s', (_caseName, ownSession, hasHush, expected) => {
    expect(claimOf(group({ ownSession }), hasHush)).toBe(expected);
  });
});

/**
 * The chrome's rule is that colour carries state and each state colour means
 * one thing everywhere. A group colour carries identity instead, so it must
 * never be mistakeable for a signal.
 */
describe('group colours are not state colours', () => {
  const STATE = ['#7fd1ae', '#e8b667', '#e8796b', '#7fb2d1'];

  // Signals are saturated; identities are muted. That is what keeps them apart
  // at a glance rather than only in a palette file.
  it('shares none of them and is less saturated than every one', () => {
    const saturation = (hex: string) => {
      const [red, green, blue] = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
      const max = Math.max(red as number, green as number, blue as number);
      const min = Math.min(red as number, green as number, blue as number);
      const lightness = (max + min) / 2;
      return max === min ? 0 : lightness > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
    };
    const mutedestState = Math.min(...STATE.map(saturation));
    for (const { hex } of GROUP_COLOURS) {
      expect(STATE).not.toContain(hex.toLowerCase());
      expect(saturation(hex)).toBeLessThan(mutedestState);
    }
  });
});

/** How the strip is drawn: runs of tabs that sit together and belong together. */
describe('splitting the strip into groups', () => {
  const strip = (...ids: (string | null)[]) => ids.map((groupId, index) => ({ id: `t${index}`, groupId }));

  /**
   * A group whose tabs have been dragged apart is drawn as two bands. One band
   * stretching over the tab between them would say those tabs are in the group
   * when they are not.
   */
  it.each([
    ['ungrouped tabs as one run', [null, null], [null]],
    ['adjacent tabs of the same group', ['a', 'a', null], ['a', null]],
    ['a split group as two bands rather than swallowing what is between', ['a', null, 'a'], ['a', null, 'a']],
    ['two different groups apart even when adjacent', ['a', 'b'], ['a', 'b']],
    ['an empty strip', [], []],
  ] as [string, (string | null)[], (string | null)[]][])('treats %s', (_caseName, ids, expectedGroupIds) => {
    expect(segmentByGroup(strip(...ids)).map((run) => run.groupId)).toEqual(expectedGroupIds);
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

  /*
   * Dragging rightward is not the mirror of dragging leftward. TabManager.move
   * removes the tab first and then splices it in at the target index, so the
   * tab comes to rest at that index in the strip that no longer contains it.
   * An off-by-one on the rightward path once went unnoticed.
   */
  it.each([
    ['joins between two of its tabs', ['a', 'a', null], 2, 1, 'a'],
    ['does not join by landing on the left edge', ['a', 'a', null], 2, 0, null],
    ['does not join by landing on the right edge', [null, 'a', 'a'], 0, 3, null],
    ['joins when dragged rightward into the group', [null, 'a', 'a'], 0, 1, 'a'],
    ['does not join a group it is dragged rightward past', [null, 'a', 'a', 'b'], 0, 2, null],
    ['stays ungrouped between two different groups', ['a', 'b', null], 2, 1, null],
    ['stays ungrouped between two ungrouped tabs', [null, null, 'a'], 2, 1, null],
    ['stays where it was when dropped in place', ['a', 'a', 'a'], 1, 1, 'a'],
    ['stays ungrouped as a single tab', [null], 0, 0, null],
  ] as [string, (string | null)[], number, number, string | null][])('%s', (_caseName, ids, from, to, expected) => {
    expect(groupForDrop(strip(...ids), from, to)).toBe(expected);
  });

  it('agrees with where move() actually puts the tab', () => {
    // The contract in one assertion: land the tab, then read its neighbours.
    const land = (ids: (string | null)[], from: number, to: number) => {
      const without = ids.filter((_unused, index) => index !== from);
      const landingIndex = Math.min(Math.max(0, to), ids.length - 1);
      const landed = [...without.slice(0, landingIndex), ids[from], ...without.slice(landingIndex)];
      const before = landed[landingIndex - 1];
      const after = landed[landingIndex + 1];
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
});

/**
 * Collapsing a group hides its tabs. If the tab being looked at is one of them
 * its page stays on screen with nothing in the strip pointing at it, and the
 * only way back is to expand the group again.
 *
 * The tab it moves to has to be one you can see, so a group that is already
 * collapsed is skipped too.
 */
describe('collapsing a group that holds the active tab', () => {
  const strip = (...ids: (string | null)[]) => ids.map((groupId, index) => ({ groupId, id: String(index) }));

  it.each([
    ['moves to the first tab after the group', ['a', 'a', null, 'b'], 1, ['a'], '2'],
    ['skips the rest of the group rather than landing inside it', ['a', 'a', 'a', null], 0, ['a'], '3'],
    ['falls back to the left when the group ends the strip', [null, 'a', 'a'], 2, ['a'], '0'],
    ['finds nothing when every tab is in the group', ['a', 'a'], 0, ['a'], null],
    ['skips a group that is already collapsed', ['a', 'a', 'b', null], 0, ['a', 'b'], '3'],
    ['finds nothing when every other tab is in a collapsed group', ['a', 'b'], 0, ['a', 'b'], null],
    ['leaves an active tab outside the group where it is', ['a', null], 1, ['a'], '1'],
  ] as [string, (string | null)[], number, string[], string | null][])(
    '%s',
    (_caseName, ids, activeIndex, collapsed, expectedId) => {
      expect(tabAfterCollapsing(strip(...ids), activeIndex, new Set(collapsed))?.id ?? null).toBe(expectedId);
    },
  );
});

describe('partitions a deleted group left behind', () => {
  it('names the directories whose group is gone', () => {
    expect(orphanedGroupPartitions(['copacetic-group-a', 'copacetic-group-b'], ['a'], PARTITIONS)).toEqual([
      'copacetic-group-b',
    ]);
  });

  // The folder also holds the shared web session and anything Chromium adds; none of it is ours to delete.
  it('never names a directory this code did not create', () => {
    expect(
      orphanedGroupPartitions(['copacetic-web', 'copacetic-hush', 'other', 'copacetic-groupie'], [], PARTITIONS),
    ).toEqual([]);
  });

  it('agrees with the partition a group is given', () => {
    const directory = groupPartition(PARTITIONS, 'live').replace('persist:', '');
    expect(orphanedGroupPartitions([directory], ['live'], PARTITIONS)).toEqual([]);
  });

  // Measured in Electron 43: persist:copacetic-group-_M_UQVyELaNR is stored as copacetic-group-_m_uqvyelanr.
  it("keeps a live group whose id has capitals, which Electron's folder name does not", () => {
    expect(orphanedGroupPartitions(['copacetic-group-_m_uqvyelanr'], ['_M_UQVyELaNR'], PARTITIONS)).toEqual([]);
    expect(orphanedGroupPartitions(['copacetic-group-_m_uqvyelanr'], ['other'], PARTITIONS)).toEqual([
      'copacetic-group-_m_uqvyelanr',
    ]);
  });

  // Each profile sweeps only its own: another profile's live groups look like orphans from here.
  it("never names another profile's group sessions", () => {
    const other = groupPartition(partitionsFor('work'), 'theirs').replace('persist:', '');
    expect(orphanedGroupPartitions([other], [], PARTITIONS)).toEqual([]);
  });
});
