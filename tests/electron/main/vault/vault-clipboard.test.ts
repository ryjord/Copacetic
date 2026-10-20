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

const { CLEAR_SECRET_AFTER_MS, READ_BACK_TIMEOUT_MS, clearCopiedSecret, copySecret, hasCopiedSecret } =
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

  it('is cleared at once when the vault locks or the app quits', async () => {
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

  // The quit waits on this, so it has to say whether there is anything to wait for.
  it('says whether a copied password is still waiting to be cleared', async () => {
    expect(hasCopiedSecret()).toBe(false);
    await copySecret('hunter2');
    expect(hasCopiedSecret()).toBe(true);
    await clearCopiedSecret();
    expect(hasCopiedSecret()).toBe(false);
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
