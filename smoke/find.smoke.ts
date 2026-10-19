import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
const PAGE = 'https://example.com/find';

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

/**
 * Find used to be a row of the chrome, so opening it pushed the page down by a
 * bar's height and closing it pulled it back: everything you were reading moved
 * twice. It is drawn over the page's corner now, and only the card takes clicks.
 */
describe('find on page', () => {
  it('opens over the page without moving it', async () => {
    const before = (await layers()).find((layer) => layer.url === PAGE)?.bounds;
    expect(before).toBeTruthy();

    await copacetic.chooseMenuItem('Find on page…');
    const isDrawn = await until(async () =>
      copacetic.overlay.evaluate(() => Boolean(document.querySelector('[role="search"]'))),
    );
    expect(isDrawn).toBe(true);
    const isShown = await until(async () =>
      (await layers()).some((layer) => layer.url.includes('region=trailing') && layer.isVisible),
    );
    expect(isShown).toBe(true);

    const now = await layers();
    expect(now.find((layer) => layer.url === PAGE)?.bounds).toEqual(before);

    // The card's corner and no more, so the rest of the page's top edge still takes clicks.
    const overlay = now.find((layer) => layer.url.includes('region=trailing'))?.bounds;
    expect(overlay?.y).toBe(before?.y);
    expect((overlay?.x ?? 0) + (overlay?.width ?? 0)).toBe((before?.x ?? 0) + (before?.width ?? 0));
    expect(overlay?.width).toBeLessThan((before?.width ?? 0) / 2);
  }, 90_000);

  // The overlay is a view of its own, so typing reaches it only if the browser hands it the keyboard.
  it('has the keyboard, and finds what is typed', async () => {
    await copacetic.overlay.keyboard.type('Example');
    const isCounted = await until(async () =>
      copacetic.overlay.evaluate(() =>
        /of \d+/.test(document.querySelector('[role="search"] [role="status"]')?.textContent ?? ''),
      ),
    );
    expect(isCounted).toBe(true);
    expect(await copacetic.overlay.evaluate(() => (document.activeElement as HTMLInputElement | null)?.value)).toBe(
      'Example',
    );
  }, 60_000);

  it('closes with Escape and hands the keyboard back to the page', async () => {
    await copacetic.overlay.keyboard.press('Escape');
    const isHidden = await until(async () =>
      (await layers()).every((layer) => !layer.url.includes('region=trailing') || !layer.isVisible),
    );
    expect(isHidden).toBe(true);

    const isPageFocused = await copacetic.main(({ webContents }, url) => {
      return (
        webContents
          .getAllWebContents()
          .find((contents) => contents.getURL() === url)
          ?.isFocused() ?? false
      );
    }, PAGE);
    expect(isPageFocused).toBe(true);
  }, 60_000);
});
