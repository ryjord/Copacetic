import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let server: Server;
/** What the tracker was sent with each request for its pixel, newest last. */
const cookiesSeenByTracker: string[] = [];

const PAGE = 'http://news.example.com/story';
const TRACKER = 'http://tracker.example.net/';

beforeAll(async () => {
  server = createServer((request, response) => {
    const host = request.headers.host ?? '';
    if (host.startsWith('tracker.') && request.url === '/pixel') {
      cookiesSeenByTracker.push(request.headers.cookie ?? '');
      response.writeHead(200, { 'content-type': 'image/gif', 'set-cookie': 'pixel=again; Path=/' });
      response.end();
      return;
    }
    if (host.startsWith('tracker.')) {
      // Visited directly, so this cookie is first-party and is kept.
      response.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'visitor=known; Path=/' });
      response.end('<title>Tracker home</title>');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<title>News</title><img src="${TRACKER}pixel?${Date.now()}">`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  copacetic = await SmokeApp.launch({
    args: [`--host-resolver-rules=MAP news.example.com 127.0.0.1:${port}, MAP tracker.example.net 127.0.0.1:${port}`],
  });
  await copacetic.waitForReady();
  // Plain http on purpose, so the test is about cookies rather than an upgrade.
  await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ httpsFirst: false }));
  await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), TRACKER);
  await copacetic.inOpenPage(TRACKER, 'document.readyState');
});
afterAll(async () => {
  await copacetic?.close();
  server?.close();
});

const until = async (condition: () => boolean, timeoutMs = 15_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
};

const loadPage = async () => {
  const before = cookiesSeenByTracker.length;
  await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), `${PAGE}?${Date.now()}`);
  expect(await until(() => cookiesSeenByTracker.length > before)).toBe(true);
  return cookiesSeenByTracker.at(-1);
};

/** Most tracking across sites is a cookie riding along with something a page loads from elsewhere. */
describe('a cookie from another site', () => {
  it('does not ride along with what a page loads from that site', async () => {
    expect(await loadPage()).toBe('');
  }, 90_000);

  // The counterweight: with blocking off the same request carries it, so the check above is about the setting.
  it('does when blocking is turned off', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ blockThirdPartyCookies: false }));
    expect(await loadPage()).toContain('visitor=known');
  }, 90_000);
});
