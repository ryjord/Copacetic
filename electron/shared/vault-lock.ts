/**
 * Locking the vault protects against someone at your screen. It does not
 * protect against someone with your disk, and saying otherwise would be the
 * kind of claim this browser exists not to make: the key is in the operating
 * system's keychain, and anything running as you can ask for it whether the
 * interface says locked or not.
 */

/** What this machine can actually do to check who you are. */
export type UnlockMethod = 'touch-id' | 'none';

export interface LockState {
  /** When the vault was last unlocked, or null if it is locked. */
  unlockedAt: number | null;
  timeoutMs: number;
}

export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
export const TIMEOUT_CHOICES_MS = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000] as const;

export const LOCKED: LockState = { unlockedAt: null, timeoutMs: DEFAULT_TIMEOUT_MS };

/**
 * Electron can ask for Touch ID on macOS and has no equivalent for Windows
 * Hello, so on every other platform there is nothing to ask with. That is
 * stated rather than papered over with a password of Copacetic's own, which
 * would be a lock this project rolled itself and got wrong.
 */
export function unlockMethodFor(platform: string, canPromptTouchID: boolean): UnlockMethod {
  return platform === 'darwin' && canPromptTouchID ? 'touch-id' : 'none';
}

/** What locking is worth on this machine, in the words shown to the user. */
export function describeLock(method: UnlockMethod): string {
  if (method === 'touch-id') {
    return 'Locking hides your passwords until Touch ID confirms it is you. It does not protect the file itself — anything running as you can still ask the keychain for it.';
  }
  return 'This machine has no way for Copacetic to check who you are, so unlocking here is a single click. It stops someone reading over your shoulder and nothing more.';
}

export function isUnlocked(state: LockState, now: number): boolean {
  if (state.unlockedAt === null) {
    return false;
  }
  // A clock that went backwards must lock, not unlock forever.
  const elapsed = now - state.unlockedAt;
  return elapsed >= 0 && elapsed < state.timeoutMs;
}

export function unlock(state: LockState, now: number): LockState {
  return { ...state, unlockedAt: now };
}

export function lock(state: LockState): LockState {
  return { ...state, unlockedAt: null };
}

/** Using the vault holds the lock open; reading one password should not start a countdown. */
export function touch(state: LockState, now: number): LockState {
  return isUnlocked(state, now) ? { ...state, unlockedAt: now } : state;
}

export function withTimeout(state: LockState, timeoutMs: number): LockState {
  const allowed = TIMEOUT_CHOICES_MS.includes(timeoutMs as (typeof TIMEOUT_CHOICES_MS)[number]);
  return { ...state, timeoutMs: allowed ? timeoutMs : DEFAULT_TIMEOUT_MS };
}

export function millisecondsUntilLock(state: LockState, now: number): number {
  if (!isUnlocked(state, now)) {
    return 0;
  }
  return Math.max(0, (state.unlockedAt ?? 0) + state.timeoutMs - now);
}
