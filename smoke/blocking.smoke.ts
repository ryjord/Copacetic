import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';
import { type LocalSite, startLocalSite } from './support/local-site';

let copacetic: SmokeApp;
let site: LocalSite;

// A public-looking name for the local site: EasyList turns element hiding off on 127.0.0.1 and localhost, on purpose.
const PAGE_ORIGIN = 'http://blocking.example';

beforeAll(async () => {
  site = await startLocalSite();
  copacetic = await SmokeApp.launch({
    args: [`--host-resolver-rules=MAP blocking.example 127.0.0.1:${new URL(site.origin).port}`],
  });
  await copacetic.waitForVisible();
  // The local site speaks only HTTP; what is tested here is blocking, not the upgrade.
  await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ httpsFirst: false }));
});
afterAll(async () => {
  await copacetic?.close();
  await site?.close();
});

/** Asked from inside a real page, because that is the only place it is true. */
const askPage = <T>(expression: string, path = '/'): Promise<T> =>
  copacetic.inPage<T>(`${PAGE_ORIGIN}${path}`, expression);

/**
 * What the blocker recorded for a host, which is the signal that means what we
 * mean.
 *
 * A fetch that rejects proves nothing on its own: an unreachable host, a DNS
 * policy or an offline runner all reject too, and every one of those would make
 * the tests below pass with blocking switched off entirely. This fires the
 * moment onBeforeRequest cancels a request, and only then.
 */
const blockedCounts = async (): Promise<Record<string, number>> =>
  copacetic.chrome.evaluate(async () => {
    // Every tab, not the active one: `inPage` runs in the first tab matching a
    // URL, which is not necessarily the tab in front. Looking only at the
    // active one found nothing and said the blocker had done nothing.
    const state = await window.copacetic.chrome.getState();
    const counts: Record<string, number> = {};
    for (const tab of state.tabs) {
      for (const entry of await window.copacetic.connections.list(tab.id)) {
        counts[entry.host] = (counts[entry.host] ?? 0) + entry.blocked;
      }
    }
    return counts;
  });

const tryFetch = (url: string) => `
  (async () => {
    try { await fetch(${JSON.stringify(url)}, { mode: 'no-cors' }); return 'allowed'; }
    catch { return 'refused'; }
  })()
`;

/**
 * Blocking, asked of the browser rather than of the engine.
 *
 * The engine can be unit-tested and say yes to everything while the browser
 * says yes to everything too: the lists have to be built, shipped, found on
 * disk, deserialized, and consulted on the right event with the right request
 * shape. Every one of those is a place it can be wired up wrong and still
 * compile.
 */
describe('what a page is allowed to fetch', () => {
  /*
   * These two hosts are in the curated set as well as the lists, so this passes
   * with the lists switched off entirely - it is the floor, and it is here to
   * say the floor still holds.
   */
  it('refuses an advertising endpoint the curated set names', async () => {
    expect(await askPage(tryFetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'))).toBe('refused');
  }, 90_000);

  it('refuses an analytics endpoint the curated set names', async () => {
    expect(await askPage(tryFetch('https://www.google-analytics.com/analytics.js'))).toBe('refused');
    expect((await blockedCounts())['www.google-analytics.com']).toBeGreaterThan(0);
  }, 90_000);

  /*
   * This one is the feature. The curated set is 122 hostnames; EasyPrivacy
   * alone carries 47,263 plain host rules, and bat.bing.com is in the second
   * and not the first - so nothing but the shipped lists can refuse it, and a
   * release that failed to build or load them fails here and nowhere else.
   */
  it('refuses a tracker only the shipped lists know about', async () => {
    // The blocker's own count, not the fetch: an offline runner rejects too, and the lists load after the window.
    const isCounted = await copacetic.until(async () => {
      await askPage(tryFetch('https://bat.bing.com/bat.js'));
      return ((await blockedCounts())['bat.bing.com'] ?? 0) > 0;
    }, 30_000);
    expect(isCounted).toBe(true);
  }, 90_000);

  // The counterweight. A blocker that refused everything would pass both tests
  // above and be useless, and this is the only assertion that notices.
  it('allows an ordinary request', async () => {
    expect(await askPage(tryFetch(`${PAGE_ORIGIN}/?ordinary=1`))).toBe('allowed');
    expect((await blockedCounts())['blocking.example'] ?? 0).toBe(0);
  }, 90_000);

  /*
   * The switch has to switch. A blocker whose setting did nothing would look
   * identical from the outside - the refusals above would still pass - and the
   * only person who would find out is someone who turned it off to fix a broken
   * site and watched it stay broken.
   */
  // Counted by the blocker rather than by whether the fetch succeeded, so the half with blocking off needs no network.
  it('stops refusing when blocking is switched off', async () => {
    const analytics = tryFetch('https://www.google-analytics.com/analytics.js');
    const counted = async () => (await blockedCounts())['www.google-analytics.com'] ?? 0;

    await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ blockTrackers: false }));
    const before = await counted();
    await askPage(analytics, '/?blocking=off');
    const whileOff = await counted();

    await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ blockTrackers: true }));
    const isRefusedAgain = await copacetic.until(async () => {
      await askPage(analytics, '/?blocking=on');
      return (await counted()) > whileOff;
    }, 15_000);

    expect(whileOff).toBe(before);
    expect(isRefusedAgain).toBe(true);
  }, 120_000);
});

/**
 * A refused request still leaves the frame the page laid out for it, so the
 * stylesheet that collapses those holes is part of the feature rather than
 * decoration. It is a stylesheet and not a script on purpose: page content in
 * this browser gets no script of Copacetic's, and hiding elements is the usual
 * reason a blocker breaks that promise.
 */
describe('hiding what blocking leaves behind', () => {
  it('hides an element the lists name, and adds no script of ours', async () => {
    // Asked of the element, not of document.styleSheets: insertCSS adds a
    // user-origin stylesheet, which never appears there. An earlier version of
    // this test looked in the wrong place and reported nothing was inserted.
    const found = await askPage<{ advert: string; ordinary: string; copaceticGlobals: string[] }>(`
      (() => {
        const make = (tag) => {
          const element = document.createElement(tag);
          document.body.appendChild(element);
          return getComputedStyle(element).display;
        };
        return {
          // A tag the shipped lists hide on every site.
          advert: make('ad-slot'),
          ordinary: make('section'),
          // The promise: nothing of Copacetic's is reachable from the page.
          copaceticGlobals: Object.keys(window).filter((key) => key.toLowerCase().includes('copacetic')),
        };
      })()
    `);

    expect(found.advert).toBe('none');
    // The counterweight: a stylesheet that hid everything would pass the line
    // above and break every page on the internet.
    expect(found.ordinary).toBe('block');
    expect(found.copaceticGlobals).toEqual([]);
  }, 90_000);
});

// Hidden by the same user-origin stylesheet, so nothing in the page answers the banner or runs on its behalf.
describe('hiding cookie banners', () => {
  const bannerDisplay = `
    (() => {
      const banner = document.createElement('div');
      banner.id = 'onetrust-banner-sdk';
      document.body.appendChild(banner);
      return getComputedStyle(banner).display;
    })()
  `;

  it('hides a consent banner the cookie list names, and shows it once switched off', async () => {
    const hidden = await askPage<string>(bannerDisplay, '/?banners=on');

    await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ hideCookieBanners: false }));
    // Each look is a new tab, which is what picks up the switch: a page already open keeps the sheet it was given.
    let shown = '';
    await copacetic.until(async () => {
      shown = await askPage<string>(bannerDisplay, `/?banners=off&look=${Date.now()}`);
      return shown === 'block';
    }, 15_000);
    await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ hideCookieBanners: true }));

    expect(hidden).toBe('none');
    expect(shown).toBe('block');
  }, 120_000);
});
