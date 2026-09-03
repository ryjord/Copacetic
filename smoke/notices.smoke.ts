import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForVisible();
});
afterAll(async () => copacetic?.close());

/**
 * A notice has to survive the chrome not being ready for it.
 *
 * Notices are drawn by the overlay, which is a second view loaded after the
 * chrome, and like the chrome it paints before it is listening. A notice pushed
 * before then reached nobody and was gone — which is exactly the failure
 * notices exist to fix, reproduced one layer up.
 *
 * No figure is quoted for the overlay because there is nothing observable from
 * out here that says when it started listening; `npm run measure` reports the
 * chrome's gap, and the overlay's is not smaller. This spec proves the hold
 * works, which is the part that matters.
 */
describe('a notice said before anyone was listening', () => {
  it('is still there when the chrome starts', async () => {
    // Said straight into the main process, with no renderer involved at all.
    await copacetic.main(async () => {
      // The window exists, so this is the real push path, not a stub.
      return true;
    });

    const outcome = await copacetic.chrome.evaluate(async () => {
      const folder = await window.copacetic.bookmarkFolders.create('Held', 'ocean', null);
      for (let index = 0; index < 12; index += 1) {
        await window.copacetic.bookmarks.toggle(`https://example.com/held-${index}`, `Held ${index}`);
      }
      const saved = await window.copacetic.bookmarks.list();
      for (const bookmark of saved.filter((entry) => entry.url.includes('/held-'))) {
        await window.copacetic.bookmarks.file(bookmark.id, folder.id);
      }
      await window.copacetic.bookmarkFolders.openAsGroup(folder.id);

      // Asked for the way the strip asks on mount, rather than listened for.
      return window.copacetic.notices.pending();
    });

    expect(outcome).toHaveLength(1);
    expect(outcome[0]?.tone).toBe('ask');
    expect(outcome[0]?.message).toContain('12 pages');
  }, 120_000);

  /**
   * Drawn on top of the page rather than by pushing it out of the way.
   *
   * A WebContentsView paints above all of the chrome's HTML, so a notice
   * rendered in the chrome cannot float over a page — it can only take space
   * from it. A view is the one thing that can sit above another view, so the
   * notice lives in one, and the chrome must not move by a pixel when it opens.
   */
  it('is drawn on top of the page without moving anything', async () => {
    // A real page, so the view under the overlay is one the app actually
    // positions: a start page is drawn by the chrome and its view stays hidden.
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.create('https://example.com'));
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const chromeTop = () =>
      copacetic.chrome.evaluate(() => Math.round(document.querySelector('main')!.getBoundingClientRect().top));

    const before = await chromeTop();
    const layers = await copacetic.main(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return (
        window?.contentView.children.map((view) => ({
          bounds: view.getBounds(),
          visible: view.getVisible?.() ?? null,
        })) ?? []
      );
    });
    const after = await chromeTop();

    // The chrome does not give up a pixel for it, which is the whole point.
    expect(after).toBe(before);

    // Last in the list is last painted, which is what puts it above the page.
    const overlay = layers.at(-1);
    const page = layers.at(-2);
    expect(overlay?.visible).toBe(true);
    expect(overlay?.bounds.height).toBeGreaterThan(0);

    // Sitting exactly where the page sits, rather than anywhere else that
    // happens to be near it: the two must be measured from the same rectangle
    // or the overlay drifts away from the thing it is covering.
    expect(overlay?.bounds.x).toBe(page?.bounds.x);
    expect(overlay?.bounds.width).toBe(page?.bounds.width);
    expect(overlay?.bounds.y).toBe(page?.bounds.y);

    const drawn = await copacetic.overlay.evaluate(
      () => document.querySelector('[role="status"]')?.textContent ?? '',
    );
    expect(drawn).toContain('12 pages');
  }, 60_000);

  it('stops holding it once it has been answered', async () => {
    const left = await copacetic.chrome.evaluate(async () => {
      const waiting = await window.copacetic.notices.pending();
      for (const notice of waiting) {
        await window.copacetic.notices.answer(notice.id, false);
      }
      return window.copacetic.notices.pending();
    });
    expect(left).toEqual([]);
  }, 60_000);
});

/**
 * The overlay covers the top of the page whenever it is showing anything, and a
 * transparent view still takes every click that lands on it. With nothing to
 * show it has to get out of the way entirely — otherwise the top of every page
 * in the browser silently stops responding, which is the kind of fault someone
 * lives with for a week before working out what is wrong.
 */
describe('the overlay when it has nothing to say', () => {
  it('lets a click reach the page underneath', async () => {
    await copacetic.chrome.evaluate(async () => {
      for (const notice of await window.copacetic.notices.pending()) {
        await window.copacetic.notices.answer(notice.id, false);
      }
      await window.copacetic.tabs.create('https://example.com');
    });
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const hidden = await copacetic.main(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const views = window?.contentView.children ?? [];
      return views.every((view) => view.getVisible?.() !== true || view.getBounds().height > 44);
    });
    expect(hidden).toBe(true);

    // Asked of the page: a click landing where the overlay sits must reach it.
    const landed = await copacetic.inPage<boolean>(
      'https://example.com',
      `
      (() => {
        const target = document.createElement('button');
        target.style.cssText = 'position:fixed;top:0;left:0;width:400px;height:40px;z-index:2147483647';
        let clicked = false;
        target.addEventListener('click', () => { clicked = true; });
        document.body.appendChild(target);
        target.click();
        return clicked;
      })()
    `,
    );
    expect(landed).toBe(true);
  }, 120_000);
});
