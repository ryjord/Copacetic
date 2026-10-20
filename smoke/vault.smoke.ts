import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
let server: Server;
let signIn = '';
const PASSWORD = 'correct horse battery staple 7c1e';

beforeAll(async () => {
  // A sign-in form on a loopback address, the one kind of plain-HTTP page a password may be filled into.
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<title>Sign in</title><form><input name="user"><input type="password" name="pass"></form>');
  });
  await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
  signIn = `http://localhost:${(server.address() as AddressInfo).port}/`;
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => {
  await copacetic?.close();
  server?.close();
});

const add = () =>
  copacetic.chrome.evaluate(
    (password) => window.copacetic.vault.add({ origin: 'https://example.com', username: 'riley', password }),
    PASSWORD,
  );

/**
 * The vault's whole promise is about what is on disk, and only the real
 * keychain can keep it: a mock proves the code calls encrypt, not that the
 * file holds no password. CI only, because on a person's own machine the
 * keychain stops to ask, and a smoke run should never put a dialog in front of
 * anyone.
 */
describe.skipIf(process.env.CI !== 'true')('the password vault', () => {
  // A CI runner has no keyring, which is exactly the case the vault must refuse.
  it.runIf(process.platform === 'linux')('refuses to save with no keyring, and says why', async () => {
    const result = await add();
    expect(result).toEqual({ error: expect.stringContaining('No keyring is running') });
  });

  // Since version 2 the site and username are sealed too: which accounts exist is as revealing as their passwords.
  it.runIf(process.platform !== 'linux')('writes nothing it was given to disk in plain text', async () => {
    const result = await add();
    expect(result).toHaveProperty('id');
    const file = path.join(copacetic.profile, 'vault.json');
    expect(await copacetic.until(() => existsSync(file), 10_000)).toBe(true);
    const onDisk = readFileSync(file, 'utf8');
    expect(onDisk).not.toContain(PASSWORD);
    expect(onDisk).not.toContain('example.com');
    expect(onDisk).not.toContain('riley');
  });

  it.runIf(process.platform !== 'linux')('gives the password back only when asked for it by id', async () => {
    const state = await copacetic.chrome.evaluate(() => window.copacetic.vault.list());
    expect(JSON.stringify(state)).not.toContain(PASSWORD);
    const id = state.entries[0]?.id ?? '';
    // A CI machine has no Touch ID, so unlocking asks nobody.
    expect(await copacetic.chrome.evaluate(() => window.copacetic.vault.unlock())).toBe('');
    expect(await copacetic.chrome.evaluate((entryId) => window.copacetic.vault.reveal(entryId), id)).toBe(PASSWORD);
  });

  // The only script Copacetic puts in a page because someone asked, proved on a real form.
  it.runIf(process.platform !== 'linux')(
    'fills the saved password into the page it belongs to, when asked',
    async () => {
      const origin = signIn.slice(0, -1);
      await copacetic.chrome.evaluate(
        (entry) => window.copacetic.vault.add({ origin: entry.origin, username: 'riley', password: entry.password }),
        { origin, password: PASSWORD },
      );
      const tabId = await copacetic.chrome.evaluate((url) => window.copacetic.tabs.create(url), signIn);
      await copacetic.inOpenPage(signIn, 'document.readyState');
      expect(await copacetic.inOpenPage(signIn, 'document.querySelector("[name=pass]").value')).toBe('');
      await copacetic.chrome.evaluate((id) => window.copacetic.vault.fillForTab(id, 0, 0), tabId);
      const filled = () =>
        copacetic.inOpenPage<{ user: string; pass: string }>(
          signIn,
          '({ user: document.querySelector("[name=user]").value, pass: document.querySelector("[name=pass]").value })',
        );
      expect(await copacetic.until(async () => (await filled()).pass === PASSWORD, 10_000)).toBe(true);
      expect((await filled()).user).toBe('riley');
    },
  );
});
