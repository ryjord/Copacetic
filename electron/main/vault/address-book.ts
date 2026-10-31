// Utils
import { asNumber, asString, isRecord, newId } from '../data/persistence';
import {
  type AddressEntry,
  type AddressFields,
  addressLabel,
  isEmptyAddress,
  readAddressFields,
} from '../../shared/passwords/addresses';
import { t } from '../../shared/i18n/translate';

import { isKeychainAvailable, openText, sealText, whyKeychainUnavailable } from './sealing';

// Types
import type { SecretStore } from './vault';

/** One address, sealed whole: name, street and phone say as much about someone as a password does. */
interface SealedAddress {
  id: string;
  /** Base64 of the encrypted fields. */
  sealed: string;
  createdAt: number;
  updatedAt: number;
}

export interface AddressFile {
  version: number;
  addresses: SealedAddress[];
}

export const EMPTY_ADDRESS_FILE: AddressFile = { version: 1, addresses: [] };

export interface AddressStorage {
  get(): AddressFile;
  set(next: AddressFile): void;
}

/**
 * Addresses kept in the vault: sealed by the same keychain as the passwords
 * and behind the same lock, except that adding one is allowed while locked,
 * as adding a password is, since nothing is lost or shown by it.
 */
export class AddressBook {
  /** Opened once and remembered, as the vault remembers sites and usernames. */
  private readonly opened = new Map<string, AddressFields>();

  constructor(
    private readonly secrets: SecretStore,
    private readonly storage: AddressStorage,
    private readonly isUnlocked: () => boolean,
    private readonly now: () => number = Date.now,
  ) {}

  /** Every address by its label, to choose from; the fields themselves need the vault open. */
  async list(): Promise<AddressEntry[]> {
    return Promise.all(
      this.storage.get().addresses.map(async (address) => {
        const fields = await this.open(address);
        return {
          id: address.id,
          label: fields ? addressLabel(fields) : '',
          createdAt: address.createdAt,
          updatedAt: address.updatedAt,
          isReadable: fields !== null,
        };
      }),
    );
  }

  async add(input: unknown): Promise<{ id: string } | { error: string }> {
    const sealing = await this.sealed(input);
    if ('error' in sealing) {
      return sealing;
    }
    const timestamp = this.now();
    const address: SealedAddress = {
      id: newId(),
      sealed: sealing.sealed,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    // Read after the keychain answered, so two saves at once both land.
    const file = this.storage.get();
    this.storage.set({ ...file, addresses: [...file.addresses, address] });
    return { id: address.id };
  }

  /** The whole address, for filling or editing, only while the vault is open. */
  async fieldsOf(id: string): Promise<AddressFields | null> {
    if (!this.isUnlocked()) {
      return null;
    }
    const address = this.storage.get().addresses.find((candidate) => candidate.id === id);
    return address ? this.open(address) : null;
  }

  async update(id: string, input: unknown): Promise<{ error: string } | null> {
    if (!this.isUnlocked()) {
      return { error: t('main.addresses.errors.unlockToChange') };
    }
    const sealing = await this.sealed(input);
    if ('error' in sealing) {
      return sealing;
    }
    const { sealed } = sealing;
    const file = this.storage.get();
    if (!file.addresses.some((address) => address.id === id)) {
      return { error: t('main.addresses.errors.gone') };
    }
    this.storage.set({
      ...file,
      addresses: file.addresses.map((address) =>
        address.id === id ? { ...address, sealed, updatedAt: this.now() } : address,
      ),
    });
    return null;
  }

  remove(id: string): { error: string } | null {
    if (!this.isUnlocked()) {
      return { error: t('main.addresses.errors.unlockToRemove') };
    }
    const file = this.storage.get();
    this.storage.set({ ...file, addresses: file.addresses.filter((address) => address.id !== id) });
    return null;
  }

  count(): number {
    return this.storage.get().addresses.length;
  }

  private async open(address: SealedAddress): Promise<AddressFields | null> {
    const remembered = this.opened.get(address.sealed);
    if (remembered) {
      return remembered;
    }
    const opened = await openText(this.secrets, address.sealed);
    try {
      const fields = opened ? readAddressFields(JSON.parse(opened.result)) : null;
      if (fields) {
        this.opened.set(address.sealed, fields);
      }
      return fields;
    } catch {
      return null;
    }
  }

  /** The address sealed, or why it could not be: empty, or no keychain to seal it with. */
  private async sealed(input: unknown): Promise<{ fields: AddressFields; sealed: string } | { error: string }> {
    const fields = readAddressFields(input);
    if (isEmptyAddress(fields)) {
      return { error: t('main.addresses.errors.empty') };
    }
    const sealed = (await isKeychainAvailable(this.secrets))
      ? await sealText(this.secrets, JSON.stringify(fields))
      : null;
    if (sealed === null) {
      return { error: await whyKeychainUnavailable(this.secrets) };
    }
    this.opened.set(sealed, fields);
    return { fields, sealed };
  }
}

export function reviveAddressFile(raw: unknown): AddressFile | null {
  if (!isRecord(raw) || !Array.isArray(raw.addresses)) {
    return null;
  }
  const addresses = raw.addresses.filter(isRecord).flatMap((entry): SealedAddress[] => {
    const sealed = asString(entry.sealed);
    return sealed
      ? [
          {
            id: asString(entry.id) || newId(),
            sealed,
            createdAt: asNumber(entry.createdAt),
            updatedAt: asNumber(entry.updatedAt),
          },
        ]
      : [];
  });
  return { version: 1, addresses };
}
