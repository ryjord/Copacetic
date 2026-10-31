// Utils
import { asNumber, asString, isRecord, newId } from '../data/persistence';
import { t } from '../../shared/i18n/translate';
import { isKeychainAvailable, openText, sealText, whyKeychainUnavailable } from './sealing';

// Types
import type { CsvCredential } from '../../shared/passwords/credential-csv';
import type { VaultEntry, VaultState } from '../../shared/types';

/** The OS keychain, behind an interface so the rules above it can be tested without one. */
export interface SecretStore {
  isAvailable(): Promise<boolean>;
  /** Why it is not available, where the platform can say more than that. */
  whyUnavailable?(): Promise<string>;
  encrypt(plainText: string): Promise<Buffer>;
  /** `shouldReEncrypt`: sealed under a key the keychain has since replaced. */
  decrypt(cipherText: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
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

// A vault with nothing in it and one that cannot be decrypted are different states.
export class Vault {
  /** Sites and usernames already opened, keyed by what was sealed: the list shows them, so they are not secret here. */
  private readonly opened = new Map<string, Identity>();
  /** Ciphertexts that have opened on this machine; only positives, so a keychain that comes back is noticed. */
  private readonly knownReadable = new Set<string>();

  /** Every read and write waits for version 1's entries to be sealed, so none of them sees a half-upgraded file. */
  private readonly ready: Promise<void>;

  constructor(
    private readonly secrets: SecretStore,
    private readonly storage: VaultStorage,
    private readonly now: () => number = Date.now,
    // Enforced here, not just the interface - a lock the renderer honours and the vault does not is decoration.
    private readonly isUnlocked: () => boolean = () => true,
  ) {
    this.ready = this.sealLegacyEntries();
  }

  async state(): Promise<VaultState> {
    await this.ready;
    const stored = this.storage.get().entries;

    if (!(await this.isAvailable())) {
      // Every secret is unreadable, but they are all still there.
      return {
        availability: 'unavailable',
        detail: await this.unavailableReason(),
        entries: await Promise.all(stored.map((entry) => this.describe(entry, false))),
        unreadableCount: stored.length,
      };
    }

    const entries = await Promise.all(stored.map(async (entry) => this.describe(entry, await this.canRead(entry))));
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
  async add(input: {
    origin: string;
    username: string;
    password: string;
  }): Promise<{ id: string } | { error: string }> {
    await this.ready;
    if (!(await this.isAvailable())) {
      return { error: await this.unavailableReason() };
    }

    const origin = input.origin.trim();
    const password = input.password;
    if (!origin) {
      return { error: t('main.vault.errors.needsSite') };
    }
    if (!password) {
      return { error: t('main.vault.errors.nothingToSave') };
    }

    const encrypted = await this.encryptOrError(password);
    if ('error' in encrypted) {
      return encrypted;
    }
    const identity = await this.sealIdentity({ origin, username: input.username.trim() });
    if (identity === null) {
      return { error: await this.unavailableReason() };
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
  async update(
    id: string,
    changes: { origin?: string; username?: string; password?: string },
  ): Promise<{ error: string } | null> {
    await this.ready;
    if (!this.isUnlocked()) {
      return { error: t('main.vault.errors.unlockToChange') };
    }
    const existing = this.storage.get().entries.find((entry) => entry.id === id);
    if (!existing) {
      return { error: t('main.vault.errors.gone') };
    }

    let secret = existing.secret;
    if (changes.password !== undefined) {
      if (!(await this.isAvailable())) {
        return { error: await this.unavailableReason() };
      }
      if (!changes.password) {
        return { error: t('main.vault.errors.nothingToSave') };
      }
      const encrypted = await this.encryptOrError(changes.password);
      if ('error' in encrypted) {
        return encrypted;
      }
      secret = encrypted.secret;
    }

    const current = await this.identityOf(existing);
    if (!current) {
      return { error: t('main.vault.errors.unreadableToChange') };
    }
    const origin = changes.origin === undefined ? current.origin : changes.origin.trim();
    if (!origin) {
      return { error: t('main.vault.errors.needsSite') };
    }
    const identity = await this.sealIdentity({
      origin,
      username: changes.username === undefined ? current.username : changes.username.trim(),
    });
    if (identity === null) {
      return { error: await this.unavailableReason() };
    }

    const updated: SealedEntry = {
      id: existing.id,
      identity,
      secret,
      createdAt: existing.createdAt,
      updatedAt: this.now(),
    };

    // Read again after the keychain answered: it can have been removed meanwhile, and writing it back would undo that.
    const file = this.storage.get();
    if (!file.entries.some((entry) => entry.id === id)) {
      return { error: t('main.vault.errors.gone') };
    }
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
  async reveal(id: string): Promise<string | null> {
    await this.ready;
    if (!this.isUnlocked()) {
      return null;
    }
    const entry = this.storage.get().entries.find((candidate) => candidate.id === id);
    return entry ? this.decryptEntry(entry) : null;
  }

  // Leaving an undecryptable password out quietly is how someone believes they took everything.
  async exportAll(): Promise<{ credentials: CsvCredential[]; unreadable: number }> {
    await this.ready;
    // The largest reveal there is, so it is behind the same lock.
    if (!this.isUnlocked()) {
      return { credentials: [], unreadable: this.storage.get().entries.length };
    }
    const stored = this.storage.get().entries;
    const opened = await Promise.all(
      stored.map(async (entry) => ({
        password: await this.decryptEntry(entry),
        identity: await this.identityOf(entry),
      })),
    );
    const credentials = opened.flatMap(({ password, identity }): CsvCredential[] =>
      password === null || identity === null
        ? []
        : [{ origin: identity.origin, username: identity.username, password }],
    );

    return { credentials, unreadable: stored.length - credentials.length };
  }

  /** A site and username already here has its password replaced rather than duplicated. */
  // An import updates entries that already exist, so it can overwrite a password
  // nobody can currently read. Behind the lock for the same reason as update.
  async importMany(
    credentials: readonly CsvCredential[],
  ): Promise<{ added: number; updated: number; skipped: number }> {
    await this.ready;
    if (!this.isUnlocked()) {
      return { added: 0, updated: 0, skipped: credentials.length };
    }
    let added = 0;
    let updated = 0;
    let skipped = 0;

    // One at a time: a file can name the same site and username twice, and the second must find the first.
    for (const credential of credentials) {
      const existing = await this.entryFor(credential.origin.trim(), credential.username.trim());

      if (existing) {
        const failure = await this.update(existing.id, { password: credential.password });
        if (failure) {
          skipped += 1;
        } else {
          updated += 1;
        }
        continue;
      }

      const result = await this.add(credential);
      if ('error' in result) {
        skipped += 1;
      } else {
        added += 1;
      }
    }

    return { added, updated, skipped };
  }

  private async entryFor(origin: string, username: string): Promise<StoredEntry | undefined> {
    const stored = this.storage.get().entries;
    const identities = await Promise.all(stored.map((entry) => this.identityOf(entry)));
    return stored.find(
      (_entry, index) => identities[index]?.origin === origin && identities[index].username === username,
    );
  }

  /** Whether the secret decrypts, which is a different question from whether the vault is unlocked. */
  private async canRead(entry: StoredEntry): Promise<boolean> {
    // Asked for every entry on every list, so a secret that opened once is not decrypted again to say so.
    if (this.knownReadable.has(entry.secret)) {
      return true;
    }
    const isReadable = (await this.decryptEntry(entry)) !== null && (await this.identityOf(entry)) !== null;
    if (isReadable) {
      this.knownReadable.add(entry.secret);
    }
    return isReadable;
  }

  /** The site and username, opened once and remembered, or null where this machine cannot open them. */
  private async identityOf(entry: StoredEntry): Promise<Identity | null> {
    if (!isSealed(entry)) {
      return { origin: entry.origin, username: entry.username };
    }
    const remembered = this.opened.get(entry.identity);
    if (remembered) {
      return remembered;
    }
    const plainText = await this.open(entry.id, entry.identity);
    if (plainText === null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(plainText);
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

  private async sealIdentity(identity: Identity): Promise<string | null> {
    const sealed = await this.seal(JSON.stringify(identity));
    if (sealed !== null) {
      this.opened.set(sealed, identity);
    }
    return sealed;
  }

  /**
   * Seals what version 1 left in the clear, as soon as there is a keychain.
   *
   * Only the site and username are sealed, so an entry whose password this
   * machine cannot read is still upgraded and still kept. Without a keychain
   * nothing changes and nothing is dropped: the entries wait for one.
   */
  private async sealLegacyEntries(): Promise<void> {
    const legacy = this.storage.get().entries.filter((entry): entry is LegacyEntry => !isSealed(entry));
    if (legacy.length === 0 || !(await this.isAvailable())) {
      return;
    }
    const sealedIdentities = new Map(
      await Promise.all(
        legacy.map(async (entry): Promise<[string, string | null]> => [
          entry.id,
          await this.sealIdentity({ origin: entry.origin, username: entry.username }),
        ]),
      ),
    );
    // Read again: the file is only written once every seal has come back.
    const entries = this.storage.get().entries.map((entry): StoredEntry => {
      const identity = sealedIdentities.get(entry.id);
      return isSealed(entry) || !identity
        ? entry
        : { id: entry.id, identity, secret: entry.secret, createdAt: entry.createdAt, updatedAt: entry.updatedAt };
    });
    this.storage.set({ version: entries.every(isSealed) ? CURRENT_VERSION : 1, entries });
  }

  private async encryptOrError(password: string): Promise<{ secret: string } | { error: string }> {
    const secret = await this.seal(password);
    // Never fall back to storing it in the clear.
    return secret === null ? { error: await this.unavailableReason() } : { secret };
  }

  private decryptEntry(entry: StoredEntry): Promise<string | null> {
    return this.open(entry.id, entry.secret);
  }

  private seal(plainText: string): Promise<string | null> {
    return sealText(this.secrets, plainText);
  }

  /** Opens one sealed field of an entry, and seals it again where the keychain has moved on to a newer key. */
  private async open(entryId: string, sealed: string): Promise<string | null> {
    const opened = await openText(this.secrets, sealed);
    if (opened?.shouldReEncrypt) {
      await this.reseal(entryId, sealed, opened.result);
    }
    return opened?.result ?? null;
  }

  /** Swaps one sealed field for the same text under the keychain's current key, unless it was changed meanwhile. */
  private async reseal(entryId: string, was: string, plainText: string): Promise<void> {
    const resealed = await this.seal(plainText);
    if (resealed === null) {
      return;
    }
    const file = this.storage.get();
    const entries = file.entries.map((entry): StoredEntry => {
      if (entry.id !== entryId) {
        return entry;
      }
      if (entry.secret === was) {
        return { ...entry, secret: resealed };
      }
      return isSealed(entry) && entry.identity === was ? { ...entry, identity: resealed } : entry;
    });
    this.storage.set({ ...file, entries });
  }

  private isAvailable(): Promise<boolean> {
    return isKeychainAvailable(this.secrets);
  }

  private unavailableReason(): Promise<string> {
    return whyKeychainUnavailable(this.secrets);
  }

  /** The count alone, without attempting to decrypt anything - cheap enough for a status readout. */
  count(): number {
    return this.storage.get().entries.length;
  }

  private async describe(entry: StoredEntry, isReadable: boolean): Promise<VaultEntry> {
    // Unopenable on this machine: kept and counted, with nothing to say about which site it was for.
    const identity = (await this.identityOf(entry)) ?? { origin: '', username: '' };
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
