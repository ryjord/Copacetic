import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
const PAGE = 'https://example.com/tall-page';

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

/** Width and height from a PNG's own header, so the check reads the file rather than trusting the code that wrote it. */
const pngSize = (file: string) => {
  const bytes = readFileSync(file);
  return {
    isPng: bytes.subarray(1, 4).toString('ascii') === 'PNG',
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
};

describe('a picture of the whole page', () => {
  it('is the whole page, not just what the window shows', async () => {
    const tabId = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), PAGE);
    await copacetic.inOpenPage(PAGE, "document.body.style.height = '4000px', true");
    const target = path.join(copacetic.profile, 'whole-page.png');
    // The save dialog is answered for the test, the one part of this a person would do.
    await copacetic.main(({ dialog }, filePath) => {
      dialog.showSaveDialog = (async () => ({ canceled: false, filePath })) as typeof dialog.showSaveDialog;
    }, target);

    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.saveScreenshot(id), tabId);
    expect(await copacetic.until(() => existsSync(target), 20_000)).toBe(true);

    const viewportHeight = await copacetic.inOpenPage<number>(PAGE, 'window.innerHeight');
    const size = pngSize(target);
    expect(size.isPng).toBe(true);
    expect(size.height).toBeGreaterThan(viewportHeight);
    expect(size.height).toBeGreaterThanOrEqual(4000);
  }, 90_000);
});
