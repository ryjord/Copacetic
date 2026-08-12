import { newId } from './persistence';
import type { CsvCredential } from '../shared/credential-csv';
import type { VaultEntry, VaultState } from '../shared/types';

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

/**
 * The distinction this class exists to preserve: a vault with nothing in it and
 * a vault whose secrets cannot be decrypted are different, and showing the
 * first when the second is true tells someone their passwords are gone.
 */
export class Vault {
  constructor(
    private readonly secrets: SecretStore,
    private readonly storage: VaultStorage,
    private readonly now: () => number = Date.now,
    /**
     * Enforced here rather than in the interface. A lock the renderer honours
     * and the vault does not is decoration.
     */
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

    let secret = '';
    try {
      secret = this.secrets.encrypt(password).toString('base64');
    } catch {
      // Never fall back to storing it in the clear.
      return { error: NO_KEYCHAIN };
    }

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

  update(id: string, changes: { origin?: string; username?: string; password?: string }): { error: string } | null {
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
      try {
        secret = this.secrets.encrypt(changes.password).toString('base64');
      } catch {
        return { error: NO_KEYCHAIN };
      }
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

  remove(id: string): void {
    const file = this.storage.get();
    this.storage.set({ ...file, entries: file.entries.filter((entry) => entry.id !== id) });
  }

  /** The only way a password leaves this process, one at a time and only when asked. */
  reveal(id: string): string | null {
    if (!this.isUnlocked()) {
      return null;
    }
    const entry = this.storage.get().entries.find((candidate) => candidate.id === id);
    if (!entry || !this.secrets.isAvailable()) {
      return null;
    }
    try {
      return this.secrets.decrypt(Buffer.from(entry.secret, 'base64'));
    } catch {
      return null;
    }
  }

  /**
   * Everything that can be decrypted, and a count of what cannot. A password
   * that will not decrypt cannot be written to a file, and leaving it out
   * quietly is how someone believes they took everything with them.
   */
  exportAll(): { credentials: CsvCredential[]; unreadable: number } {
    // The largest reveal there is, so it is behind the same lock.
    if (!this.isUnlocked()) {
      return { credentials: [], unreadable: this.storage.get().entries.length };
    }
    const credentials: CsvCredential[] = [];
    let unreadable = 0;

    for (const entry of this.storage.get().entries) {
      const password = this.reveal(entry.id);
      if (password === null) {
        unreadable += 1;
        continue;
      }
      credentials.push({ origin: entry.origin, username: entry.username, password });
    }

    return { credentials, unreadable };
  }

  /** A site and username already here has its password replaced rather than duplicated. */
  importMany(credentials: readonly CsvCredential[]): { added: number; updated: number; skipped: number } {
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
    try {
      this.secrets.decrypt(Buffer.from(entry.secret, 'base64'));
      return true;
    } catch {
      return false;
    }
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
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const candidate = raw as { entries?: unknown };
  if (!Array.isArray(candidate.entries)) {
    return null;
  }

  const entries = candidate.entries
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map((entry) => ({
      id: typeof entry.id === 'string' ? entry.id : newId(),
      origin: typeof entry.origin === 'string' ? entry.origin : '',
      username: typeof entry.username === 'string' ? entry.username : '',
      secret: typeof entry.secret === 'string' ? entry.secret : '',
      createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : 0,
      updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0,
    }))
    // An entry with no origin or no secret is not a password, and keeping it
    // would show a row that can never be used.
    .filter((entry) => entry.origin !== '' && entry.secret !== '');

  return { version: 1, entries };
}
