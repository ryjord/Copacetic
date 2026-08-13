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
} from '../electron/shared/vault-lock';

const START = 1_000_000;

describe('locking and unlocking', () => {
  it('starts locked', () => {
    expect(isUnlocked(LOCKED, START)).toBe(false);
  });

  it('is unlocked immediately after unlocking', () => {
    expect(isUnlocked(unlock(LOCKED, START), START)).toBe(true);
  });

  it('stays unlocked until the timeout', () => {
    const state = unlock(LOCKED, START);
    expect(isUnlocked(state, START + DEFAULT_TIMEOUT_MS - 1)).toBe(true);
  });

  it('locks itself once the timeout passes', () => {
    const state = unlock(LOCKED, START);
    expect(isUnlocked(state, START + DEFAULT_TIMEOUT_MS)).toBe(false);
    expect(isUnlocked(state, START + DEFAULT_TIMEOUT_MS + 60_000)).toBe(false);
  });

  it('locks on demand', () => {
    expect(isUnlocked(lock(unlock(LOCKED, START)), START)).toBe(false);
  });

  /**
   * A clock that jumps backwards — a timezone change, an NTP correction, a
   * laptop waking — must fail closed. Treating a negative elapsed time as
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
  it('uses Touch ID on a Mac that has it', () => {
    expect(unlockMethodFor('darwin', true)).toBe('touch-id');
  });

  it.each([
    ['a Mac without Touch ID', 'darwin', false],
    ['Windows', 'win32', false],
    ['Windows even if something claims otherwise', 'win32', true],
    ['Linux', 'linux', false],
  ])('has nothing to ask with on %s', (_name, platform, canPrompt) => {
    expect(unlockMethodFor(platform, canPrompt)).toBe('none');
  });

  it('says plainly that a click is all it is, where that is true', () => {
    expect(describeLock('none')).toContain('single click');
    expect(describeLock('none')).toContain('nothing more');
  });

  // Even with Touch ID this is not protection of the file, and saying so is the
  // whole point of the sentence.
  it('does not claim Touch ID protects the file itself', () => {
    expect(describeLock('touch-id')).toContain('does not protect the file itself');
  });
});
