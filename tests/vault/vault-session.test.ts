import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { VaultHost } from '../../electron/main/app/vault-session';

let dataDir = '';
vi.mock('electron', () => ({ app: { getPath: () => dataDir } }));

const { VaultSession } = await import('../../electron/main/app/vault-session');
const { DEFAULT_TIMEOUT_MS } = await import('../../electron/shared/vault-lock');

/** Reversible rather than encrypted: these tests are about the lock, not the cipher. */
function fakeHost(overrides: Partial<VaultHost> = {}): VaultHost {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (plainText) => Buffer.from(plainText, 'utf8'),
    decryptString: (cipherText) => cipherText.toString('utf8'),
    platform: 'darwin',
    canPromptTouchID: () => true,
    promptTouchID: async () => {},
    userDataPath: () => dataDir,
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
  it('is locked before anyone has unlocked it', () => {
    const { session } = setup();
    expect(session.isOpen()).toBe(false);
  });

  it('will not reveal a password while locked', () => {
    const { session } = setup();
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

  it('opens when the prompt is satisfied', async () => {
    const { session, onChanged } = setup();
    expect(await session.unlock()).toBe('');
    expect(session.isOpen()).toBe(true);
    expect(onChanged).toHaveBeenCalled();
  });

  // Nothing on the machine can vouch for you, so there is nobody to refuse.
  it('opens without a prompt where there is no prompt to give', async () => {
    const prompt = vi.fn();
    const { session } = setup({ platform: 'linux', canPromptTouchID: () => false, promptTouchID: prompt });

    expect(await session.unlock()).toBe('');
    expect(session.isOpen()).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('reveals a password once it is open', async () => {
    const { session } = setup();
    const { id } = session.vault.add({
      origin: 'https://example.com',
      username: 'ada',
      password: 'hunter2',
    }) as { id: string };

    await session.unlock();
    expect(session.vault.reveal(id)).toBe('hunter2');
  });

  it('locks again on request', async () => {
    const { session } = setup();
    await session.unlock();
    session.lock();
    expect(session.isOpen()).toBe(false);
  });
});

describe('an unlocked vault closes itself after a while', () => {
  it('locks once the timeout has passed', async () => {
    const { session } = setup();
    await session.unlock();

    clock = DEFAULT_TIMEOUT_MS + 1;
    expect(session.isOpen()).toBe(false);
  });

  // Reading a password is being present, so it should not be the thing that
  // runs the clock down while you are still working.
  it('is held open by using it', async () => {
    const { session } = setup();
    const { id } = session.vault.add({
      origin: 'https://example.com',
      username: 'ada',
      password: 'hunter2',
    }) as { id: string };
    await session.unlock();

    clock = DEFAULT_TIMEOUT_MS - 1000;
    expect(session.vault.reveal(id)).toBe('hunter2');

    // Past the original deadline, but not past a new one starting from that read.
    clock = DEFAULT_TIMEOUT_MS + 1000;
    expect(session.isOpen()).toBe(true);
  });

  it('is not held open by a read that happened after it had already closed', async () => {
    const { session } = setup();
    const { id } = session.vault.add({
      origin: 'https://example.com',
      username: 'ada',
      password: 'hunter2',
    }) as { id: string };
    await session.unlock();

    clock = DEFAULT_TIMEOUT_MS + 1;
    expect(session.vault.reveal(id)).toBeNull();
    expect(session.isOpen()).toBe(false);
  });
});

describe('what the honesty page is told', () => {
  it('reports the keychain as missing when there is none', () => {
    const { session } = setup({ isEncryptionAvailable: () => false });
    expect(session.facts().hasKeychain).toBe(false);
  });

  it('says nothing can vouch for you where nothing can', () => {
    const { session } = setup({ platform: 'linux', canPromptTouchID: () => false });
    expect(session.facts().canAskWhoYouAre).toBe(false);
    expect(session.lockInfo().method).toBe('none');
  });

  // Claiming a signature that was never bought would be the one lie on a page
  // whose whole point is not telling any.
  it('does not claim to be signed', () => {
    const { session } = setup();
    expect(session.facts().isSigned).toBe(false);
  });

  it('counts the entries actually stored', () => {
    const { session } = setup();
    session.vault.add({ origin: 'https://example.com', username: 'ada', password: 'hunter2' });
    expect(session.facts().entryCount).toBe(1);
  });

  it('points at the file it really writes', () => {
    const { session } = setup();
    expect(session.facts().filePath).toBe(path.join(dataDir, 'vault.json'));
  });
});
