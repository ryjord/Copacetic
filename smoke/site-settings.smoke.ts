import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
const PAGE = 'https://example.com/site-settings';

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

/**
 * What Site settings stores is only worth something if the engine obeys it.
 * These write a decision and a zoom the way the pane does, then ask a real page
 * and Chromium itself what happened.
 */
describe('what Site settings keeps about a site', () => {
  it('refuses a page a stored block applies to, without asking', async () => {
    await copacetic.chrome.evaluate(() =>
      window.copacetic.settings.update({ permissionDecisions: { 'https://example.com|notifications': 'deny' } }),
    );
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), PAGE);
    expect(await copacetic.inOpenPage(PAGE, 'Notification.requestPermission()')).toBe('denied');
    const prompts = await copacetic.chrome.evaluate(
      async () => (await window.copacetic.chrome.getState()).permissionPrompts.length,
    );
    expect(prompts).toBe(0);
  }, 90_000);

  it('applies a stored zoom when the site is opened', async () => {
    await copacetic.chrome.evaluate(() =>
      window.copacetic.settings.update({ zoomLevels: { 'https://example.com': 1.5 } }),
    );
    const zoomed = `${PAGE}?zoomed`;
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), zoomed);
    await copacetic.inOpenPage(zoomed, 'true');
    const zoomOfPage = () =>
      copacetic.read(
        ({ webContents }, url) =>
          webContents
            .getAllWebContents()
            .find((contents) => contents.getURL() === url)
            ?.getZoomFactor() ?? null,
        zoomed,
      );
    expect(await copacetic.until(async () => (await zoomOfPage()) === 1.5, 10_000)).toBe(true);
  }, 90_000);
});
