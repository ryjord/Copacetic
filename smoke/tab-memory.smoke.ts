import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
const PAGE = 'https://example.com/measured';

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

describe('memory per tab', () => {
  it('measures a page in front, and leaves out a sleeping tab', async () => {
    const tabId = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), PAGE);
    await copacetic.inOpenPage(PAGE, 'true');
    const measured = await copacetic.chrome.evaluate(() => window.copacetic.tabs.memoryUse());
    expect(measured[tabId]?.kilobytes).toBeGreaterThan(1024);

    const otherId = await copacetic.chrome.evaluate(() => window.copacetic.tabs.create('https://example.com/front'));
    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.activate(id), otherId);
    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.sleep(id), tabId);
    expect(
      await copacetic.until(
        async () => !(tabId in (await copacetic.chrome.evaluate(() => window.copacetic.tabs.memoryUse()))),
        10_000,
      ),
    ).toBe(true);
  }, 90_000);
});
