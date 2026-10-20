import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let server: Server;

// Not a private name, so it is upgraded like any site on the internet would be.
const PLAIN_HOST = 'plain-only.example';

beforeAll(async () => {
  // Speaks only HTTP. An HTTPS connection to it fails the TLS handshake, which is
  // what a real site without a certificate does.
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<title>Plain page</title><p>served over http</p>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  copacetic = await SmokeApp.launch({ args: [`--host-resolver-rules=MAP ${PLAIN_HOST} 127.0.0.1:${port}`] });
  await copacetic.waitForReady();
});
afterAll(async () => {
  await copacetic?.close();
  await new Promise((resolve) => server?.close(resolve));
});

const tabNamed = () =>
  copacetic.chrome.evaluate(
    async (host) => (await window.copacetic.chrome.getState()).tabs.find((tab) => tab.url.includes(host)) ?? null,
    PLAIN_HOST,
  );

/**
 * HTTPS-First used to rewrite only typed addresses, and a site with no HTTPS
 * then failed with nothing to do about it. Now every page is upgraded, and a
 * failed upgrade offers the plain version, which loads only after the person
 * chooses it.
 */
describe('a site that has no HTTPS', () => {
  it('is tried over HTTPS first, and the failure offers HTTP instead of a dead end', async () => {
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), `http://${PLAIN_HOST}/page`);
    expect(
      await copacetic.waitForChrome(async () => {
        const tab = (await window.copacetic.chrome.getState()).tabs.find((candidate) =>
          candidate.url.includes('plain-only.example'),
        );
        return Boolean(tab?.error);
      }, 30_000),
    ).toBe(true);

    const failed = await tabNamed();
    expect(failed?.error?.url.startsWith('https://')).toBe(true);
    expect(failed?.error?.plainUrl).toBe(`http://${PLAIN_HOST}/page`);
  }, 120_000);

  it('loads over HTTP once the person chooses it', async () => {
    const failed = await tabNamed();
    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.continueOverHttp(id), failed!.id);
    expect(
      await copacetic.waitForChrome(async () => {
        const tab = (await window.copacetic.chrome.getState()).tabs.find((candidate) =>
          candidate.url.includes('plain-only.example'),
        );
        return tab?.title === 'Plain page' && !tab.error;
      }, 30_000),
    ).toBe(true);
    expect((await tabNamed())?.url).toBe(`http://${PLAIN_HOST}/page`);
  }, 120_000);
});
