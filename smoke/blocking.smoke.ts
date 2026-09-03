import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForVisible();
  await copacetic.chrome.evaluate(() => window.copacetic.tabs.create('https://example.com'));
  await new Promise((resolve) => setTimeout(resolve, 4000));
});
afterAll(async () => copacetic?.close());

/** Asked from inside a real page, because that is the only place it is true. */
const askPage = <T>(expression: string): Promise<T> => copacetic.inPage<T>('https://example.com', expression);

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
   * with the lists switched off entirely — it is the floor, and it is here to
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
   * and not the first — so nothing but the shipped lists can refuse it, and a
   * release that failed to build or load them fails here and nowhere else.
   */
  it('refuses a tracker only the shipped lists know about', async () => {
    expect(await askPage(tryFetch('https://bat.bing.com/bat.js'))).toBe('refused');
    // And the blocker says it was the one who refused it. A rejected fetch on
    // its own proves nothing: an offline runner rejects too, and would make
    // every test here pass with blocking switched off.
    expect((await blockedCounts())['bat.bing.com']).toBeGreaterThan(0);
  }, 90_000);

  // The counterweight. A blocker that refused everything would pass both tests
  // above and be useless, and this is the only assertion that notices.
  it('allows an ordinary request', async () => {
    expect(await askPage(tryFetch('https://example.com/?ordinary=1'))).toBe('allowed');
  }, 90_000);

  /*
   * The switch has to switch. A blocker whose setting did nothing would look
   * identical from the outside — the refusals above would still pass — and the
   * only person who would find out is someone who turned it off to fix a broken
   * site and watched it stay broken.
   */
  it('stops refusing when blocking is switched off', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ blockTrackers: false }));
    await new Promise((resolve) => setTimeout(resolve, 800));
    const allowed = await askPage(tryFetch('https://www.google-analytics.com/analytics.js'));

    await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ blockTrackers: true }));
    await new Promise((resolve) => setTimeout(resolve, 800));
    const refused = await askPage(tryFetch('https://www.google-analytics.com/analytics.js'));

    expect(allowed).toBe('allowed');
    expect(refused).toBe('refused');
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
