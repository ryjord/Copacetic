import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

/**
 * The engine in its real worker, with a real model from Mozilla: the part no
 * unit test reaches. The download is about 35 MB, so this is slow on purpose.
 */
describe('translation on this machine', () => {
  it('translates English into German, keeping the markup, and keeps the model for next time', async () => {
    const result = await copacetic.chrome.evaluate(() =>
      window.copacetic.translation.translate('en', 'de', ['The <b>browser</b> keeps nothing.']),
    );
    expect('texts' in result ? result.texts[0] : result.error).toMatch(/Browser/);
    expect('texts' in result ? result.texts[0] : '').toContain('<b>');

    const kept = await copacetic.chrome.evaluate(() => window.copacetic.translation.installedBytes());
    expect(kept).toBeGreaterThan(10 * 1024 * 1024);

    await copacetic.chrome.evaluate(() => window.copacetic.translation.removeModels());
    expect(await copacetic.chrome.evaluate(() => window.copacetic.translation.installedBytes())).toBe(0);
  }, 240_000);
});
