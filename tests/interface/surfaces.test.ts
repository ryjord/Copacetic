import { describe, expect, it } from 'vitest';
import { clampZoom } from '../../electron/shared/types';
import {
  STILL_WANTED_MS,
  reachedForAnotherTab,
  stillWanted,
  worthHolding,
  type SurfaceRequest,
} from '../../electron/shared/surfaces';

const asked = (over: Partial<SurfaceRequest> = {}): SurfaceRequest => ({
  surface: 'settings',
  askedAt: 1_000_000,
  ...over,
});

/**
 * The window paints before anything in it is listening, by about 190ms on the
 * machine `npm run measure` reports, and later still into a cold start, which
 * is slower throughout. Measured before
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

/**
 * Separating these two was worth a rule of its own. Without it, whether a
 * collected surface is ever seen came down to which of two lines in a mount
 * effect ran first — measured by swapping them, which made the surface vanish
 * with every test still green.
 */
describe('whether moving to a tab is someone reaching for it', () => {
  it('is, when the tab changes', () => {
    expect(reachedForAnotherTab('tab-1', 'tab-2')).toBe(true);
  });

  it('is not, when the first state arrives and there was no tab before', () => {
    expect(reachedForAnotherTab(null, 'tab-1')).toBe(false);
  });

  it('is not, when the same tab is reported again', () => {
    expect(reachedForAnotherTab('tab-1', 'tab-1')).toBe(false);
  });

  // Closing the last tab is a change, and what was covering it should still go.
  it('is, when the last tab closes', () => {
    expect(reachedForAnotherTab('tab-1', null)).toBe(true);
  });
});

/**
 * Clamping carried a NaN straight through, because Math.min and Math.max
 * propagate it whichever way round they are written. There is no nearest bound
 * to a NaN, so the answer is the default rather than an edge.
 */
describe('what counts as a zoom', () => {
  it('holds a level that is already sensible', () => {
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it('brings an extreme one to the nearest bound', () => {
    expect(clampZoom(1000)).toBe(5);
    expect(clampZoom(0.001)).toBe(0.25);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('answers 1 for %p', (value) => {
    expect(clampZoom(value)).toBe(1);
  });
});
