import { describe, expect, it } from 'vitest';
import { describeLock, unlockMethodFor } from '../../../../electron/shared/passwords/vault-lock';

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
