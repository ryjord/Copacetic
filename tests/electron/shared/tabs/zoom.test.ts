import { describe, expect, it } from 'vitest';

import { isZoomedFrom, nextZoomStep } from '../../../../electron/shared/tabs/zoom';

describe('nextZoomStep', () => {
  it.each([
    ['one step in from the default', 1, 'in', 1.1],
    ['one step out from the default', 1, 'out', 0.9],
    ['one step along the ladder', 1.25, 'in', 1.5],
    ['the next step beyond a level between two, going in', 1.2, 'in', 1.25],
    ['the next step beyond a level between two, going out', 1.2, 'out', 1.1],
    ['no change at the top end', 5, 'in', 5],
    ['no change at the bottom end', 0.25, 'out', 0.25],
    ['the default for a level that is not a number', Number.NaN, 'in', 1.1],
  ] as const)('moves %s', (_caseName, level, direction, expected) => {
    expect(nextZoomStep(level, direction)).toBe(expected);
  });
});

describe('isZoomedFrom', () => {
  it('ignores floating point noise around the default', () => {
    expect(isZoomedFrom(1.0000001, 1)).toBe(false);
    expect(isZoomedFrom(1.1, 1)).toBe(true);
    expect(isZoomedFrom(1, 1.25)).toBe(true);
  });
});
