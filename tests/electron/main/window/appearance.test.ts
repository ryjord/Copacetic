import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ nativeTheme: { shouldUseDarkColors: true, on: () => {}, removeListener: () => {} } }));

const { titleBarOverlayFor, windowButtonPositionFor } = await import('../../../../electron/main/window/appearance');

describe("the system's window controls", () => {
  // They sit in the top row, which is the tab strip or the one row holding tabs and address.
  it.each([
    ['standard', 'comfortable', 40],
    ['standard', 'compact', 34],
    ['one-line', 'comfortable', 46],
    ['one-line', 'compact', 40],
  ] as const)('are as tall as the top row, laid out %s and %s', (layout, density, height) => {
    expect(titleBarOverlayFor(density, layout).height).toBe(height);
    expect(windowButtonPositionFor(density, layout).y).toBe((height - 12) / 2);
  });
});
