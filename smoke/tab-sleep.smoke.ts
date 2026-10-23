import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
afterAll(async () => copacetic?.close());

const SLEEPER = 'https://example.com/sleeper';

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

const chrome = () => copacetic.chromePages()[0]!;

const sleeperState = () =>
  chrome().evaluate(
    async (url) => (await window.copacetic.chrome.getState()).tabs.find((tab) => tab.url === url),
    SLEEPER,
  );

/** Whether a live page anywhere in the app is showing the address, which is what sleeping takes away. */
const isPageOpen = () =>
  copacetic.read(
    ({ webContents }, url) => webContents.getAllWebContents().some((contents) => contents.getURL() === url),
    SLEEPER,
  );

describe('a sleeping tab', () => {
  it('gives back its page and keeps its place in the strip', async () => {
    copacetic = await SmokeApp.launch();
    await copacetic.waitForReady();
    const id = await chrome().evaluate((url) => window.copacetic.tabs.create(url, false), SLEEPER);
    expect(await until(isPageOpen)).toBe(true);

    await chrome().evaluate((tabId) => window.copacetic.tabs.sleep(tabId), id);
    expect(await until(async () => (await sleeperState())?.isAsleep === true)).toBe(true);
    expect(await until(async () => !(await isPageOpen()))).toBe(true);
  }, 90_000);

  it('wakes at the same address when it is chosen', async () => {
    const asleep = await sleeperState();
    await chrome().evaluate((tabId) => window.copacetic.tabs.activate(tabId), asleep!.id);
    expect(await until(isPageOpen)).toBe(true);
    expect((await sleeperState())?.isAsleep).toBe(false);
  }, 60_000);

  // The tab in front is the page someone is reading; sleeping it would blank the window.
  it('refuses to sleep the tab in front', async () => {
    const asleep = await sleeperState();
    await chrome().evaluate((tabId) => window.copacetic.tabs.sleep(tabId), asleep!.id);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(await isPageOpen()).toBe(true);
  }, 30_000);
});

// An extension is told about every tab whenever anything changes, and telling it once woke every tab asleep.
describe('a sleeping tab, with an extension watching', () => {
  it('stays asleep while the window around it changes', async () => {
    const watcher = await SmokeApp.launch();
    try {
      await watcher.waitForReady();
      await watcher.main(({ dialog }, folder) => {
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [folder],
        })) as typeof dialog.showOpenDialog;
        dialog.showMessageBox = (async () => ({
          response: 0,
          checkboxChecked: false,
        })) as typeof dialog.showMessageBox;
      }, path.resolve('smoke/fixtures/extensions/probe'));
      expect(await watcher.chrome.evaluate(() => window.copacetic.extensions.addFromFolder())).toBe('');
      const page = 'https://example.com/watched-sleeper';
      const id = await watcher.chrome.evaluate((url) => window.copacetic.tabs.create(url, false), page);
      const isOpen = () =>
        watcher.read(
          ({ webContents }, url) => webContents.getAllWebContents().some((contents) => contents.getURL() === url),
          page,
        );
      expect(await until(isOpen)).toBe(true);
      // Past the moment the page is looked at again for a sign-in form drawn late.
      await new Promise((resolve) => setTimeout(resolve, 4000));
      await watcher.chrome.evaluate((tabId) => window.copacetic.tabs.sleep(tabId), id);
      expect(await until(async () => !(await isOpen()))).toBe(true);
      // Each of these changes the window, which is told to the extension.
      await watcher.chrome.evaluate(() => window.copacetic.tabs.create('https://example.org/'));
      await watcher.chrome.evaluate(() => window.copacetic.settings.update({ density: 'compact' }));
      await new Promise((resolve) => setTimeout(resolve, 3000));
      expect(await isOpen()).toBe(false);
      const state = await watcher.chrome.evaluate(
        async (tabId) => (await window.copacetic.chrome.getState()).tabs.find((tab) => tab.id === tabId),
        id,
      );
      expect(state?.isAsleep).toBe(true);
    } finally {
      await watcher.close();
    }
  }, 90_000);
});
