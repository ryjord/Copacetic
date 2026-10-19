import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
const PAGE = 'https://example.com/reader';

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

describe('reader view', () => {
  it('reads the page as it stands, through DevTools rather than a script in it', async () => {
    const tabId = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), PAGE);
    // Changed after load, so only a read of the live document would see it.
    await copacetic.inOpenPage(
      PAGE,
      "document.body.insertAdjacentHTML('beforeend', '<p id=late>Added later</p>'), true",
    );

    const document = await copacetic.chrome.evaluate((id) => window.copacetic.tabs.readerDocument(id), tabId);
    expect(document?.url).toBe(PAGE);
    expect(document?.html).toContain('Added later');

    const globals = await copacetic.inOpenPage<string[]>(
      PAGE,
      "Object.keys(window).filter((key) => key.toLowerCase().includes('copacetic') || key.toLowerCase().includes('readability'))",
    );
    expect(globals).toEqual([]);
  }, 90_000);
});
