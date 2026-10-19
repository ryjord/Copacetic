import path from 'node:path';
import { type KeychainDescription, describeKeychain } from '../../shared/vault-keychain';
import type { VaultFacts, VaultLock } from '../../shared/types';
import {
  LOCKED,
  type LockState,
  describeLock,
  isUnlocked,
  lock,
  touch,
  unlock,
  unlockMethodFor,
} from '../../shared/vault-lock';
import { EMPTY_VAULT_FILE, Vault, type VaultFile, reviveVaultFile } from './vault';
import { PersistedFile } from '../data/persistence';

/**
 * The parts of the machine the vault has to ask about: the keychain that holds
 * the key, and whoever can vouch that you are still the person who unlocked it.
 * Passed in rather than imported so the answers can be arranged in a test.
 */
export interface VaultHost {
  isEncryptionAvailable(): boolean;
  /** Which secret store Chromium chose; only Linux has a choice, so elsewhere null. */
  storageBackend(): string | null;
  encryptString(plainText: string): Buffer;
  decryptString(cipherText: Buffer): string;
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
  private lockState: LockState = LOCKED;

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
        isAvailable: () => this.keychain().problem === '',
        whyUnavailable: () => this.keychain().problem,
        encrypt: (plainText) => this.host.encryptString(plainText),
        decrypt: (cipherText) => this.host.decryptString(cipherText),
      },
      {
        get: () => this.file.get(),
        set: (next) => this.file.set(next),
      },
      this.now,
      () => {
        const open = isUnlocked(this.lockState, this.now());
        if (open) {
          // Using it holds it open; reading one password should not start a countdown.
          this.lockState = touch(this.lockState, this.now());
        }
        return open;
      },
    );
  }

  isOpen(): boolean {
    return isUnlocked(this.lockState, this.now());
  }

  private method() {
    return unlockMethodFor(this.host.platform, this.host.canPromptTouchID());
  }

  facts(): VaultFacts {
    return {
      filePath: path.join(this.host.profileDirectory(), 'vault.json'),
      hasKeychain: this.keychain().problem === '',
      keychainName: this.keychain().name,
      keychainProblem: this.keychain().problem,
      canAskWhoYouAre: this.method() !== 'none',
      // No certificate is bought, so this is false everywhere until one is.
      isSigned: false,
      entryCount: this.vault.count(),
    };
  }

  // Asked each time: a keyring can start or stop while Copacetic runs.
  private keychain(): KeychainDescription {
    return describeKeychain(this.host.platform, this.host.storageBackend(), this.host.isEncryptionAvailable());
  }

  lockInfo(): VaultLock {
    const method = this.method();
    return { isUnlocked: this.isOpen(), method, detail: describeLock(method) };
  }

  /** Asks the operating system where it can, and says so plainly where it cannot. */
  async unlock(): Promise<string> {
    if (this.method() === 'touch-id') {
      try {
        await this.host.promptTouchID('unlock your saved passwords');
      } catch {
        // A refused or failed prompt leaves it locked. Saying "cancelled" would
        // be a guess; either way nothing was unlocked.
        return 'Not unlocked.';
      }
    }
    this.lockState = unlock(this.lockState, this.now());
    this.onChanged();
    return '';
  }

  lock(): void {
    this.lockState = lock(this.lockState);
    this.onChanged();
  }

  flush(): void {
    this.file.flush();
  }
}
