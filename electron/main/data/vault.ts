import { asNumber, asString, isRecord, newId } from './persistence';
import type { CsvCredential } from '../../shared/credential-csv';
import type { VaultEntry, VaultState } from '../../shared/types';

/** The OS keychain, behind an interface so the rules above it can be tested without one. */
export interface SecretStore {
  isAvailable(): boolean;
  encrypt(plainText: string): Buffer;
  decrypt(cipherText: Buffer): string;
}

interface StoredEntry {
  id: string;
  origin: string;
  username: string;
  /** Base64 of the encrypted password. Encrypted per entry, so one unreadable secret is not all of them. */
  secret: string;
  createdAt: number;
  updatedAt: number;
}

export interface VaultFile {
  version: number;
  entries: StoredEntry[];
}

export interface VaultStorage {
  get(): VaultFile;
  set(next: VaultFile): void;
}

export const EMPTY_VAULT_FILE: VaultFile = { version: 1, entries: [] };

const NO_KEYCHAIN =
  'This machine has no keychain Copacetic can use, so there is nowhere safe to keep a password. Nothing has been saved.';

// A vault with nothing in it and one that cannot be decrypted are different states.
export class Vault {
  constructor(
    private readonly secrets: SecretStore,
    private readonly storage: VaultStorage,
    private readonly now: () => number = Date.now,
    // Enforced here, not just the interface — a lock the renderer honours and the vault does not is decoration.
    private readonly isUnlocked: () => boolean = () => true,
  ) {}

  state(): VaultState {
    const stored = this.storage.get().entries;

    if (!this.secrets.isAvailable()) {
      // Every secret is unreadable, but they are all still there.
      return {
        availability: 'unavailable',
        detail: NO_KEYCHAIN,
        entries: stored.map((entry) => this.describe(entry, false)),
        unreadableCount: stored.length,
      };
    }

    const entries = stored.map((entry) => this.describe(entry, this.canRead(entry)));
    const unreadableCount = entries.filter((entry) => !entry.isReadable).length;

    if (unreadableCount > 0) {
      return {
        availability: 'unreadable',
        detail: `${unreadableCount} of your saved passwords cannot be decrypted on this machine. They have not been deleted. This usually means the keychain no longer recognises this build of Copacetic.`,
        entries,
        unreadableCount,
      };
    }

    return { availability: 'ready', detail: '', entries, unreadableCount: 0 };
  }

  /** Returns the new entry's id, or a message explaining why nothing was saved. */
  add(input: { origin: string; username: string; password: string }): { id: string } | { error: string } {
    if (!this.secrets.isAvailable()) {
      return { error: NO_KEYCHAIN };
    }

    const origin = input.origin.trim();
    const password = input.password;
    if (!origin) {
      return { error: 'A password needs a site to belong to.' };
    }
    if (!password) {
      return { error: 'There is no password here to save.' };
    }

    const encrypted = this.encryptOrError(password);
    if ('error' in encrypted) {
      return encrypted;
    }
    const secret = encrypted.secret;

    const timestamp = this.now();
    const entry: StoredEntry = {
      id: newId(),
      origin,
      username: input.username.trim(),
      secret,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const file = this.storage.get();
    this.storage.set({ ...file, entries: [...file.entries, entry] });
    return { id: entry.id };
  }

  // Overwriting a password you cannot read is losing it, so this is behind the
  // lock too. Adding a new one is not: nothing is lost by it.
  update(id: string, changes: { origin?: string; username?: string; password?: string }): { error: string } | null {
    if (!this.isUnlocked()) {
      return { error: 'Unlock the vault before changing a password.' };
    }
    const file = this.storage.get();
    const existing = file.entries.find((entry) => entry.id === id);
    if (!existing) {
      return { error: 'That password is no longer here.' };
    }

    let secret = existing.secret;
    if (changes.password !== undefined) {
      if (!this.secrets.isAvailable()) {
        return { error: NO_KEYCHAIN };
      }
      if (!changes.password) {
        return { error: 'There is no password here to save.' };
      }
      const encrypted = this.encryptOrError(changes.password);
      if ('error' in encrypted) {
        return encrypted;
      }
      secret = encrypted.secret;
    }

    const origin = changes.origin === undefined ? existing.origin : changes.origin.trim();
    if (!origin) {
      return { error: 'A password needs a site to belong to.' };
    }

    const updated: StoredEntry = {
      ...existing,
      origin,
      username: changes.username === undefined ? existing.username : changes.username.trim(),
      secret,
      updatedAt: this.now(),
    };

    this.storage.set({ ...file, entries: file.entries.map((entry) => (entry.id === id ? updated : entry)) });
    return null;
  }

  /**
   * Deleting is behind the lock, like reading.
   *
   * It was not, and the two together made a strange promise: locked, the pane
   * refused to show you a password and offered to delete it in the same row.
   * Whoever cannot be trusted to read an entry cannot be trusted to destroy one
   * — and destroying it is the half that cannot be undone.
   *
   * The lock is a soft one and this browser says so plainly elsewhere. That is
   * an argument about how much it is worth, not about which operations it
   * covers.
   */
  remove(id: string): { error: string } | null {
    if (!this.isUnlocked()) {
      return { error: 'Unlock the vault before removing a password.' };
    }
    const file = this.storage.get();
    this.storage.set({ ...file, entries: file.entries.filter((entry) => entry.id !== id) });
    return null;
  }

  /** The only way a password leaves this process, one at a time and only when asked. */
  reveal(id: string): string | null {
    if (!this.isUnlocked()) {
      return null;
    }
    const entry = this.storage.get().entries.find((candidate) => candidate.id === id);
    return entry ? this.decryptEntry(entry) : null;
  }

  // Leaving an undecryptable password out quietly is how someone believes they took everything.
  exportAll(): { credentials: CsvCredential[]; unreadable: number } {
    // The largest reveal there is, so it is behind the same lock.
    if (!this.isUnlocked()) {
      return { credentials: [], unreadable: this.storage.get().entries.length };
    }
    const credentials: CsvCredential[] = [];
    let unreadable = 0;

    for (const entry of this.storage.get().entries) {
      const password = this.decryptEntry(entry);
      if (password === null) {
        unreadable += 1;
        continue;
      }
      credentials.push({ origin: entry.origin, username: entry.username, password });
    }

    return { credentials, unreadable };
  }

  /** A site and username already here has its password replaced rather than duplicated. */
  // An import updates entries that already exist, so it can overwrite a password
  // nobody can currently read. Behind the lock for the same reason as update.
  importMany(credentials: readonly CsvCredential[]): { added: number; updated: number; skipped: number } {
    if (!this.isUnlocked()) {
      return { added: 0, updated: 0, skipped: credentials.length };
    }
    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const credential of credentials) {
      const existing = this.storage
        .get()
        .entries.find(
          (entry) => entry.origin === credential.origin.trim() && entry.username === credential.username.trim(),
        );

      if (existing) {
        const failure = this.update(existing.id, { password: credential.password });
        if (failure) {
          skipped += 1;
        } else {
          updated += 1;
        }
        continue;
      }

      const result = this.add(credential);
      if ('error' in result) {
        skipped += 1;
      } else {
        added += 1;
      }
    }

    return { added, updated, skipped };
  }

  /** Whether the secret decrypts, which is a different question from whether the vault is unlocked. */
  private canRead(entry: StoredEntry): boolean {
    return this.decryptEntry(entry) !== null;
  }

  private encryptOrError(password: string): { secret: string } | { error: string } {
    try {
      return { secret: this.secrets.encrypt(password).toString('base64') };
    } catch {
      // Never fall back to storing it in the clear.
      return { error: NO_KEYCHAIN };
    }
  }

  private decryptEntry(entry: StoredEntry): string | null {
    if (!this.secrets.isAvailable()) {
      return null;
    }
    try {
      return this.secrets.decrypt(Buffer.from(entry.secret, 'base64'));
    } catch {
      return null;
    }
  }

  /** The count alone, without attempting to decrypt anything — cheap enough for a status readout. */
  count(): number {
    return this.storage.get().entries.length;
  }

  private describe(entry: StoredEntry, isReadable: boolean): VaultEntry {
    return {
      id: entry.id,
      origin: entry.origin,
      username: entry.username,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      isReadable,
    };
  }
}

export function reviveVaultFile(raw: unknown): VaultFile | null {
  if (!isRecord(raw) || !Array.isArray(raw.entries)) {
    return null;
  }

  const entries = raw.entries
    .filter(isRecord)
    .map((entry) => ({
      id: typeof entry.id === 'string' ? entry.id : newId(),
      origin: asString(entry.origin),
      username: asString(entry.username),
      secret: asString(entry.secret),
      createdAt: asNumber(entry.createdAt),
      updatedAt: asNumber(entry.updatedAt),
    }))
    // An entry with no origin or no secret is not a password, and keeping it
    // would show a row that can never be used.
    .filter((entry) => entry.origin !== '' && entry.secret !== '');

  return { version: 1, entries };
}
