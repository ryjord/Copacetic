import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';
import { type LocalSite, startLocalSite } from './support/local-site';

let copacetic: SmokeApp;
let site: LocalSite;

// Public-looking names, so each is its own site to the cookie store; both are served by the local site.
const VISITED = 'http://visited.example';
const NOT_VISITED = 'http://not-visited.example';

beforeAll(async () => {
  site = await startLocalSite();
  const port = new URL(site.origin).port;
  copacetic = await SmokeApp.launch({
    args: [`--host-resolver-rules=MAP visited.example 127.0.0.1:${port}, MAP not-visited.example 127.0.0.1:${port}`],
  });
  await copacetic.waitForReady();
  await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ httpsFirst: false }));
});
afterAll(async () => {
  await copacetic?.close();
  await site?.close();
});

const cookieNames = () =>
  copacetic.main(async ({ session }) => {
    const all = await session.fromPartition('persist:copacetic-web').cookies.get({});
    return all.map((cookie) => `${(cookie.domain ?? '').replace(/^\./, '')}:${cookie.name}`).sort();
  });

const setCookie = (url: string, name: string) =>
  copacetic.main(
    async ({ session }, options) => {
      await session.fromPartition('persist:copacetic-web').cookies.set({
        url: options.url,
        name: options.name,
        value: 'kept',
        // Long-lived, like a sign-in: a ranged clear still takes it from a site visited in the range.
        expirationDate: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      });
    },
    { url, name },
  );

/**
 * Chromium keeps no time for a cookie, so "the last hour" cannot mean cookies
 * made in the last hour. Copacetic clears the cookies of the sites visited in
 * the range instead, which only the real cookie store can show working.
 */
describe('clearing cookies for a time range', () => {
  it('takes the cookies of a site visited in the range, and leaves a site that was not', async () => {
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), `${VISITED}/`);
    const isInHistory = await copacetic.until(
      async () =>
        (await copacetic.chrome.evaluate(() => window.copacetic.history.list(''))).entries.some((entry) =>
          entry.url.startsWith('http://visited.example'),
        ),
      15_000,
    );
    expect(isInHistory).toBe(true);
    await setCookie(`${VISITED}/`, 'signed_in');
    await setCookie(`${NOT_VISITED}/`, 'signed_in');
    expect(await cookieNames()).toEqual(['not-visited.example:signed_in', 'visited.example:signed_in']);

    await copacetic.chrome.evaluate(() =>
      window.copacetic.history.clear('hour', { history: true, siteData: true, cache: false }),
    );

    expect(await cookieNames()).toEqual(['not-visited.example:signed_in']);
  }, 90_000);
});
