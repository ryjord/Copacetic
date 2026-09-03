import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

/** Cookies held for a host in the ordinary web session, counted from the main process. */
const cookiesFor = (domain: string) =>
  copacetic.main(async ({ session }, host) => {
    const all = await session.fromPartition('persist:copacetic-web').cookies.get({});
    return all.filter((cookie) => (cookie.domain ?? '').includes(host)).map((cookie) => cookie.name);
  }, domain);

const setCookie = (url: string, name: string) =>
  copacetic.main(
    async ({ session }, options) => {
      await session.fromPartition('persist:copacetic-web').cookies.set({
        url: options.url,
        name: options.name,
        value: 'signed-in',
      });
    },
    { url, name },
  );

/**
 * "Forget this site" cleared history, icons, certificates, zoom, permissions and
 * blocking exceptions, and did not touch the session — so the one thing someone
 * would check afterwards, whether they were still signed in, was untouched. The
 * method's own docstring said it removed everything the browser knew about the
 * site, and the menu item read "Forget example.com".
 *
 * A unit test cannot see this: the store has no session and the session is the
 * whole finding. So it is driven against the real one.
 */
describe('forgetting a site', () => {
  it('takes its cookies, which is what kept you signed in', async () => {
    await setCookie('https://example.com/', 'session_token');
    await setCookie('https://www.example.com/', 'preferences');
    expect((await cookiesFor('example.com')).sort()).toEqual(['preferences', 'session_token']);

    // Said before it happens: the warning has to name the cookies too, or it
    // understates the thing people care about and then reports it afterwards.
    const warned = await copacetic.chrome.evaluate(() =>
      window.copacetic.history.traces('https://www.example.com/anything'),
    );
    expect(warned.cookies).toBeGreaterThanOrEqual(2);

    const removed = await copacetic.chrome.evaluate(() => window.copacetic.history.forgetSite('https://example.com'));
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(await cookiesFor('example.com')).toEqual([]);
    // And it says how many went, rather than going quiet about it.
    expect(removed.cookies).toBeGreaterThanOrEqual(2);
  }, 120_000);

  /*
   * The counterweight. Clearing every cookie in the session would pass the test
   * above and silently sign the person out of everything they own.
   */
  it('leaves other sites signed in', async () => {
    await setCookie('https://keep-me.example/', 'session_token');
    await setCookie('https://example.org/', 'session_token');

    await copacetic.chrome.evaluate(() => window.copacetic.history.forgetSite('https://keep-me.example'));
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(await cookiesFor('keep-me.example')).toEqual([]);
    expect(await cookiesFor('example.org')).toEqual(['session_token']);
  }, 120_000);
});
