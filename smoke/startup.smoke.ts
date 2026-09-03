import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';
import pkg from '../package.json' with { type: 'json' };

let copacetic: SmokeApp;

/**
 * Presses a menu item by its label, the way the menu bar does.
 *
 * `MenuItem.click()` calls the handler directly, which is the only way to reach
 * these from a test: the menu bar itself is drawn by the operating system and
 * Playwright cannot see it.
 */
const pressMenuItem = (label: string) =>
  copacetic.main(({ Menu }, wanted) => {
    const walk = (items: Electron.MenuItem[]): Electron.MenuItem | null => {
      for (const item of items) {
        if (item.label === wanted) {
          return item;
        }
        const found = item.submenu ? walk(item.submenu.items) : null;
        if (found) {
          return found;
        }
      }
      return null;
    };
    const item = walk(Menu.getApplicationMenu()?.items ?? []);
    item?.click();
    return Boolean(item);
  }, label);

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
});
afterAll(async () => copacetic?.close());

describe('the app starts', () => {
  it('opens a window', () => {
    expect(copacetic.chrome).toBeTruthy();
  });

  // `show: false` until it is ready to paint, so a window that never becomes
  // visible is a real failure rather than a slow start.
  it('shows the window rather than leaving it hidden', async () => {
    expect(await copacetic.waitForVisible()).toBe(true);
  });

  it('draws its own chrome rather than an empty document', async () => {
    await copacetic.chrome.waitForSelector('body', { timeout: 30_000 });
    const painted = await copacetic.chrome.evaluate(() => document.body.innerHTML.length);
    expect(painted).toBeGreaterThan(0);
  });

  it('reports the version this build actually is', async () => {
    const info = await copacetic.chrome.evaluate(() => window.copacetic.app.getInfo());
    expect(info.version).toBe(pkg.version);
  });

  it('starts with no error dialog and one window', async () => {
    expect(await copacetic.main(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  });
});

/**
 * The menu bar is not decoration, and the only way to know an item works is to
 * press it. This one was reported broken during the blocking work and was not:
 * the test pressed it before the renderer had hydrated, so the push it sends
 * arrived at a window that was not yet listening. At the time the fix was the
 * test. The request is now held in the main process instead, which is the
 * subject of the spec below.
 */
describe('the Settings item in the menu bar', () => {
  it('opens the settings surface', async () => {
    expect(await copacetic.waitForReady()).toBe(true);

    expect(await pressMenuItem('Settings…')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const opened = await copacetic.chrome.evaluate(() =>
      document.body.innerText.includes('Everything here is stored'),
    );
    expect(opened).toBe(true);

    // Put it back. A surface covers the content area, so leaving it open hides
    // the page view and the next test finds nothing where the page should be.
    await copacetic.chrome.getByRole('button', { name: 'Close settings' }).click();
    await new Promise((resolve) => setTimeout(resolve, 800));
  }, 90_000);
});

/**
 * The other half of the item above, and the reason its comment no longer blames
 * the test.
 *
 * The chrome is a page, and the window paints before anything in it is
 * listening — about 190ms apart on the machine `npm run measure` reports, and
 * further into a cold start, which is slower throughout. A push sent inside that window
 * reaches a renderer with no listeners attached and is simply gone, so Cmd+, during startup did nothing and looked identical to a
 * menu item that is broken. The request is now held in the main process and
 * collected when the renderer starts listening.
 *
 * This presses the item after hydration, because the race cannot be forced from
 * out here. What it proves is the part that a unit test cannot: that the
 * channel is registered, the preload exposes it, and the main process really is
 * keeping the request — a rule with nothing wired to it passes its own tests
 * perfectly.
 */
describe('a surface asked for before the chrome is listening', () => {
  it('is kept for a renderer that starts later, and handed over once', async () => {
    expect(await copacetic.waitForReady()).toBe(true);
    expect(await pressMenuItem('Show all history')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 800));

    // What a chrome starting now would be given. The push also reached this
    // already-hydrated renderer, which is not what is being measured here.
    const held = await copacetic.chrome.evaluate(() => window.copacetic.chrome.pendingSurface());
    expect(held).toBe('history');

    // Handed over once: a second renderer asking is a reload, not a person
    // asking again, and it must not reopen a pane that was already closed.
    const again = await copacetic.chrome.evaluate(() => window.copacetic.chrome.pendingSurface());
    expect(again).toBeNull();

    // Put it back, or the surface hides the page view for every spec after it.
    await copacetic.chrome.getByRole('button', { name: 'Close history' }).click();
    await new Promise((resolve) => setTimeout(resolve, 800));
  }, 90_000);

  /*
   * The one that matters, and the one the two above cannot see.
   *
   * They assert what the main process hands back, which is only half the
   * journey: the renderer still has to collect it and still be showing it once
   * the first state arrives. Reloading the chrome with a request held is the
   * only way to reproduce a renderer starting up from out here, and it is a
   * real case in its own right.
   */
  it('is actually on screen once the interface has finished starting', async () => {
    expect(await pressMenuItem('Show all history')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 400));

    await copacetic.main(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.reload());
    expect(await copacetic.waitForReady()).toBe(true);
    // Long enough for the first state push to land and everything it triggers
    // to settle. The failure this catches happens after hydration, not during.
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const showing = await copacetic.chrome.evaluate(() => document.body.innerText.includes('Kept on this machine'));
    expect(showing).toBe(true);

    await copacetic.chrome.getByRole('button', { name: 'Close history' }).click();
    await new Promise((resolve) => setTimeout(resolve, 800));
  }, 120_000);

  /*
   * The counterweight. Holding a close would mean a chrome that finished
   * starting a second later opened, and then immediately shut, a pane nobody
   * had asked for.
   */
  it('never keeps a close', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.chrome.pendingSurface());
    expect(await pressMenuItem('Show all history')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 600));

    await copacetic.chrome.getByRole('button', { name: 'Close history' }).click();
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Closing goes through the renderer only, so the request the main process
    // is holding is still the open. Pressing the item again and letting the
    // close land is the shape that matters: what is held must never be 'none'.
    const held = await copacetic.chrome.evaluate(() => window.copacetic.chrome.pendingSurface());
    expect(held).not.toBe('none');
  }, 90_000);
});

/**
 * The chrome measures where the page should go and the main process puts it
 * there, and the two are measured in different processes from different
 * sources. When they drift, everything positioned against the page drifts with
 * it: an overlay lands beside the thing it is covering rather than on it, and
 * nothing about either number looks wrong on its own.
 *
 * Seen once at 9px during the overlay work, on a build where a chrome row had
 * opened without the rectangle being re-sent.
 */
describe('where the page goes', () => {
  it('is the same rectangle in the chrome and in the main process', async () => {
    await copacetic.waitForVisible();
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.create('https://example.com'));
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const asDrawn = await copacetic.chrome.evaluate(() => {
      const rect = document.querySelector('main')!.getBoundingClientRect();
      return { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width) };
    });

    const asPlaced = await copacetic.main(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const visible = window?.contentView.children.filter((view) => view.getVisible?.() !== false) ?? [];
      return visible.at(-1)?.getBounds() ?? null;
    });

    expect(asPlaced).not.toBeNull();
    expect(asPlaced?.y).toBe(asDrawn.top);
    expect(asPlaced?.x).toBe(asDrawn.left);
    expect(asPlaced?.width).toBe(asDrawn.width);
  }, 90_000);
});
