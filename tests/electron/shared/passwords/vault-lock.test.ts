import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMEOUT_MS,
  LOCKED,
  TIMEOUT_CHOICES_MS,
  describeLock,
  isUnlocked,
  lock,
  millisecondsUntilLock,
  touch,
  unlock,
  unlockMethodFor,
  withTimeout,
} from '../../../../electron/shared/passwords/vault-lock';

const START = 1_000_000;

describe('locking and unlocking', () => {
  it.each([
    ['starts locked', LOCKED, START, false],
    ['is unlocked immediately after unlocking', unlock(LOCKED, START), START, true],
    ['stays unlocked until the timeout', unlock(LOCKED, START), START + DEFAULT_TIMEOUT_MS - 1, true],
    ['locks itself once the timeout passes', unlock(LOCKED, START), START + DEFAULT_TIMEOUT_MS, false],
    ['stays locked well after the timeout', unlock(LOCKED, START), START + DEFAULT_TIMEOUT_MS + 60_000, false],
    ['locks on demand', lock(unlock(LOCKED, START)), START, false],
  ])('%s', (_caseName, state, now, expected) => {
    expect(isUnlocked(state, now)).toBe(expected);
  });

  /**
   * A clock that jumps backwards - a timezone change, an NTP correction, a
   * laptop waking - must fail closed. Treating a negative elapsed time as
   * "no time has passed" would leave the vault open indefinitely.
   */
  it('locks rather than unlocking forever when the clock goes backwards', () => {
    const state = unlock(LOCKED, START);
    expect(isUnlocked(state, START - 60_000)).toBe(false);
  });

  it('holds the lock open while the vault is being used', () => {
    let state = unlock(LOCKED, START);
    state = touch(state, START + DEFAULT_TIMEOUT_MS - 1000);
    expect(isUnlocked(state, START + DEFAULT_TIMEOUT_MS + 1000)).toBe(true);
  });

  // Otherwise a locked vault could be held open by activity that should have
  // required unlocking first.
  it('does not reopen a vault that has already locked', () => {
    const state = unlock(LOCKED, START);
    const late = touch(state, START + DEFAULT_TIMEOUT_MS + 1);
    expect(isUnlocked(late, START + DEFAULT_TIMEOUT_MS + 1)).toBe(false);
  });

  it('reports how long is left', () => {
    const state = unlock({ ...LOCKED, timeoutMs: 60_000 }, START);
    expect(millisecondsUntilLock(state, START)).toBe(60_000);
    expect(millisecondsUntilLock(state, START + 59_000)).toBe(1_000);
    expect(millisecondsUntilLock(state, START + 60_000)).toBe(0);
  });
});

describe('the timeout', () => {
  it.each(TIMEOUT_CHOICES_MS)('accepts the offered choice %i', (choice) => {
    expect(withTimeout(LOCKED, choice).timeoutMs).toBe(choice);
  });

  // A timeout from the renderer is a number the main process did not choose.
  it.each([0, -1, 1, Number.MAX_SAFE_INTEGER, Number.NaN])('refuses %s and keeps the default', (value) => {
    expect(withTimeout(LOCKED, value).timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
  });
});

/**
 * Electron can ask for Touch ID on macOS and has no equivalent for Windows
 * Hello. Claiming otherwise would be a promise the code cannot keep.
 */
describe('what this machine can actually ask', () => {
  it.each([
    ['a Mac that has Touch ID', 'darwin', true, 'touch-id'],
    ['a Mac without Touch ID', 'darwin', false, 'none'],
    ['Windows', 'win32', false, 'none'],
    ['Windows even if something claims otherwise', 'win32', true, 'none'],
    ['Linux', 'linux', false, 'none'],
  ])('asks with the right method on %s', (_caseName, platform, canPrompt, expected) => {
    expect(unlockMethodFor(platform, canPrompt)).toBe(expected);
  });

  /**
   * Observed on a real machine: the prompt asked for the login password rather
   * than a fingerprint. macOS decides which, and on an unsigned build it tends
   * to decide password - so promising a fingerprint makes the prompt someone
   * actually gets look like something has gone wrong.
   */
  it('does not promise a fingerprint specifically', () => {
    const detail = describeLock('touch-id');
    expect(detail).toContain('login password');
    expect(detail).not.toMatch(/until Touch ID confirms/);
  });
});
