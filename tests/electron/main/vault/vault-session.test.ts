import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { VaultHost } from '../../../../electron/main/vault/vault-session';

let dataDir = '';
vi.mock('electron', () => ({ app: { getPath: () => dataDir } }));

const { VaultSession } = await import('../../../../electron/main/vault/vault-session');

const A_DAY = 24 * 60 * 60 * 1000;

/** Reversible rather than encrypted: these tests are about the lock, not the cipher. */
function fakeHost(overrides: Partial<VaultHost> = {}): VaultHost {
  return {
    isEncryptionAvailable: () => true,
    storageBackend: () => null,
    encryptString: (plainText) => Buffer.from(plainText, 'utf8'),
    decryptString: (cipherText) => cipherText.toString('utf8'),
    platform: 'darwin',
    canPromptTouchID: () => true,
    promptTouchID: async () => {},
    profileDirectory: () => dataDir,
    ...overrides,
  };
}

let clock = 0;
const setup = (overrides: Partial<VaultHost> = {}) => {
  clock = 0;
  const onChanged = vi.fn();
  const session = new VaultSession(fakeHost(overrides), onChanged, () => clock);
  return { session, onChanged };
};

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'copacetic-vault-'));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('the vault starts locked', () => {
  it('is locked before anyone has unlocked it, and will not reveal a password while locked', () => {
    const { session } = setup();
    expect(session.isOpen()).toBe(false);

    const added = session.vault.add({ origin: 'https://example.com', username: 'ada', password: 'hunter2' });
    expect('id' in added).toBe(true);
    const id = (added as { id: string }).id;

    expect(session.vault.reveal(id)).toBeNull();
  });
});

describe('unlocking asks whoever the machine can ask', () => {
  it('stays locked when the prompt is refused', async () => {
    const { session, onChanged } = setup({
      promptTouchID: async () => {
        throw new Error('user cancelled');
      },
    });

    expect(await session.unlock()).toBe('Not unlocked.');
    expect(session.isOpen()).toBe(false);
    expect(onChanged).not.toHaveBeenCalled();
  });

  // Nothing on the machine can vouch for you, so there is nobody to refuse.
  it('opens without a prompt where there is no prompt to give', async () => {
    const prompt = vi.fn();
    const { session } = setup({ platform: 'linux', canPromptTouchID: () => false, promptTouchID: prompt });

    expect(await session.unlock()).toBe('');
    expect(session.isOpen()).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('opens when the prompt is satisfied, reveals a password, and locks again on request', async () => {
    const { session, onChanged } = setup();
    const { id } = session.vault.add({
      origin: 'https://example.com',
      username: 'ada',
      password: 'hunter2',
    }) as { id: string };

    expect(await session.unlock()).toBe('');
    expect(session.isOpen()).toBe(true);
    expect(onChanged).toHaveBeenCalled();
    expect(session.vault.reveal(id)).toBe('hunter2');

    session.lock();
    expect(session.isOpen()).toBe(false);
  });
});

// Asking again an hour into a session, for a vault you already opened, is friction that protects nothing.
describe('an unlocked vault stays open until it is locked or Copacetic quits', () => {
  it('is still open, and still reveals, a day later', async () => {
    const { session } = setup();
    const { id } = session.vault.add({
      origin: 'https://example.com',
      username: 'ada',
      password: 'hunter2',
    }) as { id: string };
    await session.unlock();

    clock = A_DAY;
    expect(session.isOpen()).toBe(true);
    expect(session.vault.reveal(id)).toBe('hunter2');
  });

  it('closes when locked, and stays closed however long passes', async () => {
    const { session } = setup();
    await session.unlock();
    session.lock();

    clock = A_DAY;
    expect(session.isOpen()).toBe(false);
  });

  // Quitting ends the process, and a new one starts from here.
  it('starts locked again in a new session', async () => {
    const first = setup();
    await first.session.unlock();

    const next = setup();
    expect(next.session.isOpen()).toBe(false);
  });
});

describe('what the honesty page is told', () => {
  it('reports the keychain as missing when there is none', () => {
    const { session } = setup({ isEncryptionAvailable: () => false });
    expect(session.facts().hasKeychain).toBe(false);
  });

  it('names the keychain, counts the entries stored, and points at the file it really writes', () => {
    const { session } = setup();
    session.vault.add({ origin: 'https://example.com', username: 'ada', password: 'hunter2' });
    expect(session.facts().keychainName).toBe('the macOS Keychain');
    expect(session.facts().entryCount).toBe(1);
    expect(session.facts().filePath).toBe(path.join(dataDir, 'vault.json'));

    const linux = setup({ platform: 'linux', storageBackend: () => 'gnome_libsecret' });
    expect(linux.session.facts().keychainName).toBe('GNOME Keyring');
  });

  // Chromium's fallback encrypts with a key every Chromium shares, which is no protection worth the name.
  it('refuses the Linux plain-text fallback even when it reports itself available, and says why', () => {
    const { session } = setup({
      platform: 'linux',
      storageBackend: () => 'basic_text',
      isEncryptionAvailable: () => true,
    });
    expect(session.facts().hasKeychain).toBe(false);
    expect(session.facts().keychainProblem).toContain('Start GNOME Keyring or KWallet');
    expect(session.vault.state()).toMatchObject({
      availability: 'unavailable',
      detail: expect.stringContaining('No keyring is running'),
    });
    expect(session.vault.add({ origin: 'https://example.com', username: 'ada', password: 'hunter2' })).toHaveProperty(
      'error',
    );
  });

  it('says nothing can vouch for you where nothing can', () => {
    const { session } = setup({ platform: 'linux', canPromptTouchID: () => false });
    expect(session.facts().canAskWhoYouAre).toBe(false);
    expect(session.lockInfo().method).toBe('none');
  });
});
