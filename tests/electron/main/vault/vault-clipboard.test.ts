import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let board = '';
vi.mock('electron', () => ({
  clipboard: {
    writeText: (text: string) => {
      board = text;
    },
    readText: () => board,
    clear: () => {
      board = '';
    },
  },
}));

const { CLEAR_SECRET_AFTER_MS, clearCopiedSecret, copySecret } =
  await import('../../../../electron/main/vault/vault-clipboard');

beforeEach(() => {
  vi.useFakeTimers();
  board = '';
});
afterEach(() => vi.useRealTimers());

describe('a password on the clipboard', () => {
  it('is cleared after half a minute', () => {
    copySecret('hunter2');
    expect(board).toBe('hunter2');
    vi.advanceTimersByTime(CLEAR_SECRET_AFTER_MS);
    expect(board).toBe('');
  });

  // Copied since, so it is the person's: wiping it would lose what they meant to paste.
  it('leaves alone whatever was copied after it', () => {
    copySecret('hunter2');
    board = 'a note';
    vi.advanceTimersByTime(CLEAR_SECRET_AFTER_MS);
    expect(board).toBe('a note');
  });

  it('is cleared at once when the vault locks or the app quits', () => {
    copySecret('hunter2');
    clearCopiedSecret();
    expect(board).toBe('');
  });

  it('leaves a later copy alone when cleared early too', () => {
    copySecret('hunter2');
    board = 'a note';
    clearCopiedSecret();
    expect(board).toBe('a note');
  });
});
