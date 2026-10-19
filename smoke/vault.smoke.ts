import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SmokeApp } from './support/harness';

let copacetic: SmokeApp;
const PASSWORD = 'correct horse battery staple 7c1e';

beforeAll(async () => {
  copacetic = await SmokeApp.launch();
  await copacetic.waitForReady();
});
afterAll(async () => copacetic?.close());

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
});
