import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: () => '/tmp' },
  screen: { getAllDisplays: () => [] },
  shell: {},
}));

const { clampToVisibleDisplay } = await import('../../electron/main/app/window');

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
 * cannot be recovered without editing the config file by hand — the user sees
 * the app start and no window appear.
 */
describe('restoring a window onto the displays that exist now', () => {
  it('keeps a position that is still on screen', () => {
    const bounds = saved(100, 100);
    expect(clampToVisibleDisplay(bounds, [LAPTOP])).toEqual(bounds);
  });

  it('keeps a position on a second display while it is attached', () => {
    const bounds = saved(2000, 200);
    expect(clampToVisibleDisplay(bounds, [LAPTOP, EXTERNAL])).toEqual(bounds);
  });

  it('forgets a position on a display that has been unplugged', () => {
    const clamped = clampToVisibleDisplay(saved(2000, 200), [LAPTOP]);
    expect(clamped).toMatchObject({ x: null, y: null, width: 1200, height: 800 });
  });

  it('forgets a position above the screen, which some docks produce', () => {
    expect(clampToVisibleDisplay(saved(100, -2000), [LAPTOP])).toMatchObject({ x: null, y: null });
  });

  // Overlapping by a sliver still leaves something to grab, so it is kept.
  it('keeps a window hanging off an edge but still partly visible', () => {
    const bounds = saved(1400, 800);
    expect(clampToVisibleDisplay(bounds, [LAPTOP])).toEqual(bounds);
  });

  it('forgets a position when no display is reported at all', () => {
    expect(clampToVisibleDisplay(saved(100, 100), [])).toMatchObject({ x: null, y: null });
  });

  it('leaves an unset position alone rather than inventing one', () => {
    const bounds = saved(null, null);
    expect(clampToVisibleDisplay(bounds, [LAPTOP])).toEqual(bounds);
  });

  it('never loses the size while forgetting the position', () => {
    const clamped = clampToVisibleDisplay(saved(9000, 9000), [LAPTOP]);
    expect(clamped.width).toBe(1200);
    expect(clamped.height).toBe(800);
  });
});
