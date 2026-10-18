import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { type Server, createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmokeApp } from './support/harness';

const BAD_HOST = 'self-signed.example';

/** A certificate nobody signed, made fresh for this run. Null where openssl is not installed. */
function selfSignedCertificate(): { key: string; cert: string } | null {
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
        `/CN=${BAD_HOST}`,
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

const credentials = selfSignedCertificate();
let copacetic: SmokeApp;
let server: Server;

beforeAll(async () => {
  if (!credentials) {
    return;
  }
  server = createServer(credentials, (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<title>Behind a bad certificate</title>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  copacetic = await SmokeApp.launch({ args: [`--host-resolver-rules=MAP ${BAD_HOST} 127.0.0.1:${port}`] });
  await copacetic.waitForReady();
});
afterAll(async () => {
  await copacetic?.close();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)));
});

const theTab = () =>
  copacetic.chrome.evaluate(
    async (host) => (await window.copacetic.chrome.getState()).tabs.find((tab) => tab.url.includes(host)) ?? null,
    BAD_HOST,
  );

/**
 * A refused certificate was a dead end: no explanation of what to do and no way
 * forward, even to a self-signed box on an intranet. Now the page offers to
 * continue, for that certificate and that session, and the badge stops
 * calling the connection secure.
 */
describe.skipIf(!credentials)('a site whose certificate nobody signed', () => {
  it('is refused, and the error page may offer to continue', async () => {
    await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), `https://${BAD_HOST}/`);
    expect(
      await copacetic.waitForChrome(async () => {
        const state = await window.copacetic.chrome.getState();
        return Boolean(state.tabs.find((tab) => tab.url.includes('self-signed.example'))?.error);
      }, 30_000),
    ).toBe(true);
    const refused = await theTab();
    expect(refused?.error?.name.startsWith('ERR_CERT')).toBe(true);
    expect(refused?.error?.canAcceptCertificate).toBe(true);
  }, 120_000);

  it('loads once the person continues, and is not called secure', async () => {
    const refused = await theTab();
    await copacetic.chrome.evaluate((id) => window.copacetic.tabs.acceptCertificate(id), refused!.id);
    expect(
      await copacetic.waitForChrome(async () => {
        const state = await window.copacetic.chrome.getState();
        const tab = state.tabs.find((candidate) => candidate.url.includes('self-signed.example'));
        return tab?.title === 'Behind a bad certificate' && !tab.error;
      }, 30_000),
    ).toBe(true);
    expect((await theTab())?.security.level).toBe('insecure');
  }, 120_000);
});
