import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { type Server, createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let server: Server;
/** What the tracker was sent with each request for its image, newest last. */
const cookiesSeenByTracker: string[] = [];

const PAGE = 'https://news.example.com/story';
const TRACKER = 'https://tracker.example.net/';

/**
 * Over HTTPS, and with SameSite=None, because anything else proves nothing:
 * Chromium already keeps a cookie with no SameSite to its own site, so over
 * plain HTTP the cookie never travelled whatever the setting said.
 */
const CROSS_SITE_COOKIE = 'Path=/; SameSite=None; Secure';

/** One certificate for both names, made fresh for this run. Null where openssl is not installed. */
function certificateForBothSites(): { key: string; cert: string } | null {
  const directory = mkdtempSync(path.join(tmpdir(), 'copacetic-cert-'));
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '1',
        '-subj',
        '/CN=news.example.com',
        '-addext',
        'subjectAltName=DNS:news.example.com,DNS:tracker.example.net',
        '-keyout',
        path.join(directory, 'key.pem'),
        '-out',
        path.join(directory, 'cert.pem'),
      ],
      { stdio: 'ignore' },
    );
    return {
      key: readFileSync(path.join(directory, 'key.pem'), 'utf8'),
      cert: readFileSync(path.join(directory, 'cert.pem'), 'utf8'),
    };
  } catch {
    return null;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const credentials = certificateForBothSites();

beforeAll(async () => {
  if (!credentials) {
    return;
  }
  server = createServer(credentials, (request, response) => {
    const host = request.headers.host ?? '';
    if (host.startsWith('tracker.') && request.url?.startsWith('/logo.gif')) {
      cookiesSeenByTracker.push(request.headers.cookie ?? '');
      response.writeHead(200, { 'content-type': 'image/gif', 'set-cookie': `pixel=again; ${CROSS_SITE_COOKIE}` });
      response.end();
      return;
    }
    if (host.startsWith('tracker.')) {
      // Visited directly, so this cookie is first-party and is kept.
      response.writeHead(200, { 'content-type': 'text/html', 'set-cookie': `visitor=known; ${CROSS_SITE_COOKIE}` });
      response.end('<title>Tracker home</title>');
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end(`<title>News</title><img src="${TRACKER}logo.gif?${Date.now()}">`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  copacetic = await SmokeApp.launch({
    args: [
      `--host-resolver-rules=MAP news.example.com 127.0.0.1:${port}, MAP tracker.example.net 127.0.0.1:${port}`,
      // The certificate is this run's own; what is being tested is cookies, not trust.
      '--ignore-certificate-errors',
    ],
  });
  await copacetic.waitForReady();
  // No tracker blocking, so the test is about cookies rather than a filter rule.
  await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ blockTrackers: false }));
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
describe.skipIf(!credentials)('a cookie from another site', () => {
  it('does not ride along with what a page loads from that site', async () => {
    expect(await loadPage()).toBe('');
  }, 90_000);

  // The counterweight: with blocking off the same request carries it, so the check above is about the setting.
  it('does when blocking is turned off', async () => {
    await copacetic.chrome.evaluate(() => window.copacetic.settings.update({ blockThirdPartyCookies: false }));
    expect(await loadPage()).toContain('visitor=known');
  }, 90_000);
});
