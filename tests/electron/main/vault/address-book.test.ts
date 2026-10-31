import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

const { AddressBook, EMPTY_ADDRESS_FILE, reviveAddressFile } =
  await import('../../../../electron/main/vault/address-book');
const { EMPTY_ADDRESS } = await import('../../../../electron/shared/passwords/addresses');
type AddressFile = import('../../../../electron/main/vault/address-book').AddressFile;
type SecretStore = import('../../../../electron/main/vault/vault').SecretStore;

/** Reversible rather than encrypted: these tests are about the lock and the file, not the cipher. */
const keychain = (available = true): SecretStore => ({
  isAvailable: async () => available,
  encrypt: async (plainText) => Buffer.from(`sealed:${plainText}`),
  decrypt: async (cipherText) => ({ result: cipherText.toString().slice('sealed:'.length), shouldReEncrypt: false }),
});

function storage(initial: AddressFile = EMPTY_ADDRESS_FILE) {
  let value = initial;
  return { get: () => value, set: (next: AddressFile) => (value = next), written: () => value };
}

const HOME = { ...EMPTY_ADDRESS, name: 'Riley Jordan', street: '1 High Street', postcode: 'BH1 1AA' };

describe('an address kept in the vault', () => {
  // A name, a street and a postcode say who and where someone is, so none of it is on disk in the clear.
  it('is sealed whole, and listed by its label', async () => {
    const store = storage();
    const book = new AddressBook(keychain(), store, () => false);
    expect(await book.add(HOME)).toHaveProperty('id');
    const written = JSON.stringify(store.written());
    expect(written).not.toMatch(/Riley|High Street|BH1/);
    expect((await book.list()).map((entry) => entry.label)).toEqual(['Riley Jordan, 1 High Street']);
  });

  // Adding loses and shows nothing, so it is allowed while locked, as adding a password is.
  it('can be added while the vault is locked, but not seen whole, changed or removed', async () => {
    const book = new AddressBook(keychain(), storage(), () => false);
    const added = await book.add(HOME);
    const id = 'id' in added ? added.id : '';
    expect(await book.fieldsOf(id)).toBeNull();
    expect(await book.update(id, { ...HOME, postcode: 'BH2 2BB' })).toHaveProperty('error');
    expect(book.remove(id)).toHaveProperty('error');
    expect(await book.list()).toHaveLength(1);
  });

  it('is seen whole, changed and removed once the vault is open', async () => {
    const book = new AddressBook(keychain(), storage(), () => true);
    const added = await book.add(HOME);
    const id = 'id' in added ? added.id : '';
    expect(await book.update(id, { ...HOME, postcode: 'BH2 2BB' })).toBeNull();
    expect((await book.fieldsOf(id))?.postcode).toBe('BH2 2BB');
    expect(book.remove(id)).toBeNull();
    expect(await book.list()).toEqual([]);
  });

  it('refuses an empty address, and one there is no keychain to seal', async () => {
    expect(await new AddressBook(keychain(), storage(), () => true).add(EMPTY_ADDRESS)).toHaveProperty('error');
    const store = storage();
    expect(await new AddressBook(keychain(false), store, () => true).add(HOME)).toHaveProperty('error');
    expect(store.written().addresses).toHaveLength(0);
  });

  // Only strings, trimmed and bounded, get in: a renderer cannot slip anything else into the vault.
  it('keeps only the parts of an address it knows, as text', async () => {
    const book = new AddressBook(keychain(), storage(), () => true);
    const added = await book.add({ ...HOME, name: '  Riley  ', extra: 'nope', city: 42 });
    const fields = await book.fieldsOf('id' in added ? added.id : '');
    expect(fields).toMatchObject({ name: 'Riley', city: '' });
    expect(fields).not.toHaveProperty('extra');
  });

  it('reads back only entries that hold something sealed', () => {
    expect(
      reviveAddressFile({ addresses: [{ id: 'a', sealed: 'x', createdAt: 1, updatedAt: 2 }, { id: 'b' }, 7] })
        ?.addresses,
    ).toEqual([{ id: 'a', sealed: 'x', createdAt: 1, updatedAt: 2 }]);
    expect(reviveAddressFile({ nope: true })).toBeNull();
  });
});
