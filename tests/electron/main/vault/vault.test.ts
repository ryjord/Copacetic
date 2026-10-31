import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

const { EMPTY_VAULT_FILE, Vault, reviveVaultFile } = await import('../../../../electron/main/vault/vault');
const { credentialsFromCsv, credentialsToCsv } = await import('../../../../electron/shared/passwords/credential-csv');
type VaultFile = import('../../../../electron/main/vault/vault').VaultFile;
type SecretStore = import('../../../../electron/main/vault/vault').SecretStore;

/** Stands in for the OS keychain. Reversible, and able to fail the way a real one does. */
function keychain(options: { available?: boolean; unreadable?: Set<string> } = {}): SecretStore {
  const unreadable = options.unreadable ?? new Set<string>();
  return {
    isAvailable: async () => options.available !== false,
    encrypt: async (plainText) => Buffer.from(`sealed:${plainText}`),
    decrypt: async (cipherText) => {
      const text = cipherText.toString();
      if (unreadable.has(text)) {
        throw new Error('the keychain refused this item');
      }
      if (!text.startsWith('sealed:')) {
        throw new Error('not something this keychain wrote');
      }
      return { result: text.slice('sealed:'.length), shouldReEncrypt: false };
    },
  };
}

/** Holds back sealing one text until released, so a test can change the vault while the keychain is still asked. */
function holdSealing(secrets: SecretStore, heldText: string) {
  let release = () => {};
  let markAsked = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const asked = new Promise<void>((resolve) => {
    markAsked = resolve;
  });
  const held: SecretStore = {
    ...secrets,
    encrypt: async (plainText) => {
      if (plainText === heldText) {
        markAsked();
        await released;
      }
      return secrets.encrypt(plainText);
    },
  };
  return { secrets: held, asked, release };
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
  it('stores it and hands back an id', async () => {
    const vault = new Vault(keychain(), storage(), now);
    const result = await vault.add({ origin: 'https://example.com', username: 'riley', password: 'hunter2' });
    expect(result).toHaveProperty('id');
    expect((await vault.state()).entries).toHaveLength(1);
  });

  // The stored form must not contain the password, or encrypting it was theatre.
  it('never writes the password in the clear', async () => {
    const store = storage();
    await new Vault(keychain(), store, now).add({
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
  it.each([
    ['there is no keychain', keychain({ available: false })],
    [
      'encrypting throws',
      {
        isAvailable: async () => true,
        encrypt: async () => {
          throw new Error('keychain locked');
        },
        decrypt: async () => ({ result: '', shouldReEncrypt: false }),
      } satisfies SecretStore,
    ],
  ])('refuses to save at all when %s', async (_name, secrets) => {
    const store = storage();
    const result = await new Vault(secrets, store, now).add({
      origin: 'https://example.com',
      username: 'riley',
      password: 'hunter2',
    });
    expect(result).toHaveProperty('error');
    expect(store.written().entries).toHaveLength(0);
  });

  it.each([
    ['no site', { origin: '  ', username: 'riley', password: 'hunter2' }],
    ['no password', { origin: 'https://example.com', username: 'riley', password: '' }],
  ])('refuses an entry with %s', async (_name, input) => {
    expect(await new Vault(keychain(), storage(), now).add(input)).toHaveProperty('error');
  });
});

describe('reading one back', () => {
  it('returns the password only when asked for it by id', async () => {
    const vault = new Vault(keychain(), storage(), now);
    const added = await vault.add({ origin: 'https://example.com', username: 'riley', password: 'hunter2' });
    expect(await vault.reveal((added as { id: string }).id)).toBe('hunter2');
  });

  // The pushed state is read continuously by the renderer; a password in it
  // would be in memory over there for as long as Settings is open.
  it('keeps passwords out of the listed state entirely', async () => {
    const vault = new Vault(keychain(), storage(), now);
    await vault.add({ origin: 'https://example.com', username: 'riley', password: 'hunter2' });
    expect(JSON.stringify(await vault.state())).not.toContain('hunter2');
  });

  it('returns nothing for an id that is not there', async () => {
    expect(await new Vault(keychain(), storage(), now).reveal('missing')).toBeNull();
  });
});

/**
 * The reason this class exists. On an unsigned build macOS can treat an updated
 * binary as a different application and refuse it the keychain entry, so
 * "nothing saved" and "saved but unreadable" are both real - and reporting the
 * first when the second is true tells someone their passwords are gone.
 */
describe('telling an empty vault from an unreadable one', () => {
  it('is ready and empty when nothing has been saved', async () => {
    const state = await new Vault(keychain(), storage(), now).state();
    expect(state.availability).toBe('ready');
    expect(state.entries).toHaveLength(0);
    expect(state.unreadableCount).toBe(0);
  });

  it('still lists entries whose secrets cannot be decrypted', async () => {
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
    const state = await new Vault(keychain({ unreadable: new Set(['sealed:hunter2']) }), store, now).state();

    expect(state.availability).toBe('unreadable');
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]?.isReadable).toBe(false);
    expect(state.unreadableCount).toBe(1);
    expect(state.detail).toContain('not been deleted');
  });

  it('says the keychain is missing rather than showing an empty list', async () => {
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
    const state = await new Vault(keychain({ available: false }), store, now).state();

    expect(state.availability).toBe('unavailable');
    expect(state.entries).toHaveLength(1);
    expect(state.unreadableCount).toBe(1);
    expect(state.detail.length).toBeGreaterThan(0);
  });

  // Losing the key must never look like a reason to delete the row.
  it('never drops an unreadable entry from storage', async () => {
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
    await new Vault(keychain({ unreadable: new Set(['sealed:hunter2']) }), store, now).state();
    expect(store.written().entries).toHaveLength(1);
  });
});

describe('changing and removing', () => {
  it('re-encrypts when the password changes', async () => {
    const store = storage();
    const vault = new Vault(keychain(), store, now);
    const { id } = (await vault.add({ origin: 'https://example.com', username: 'riley', password: 'old' })) as {
      id: string;
    };

    expect(await vault.update(id, { password: 'new' })).toBeNull();
    expect(await vault.reveal(id)).toBe('new');
    expect(JSON.stringify(store.written())).not.toContain('old');
  });

  it('leaves the password alone when only the username changes', async () => {
    const vault = new Vault(keychain(), storage(), now);
    const { id } = (await vault.add({ origin: 'https://example.com', username: 'riley', password: 'hunter2' })) as {
      id: string;
    };

    await vault.update(id, { username: 'someone-else' });
    expect(await vault.reveal(id)).toBe('hunter2');
    expect((await vault.state()).entries[0]?.username).toBe('someone-else');
  });

  it('moves updatedAt without touching createdAt', async () => {
    const vault = new Vault(keychain(), storage(), now);
    const { id } = (await vault.add({ origin: 'https://example.com', username: 'riley', password: 'hunter2' })) as {
      id: string;
    };
    const before = (await vault.state()).entries[0];

    await vault.update(id, { username: 'later' });
    const after = (await vault.state()).entries[0];
    expect(after?.createdAt).toBe(before?.createdAt);
    expect(after?.updatedAt).toBeGreaterThan(before?.updatedAt ?? 0);
  });

  it('reports an update to something that is gone', async () => {
    expect(await new Vault(keychain(), storage(), now).update('missing', { username: 'x' })).toHaveProperty('error');
  });

  it('removes an entry and forgets its secret', async () => {
    const store = storage();
    const vault = new Vault(keychain(), store, now);
    const { id } = (await vault.add({ origin: 'https://example.com', username: 'riley', password: 'hunter2' })) as {
      id: string;
    };

    vault.remove(id);
    expect((await vault.state()).entries).toHaveLength(0);
    expect(JSON.stringify(store.written())).not.toContain('hunter2');
    expect(await vault.reveal(id)).toBeNull();
  });
});

describe('reading the file back off disk', () => {
  it('refuses anything that is not a vault', async () => {
    for (const raw of [null, 42, 'text', {}, { entries: 'no' }]) {
      expect(reviveVaultFile(raw)).toBeNull();
    }
  });

  it('keeps well-formed entries', async () => {
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
  ])('drops an entry with %s', async (_name, entry) => {
    expect(reviveVaultFile({ version: 1, entries: [entry] })?.entries).toHaveLength(0);
  });
});

/**
 * "Everything lives on this machine" is honest, and on its own it is also
 * lock-in. Getting it back out is what makes the claim something a person can
 * act on rather than take on trust.
 */
describe('taking it all with you', () => {
  it('hands back every password it can read', async () => {
    const vault = new Vault(keychain(), storage(), now);
    await vault.add({ origin: 'https://a.test', username: 'one', password: 'first' });
    await vault.add({ origin: 'https://b.test', username: 'two', password: 'second' });

    const exported = await vault.exportAll();
    expect(exported.credentials).toEqual([
      { origin: 'https://a.test', username: 'one', password: 'first' },
      { origin: 'https://b.test', username: 'two', password: 'second' },
    ]);
    expect(exported.unreadable).toBe(0);
  });

  // Leaving it out quietly is how someone believes they took everything.
  it('counts what it could not decrypt rather than dropping it silently', async () => {
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
    const exported = await new Vault(keychain({ unreadable: new Set(['sealed:first']) }), store, now).exportAll();
    expect(exported.credentials).toEqual([]);
    expect(exported.unreadable).toBe(1);
  });

  // The file is only an exit if it comes back in: every awkward character, through the CSV, into a fresh vault.
  it('round trips through the CSV it writes into an empty vault', async () => {
    const original = new Vault(keychain(), storage(), now);
    const awkward = [
      { origin: 'https://a.test', username: 'one', password: 'comma, "quote" and\nline' },
      { origin: 'https://b.test:8443', username: '', password: 'no username' },
      { origin: 'https://c.test', username: 'tab\there', password: '  leading and trailing  ' },
    ];
    for (const credential of awkward) {
      await original.add(credential);
    }

    const csv = credentialsToCsv((await original.exportAll()).credentials);
    const { credentials, skipped } = credentialsFromCsv(csv);
    const restored = new Vault(keychain(), storage(), now);
    expect(skipped).toBe(0);
    expect((await restored.importMany(credentials)).added).toBe(awkward.length);
    expect((await restored.exportAll()).credentials).toEqual((await original.exportAll()).credentials);
  });

  it('exports nothing rather than failing when there is no keychain', async () => {
    const exported = await new Vault(keychain({ available: false }), storage(), now).exportAll();
    expect(exported.credentials).toEqual([]);
  });
});

describe('bringing passwords in', () => {
  it('adds ones it has never seen, treating a different username on the same site as a separate account', async () => {
    const vault = new Vault(keychain(), storage(), now);
    const result = await vault.importMany([
      { origin: 'https://a.test', username: 'one', password: 'first' },
      { origin: 'https://b.test', username: 'two', password: 'second' },
      { origin: 'https://a.test', username: 'three', password: 'third' },
    ]);
    expect(result).toEqual({ added: 3, updated: 0, skipped: 0 });
    expect((await vault.state()).entries).toHaveLength(3);
  });

  // Importing the same file twice should not leave two of everything.
  it('replaces the password on a site and username it already has', async () => {
    const vault = new Vault(keychain(), storage(), now);
    await vault.add({ origin: 'https://a.test', username: 'one', password: 'old' });

    const result = await vault.importMany([{ origin: 'https://a.test', username: 'one', password: 'new' }]);
    expect(result).toEqual({ added: 0, updated: 1, skipped: 0 });
    expect((await vault.state()).entries).toHaveLength(1);
    expect(await vault.reveal((await vault.state()).entries[0]?.id ?? '')).toBe('new');
  });

  it('counts rows it refused rather than reporting them as imported', async () => {
    const vault = new Vault(keychain(), storage(), now);
    const result = await vault.importMany([
      { origin: 'https://a.test', username: 'one', password: 'first' },
      { origin: '', username: 'two', password: 'second' },
      { origin: 'https://c.test', username: 'three', password: '' },
    ]);
    expect(result).toEqual({ added: 1, updated: 0, skipped: 2 });
  });

  it('imports nothing at all when there is no keychain', async () => {
    const store = storage();
    const result = await new Vault(keychain({ available: false }), store, now).importMany([
      { origin: 'https://a.test', username: 'one', password: 'first' },
    ]);
    expect(result.added).toBe(0);
    expect(store.written().entries).toHaveLength(0);
  });
});

/**
 * Enforced in the vault rather than the interface. A lock the renderer honours
 * and the vault does not is decoration - anything that can reach IPC walks
 * straight past it.
 */
describe('while the vault is locked', () => {
  const lockedVault = async () => {
    const store = storage();
    const open = new Vault(keychain(), store, now);
    const { id } = (await open.add({ origin: 'https://example.com', username: 'riley', password: 'hunter2' })) as {
      id: string;
    };
    return { id, vault: new Vault(keychain(), store, now, () => false) };
  };

  it('refuses to reveal a password', async () => {
    const { id, vault } = await lockedVault();
    expect(await vault.reveal(id)).toBeNull();
  });

  // Exporting is the largest reveal available, so it is behind the same lock.
  it('exports nothing, and says how many it is holding back', async () => {
    const { vault } = await lockedVault();
    expect(await vault.exportAll()).toEqual({ credentials: [], unreadable: 1 });
  });

  /*
   * Reading was behind the lock and destroying was not, which made the pane say
   * two things at once: it refused to show a password and offered to delete it
   * in the same row. Whoever cannot be trusted to read an entry cannot be
   * trusted to destroy one, and destroying is the half that cannot be undone.
   */
  it('refuses to remove a password, and says why', async () => {
    const { id, vault } = await lockedVault();
    expect(vault.remove(id)).toEqual({ error: 'Unlock the vault before removing a password.' });
    expect((await vault.state()).entries).toHaveLength(1);
  });

  // Overwriting a password nobody can read is losing it.
  it('refuses to change one', async () => {
    const { id, vault } = await lockedVault();
    expect(await vault.update(id, { password: 'something-else' })).toEqual({
      error: 'Unlock the vault before changing a password.',
    });
  });

  // An import updates entries that already exist, so it can overwrite too.
  it('imports nothing, and counts what it turned away', async () => {
    const { vault } = await lockedVault();
    const result = await vault.importMany([{ origin: 'https://example.com', username: 'riley', password: 'new' }]);
    expect(result).toEqual({ added: 0, updated: 0, skipped: 1 });
    expect((await vault.state()).entries).toHaveLength(1);
  });

  /*
   * The counterweight, and the line the lock is drawn on: adding a password
   * loses nothing and reveals nothing, so it is allowed. A lock that stopped
   * everything would just be a broken vault.
   */
  it('still lets a new password be added', async () => {
    const { vault } = await lockedVault();
    expect(await vault.add({ origin: 'https://new.example', username: 'a', password: 'b' })).toHaveProperty('id');
    expect((await vault.state()).entries).toHaveLength(2);
  });

  // Locked is not the same as gone: the list is how someone knows what is there.
  it('still lists what is saved', async () => {
    const { vault } = await lockedVault();
    expect((await vault.state()).entries).toHaveLength(1);
    expect((await vault.state()).entries[0]?.origin).toBe('https://example.com');
  });

  it('reveals again once unlocked', async () => {
    const store = storage();
    const open = new Vault(keychain(), store, now);
    const { id } = (await open.add({ origin: 'https://example.com', username: 'riley', password: 'hunter2' })) as {
      id: string;
    };

    let unlocked = false;
    const vault = new Vault(keychain(), store, now, () => unlocked);
    expect(await vault.reveal(id)).toBeNull();
    unlocked = true;
    expect(await vault.reveal(id)).toBe('hunter2');
  });
});

/**
 * Version 1 kept the site and username in the clear, so the file was a list of
 * every account someone had, readable by anything that could read the disk.
 */
describe('what the vault file says about an account', () => {
  it('names neither the site nor the username, and holds no password', async () => {
    const store = storage();
    await new Vault(keychain(), store, now).add({
      origin: 'https://bank.example',
      username: 'riley@home',
      password: 'hunter2',
    });
    const written = JSON.stringify(store.written());
    expect(written).not.toMatch(/bank\.example|riley@home|hunter2/);
    expect(store.written().version).toBe(2);
  });

  it('still lists the site and username to whoever can open them', async () => {
    const vault = new Vault(keychain(), storage(), now);
    await vault.add({ origin: 'https://bank.example', username: 'riley', password: 'hunter2' });
    expect((await vault.state()).entries.map((entry) => [entry.origin, entry.username])).toEqual([
      ['https://bank.example', 'riley'],
    ]);
  });
});

describe('a vault file from version 1', () => {
  const legacy = (secret = Buffer.from('sealed:hunter2').toString('base64')): VaultFile => ({
    version: 1,
    entries: [{ id: 'a', origin: 'https://bank.example', username: 'riley', secret, createdAt: 1, updatedAt: 1 }],
  });

  it('is sealed as soon as it is opened, keeping everything', async () => {
    const store = storage(legacy());
    const vault = new Vault(keychain(), store, now);
    const state = await vault.state();
    expect(JSON.stringify(store.written())).not.toMatch(/bank\.example|riley/);
    expect(store.written().version).toBe(2);
    expect(state.entries).toMatchObject([{ id: 'a', origin: 'https://bank.example', username: 'riley' }]);
    expect(await vault.reveal('a')).toBe('hunter2');
  });

  // Sealing needs only the site and username, so a password this machine cannot read is upgraded and kept too.
  it('seals an entry whose password cannot be read here, rather than losing it', async () => {
    const unreadableSecret = Buffer.from('sealed:locked-away');
    const store = storage(legacy(unreadableSecret.toString('base64')));
    const vault = new Vault(keychain({ unreadable: new Set([unreadableSecret.toString()]) }), store, now);
    const state = await vault.state();
    expect(store.written().entries).toHaveLength(1);
    expect(JSON.stringify(store.written())).not.toContain('bank.example');
    expect(state.unreadableCount).toBe(1);
  });

  it('is left exactly as it was where there is no keychain to seal it with', async () => {
    const before = legacy();
    const store = storage(before);
    const vault = new Vault(keychain({ available: false }), store, now);
    const state = await vault.state();
    expect(store.written()).toEqual(before);
    expect(state.entries).toHaveLength(1);
  });

  it('reads back through the reviver in either shape', async () => {
    const store = storage(legacy());
    await new Vault(keychain(), store, now).state();
    const revived = reviveVaultFile(JSON.parse(JSON.stringify(store.written())));
    expect(revived?.version).toBe(2);
    expect((await new Vault(keychain(), storage(revived ?? EMPTY_VAULT_FILE), now).state()).entries[0]?.origin).toBe(
      'https://bank.example',
    );
  });
});

describe('an entry this machine cannot open', () => {
  it('is kept and counted, not dropped or shown as some other site', async () => {
    const store = storage();
    await new Vault(keychain(), store, now).add({
      origin: 'https://bank.example',
      username: 'riley',
      password: 'hunter2',
    });
    const [sealed] = store.written().entries;
    const identity = 'identity' in sealed! ? Buffer.from(sealed.identity, 'base64').toString() : '';

    const vault = new Vault(keychain({ unreadable: new Set([identity]) }), store, now);
    const state = await vault.state();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({ origin: '', isReadable: false });
    expect(state.unreadableCount).toBe(1);
  });
});

// The async keychain can say a secret was sealed under a key it has since replaced; it is then sealed again.
describe('a keychain that has moved on to a newer key', () => {
  /** Opens anything sealed as "old:" and says it should be sealed again; seals everything new as "sealed:". */
  const rotatedKeychain = (): SecretStore => ({
    isAvailable: async () => true,
    encrypt: async (plainText) => Buffer.from(`sealed:${plainText}`),
    decrypt: async (cipherText) => {
      const text = cipherText.toString();
      const [, scheme, rest] = /^(old|sealed):([\s\S]*)$/.exec(text) ?? [];
      if (rest === undefined) {
        throw new Error('not something this keychain wrote');
      }
      return { result: rest, shouldReEncrypt: scheme === 'old' };
    },
  });
  const base64 = (text: string) => Buffer.from(text).toString('base64');

  it('seals the password and the site again under the new key, and reveals the same password', async () => {
    const store = storage({
      version: 2,
      entries: [
        {
          id: 'a',
          identity: base64(`old:${JSON.stringify({ origin: 'https://bank.example', username: 'riley' })}`),
          secret: base64('old:hunter2'),
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    const vault = new Vault(rotatedKeychain(), store, now);

    expect(await vault.reveal('a')).toBe('hunter2');
    expect((await vault.state()).entries[0]).toMatchObject({ origin: 'https://bank.example', isReadable: true });
    const [entry] = store.written().entries;
    expect(Buffer.from(entry?.secret ?? '', 'base64').toString()).toBe('sealed:hunter2');
    expect(entry && 'identity' in entry ? Buffer.from(entry.identity, 'base64').toString() : '').toMatch(/^sealed:/);
  });

  // Sealing again must not put back a password that was changed while the old one was being opened.
  it('leaves a password changed meanwhile alone', async () => {
    const store = storage({
      version: 2,
      entries: [
        {
          id: 'a',
          identity: base64(`sealed:${JSON.stringify({ origin: 'https://bank.example', username: 'riley' })}`),
          secret: base64('old:hunter2'),
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });
    const { secrets, release } = holdSealing(rotatedKeychain(), 'hunter2');
    const vault = new Vault(secrets, store, now);
    const revealing = vault.reveal('a');
    await vault.update('a', { password: 'changed' });
    release();
    expect(await revealing).toBe('hunter2');
    expect(Buffer.from(store.written().entries[0]?.secret ?? '', 'base64').toString()).toBe('sealed:changed');
  });
});

describe('a change that waits on the keychain', () => {
  // Writing the old entry back after the keychain answered would undo a removal made while it was asked.
  it('does not bring back an entry removed while it was being sealed', async () => {
    const store = storage();
    const { secrets, asked, release } = holdSealing(keychain(), 'new');
    const vault = new Vault(secrets, store, now);
    const { id } = (await vault.add({ origin: 'https://example.com', username: 'riley', password: 'old' })) as {
      id: string;
    };
    const updating = vault.update(id, { password: 'new' });
    await asked;
    vault.remove(id);
    release();
    expect(await updating).toHaveProperty('error');
    expect(store.written().entries).toHaveLength(0);
  });

  // Two saves at once both land: each reads the file only after its own sealing is done.
  it('keeps both of two passwords added at the same time', async () => {
    const vault = new Vault(keychain(), storage(), now);
    await Promise.all([
      vault.add({ origin: 'https://a.test', username: 'one', password: 'first' }),
      vault.add({ origin: 'https://b.test', username: 'two', password: 'second' }),
    ]);
    expect((await vault.state()).entries).toHaveLength(2);
  });
});
