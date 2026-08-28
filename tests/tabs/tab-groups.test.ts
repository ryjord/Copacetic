import { describe, expect, it } from 'vitest';
import { GROUP_COLOURS, claimOf, describeClaim, partitionFor } from '../../electron/shared/tab-groups';
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
