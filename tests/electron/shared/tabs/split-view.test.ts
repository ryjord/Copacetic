import { describe, expect, it } from 'vitest';
import {
  SPLIT_DIVIDER_WIDTH,
  clampSplitRatio,
  isInSplit,
  partnerIn,
  shownSplit,
  splitPanes,
} from '../../../../electron/shared/tabs/split-view';

const split = { leftId: 'left', rightId: 'right', ratio: 0.5 };

describe('splitPanes', () => {
  it('shares the width either side of the divider, with nothing lost or overlapping', () => {
    const { left, right } = splitPanes({ x: 0, y: 88, width: 1206, height: 700 }, 0.5);
    expect(left).toEqual({ x: 0, y: 88, width: 600, height: 700 });
    expect(right.x).toBe(left.width + SPLIT_DIVIDER_WIDTH);
    expect(left.width + SPLIT_DIVIDER_WIDTH + right.width).toBe(1206);
  });

  it('keeps an odd width whole rather than splitting a pixel', () => {
    const { left, right } = splitPanes({ x: 10, y: 0, width: 1001, height: 500 }, 1 / 3);
    expect(Number.isInteger(left.width) && Number.isInteger(right.width)).toBe(true);
    expect(right.x + right.width).toBe(10 + 1001);
  });

  it('never lets one side be squeezed out', () => {
    expect(splitPanes({ x: 0, y: 0, width: 1006, height: 1 }, 0.01).left.width).toBe(200);
    expect(splitPanes({ x: 0, y: 0, width: 1006, height: 1 }, 0.99).left.width).toBe(800);
  });
});

describe('clampSplitRatio', () => {
  it('turns a number that is not one into an even split', () => {
    expect(clampSplitRatio(Number.NaN)).toBe(0.5);
    expect(clampSplitRatio(Number.POSITIVE_INFINITY)).toBe(0.5);
  });
});

describe('which tabs a split holds', () => {
  it('is on screen only while one of its tabs is in front, and knows each tab by the other', () => {
    expect(shownSplit(split, 'left')).toBe(split);
    expect(shownSplit(split, 'elsewhere')).toBeNull();
    expect(shownSplit(null, 'left')).toBeNull();
    expect(partnerIn(split, 'left')).toBe('right');
    expect(partnerIn(split, 'right')).toBe('left');
    expect(isInSplit(split, null)).toBe(false);
  });
});
