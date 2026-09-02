import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';
import pkg from '../package.json' with { type: 'json' };

let copacetic: SmokeApp;

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
