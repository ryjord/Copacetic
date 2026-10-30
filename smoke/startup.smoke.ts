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
    expect(await copacetic.read(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  });
});

// Pressed, because that is the only way to know a menu item works; the tab it opens is closed for the specs after.
describe('the Settings item in the menu bar', () => {
  it('opens settings in a tab of its own', async () => {
    expect(await copacetic.waitForReady()).toBe(true);
    expect(await pressMenuItem('Settings…')).toBe(true);

    const activeUrl = () =>
      copacetic.chrome.evaluate(async () => {
        const state = await window.copacetic.chrome.getState();
        return state.tabs.find((tab) => tab.id === state.activeTabId)?.url ?? null;
      });
    expect(await copacetic.until(async () => (await activeUrl()) === 'copacetic://settings', 10_000)).toBe(true);
    expect(await copacetic.chrome.getByRole('region', { name: 'Settings' }).isVisible()).toBe(true);

    await copacetic.chrome.evaluate(async () => {
      const state = await window.copacetic.chrome.getState();
      if (state.activeTabId) {
        await window.copacetic.tabs.close(state.activeTabId);
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 800));
  }, 90_000);

  // A tab of ours is ordinary state, so a chrome that reloads draws it again with nothing held for it.
  it('is still drawn after the interface reloads', async () => {
    expect(await pressMenuItem('Settings…')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    await copacetic.main(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.reload());
    expect(await copacetic.waitForReady()).toBe(true);
    expect(
      await copacetic.waitForChrome(() => Boolean(document.querySelector('section[aria-label="Settings"]'))),
    ).toBe(true);
    await copacetic.chrome.evaluate(async () => {
      const state = await window.copacetic.chrome.getState();
      if (state.activeTabId) {
        await window.copacetic.tabs.close(state.activeTabId);
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 800));
  }, 120_000);
});

/**
 * The chrome is a page, and the window paints before anything in it is
 * listening - about 190ms apart on the machine `npm run measure` reports, and
 * further into a cold start. A push sent inside that window reaches a renderer
 * with no listeners attached and is simply gone, so Cmd+K during startup did
 * nothing and looked identical to a menu item that is broken. The request is
 * held in the main process and collected when the renderer starts listening.
 *
 * This presses the item after hydration, because the race cannot be forced from
 * out here. What it proves is the part a unit test cannot: that the channel is
 * registered, the preload exposes it, and the main process really is keeping
 * the request.
 */
describe('a surface asked for before the chrome is listening', () => {
  const paletteShowing = () =>
    copacetic.chrome.evaluate(() => Boolean(document.querySelector('[role="dialog"][aria-label="Command palette"]')));

  it('is kept for a renderer that starts later, and handed over once', async () => {
    expect(await copacetic.waitForReady()).toBe(true);
    expect(await pressMenuItem('Command palette')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 800));

    const held = await copacetic.chrome.evaluate(() => window.copacetic.chrome.pendingSurface());
    expect(held).toBe('palette');
    // Handed over once: a second renderer asking is a reload, not a person asking again.
    const again = await copacetic.chrome.evaluate(() => window.copacetic.chrome.pendingSurface());
    expect(again).toBeNull();

    await copacetic.chrome.keyboard.press('Escape');
    await new Promise((resolve) => setTimeout(resolve, 600));
  }, 90_000);

  // Reloading the chrome with a request held is the one way to reproduce a renderer starting up from out here.
  it('is actually on screen once the interface has finished starting', async () => {
    expect(await pressMenuItem('Command palette')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 400));

    await copacetic.main(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.reload());
    expect(await copacetic.waitForReady()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(await paletteShowing()).toBe(true);

    await copacetic.chrome.keyboard.press('Escape');
    await new Promise((resolve) => setTimeout(resolve, 600));
  }, 120_000);

  // Holding a close would mean a chrome that started a second later opened, then shut, a pane nobody asked for.
  it('never keeps a close', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.chrome.pendingSurface());
    expect(await pressMenuItem('Command palette')).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    await copacetic.chrome.keyboard.press('Escape');
    await new Promise((resolve) => setTimeout(resolve, 600));

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

    // Every edge, rounded once, as the chrome reports them.
    const asDrawn = () =>
      copacetic.chrome.evaluate(() => {
        const rect = document.querySelector('main')!.getBoundingClientRect();
        const [x, y] = [Math.round(rect.left), Math.round(rect.top)];
        return { x, y, width: Math.round(rect.right) - x, height: Math.round(rect.bottom) - y };
      });
    // The page's own view, found by its address: the last visible view can be the overlay, which sits elsewhere.
    const asPlaced = () =>
      copacetic.main(({ BrowserWindow, WebContentsView }) => {
        const window = BrowserWindow.getAllWindows()[0];
        const page = window?.contentView.children.find(
          (view) =>
            view instanceof WebContentsView &&
            view.getVisible() &&
            view.webContents.getURL().startsWith('https://example.com'),
        );
        return page?.getBounds() ?? null;
      });

    // Waited for until they agree, rather than for a fixed time a slow runner can outlast.
    const agree = async () => JSON.stringify(await asPlaced()) === JSON.stringify(await asDrawn());
    await copacetic.until(agree, 15_000);
    expect(await asPlaced()).toEqual(await asDrawn());
  }, 90_000);
});

/**
 * macOS keeps an application running after its last window closes, and clicking
 * the dock icon is how a person asks for it back.
 *
 * The handler for that returned early when the window was gone, so the app sat
 * in the dock, alive, with no window and no way to open one - usable only by
 * force-quitting it. Everywhere else the last window closing quits, so this is
 * the one platform where it matters and the one platform it was broken on.
 */
