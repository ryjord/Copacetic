import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
const PAGES = ['https://example.com/kept-one', 'https://example.com/kept-two'];

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

const openAddresses = () =>
  copacetic.read(({ webContents }) => webContents.getAllWebContents().map((contents) => contents.getURL()));

describe('saved sessions', () => {
  it('keeps the pages, Hush aside, and opens them again in a window of their own', async () => {
    await Promise.all(
      PAGES.map((url) => copacetic.chrome.evaluate((target) => window.copacetic.tabs.create(target), url)),
    );
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.createHush());
    await copacetic.until(async () => {
      const addresses = await openAddresses();
      return PAGES.every((url) => addresses.includes(url));
    }, 20_000);

    await copacetic.chrome.evaluate(() => window.copacetic.sessions.save());
    const saved = async () =>
      (await copacetic.chrome.evaluate(() => window.copacetic.chrome.getState())).namedSessions;
    expect(await copacetic.until(async () => (await saved()).length === 1, 10_000)).toBe(true);
    const [session] = await saved();
    expect(session?.tabCount).toBe(PAGES.length);

    await copacetic.chrome.evaluate((id) => window.copacetic.sessions.open(id), session?.id ?? '');
    const windowCount = () =>
      copacetic.read(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((window) => window.isVisible()).length,
      );
    expect(await copacetic.until(async () => (await windowCount()) === 2, 20_000)).toBe(true);
    const pagesEach = async () => {
      const addresses = await openAddresses();
      return PAGES.every((url) => addresses.filter((address) => address === url).length === 2);
    };
    expect(await copacetic.until(pagesEach, 20_000)).toBe(true);
  }, 120_000);
});
