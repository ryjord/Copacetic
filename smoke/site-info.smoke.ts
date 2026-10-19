import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IS_FOREGROUND_RUN, SmokeApp } from './support/harness';

let copacetic: SmokeApp;
const PAGE = 'https://example.com/site-info';

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
  await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), PAGE);
  await copacetic.inOpenPage(PAGE, 'document.readyState');
});
afterAll(async () => copacetic?.close());

/** Every view's URL, bounds and visibility, read from Electron itself. */
const layers = () =>
  copacetic.main(({ BrowserWindow }) =>
    (BrowserWindow.getAllWindows()[0]?.contentView.children ?? []).map((view) => ({
      url: 'webContents' in view ? (view as Electron.WebContentsView).webContents.getURL() : '',
      bounds: view.getBounds(),
      isVisible: view.getVisible?.() === true,
    })),
  );

const isCardShown = async () =>
  (await layers()).some((layer) => layer.url.includes('region=leading') && layer.isVisible) &&
  (await copacetic.leading.evaluate(() => Boolean(document.querySelector('[aria-label="Connection details"]'))));

const until = async (condition: () => Promise<boolean>, timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
};

const openFromBadge = async () => {
  await copacetic.chrome.getByRole('button', { name: /^Connection: / }).click();
  expect(await until(isCardShown)).toBe(true);
};

/** It was a row of the chrome, so asking what a connection was moved the page you were asking about. */
describe('site information', () => {
  it('opens from the badge over the page, without moving it', async () => {
    const before = (await layers()).find((layer) => layer.url === PAGE)?.bounds;
    await openFromBadge();
    const now = await layers();
    expect(now.find((layer) => layer.url === PAGE)?.bounds).toEqual(before);
    expect(await copacetic.chrome.getByRole('button', { name: /^Connection: / }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  }, 90_000);

  it('has the keyboard, and closes with Escape back to the page', async () => {
    const holdsIt = await copacetic.keyboardIsWith((url) => url.includes('region=leading'));
    // Null when the desktop never gave the app the keyboard, which leaves nothing to check.
    if (holdsIt !== null) {
      expect(holdsIt).toBe(true);
    }
    await copacetic.leading.keyboard.press('Escape');
    expect(await until(async () => !(await isCardShown()))).toBe(true);
    const isWithPage = await copacetic.keyboardIsWith((url) => url === PAGE);
    if (isWithPage !== null) {
      expect(isWithPage).toBe(true);
    }
  }, 60_000);

  // Focusing the page from here brings the app to the front, so this runs only when asked to take the screen.
  it.skipIf(!IS_FOREGROUND_RUN)(
    'closes when someone goes back to the page',
    async () => {
      await openFromBadge();
      await copacetic.main(({ webContents }, url) => {
        webContents
          .getAllWebContents()
          .find((contents) => contents.getURL() === url)
          ?.focus();
      }, PAGE);
      expect(await until(async () => !(await isCardShown()))).toBe(true);
    },
    60_000,
  );
});
