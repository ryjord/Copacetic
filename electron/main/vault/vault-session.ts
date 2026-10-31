// Libs
import path from 'node:path';

// Utils
import { type KeychainDescription, describeKeychain } from '../../shared/passwords/vault-keychain';
import { describeLock, unlockMethodFor } from '../../shared/passwords/vault-lock';
import { EMPTY_VAULT_FILE, Vault, type VaultFile, reviveVaultFile } from './vault';
import { PersistedFile } from '../data/persistence';
import { t } from '../../shared/i18n/translate';

// Types
import type { VaultFacts, VaultLock } from '../../shared/types';

/**
 * The parts of the machine the vault has to ask about: the keychain that holds
 * the key, and whoever can vouch that you are still the person who unlocked it.
 * Passed in rather than imported so the answers can be arranged in a test.
 */
export interface VaultHost {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  /** Which secret store Chromium chose; only Linux has a choice, so elsewhere null. */
  storageBackend(): string | null;
  encryptStringAsync(plainText: string): Promise<Buffer>;
  decryptStringAsync(cipherText: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
  platform: string;
  canPromptTouchID(): boolean;
  promptTouchID(reason: string): Promise<void>;
  profileDirectory(): string;
}

/**
 * Whether the vault is open, and everything that depends on the answer. The
 * lock is enforced here rather than in the chrome that draws it, because a lock
 * the renderer honours and the vault does not is decoration.
 */
export class VaultSession {
  readonly vault: Vault;
  private readonly file: PersistedFile<VaultFile>;
  // No idle timeout: once unlocked it stays open until it is locked or Copacetic quits.
  private isUnlocked = false;

  constructor(
    private readonly host: VaultHost,
    private readonly onChanged: () => void,
    private readonly now: () => number = Date.now,
  ) {
    this.file = new PersistedFile<VaultFile>('vault.json', () => EMPTY_VAULT_FILE, reviveVaultFile, {
      directory: this.host.profileDirectory(),
    });
    this.vault = new Vault(
      {
        isAvailable: async () => (await this.keychain()).problem === '',
        whyUnavailable: async () => (await this.keychain()).problem,
        encrypt: (plainText) => this.host.encryptStringAsync(plainText),
        decrypt: (cipherText) => this.host.decryptStringAsync(cipherText),
      },
      {
        get: () => this.file.get(),
        set: (next) => this.file.set(next),
      },
      this.now,
      () => this.isUnlocked,
    );
  }

  isOpen(): boolean {
    return this.isUnlocked;
  }

  private method() {
    return unlockMethodFor(this.host.platform, this.host.canPromptTouchID());
  }

  /** Whether there is a keychain to seal a password with, asked once rather than for all the facts. */
  async hasKeychain(): Promise<boolean> {
    return (await this.keychain()).problem === '';
  }

  async facts(): Promise<VaultFacts> {
    const keychain = await this.keychain();
    return {
      filePath: path.join(this.host.profileDirectory(), 'vault.json'),
      hasKeychain: keychain.problem === '',
      keychainName: keychain.name,
      keychainProblem: keychain.problem,
      canAskWhoYouAre: this.method() !== 'none',
      // No certificate is bought, so this is false everywhere until one is.
      isSigned: false,
      entryCount: this.vault.count(),
    };
  }

  // Asked each time: a keyring can start or stop while Copacetic runs.
  private async keychain(): Promise<KeychainDescription> {
    return describeKeychain(
      this.host.platform,
      this.host.storageBackend(),
      await this.host.isAsyncEncryptionAvailable(),
    );
  }

  lockInfo(): VaultLock {
    const method = this.method();
    return { isUnlocked: this.isOpen(), method, detail: describeLock(method) };
  }

  /** Asks the operating system where it can, and says so plainly where it cannot. */
  async unlock(): Promise<string> {
    if (this.method() === 'touch-id') {
      try {
        await this.host.promptTouchID(t('main.vault.touchIdReason'));
      } catch {
        // A refused or failed prompt leaves it locked. Saying "cancelled" would
        // be a guess; either way nothing was unlocked.
        return t('main.vault.notUnlocked');
      }
    }
    this.isUnlocked = true;
    this.onChanged();
    return '';
  }

  lock(): void {
    this.isUnlocked = false;
    this.onChanged();
  }

  flush(): void {
    this.file.flush();
  }
}

/** The machine events that say whoever unlocked the vault may no longer be the one in front of it. */
export const AWAY_EVENTS = ['lock-screen', 'suspend'] as const;

/**
 * Closes every open vault when the computer locks or sleeps. Passed the
 * monitor rather than importing it so a test can raise the events.
 */
export function lockWhenAway(
  monitor: { on(event: (typeof AWAY_EVENTS)[number], listener: () => void): unknown },
  sessions: () => VaultSession[],
): void {
  const lockOpen = () =>
    sessions()
      .filter((session) => session.isOpen())
      .forEach((session) => session.lock());
  AWAY_EVENTS.forEach((event) => monitor.on(event, lockOpen));
}
