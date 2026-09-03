import { describe, expect, it } from 'vitest';
import { STILL_WANTED_MS, stillWanted, worthHolding, type SurfaceRequest } from '../../electron/shared/surfaces';

const asked = (over: Partial<SurfaceRequest> = {}): SurfaceRequest => ({
  surface: 'settings',
  askedAt: 1_000_000,
  ...over,
});

/**
 * The window paints before anything in it is listening, by about 190ms on the
 * machine `npm run measure` reports and more on a cold start. Measured before
 * this existed: Cmd+, inside that window pushed to a renderer with no listeners
 * attached, and the menu item was indistinguishable from one that does nothing
 * at all.
 */
describe('a surface asked for before anyone was listening', () => {
  it('is handed over when the chrome collects it', () => {
    expect(stillWanted(asked(), 1_000_400)).toBe('settings');
  });

  it('is nothing when nothing was asked for', () => {
    expect(stillWanted(null, 1_000_400)).toBeNull();
  });

  /*
   * The bound is the whole reason this is not just a variable. A chrome that
   * reloads later — while developing, or after a renderer crash — must not open
   * a pane nobody is waiting for any more, or the fix for a lost request has
   * become a spurious one.
   */
  it('stops meaning anything once it is stale', () => {
    expect(stillWanted(asked(), 1_000_000 + STILL_WANTED_MS + 1)).toBeNull();
  });

  it('is still good on the last millisecond it has', () => {
    expect(stillWanted(asked(), 1_000_000 + STILL_WANTED_MS)).toBe('settings');
  });

  // A clock that moved backwards between the request and the collection is not
  // a reason to trust the request.
  it('is dropped if the clock went backwards', () => {
    expect(stillWanted(asked(), 999_000)).toBeNull();
  });
});

/**
 * Closing is not a request to see something. Held, it would mean a chrome that
 * finished starting a second later opened and then immediately closed a pane
 * nobody had asked for.
 */
describe('which requests are worth holding', () => {
  it('holds every surface a person can ask to see', () => {
    for (const surface of ['settings', 'downloads', 'history', 'bookmarks', 'palette'] as const) {
      expect(worthHolding(surface)).toBe(true);
    }
  });

  it('never holds a close', () => {
    expect(worthHolding('none')).toBe(false);
  });
});
