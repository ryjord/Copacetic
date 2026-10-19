// Utils
import { asNumber, asString, isRecord, newId } from '../data/persistence';
import { t } from '../../shared/i18n/translate';

// Types
import type { CsvCredential } from '../../shared/credential-csv';
import type { VaultEntry, VaultState } from '../../shared/types';

/** The OS keychain, behind an interface so the rules above it can be tested without one. */
export interface SecretStore {
  isAvailable(): boolean;
  /** Why it is not available, where the platform can say more than that. */
  whyUnavailable?(): string;
  encrypt(plainText: string): Buffer;
  decrypt(cipherText: Buffer): string;
}

/** Which site a password is for and whose it is: as revealing as the password, for the list of accounts it makes. */
interface Identity {
  origin: string;
  username: string;
}

/** Version 2: the site and username sealed together, the password sealed on its own. */
interface SealedEntry {
  id: string;
  /** Base64 of the encrypted site and username. */
  identity: string;
  /** Base64 of the encrypted password. Encrypted per entry, so one unreadable secret is not all of them. */
  secret: string;
  createdAt: number;
  updatedAt: number;
}

/** Version 1 kept the site and username in the clear. Read, and sealed as soon as there is a keychain to seal with. */
interface LegacyEntry extends Identity {
  id: string;
  secret: string;
  createdAt: number;
  updatedAt: number;
}

type StoredEntry = SealedEntry | LegacyEntry;

export interface VaultFile {
  version: number;
  entries: StoredEntry[];
}

const CURRENT_VERSION = 2;

function isSealed(entry: StoredEntry): entry is SealedEntry {
  return 'identity' in entry;
}

export interface VaultStorage {
  get(): VaultFile;
  set(next: VaultFile): void;
}

export const EMPTY_VAULT_FILE: VaultFile = { version: CURRENT_VERSION, entries: [] };

const NO_KEYCHAIN = t('main.vault.keychain.none');

// A vault with nothing in it and one that cannot be decrypted are different states.
export class Vault {
  /** Sites and usernames already opened, keyed by what was sealed: the list shows them, so they are not secret here. */
  private readonly opened = new Map<string, Identity>();

  constructor(
    private readonly secrets: SecretStore,
    private readonly storage: VaultStorage,
    private readonly now: () => number = Date.now,
    // Enforced here, not just the interface - a lock the renderer honours and the vault does not is decoration.
    private readonly isUnlocked: () => boolean = () => true,
  ) {
    this.sealLegacyEntries();
  }

  state(): VaultState {
    const stored = this.storage.get().entries;

    if (!this.secrets.isAvailable()) {
      // Every secret is unreadable, but they are all still there.
      return {
        availability: 'unavailable',
        detail: this.secrets.whyUnavailable?.() || NO_KEYCHAIN,
        entries: stored.map((entry) => this.describe(entry, false)),
        unreadableCount: stored.length,
      };
    }

    const entries = stored.map((entry) => this.describe(entry, this.canRead(entry)));
    const unreadableCount = entries.filter((entry) => !entry.isReadable).length;

    if (unreadableCount > 0) {
      return {
        availability: 'unreadable',
        detail: t('main.vault.unreadable', { count: unreadableCount }),
        entries,
        unreadableCount,
      };
    }

    return { availability: 'ready', detail: '', entries, unreadableCount: 0 };
  }

  /** Returns the new entry's id, or a message explaining why nothing was saved. */
  add(input: { origin: string; username: string; password: string }): { id: string } | { error: string } {
    if (!this.secrets.isAvailable()) {
      return { error: this.secrets.whyUnavailable?.() || NO_KEYCHAIN };
    }

    const origin = input.origin.trim();
    const password = input.password;
    if (!origin) {
      return { error: t('main.vault.errors.needsSite') };
    }
    if (!password) {
      return { error: t('main.vault.errors.nothingToSave') };
    }

    const encrypted = this.encryptOrError(password);
    if ('error' in encrypted) {
      return encrypted;
    }
    const identity = this.sealIdentity({ origin, username: input.username.trim() });
    if (identity === null) {
      return { error: this.secrets.whyUnavailable?.() || NO_KEYCHAIN };
    }

    const timestamp = this.now();
    const entry: SealedEntry = {
      id: newId(),
      identity,
      secret: encrypted.secret,
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
      return { error: t('main.vault.errors.unlockToChange') };
    }
    const file = this.storage.get();
    const existing = file.entries.find((entry) => entry.id === id);
    if (!existing) {
      return { error: t('main.vault.errors.gone') };
    }

    let secret = existing.secret;
    if (changes.password !== undefined) {
      if (!this.secrets.isAvailable()) {
        return { error: this.secrets.whyUnavailable?.() || NO_KEYCHAIN };
      }
      if (!changes.password) {
        return { error: t('main.vault.errors.nothingToSave') };
      }
      const encrypted = this.encryptOrError(changes.password);
      if ('error' in encrypted) {
        return encrypted;
      }
      secret = encrypted.secret;
    }

    const current = this.identityOf(existing);
    if (!current) {
      return { error: t('main.vault.errors.unreadableToChange') };
    }
    const origin = changes.origin === undefined ? current.origin : changes.origin.trim();
    if (!origin) {
      return { error: t('main.vault.errors.needsSite') };
    }
    const identity = this.sealIdentity({
      origin,
      username: changes.username === undefined ? current.username : changes.username.trim(),
    });
    if (identity === null) {
      return { error: this.secrets.whyUnavailable?.() || NO_KEYCHAIN };
    }

    const updated: SealedEntry = {
      id: existing.id,
      identity,
      secret,
      createdAt: existing.createdAt,
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
   * - and destroying it is the half that cannot be undone.
   *
   * The lock is a soft one and this browser says so plainly elsewhere. That is
   * an argument about how much it is worth, not about which operations it
   * covers.
   */
  remove(id: string): { error: string } | null {
    if (!this.isUnlocked()) {
      return { error: t('main.vault.errors.unlockToRemove') };
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
      const identity = this.identityOf(entry);
      if (password === null || identity === null) {
        unreadable += 1;
        continue;
      }
      credentials.push({ origin: identity.origin, username: identity.username, password });
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
      const existing = this.storage.get().entries.find((entry) => {
        const identity = this.identityOf(entry);
        return identity?.origin === credential.origin.trim() && identity.username === credential.username.trim();
      });

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
    return this.decryptEntry(entry) !== null && this.identityOf(entry) !== null;
  }

  /** The site and username, opened once and remembered, or null where this machine cannot open them. */
  private identityOf(entry: StoredEntry): Identity | null {
    if (!isSealed(entry)) {
      return { origin: entry.origin, username: entry.username };
    }
    const remembered = this.opened.get(entry.identity);
    if (remembered) {
      return remembered;
    }
    if (!this.secrets.isAvailable()) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(this.secrets.decrypt(Buffer.from(entry.identity, 'base64')));
      if (!isRecord(parsed) || typeof parsed.origin !== 'string' || typeof parsed.username !== 'string') {
        return null;
      }
      const identity = { origin: parsed.origin, username: parsed.username };
      this.opened.set(entry.identity, identity);
      return identity;
    } catch {
      return null;
    }
  }

  private sealIdentity(identity: Identity): string | null {
    try {
      const sealed = this.secrets.encrypt(JSON.stringify(identity)).toString('base64');
      this.opened.set(sealed, identity);
      return sealed;
    } catch {
      return null;
    }
  }

  /**
   * Seals what version 1 left in the clear, as soon as there is a keychain.
   *
   * Only the site and username are sealed, so an entry whose password this
   * machine cannot read is still upgraded and still kept. Without a keychain
   * nothing changes and nothing is dropped: the entries wait for one.
   */
  private sealLegacyEntries(): void {
    const file = this.storage.get();
    if (!file.entries.some((entry) => !isSealed(entry)) || !this.secrets.isAvailable()) {
      return;
    }
    const entries = file.entries.map((entry): StoredEntry => {
      if (isSealed(entry)) {
        return entry;
      }
      const identity = this.sealIdentity({ origin: entry.origin, username: entry.username });
      return identity === null
        ? entry
        : { id: entry.id, identity, secret: entry.secret, createdAt: entry.createdAt, updatedAt: entry.updatedAt };
    });
    const isComplete = entries.every(isSealed);
    this.storage.set({ version: isComplete ? CURRENT_VERSION : 1, entries });
  }

  private encryptOrError(password: string): { secret: string } | { error: string } {
    try {
      return { secret: this.secrets.encrypt(password).toString('base64') };
    } catch {
      // Never fall back to storing it in the clear.
      return { error: this.secrets.whyUnavailable?.() || NO_KEYCHAIN };
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

  /** The count alone, without attempting to decrypt anything - cheap enough for a status readout. */
  count(): number {
    return this.storage.get().entries.length;
  }

  private describe(entry: StoredEntry, isReadable: boolean): VaultEntry {
    // Unopenable on this machine: kept and counted, with nothing to say about which site it was for.
    const identity = this.identityOf(entry) ?? { origin: '', username: '' };
    return {
      id: entry.id,
      origin: identity.origin,
      username: identity.username,
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

  const entries = raw.entries.filter(isRecord).flatMap((entry): StoredEntry[] => {
    const common = {
      id: typeof entry.id === 'string' ? entry.id : newId(),
      secret: asString(entry.secret),
      createdAt: asNumber(entry.createdAt),
      updatedAt: asNumber(entry.updatedAt),
    };
    // An entry with no secret, or nothing to say which site it is for, is not a password and would show a row that can never be used.
    if (!common.secret) {
      return [];
    }
    const identity = asString(entry.identity);
    if (identity) {
      return [{ ...common, identity }];
    }
    const origin = asString(entry.origin);
    return origin ? [{ ...common, origin, username: asString(entry.username) }] : [];
  });

  return { version: entries.every(isSealed) ? CURRENT_VERSION : 1, entries };
}
