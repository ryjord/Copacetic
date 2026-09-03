import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

const history = (): { url: string }[] => {
  const file = path.join(copacetic.profile, 'history.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { url: string }[]) : [];
};

const tabs = () =>
  copacetic.chrome.evaluate(async () => {
    const state = await window.copacetic.chrome.getState();
    return state.tabs.map((tab) => ({ id: tab.id, url: tab.url, isHush: tab.isHush === true }));
  });

/**
 * A link followed out of a Hush tab opened an ordinary, recorded one.
 *
 * The unit tests say the inheritance rule is right and that the callers pass an
 * opener. Neither can say the two are connected: a rule nothing loads passes
 * its own tests perfectly. This drives the real path — a page in a real Hush
 * tab calling `window.open`, through the security delegate, into tab creation —
 * and then looks at what reached the disk.
 */
describe('a tab opened by a page inside a Hush tab', () => {
  it('is a Hush tab too, and its address is not written down', async () => {
    await copacetic.chrome.evaluate(async () => {
      await window.copacetic.tabs.createHush();
    });
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const hush = (await tabs()).find((tab) => tab.isHush);
    expect(hush).toBeTruthy();

    // A real page in it, so `window.open` runs in page content rather than
    // anywhere with privileges.
    await copacetic.chrome.evaluate(
      (id) => window.copacetic.tabs.navigate(id, 'https://example.com/hush-opener'),
      hush!.id,
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));

    await copacetic.inPage(
      'https://example.com/hush-opener',
      `window.open('https://example.com/opened-from-hush', '_blank'), true`,
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const opened = (await tabs()).find((tab) => tab.url.includes('opened-from-hush'));
    expect(opened).toBeTruthy();
    expect(opened?.isHush).toBe(true);

    // The whole point. Before this, the address of a page reached from a Hush
    // tab was written to history like any other.
    expect(history().some((entry) => entry.url.includes('opened-from-hush'))).toBe(false);
  }, 180_000);

  /*
   * The counterweight. Inheriting Hush from everything, or defaulting to it,
   * would pass the test above and quietly stop the browser recording anything
   * at all — which is a bigger failure than the one being fixed.
   */
  it('does not make ordinary tabs Hush', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.create('https://example.com/ordinary'));
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const ordinary = (await tabs()).find((tab) => tab.url.includes('ordinary'));
    expect(ordinary?.isHush).toBe(false);
    expect(history().some((entry) => entry.url.includes('ordinary'))).toBe(true);
  }, 120_000);
});
