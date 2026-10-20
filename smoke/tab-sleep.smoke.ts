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
