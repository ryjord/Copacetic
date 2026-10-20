import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let board = '';
// Electron 44's clipboard answers reads and writes asynchronously; clear stays synchronous.
const readText = vi.fn(async () => board);
vi.mock('electron', () => ({
  clipboard: {
    writeText: async (text: string) => {
      board = text;
    },
    readText: () => readText(),
    clear: () => {
      board = '';
    },
  },
}));

// Answers when the test says so, as osascript does a moment after it is asked.
let finishConcealed: (isWritten: boolean) => void = () => {};
const writeConcealed = vi.fn(async (_secret: string) => false);
vi.mock('../../../../electron/main/vault/concealed-clipboard', () => ({
  writeConcealed: (secret: string) => writeConcealed(secret),
}));

const { CLEAR_SECRET_AFTER_MS, READ_BACK_TIMEOUT_MS, clearCopiedSecret, clearCopiedSecretBeforeQuit, copySecret } =
  await import('../../../../electron/main/vault/vault-clipboard');

beforeEach(async () => {
  vi.useFakeTimers();
  await clearCopiedSecret();
  board = '';
  readText.mockImplementation(async () => board);
  writeConcealed.mockImplementation(async () => false);
});
afterEach(() => vi.useRealTimers());

describe('a password on the clipboard', () => {
  it('is cleared after half a minute', async () => {
    await copySecret('hunter2');
    expect(board).toBe('hunter2');
    await vi.advanceTimersByTimeAsync(CLEAR_SECRET_AFTER_MS);
    expect(board).toBe('');
  });

  // Copied since, so it is the person's: wiping it would lose what they meant to paste.
  it('leaves alone whatever was copied after it', async () => {
    await copySecret('hunter2');
    board = 'a note';
    await vi.advanceTimersByTimeAsync(CLEAR_SECRET_AFTER_MS);
    expect(board).toBe('a note');
  });

  it('is cleared at once when the vault locks', async () => {
    await copySecret('hunter2');
    await clearCopiedSecret();
    expect(board).toBe('');
  });

  it('leaves a later copy alone when cleared early too', async () => {
    await copySecret('hunter2');
    board = 'a note';
    await clearCopiedSecret();
    expect(board).toBe('a note');
  });

  it('is written concealed where the system can mark it, and not again as plain text', async () => {
    writeConcealed.mockImplementation(async (secret) => {
      board = secret;
      return true;
    });
    await copySecret('hunter2');
    expect(writeConcealed).toHaveBeenCalledWith('hunter2');
    expect(board).toBe('hunter2');
  });

  // The vault can lock in the moment the concealed write takes, before there was anything to clear.
  it('is cleared as it lands when the vault locked while it was being written', async () => {
    writeConcealed.mockImplementation(
      (secret) =>
        new Promise((resolve) => {
          finishConcealed = (isWritten) => {
            board = secret;
            resolve(isWritten);
          };
        }),
    );
    const copying = copySecret('hunter2');
    await clearCopiedSecret();
    finishConcealed(true);
    await copying;
    expect(board).toBe('');
  });

  // Quitting cannot wait for a read back, so it clears whatever is there while the half minute runs.
  it('is cleared at once on quit, without reading the clipboard back', async () => {
    await copySecret('hunter2');
    readText.mockClear();
    clearCopiedSecretBeforeQuit();
    expect(board).toBe('');
    expect(readText).not.toHaveBeenCalled();
  });

  it('leaves the clipboard alone on quit once the half minute is over', async () => {
    await copySecret('hunter2');
    await vi.advanceTimersByTimeAsync(CLEAR_SECRET_AFTER_MS);
    board = 'a note';
    clearCopiedSecretBeforeQuit();
    expect(board).toBe('a note');
  });

  // The lock took the password and is still reading the clipboard back when the app quits.
  it('is cleared on quit while an earlier clear is still reading back', async () => {
    await copySecret('hunter2');
    readText.mockImplementationOnce(() => new Promise<string>(() => {}));
    const clearing = clearCopiedSecret();
    clearCopiedSecretBeforeQuit();
    expect(board).toBe('');
    await vi.advanceTimersByTimeAsync(READ_BACK_TIMEOUT_MS);
    await clearing;
  });

  it('is cleared anyway when the clipboard refuses the read back', async () => {
    await copySecret('hunter2');
    readText.mockImplementation(async () => {
      throw new Error('refused');
    });
    await clearCopiedSecret();
    expect(board).toBe('');
  });

  // The lock's read back is still out when another password is copied; that one is what the person wants.
  it('keeps a password copied while an earlier one was being cleared', async () => {
    await copySecret('hunter2');
    let answerRead: (text: string) => void = () => {};
    readText.mockImplementationOnce(() => new Promise<string>((resolve) => (answerRead = resolve)));
    const clearing = clearCopiedSecret();
    await copySecret('correct horse');
    answerRead('hunter2');
    await clearing;
    expect(board).toBe('correct horse');
  });

  it('is cleared anyway when the clipboard never answers the read back', async () => {
    await copySecret('hunter2');
    readText.mockImplementation(() => new Promise<string>(() => {}));
    const clearing = clearCopiedSecret();
    await vi.advanceTimersByTimeAsync(READ_BACK_TIMEOUT_MS);
    await clearing;
    expect(board).toBe('');
  });
});
