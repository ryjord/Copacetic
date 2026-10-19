import { afterAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
afterAll(async () => copacetic?.close());

const windowCount = () =>
  copacetic.main(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((window) => window.isVisible()).length);

const until = async (condition: () => Promise<boolean>, timeoutMs = 20_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

/** Each chrome's own tabs, asked of that window, which is the routing being tested. */
const tabsIn = (index: number) =>
  copacetic
    .chromePages()
    [index]!.evaluate(async () => (await window.copacetic.chrome.getState()).tabs.map((tab) => tab.url));

describe('more than one window', () => {
  it('opens a second window from the menu, with a tab of its own', async () => {
    copacetic = await SmokeApp.launch();
    await copacetic.waitForReady();
    await copacetic.chooseMenuItem('New window');
    expect(await until(async () => (await windowCount()) === 2)).toBe(true);
    expect(await until(async () => copacetic.chromePages().length === 2)).toBe(true);
  }, 90_000);

  // Asked through each window's own chrome, so this fails if calls are answered by the wrong window.
  it('keeps each window to its own tabs', async () => {
    await copacetic
      .chromePages()[1]!
      .evaluate(() => window.copacetic.tabs.create('https://example.com/second-window'));
    expect(await until(async () => (await tabsIn(1)).includes('https://example.com/second-window'))).toBe(true);
    expect(await tabsIn(0)).not.toContain('https://example.com/second-window');
  }, 60_000);

  it('brings every open window back after a restart', async () => {
    await copacetic
      .chromePages()[0]!
      .evaluate(() => window.copacetic.tabs.create('https://example.com/first-window'));
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const profile = copacetic.profile;
    await copacetic.close({ keepProfile: true });

    copacetic = await SmokeApp.launch({ profile });
    await copacetic.waitForReady();
    expect(await until(async () => (await windowCount()) === 2)).toBe(true);
    // A restored tab is a page before it has an address, so this waits for both to arrive.
    const everything = () =>
      copacetic.main(({ webContents }) => webContents.getAllWebContents().map((contents) => contents.getURL()));
    const isBothBack = async () => {
      const urls = await everything();
      return ['https://example.com/first-window', 'https://example.com/second-window'].every((url) =>
        urls.includes(url),
      );
    };
    expect(await until(isBothBack), JSON.stringify(await everything())).toBe(true);
  }, 120_000);

  // Closing one window is not quitting: the other stays, and downloads and the store go on.
  it('stays open when one of its windows closes', async () => {
    await copacetic.main(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.isVisible())
        ?.close(),
    );
    expect(await until(async () => (await windowCount()) === 1)).toBe(true);
    // The closed window's page can linger in the list for a moment on Windows, so the survivor is chosen by being open.
    const survivor = copacetic.chromePages().find((page) => !page.isClosed());
    const state = await survivor!.evaluate(async () => (await window.copacetic.chrome.getState()).tabs.length);
    expect(state).toBeGreaterThan(0);
  }, 60_000);
});
