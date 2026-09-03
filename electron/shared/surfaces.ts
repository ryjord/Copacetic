import type { ChromeSurface } from './channels';

/**
 * Whether a surface someone asked for is still worth showing them.
 *
 * A surface is opened by pushing to the chrome renderer, and the chrome is a
 * page: the window paints before anything in it is listening. `npm run measure`
 * puts that gap at about 190ms on the machine in the README and nearly 300ms on
 * a cold first run, and slower hardware widens it. Measured before this existed
 * — Cmd+, or Cmd+Y inside that window pushed to a renderer with no listeners
 * attached and nothing happened, which is indistinguishable from a menu item
 * that is simply broken. Notices had the same failure and were
 * fixed by holding them in the main process until the chrome collects them;
 * surfaces never were.
 *
 * The rules below are the two that keep holding from turning into its own bug.
 */

/** A surface asked for while nobody was listening, and when it was asked for. */
export interface SurfaceRequest {
  surface: ChromeSurface;
  askedAt: number;
}

/**
 * How long a request waits before it stops meaning anything.
 *
 * A surface is a thing someone wanted to see *now*. Held without a bound, a
 * chrome that reloads later — which happens while developing, and after a
 * renderer crash — would open a pane nobody is waiting for any more, and the
 * fix for a lost request would have become a spurious one.
 */
export const STILL_WANTED_MS = 10_000;

/**
 * Whether a request is worth keeping at all.
 *
 * Closing is not a request to see something. Holding a `none` would mean a
 * chrome that finished starting a second later opened, and then immediately
 * closed, a pane nobody had asked for.
 */
export function worthHolding(surface: ChromeSurface): boolean {
  return surface !== 'none';
}

/**
 * The surface to open on collection, or nothing.
 *
 * A negative age means the clock moved backwards between the request and the
 * collection, which is not a reason to trust the request.
 */
export function stillWanted(request: SurfaceRequest | null, now: number): ChromeSurface | null {
  if (!request) {
    return null;
  }
  const age = now - request.askedAt;
  if (age < 0 || age > STILL_WANTED_MS) {
    return null;
  }
  return request.surface;
}
