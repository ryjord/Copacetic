import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';
import { type LocalSite, startLocalSite } from './support/local-site';

let copacetic: SmokeApp;
let site: LocalSite;

const LONG_PAGE = '<!doctype html><title>Long</title><div style="height: 8000px">A long page</div>';

beforeAll(async () => {
  site = await startLocalSite((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' }).end(LONG_PAGE);
  });
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => {
  await copacetic?.close();
  await site?.close();
});

/**
 * A restored tab used to start at the top, because the page state that holds
 * the scroll position also holds typed form input. The position is now read on
 * its own and put back, which only a real restart can show.
 */
describe('scroll position across a restart', () => {
  it('puts a restored tab back where it was scrolled to', async () => {
    const page = `${site.origin}/long-read`;
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), page);
    expect(await copacetic.inOpenPage<number>(page, 'scrollTo(0, 2400), scrollY')).toBe(2400);
    // Leaving the tab is one of the moments its position is read.
    await copacetic.chrome.evaluate(() => window.copacetic.tabs.create('copacetic://start'));
    const saved = await copacetic.waitForProfileJson<{ windows: Array<{ tabs: Array<{ scroll?: { y: number } }> }> }>(
      'session.json',
      (session) => session.windows.some((snapshot) => snapshot.tabs.some((tab) => tab.scroll?.y === 2400)),
    );
    expect(saved?.windows.some((snapshot) => snapshot.tabs.some((tab) => tab.scroll?.y === 2400))).toBe(true);

    const profile = copacetic.profile;
    await copacetic.close({ keepProfile: true });
    copacetic = await SmokeApp.launch({ profile });
    await copacetic.waitForReady();

    let scrolled = 0;
    const isPutBack = await copacetic.until(async () => {
      scrolled = await copacetic.inOpenPage<number>(page, 'scrollY');
      return scrolled === 2400;
    }, 20_000);
    expect(isPutBack, `scrolled to ${scrolled}`).toBe(true);
  }, 120_000);
});
