import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

const { EMPTY_VAULT_FILE, Vault, reviveVaultFile } = await import('../../electron/main/data/vault');
type VaultFile = import('../../electron/main/data/vault').VaultFile;
type SecretStore = import('../../electron/main/data/vault').SecretStore;

/** Stands in for the OS keychain. Reversible, and able to fail the way a real one does. */
function keychain(options: { available?: boolean; unreadable?: Set<string> } = {}): SecretStore {
  const unreadable = options.unreadable ?? new Set<string>();
  return {
    isAvailable: () => options.available !== false,
    encrypt: (plainText) => Buffer.from(`sealed:${plainText}`),
    decrypt: (cipherText) => {
      const text = cipherText.toString();
      if (unreadable.has(text)) {
        throw new Error('the keychain refused this item');
      }
      if (!text.startsWith('sealed:')) {
        throw new Error('not something this keychain wrote');
      }
      return text.slice('sealed:'.length);
    },
  };
}

function storage(initial: VaultFile = EMPTY_VAULT_FILE) {
  let value = initial;
  return {
    get: () => value,
    set: (next: VaultFile) => {
      value = next;
    },
    written: () => value,
  };
}

let clock = 1_000;
beforeEach(() => {
  clock = 1_000;
});
const now = () => (clock += 1);

describe('keeping a password', () => {
  it('stores it and hands back an id', () => {
    const vault = new Vault(keychain(), storage(), now);
    const result = vault.add({ origin: 'https://example.com', username: 'riley', password: 'hunter2' });
    expect(result).toHaveProperty('id');
    expect(vault.state().entries).toHaveLength(1);
  });

  // The stored form must not contain the password, or encrypting it was theatre.
  it('never writes the password in the clear', () => {
    const store = storage();
    new Vault(keychain(), store, now).add({
      origin: 'https://example.com',
      username: 'riley',
      password: 'correct-horse-battery-staple',
    });
    expect(JSON.stringify(store.written())).not.toContain('correct-horse-battery-staple');
  });

  /**
   * The one failure mode that must never be handled gracefully. Storing it
   * unencrypted because the keychain is missing would be worse than refusing,
   * and the user would have no way to know.
   */
  it('refuses to save at all when there is no keychain', () => {
    const store = storage();
    const result = new Vault(keychain({ available: false }), store, now).add({
      origin: 'https://example.com',
      username: 'riley',
      password: 'hunter2',
    });
    expect(result).toHaveProperty('error');
    expect(store.written().entries).toHaveLength(0);
  });

  it('refuses to save when encrypting throws', () => {
    const throwing: SecretStore = {
      isAvailable: () => true,
      encrypt: () => {
        throw new Error('keychain locked');
      },
      decrypt: () => '',
    };
    const store = storage();
    expect(new Vault(throwing, store, now).add({ origin: 'a', username: 'b', password: 'c' })).toHaveProperty(
      'error',
    );
    expect(store.written().entries).toHaveLength(0);
  });

  it.each([
    ['no site', { origin: '  ', username: 'riley', password: 'hunter2' }],
    ['no password', { origin: 'https://example.com', username: 'riley', password: '' }],
  ])('refuses an entry with %s', (_name, input) => {
    expect(new Vault(keychain(), storage(), now).add(input)).toHaveProperty('error');
  });
});

describe('reading one back', () => {
  it('returns the password only when asked for it by id', () => {
    const vault = new Vault(keychain(), storage(), now);
    const added = vault.add({ origin: 'https://example.com', username: 'riley', password: 'hunter2' });
    expect(vault.reveal((added as { id: string }).id)).toBe('hunter2');
  });

  // The pushed state is read continuously by the renderer; a password in it
  // would be in memory over there for as long as Settings is open.
  it('keeps passwords out of the listed state entirely', () => {
    const vault = new Vault(keychain(), storage(), now);
    vault.add({ origin: 'https://example.com', username: 'riley', password: 'hunter2' });
    expect(JSON.stringify(vault.state())).not.toContain('hunter2');
  });

  it('returns nothing for an id that is not there', () => {
    expect(new Vault(keychain(), storage(), now).reveal('missing')).toBeNull();
  });
});

/**
 * The reason this class exists. On an unsigned build macOS can treat an updated
 * binary as a different application and refuse it the keychain entry, so
 * "nothing saved" and "saved but unreadable" are both real — and reporting the
 * first when the second is true tells someone their passwords are gone.
 */
describe('telling an empty vault from an unreadable one', () => {
  it('is ready and empty when nothing has been saved', () => {
    const state = new Vault(keychain(), storage(), now).state();
    expect(state.availability).toBe('ready');
    expect(state.entries).toHaveLength(0);
    expect(state.unreadableCount).toBe(0);
  });

  it('still lists entries whose secrets cannot be decrypted', () => {
    const store = storage({
      version: 1,
      entries: [
        {
          id: 'a',
          origin: 'https://example.com',
          username: 'riley',
          secret: Buffer.from('sealed:hunter2').toString('base64'),
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    const state = new Vault(keychain({ unreadable: new Set(['sealed:hunter2']) }), store, now).state();

    expect(state.availability).toBe('unreadable');
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]?.isReadable).toBe(false);
    expect(state.unreadableCount).toBe(1);
    expect(state.detail).toContain('not been deleted');
  });

  it('says the keychain is missing rather than showing an empty list', () => {
    const store = storage({
      version: 1,
      entries: [
        {
          id: 'a',
          origin: 'https://example.com',
          username: 'riley',
          secret: 'whatever',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    const state = new Vault(keychain({ available: false }), store, now).state();

    expect(state.availability).toBe('unavailable');
    expect(state.entries).toHaveLength(1);
    expect(state.unreadableCount).toBe(1);
    expect(state.detail.length).toBeGreaterThan(0);
  });

  // Losing the key must never look like a reason to delete the row.
  it('never drops an unreadable entry from storage', () => {
    const store = storage({
      version: 1,
      entries: [
        {
          id: 'a',
          origin: 'https://example.com',
          username: 'riley',
          secret: Buffer.from('sealed:hunter2').toString('base64'),
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    new Vault(keychain({ unreadable: new Set(['sealed:hunter2']) }), store, now).state();
    expect(store.written().entries).toHaveLength(1);
  });
});

describe('changing and removing', () => {
  it('re-encrypts when the password changes', () => {
    const store = storage();
    const vault = new Vault(keychain(), store, now);
    const { id } = vault.add({ origin: 'https://example.com', username: 'riley', password: 'old' }) as { id: string };

    expect(vault.update(id, { password: 'new' })).toBeNull();
    expect(vault.reveal(id)).toBe('new');
    expect(JSON.stringify(store.written())).not.toContain('old');
  });

  it('leaves the password alone when only the username changes', () => {
    const vault = new Vault(keychain(), storage(), now);
    const { id } = vault.add({ origin: 'https://example.com', username: 'riley', password: 'hunter2' }) as {
      id: string;
    };

    vault.update(id, { username: 'someone-else' });
    expect(vault.reveal(id)).toBe('hunter2');
    expect(vault.state().entries[0]?.username).toBe('someone-else');
  });

  it('moves updatedAt without touching createdAt', () => {
    const vault = new Vault(keychain(), storage(), now);
    const { id } = vault.add({ origin: 'https://example.com', username: 'riley', password: 'hunter2' }) as {
      id: string;
    };
    const before = vault.state().entries[0];

    vault.update(id, { username: 'later' });
    const after = vault.state().entries[0];
    expect(after?.createdAt).toBe(before?.createdAt);
    expect(after?.updatedAt).toBeGreaterThan(before?.updatedAt ?? 0);
  });

  it('reports an update to something that is gone', () => {
    expect(new Vault(keychain(), storage(), now).update('missing', { username: 'x' })).toHaveProperty('error');
  });

  it('removes an entry and forgets its secret', () => {
    const store = storage();
    const vault = new Vault(keychain(), store, now);
    const { id } = vault.add({ origin: 'https://example.com', username: 'riley', password: 'hunter2' }) as {
      id: string;
    };

    vault.remove(id);
    expect(vault.state().entries).toHaveLength(0);
    expect(JSON.stringify(store.written())).not.toContain('hunter2');
    expect(vault.reveal(id)).toBeNull();
  });
});

describe('reading the file back off disk', () => {
  it('refuses anything that is not a vault', () => {
    for (const raw of [null, 42, 'text', {}, { entries: 'no' }]) {
      expect(reviveVaultFile(raw)).toBeNull();
    }
  });

  it('keeps well-formed entries', () => {
    const revived = reviveVaultFile({
      version: 1,
      entries: [
        { id: 'a', origin: 'https://example.com', username: 'riley', secret: 'x', createdAt: 1, updatedAt: 2 },
      ],
    });
    expect(revived?.entries).toHaveLength(1);
  });

  // A row with no secret can never be used and would only ever be a puzzle.
  it.each([
    [
      'no secret',
      { id: 'a', origin: 'https://example.com', username: 'riley', secret: '', createdAt: 1, updatedAt: 2 },
    ],
    ['no origin', { id: 'a', origin: '', username: 'riley', secret: 'x', createdAt: 1, updatedAt: 2 }],
  ])('drops an entry with %s', (_name, entry) => {
    expect(reviveVaultFile({ version: 1, entries: [entry] })?.entries).toHaveLength(0);
  });
});

/**
 * "Everything lives on this machine" is honest, and on its own it is also
 * lock-in. Getting it back out is what makes the claim something a person can
 * act on rather than take on trust.
 */
describe('taking it all with you', () => {
  it('hands back every password it can read', () => {
    const vault = new Vault(keychain(), storage(), now);
    vault.add({ origin: 'https://a.test', username: 'one', password: 'first' });
    vault.add({ origin: 'https://b.test', username: 'two', password: 'second' });

    const exported = vault.exportAll();
    expect(exported.credentials).toEqual([
      { origin: 'https://a.test', username: 'one', password: 'first' },
      { origin: 'https://b.test', username: 'two', password: 'second' },
    ]);
    expect(exported.unreadable).toBe(0);
  });

  // Leaving it out quietly is how someone believes they took everything.
  it('counts what it could not decrypt rather than dropping it silently', () => {
    const store = storage({
      version: 1,
      entries: [
        {
          id: 'a',
          origin: 'https://a.test',
          username: 'one',
          secret: Buffer.from('sealed:first').toString('base64'),
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    const exported = new Vault(keychain({ unreadable: new Set(['sealed:first']) }), store, now).exportAll();
    expect(exported.credentials).toEqual([]);
    expect(exported.unreadable).toBe(1);
  });

  it('exports nothing rather than failing when there is no keychain', () => {
    const exported = new Vault(keychain({ available: false }), storage(), now).exportAll();
    expect(exported.credentials).toEqual([]);
  });
});

describe('bringing passwords in', () => {
  it('adds ones it has never seen', () => {
    const vault = new Vault(keychain(), storage(), now);
    const result = vault.importMany([
      { origin: 'https://a.test', username: 'one', password: 'first' },
      { origin: 'https://b.test', username: 'two', password: 'second' },
    ]);
    expect(result).toEqual({ added: 2, updated: 0, skipped: 0 });
    expect(vault.state().entries).toHaveLength(2);
  });

  // Importing the same file twice should not leave two of everything.
  it('replaces the password on a site and username it already has', () => {
    const vault = new Vault(keychain(), storage(), now);
    vault.add({ origin: 'https://a.test', username: 'one', password: 'old' });

    const result = vault.importMany([{ origin: 'https://a.test', username: 'one', password: 'new' }]);
    expect(result).toEqual({ added: 0, updated: 1, skipped: 0 });
    expect(vault.state().entries).toHaveLength(1);
    expect(vault.reveal(vault.state().entries[0]?.id ?? '')).toBe('new');
  });

  it('treats a different username on the same site as a separate account', () => {
    const vault = new Vault(keychain(), storage(), now);
    vault.add({ origin: 'https://a.test', username: 'one', password: 'first' });
    expect(vault.importMany([{ origin: 'https://a.test', username: 'two', password: 'second' }]).added).toBe(1);
    expect(vault.state().entries).toHaveLength(2);
  });

  it('counts rows it refused rather than reporting them as imported', () => {
    const vault = new Vault(keychain(), storage(), now);
    const result = vault.importMany([
      { origin: 'https://a.test', username: 'one', password: 'first' },
      { origin: '', username: 'two', password: 'second' },
      { origin: 'https://c.test', username: 'three', password: '' },
    ]);
    expect(result).toEqual({ added: 1, updated: 0, skipped: 2 });
  });

  it('imports nothing at all when there is no keychain', () => {
    const store = storage();
    const result = new Vault(keychain({ available: false }), store, now).importMany([
      { origin: 'https://a.test', username: 'one', password: 'first' },
    ]);
    expect(result.added).toBe(0);
    expect(store.written().entries).toHaveLength(0);
  });
});

/**
 * Enforced in the vault rather than the interface. A lock the renderer honours
 * and the vault does not is decoration — anything that can reach IPC walks
 * straight past it.
 */
describe('while the vault is locked', () => {
  const lockedVault = () => {
    const store = storage();
    const open = new Vault(keychain(), store, now);
    const { id } = open.add({ origin: 'https://example.com', username: 'riley', password: 'hunter2' }) as {
      id: string;
    };
    return { id, vault: new Vault(keychain(), store, now, () => false) };
  };

  it('refuses to reveal a password', () => {
    const { id, vault } = lockedVault();
    expect(vault.reveal(id)).toBeNull();
  });

  // Exporting is the largest reveal available, so it is behind the same lock.
  it('exports nothing, and says how many it is holding back', () => {
    const { vault } = lockedVault();
    expect(vault.exportAll()).toEqual({ credentials: [], unreadable: 1 });
  });

  // Locked is not the same as gone: the list is how someone knows what is there.
  it('still lists what is saved', () => {
    const { vault } = lockedVault();
    expect(vault.state().entries).toHaveLength(1);
    expect(vault.state().entries[0]?.origin).toBe('https://example.com');
  });

  it('reveals again once unlocked', () => {
    const store = storage();
    const open = new Vault(keychain(), store, now);
    const { id } = open.add({ origin: 'https://example.com', username: 'riley', password: 'hunter2' }) as {
      id: string;
    };

    let unlocked = false;
    const vault = new Vault(keychain(), store, now, () => unlocked);
    expect(vault.reveal(id)).toBeNull();
    unlocked = true;
    expect(vault.reveal(id)).toBe('hunter2');
  });

  // Saving a password you just typed does not require unlocking; you already
  // have it in your hand.
  it('still accepts a new password', () => {
    const { vault } = lockedVault();
    expect(vault.add({ origin: 'https://new.test', username: 'x', password: 'y' })).toHaveProperty('id');
  });
});
