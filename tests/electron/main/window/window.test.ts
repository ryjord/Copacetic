import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: () => '/tmp' },
  screen: { getAllDisplays: () => [] },
  shell: {},
}));

const { cascadedPosition, clampToVisibleDisplay } = await import('../../../../electron/main/window/window');

const LAPTOP = { x: 0, y: 0, width: 1440, height: 900 };
const EXTERNAL = { x: 1440, y: 0, width: 2560, height: 1440 };

const saved = (x: number | null, y: number | null) => ({
  width: 1200,
  height: 800,
  x,
  y,
  isMaximized: false,
});

/**
 * A window restored onto a display that is no longer attached is invisible and
 * cannot be recovered without editing the config file by hand - the user sees
 * the app start and no window appear.
 */
describe('restoring a window onto the displays that exist now', () => {
  // Overlapping by a sliver still leaves something to grab, so it is kept.
  it.each([
    ['a position that is still on screen', saved(100, 100), [LAPTOP]],
    ['a position on a second display while it is attached', saved(2000, 200), [LAPTOP, EXTERNAL]],
    ['a window hanging off an edge but still partly visible', saved(1400, 800), [LAPTOP]],
    ['an unset position, rather than inventing one', saved(null, null), [LAPTOP]],
  ])('keeps %s', (_name, bounds, displays) => {
    expect(clampToVisibleDisplay(bounds, displays)).toEqual(bounds);
  });

  it.each([
    ['on a display that has been unplugged', saved(2000, 200), [LAPTOP]],
    ['above the screen, which some docks produce', saved(100, -2000), [LAPTOP]],
    ['when no display is reported at all', saved(100, 100), []],
    ['far off every display', saved(9000, 9000), [LAPTOP]],
  ])('forgets a position %s, but never loses the size', (_name, bounds, displays) => {
    expect(clampToVisibleDisplay(bounds, displays)).toMatchObject({ x: null, y: null, width: 1200, height: 800 });
  });
});

describe('a second window', () => {
  const area = { x: 0, y: 0, width: 1440, height: 900 };

  it('opens a step down and right of the last, not on top of it', () => {
    expect(cascadedPosition({ x: 100, y: 80 }, { width: 1000, height: 700 }, area)).toEqual({ x: 128, y: 108 });
  });

  it('starts again at the corner rather than leave the screen', () => {
    expect(cascadedPosition({ x: 420, y: 180 }, { width: 1000, height: 700 }, area)).toEqual({ x: 28, y: 28 });
  });
});
