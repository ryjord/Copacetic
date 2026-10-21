import { describe, expect, it } from 'vitest';
import { clampZoom } from '../../../../electron/shared/types';
import {
  STILL_WANTED_MS,
  reachedForAnotherTab,
  stillWanted,
  worthHolding,
  type SurfaceRequest,
} from '../../../../electron/shared/tabs/surfaces';

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
  /*
   * The bound is the whole reason this is not just a variable. A chrome that
   * reloads later - while developing, or after a renderer crash - must not open
   * a pane nobody is waiting for any more, or the fix for a lost request has
   * become a spurious one. A clock that moved backwards is not a reason to
   * trust the request either.
   */
  it.each([
    ['is handed over when the chrome collects it', asked(), 1_000_400, 'settings'],
    ['is nothing when nothing was asked for', null, 1_000_400, null],
    ['stops meaning anything once it is stale', asked(), 1_000_000 + STILL_WANTED_MS + 1, null],
    ['is still good on the last millisecond it has', asked(), 1_000_000 + STILL_WANTED_MS, 'settings'],
    ['is dropped if the clock went backwards', asked(), 999_000, null],
  ])('%s', (_caseName, request, now, expected) => {
    expect(stillWanted(request, now)).toBe(expected);
  });
});

/**
 * Closing is not a request to see something. Held, it would mean a chrome that
 * finished starting a second later opened and then immediately closed a pane
 * nobody had asked for.
 */
describe('which requests are worth holding', () => {
  it.each([
    ['settings', true],
    ['downloads', true],
    ['history', true],
    ['bookmarks', true],
    ['palette', true],
    ['none', false],
  ] as const)('holds %s: %s', (surface, expected) => {
    expect(worthHolding(surface)).toBe(expected);
  });
});

/**
 * Separating these two was worth a rule of its own. Without it, whether a
 * collected surface is ever seen came down to which of two lines in a mount
 * effect ran first - measured by swapping them, which made the surface vanish
 * with every test still green. Closing the last tab is a change, and what was
 * covering it should still go.
 */
describe('whether moving to a tab is someone reaching for it', () => {
  it.each([
    ['the tab changes', 'tab-1', 'tab-2', true],
    ['the first state arrives and there was no tab before', null, 'tab-1', false],
    ['the same tab is reported again', 'tab-1', 'tab-1', false],
    ['the last tab closes', 'tab-1', null, true],
  ])('is decided when %s', (_caseName, previous, next, expected) => {
    expect(reachedForAnotherTab(previous, next)).toBe(expected);
  });
});

/**
 * Clamping carried a NaN straight through, because Math.min and Math.max
 * propagate it whichever way round they are written. There is no nearest bound
 * to a NaN, so the answer is the default rather than an edge.
 */
describe('what counts as a zoom', () => {
  it.each([
    [1.5, 1.5],
    [1000, 5],
    [0.001, 0.25],
    [Number.NaN, 1],
    [Number.POSITIVE_INFINITY, 1],
    [Number.NEGATIVE_INFINITY, 1],
  ])('brings %p to %p', (input, expected) => {
    expect(clampZoom(input)).toBe(expected);
  });
});
