import { t } from '../i18n/translate';

// Protects against someone at your screen, not someone with your disk - the key lives in the OS keychain.

/** What this machine can actually do to check who you are. */
export type UnlockMethod = 'touch-id' | 'none';

// Only macOS Touch ID exists here - stated plainly rather than papered over with a password of Copacetic's own.
export function unlockMethodFor(platform: string, canPromptTouchID: boolean): UnlockMethod {
  return platform === 'darwin' && canPromptTouchID ? 'touch-id' : 'none';
}

/** What locking is worth on this machine, in the words shown to the user. */
export function describeLock(method: UnlockMethod): string {
  if (method === 'touch-id') {
    return t('main.vault.lock.touchId');
  }
  return t('main.vault.lock.none');
}
