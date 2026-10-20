import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
const RULED = 'https://example.org/always-hush';

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

const tabAt = async (url: string) =>
  (await copacetic.chrome.evaluate(() => window.copacetic.chrome.getState())).tabs.find((tab) => tab.url === url);

describe('a site that always opens in Hush', () => {
  it('opens there from an ordinary new tab, and the empty tab it left goes', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ openRules: { 'example.org': 'hush' } }));
    const tabId = await copacetic.chrome.evaluate(() => window.copacetic.tabs.create());
    await copacetic.chrome.evaluate(
      (id) => window.copacetic.tabs.navigate(id, 'https://example.org/always-hush'),
      tabId,
    );

    expect(await copacetic.until(async () => (await tabAt(RULED))?.isHush === true, 20_000)).toBe(true);
    const state = await copacetic.chrome.evaluate(() => window.copacetic.chrome.getState());
    expect(state.tabs.some((tab) => tab.id === tabId)).toBe(false);
    expect(state.tabs.filter((tab) => tab.url === RULED).every((tab) => tab.isHush)).toBe(true);
  }, 90_000);

  it('leaves a site without a rule where it was', async () => {
    const tabId = await copacetic.chrome.evaluate(() => window.copacetic.tabs.create('https://example.com/no-rule'));
    expect(
      await copacetic.until(async () => (await tabAt('https://example.com/no-rule')) !== undefined, 20_000),
    ).toBe(true);
    const tab = await tabAt('https://example.com/no-rule');
    expect(tab?.id).toBe(tabId);
    expect(tab?.isHush).toBe(false);
  }, 60_000);
});
