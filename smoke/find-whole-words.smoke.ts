import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';
import { type LocalSite, startLocalSite } from './support/local-site';

let copacetic: SmokeApp;
let site: LocalSite;

// "cat" four times over: twice on its own, and inside two other words.
const PAGE_TEXT = '<!doctype html><title>Cats</title><p>A cat, a concatenated list, two cats, and the cat.</p>';

beforeAll(async () => {
  site = await startLocalSite((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' }).end(PAGE_TEXT);
  });
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => {
  await copacetic?.close();
  await site?.close();
});

/** The count the find bar shows, read from the bar itself. */
const shownCount = () =>
  copacetic.overlay.evaluate(() => document.querySelector('[role="search"] [role="status"]')?.textContent ?? '');

const untilCount = (expected: string) => copacetic.until(async () => (await shownCount()) === expected, 15_000);

/** Fails with what the bar showed, rather than only that it was not the count asked for. */
const expectCount = async (expected: string) => {
  const isShown = await untilCount(expected);
  expect(isShown, `the find bar showed "${await shownCount()}"`).toBe(true);
};

/**
 * Chromium's find has no whole-words option. Copacetic reads the page's text
 * through DevTools to know which matches are whole words and steps over the
 * rest, which only real find in page, on a real page, can show.
 */
describe('finding whole words', () => {
  it('counts and stops at only the whole words, and every match again once switched off', async () => {
    const page = `${site.origin}/cats`;
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), page);
    await copacetic.inOpenPage(page, 'document.readyState');

    // Typed once the bar is drawn: a search sent just before, the bar's own empty first search can undo.
    await copacetic.chrome.evaluate(() => window.copacetic.find.open());
    const field = copacetic.overlay.locator('[role="search"] input');
    await field.waitFor({ timeout: 15_000 });
    await field.fill('cat');
    await expectCount('1 of 4');

    // A new search goes on from the match already found, as Chromium's does, so either whole word can come first.
    await copacetic.chrome.evaluate(() => window.copacetic.find.setWholeWord(true));
    expect(
      await copacetic.until(async () => /^[12] of 2$/.test(await shownCount()), 15_000),
      await shownCount(),
    ).toBe(true);
    const first = await shownCount();
    const other = first === '1 of 2' ? '2 of 2' : '1 of 2';
    await copacetic.chrome.evaluate(() => window.copacetic.find.next());
    await expectCount(other);
    await copacetic.chrome.evaluate(() => window.copacetic.find.next());
    await expectCount(first);

    await copacetic.chrome.evaluate(() => window.copacetic.find.setWholeWord(false));
    await expectCount('1 of 4');
    await copacetic.chrome.evaluate(() => window.copacetic.find.stop());
  }, 90_000);
});
