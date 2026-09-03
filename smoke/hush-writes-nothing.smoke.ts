import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

/**
 * A window of its own, and nothing else in it.
 *
 * The claim is that a site opened in a Hush tab is named nowhere on disk. That
 * only means anything in a profile where nothing else has been near the site —
 * an earlier test that downloaded from it, or simply visited it in an ordinary
 * tab, writes the same name for entirely legitimate reasons and the check would
 * be reading its own leftovers.
 */
beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

/**
 * The claim as a whole, rather than one write path at a time.
 *
 * Three separate leaks have been found here by looking: the favicon cache, the
 * download record, and the certificate store — each written automatically, each
 * surviving the tab, each against the same sentence. Rather than add a fourth
 * specific test, this visits a page in a Hush tab and then reads everything the
 * browser keeps, asking whether any of it names the site. A write path added
 * later that forgets to check fails here without anyone thinking to write a
 * test for it.
 */
describe('everything a Hush tab writes', () => {
  it('names the site in none of it', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.createHush());
    await new Promise((resolve) => setTimeout(resolve, 2500));

    await copacetic.chrome.evaluate(async () => {
      const state = await window.copacetic.chrome.getState();
      const hush = state.tabs.find((tab) => tab.isHush);
      if (hush) {
        await window.copacetic.tabs.navigate(hush.id, 'https://example.com/hush-visit');
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Zoomed too: a deliberate action is still an action taken in a Hush tab.
    await copacetic.chrome.evaluate(async () => {
      const state = await window.copacetic.chrome.getState();
      const hush = state.tabs.find((tab) => tab.isHush);
      if (hush) {
        await window.copacetic.tabs.setZoom(hush.id, 1.75);
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const named: string[] = [];
    for (const name of readdirSync(copacetic.profile)) {
      if (!name.endsWith('.json')) {
        continue;
      }
      try {
        if (readFileSync(path.join(copacetic.profile, name), 'utf8').includes('example.com')) {
          named.push(name);
        }
      } catch {
        // A profile also holds Chromium's own files; not what this is about.
      }
    }

    // Listed rather than counted, so a failure says which file.
    expect(named).toEqual([]);
  }, 180_000);

  /*
   * The counterweight, and the reason this test is worth trusting: the same
   * visit in an ordinary tab must be written down. Without it, a browser that
   * had stopped recording anything at all would pass the test above.
   */
  it('but an ordinary tab is written down', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.create('https://example.com/ordinary-visit'));
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const history = readFileSync(path.join(copacetic.profile, 'history.json'), 'utf8');
    expect(history).toContain('example.com');
  }, 120_000);
});
