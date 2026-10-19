import { describe, expect, it } from 'vitest';

import { formatZoom, isZoomedFrom, nextZoomStep } from '../../../electron/shared/zoom';

describe('nextZoomStep', () => {
  it('moves one step along the ladder', () => {
    expect(nextZoomStep(1, 'in')).toBe(1.1);
    expect(nextZoomStep(1, 'out')).toBe(0.9);
    expect(nextZoomStep(1.25, 'in')).toBe(1.5);
  });

  it('moves a level between two steps to the next one beyond it', () => {
    expect(nextZoomStep(1.2, 'in')).toBe(1.25);
    expect(nextZoomStep(1.2, 'out')).toBe(1.1);
  });

  it('stays put at either end', () => {
    expect(nextZoomStep(5, 'in')).toBe(5);
    expect(nextZoomStep(0.25, 'out')).toBe(0.25);
  });

  it('treats a level that is not a number as the default', () => {
    expect(nextZoomStep(Number.NaN, 'in')).toBe(1.1);
  });
});

describe('isZoomedFrom', () => {
  it('ignores floating point noise around the default', () => {
    expect(isZoomedFrom(1.0000001, 1)).toBe(false);
    expect(isZoomedFrom(1.1, 1)).toBe(true);
    expect(isZoomedFrom(1, 1.25)).toBe(true);
  });
});

describe('formatZoom', () => {
  it('shows a whole percentage', () => {
    expect(formatZoom(1.25)).toBe('125%');
    expect(formatZoom(0.33)).toBe('33%');
  });
});
