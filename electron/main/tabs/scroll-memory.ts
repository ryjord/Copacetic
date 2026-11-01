// Utils
import { type ScrollPosition, readScrollPosition } from '../../shared/tabs/scroll-position';

// Types
import type { EnginePage } from '../engine/views';

// A world of its own, apart from the page's (0), Electron's preload world (999), the sign-in watch and picture in picture.
const SCROLL_WORLD = 1033;

/**
 * Where a page is scrolled to, asked of the page. The sixth script in pages,
 * named on the transparency page: it reads the scroll position and nothing
 * else, which is what a restored tab needs and form input is not.
 */
export async function readScroll(contents: EnginePage): Promise<ScrollPosition | null> {
  try {
    const found: unknown = await contents.executeJavaScriptInIsolatedWorld(SCROLL_WORLD, [
      { code: '[Math.round(scrollX), Math.round(scrollY)]' },
    ]);
    return readScrollPosition(found);
  } catch {
    return null;
  }
}

/** Puts a page back where it was scrolled to, and does nothing else. */
export async function restoreScroll(contents: EnginePage, position: ScrollPosition): Promise<void> {
  try {
    await contents.executeJavaScriptInIsolatedWorld(SCROLL_WORLD, [
      { code: `scrollTo(${Math.round(position.x)}, ${Math.round(position.y)})` },
    ]);
  } catch {
    // A page that went meanwhile has nowhere to be put back to.
  }
}
