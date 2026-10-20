// Libs
import { clipboard } from 'electron';

// Utils
import { writeConcealed } from './concealed-clipboard';

export const CLEAR_SECRET_AFTER_MS = 30_000;
export const READ_BACK_TIMEOUT_MS = 1_000;

let pending: { secret: string; timer: NodeJS.Timeout } | null = null;

// A call rather than a comparison, since a copy made during an await replaces what was pending.
const isCleared = (): boolean => pending === null;

// A clipboard that fails or never answers counts as still holding it: leaving a password behind is the worse mistake.
async function stillHolds(secret: string): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(secret), READ_BACK_TIMEOUT_MS);
  });
  const found = await Promise.race([clipboard.readText().catch(() => secret), timedOut]);
  clearTimeout(timer);
  return found === secret;
}

/**
 * A password on the clipboard for half a minute. Cleared only if it is still
 * there: whatever was copied since is the person's, not ours to wipe.
 */
export async function copySecret(secret: string): Promise<void> {
  if (pending) {
    clearTimeout(pending.timer);
  }
  const copied = { secret, timer: setTimeout(() => void clearCopiedSecret(), CLEAR_SECRET_AFTER_MS) };
  pending = copied;
  if (!(await writeConcealed(secret))) {
    await clipboard.writeText(secret);
  }
  // Locked or quit while it was being written, so it goes as soon as it lands; a later copy is left alone.
  if (isCleared() && (await stillHolds(secret)) && isCleared()) {
    clipboard.clear();
  }
}

/** Clears a copied password now rather than at the end of its half minute, as the vault locks. */
export async function clearCopiedSecret(): Promise<void> {
  if (!pending) {
    return;
  }
  const { secret, timer } = pending;
  clearTimeout(timer);
  pending = null;
  // Checked again after the read: a password copied meanwhile is the one on the clipboard now.
  if ((await stillHolds(secret)) && isCleared()) {
    clipboard.clear();
  }
}

/**
 * Clears a copied password at once, without reading the clipboard back.
 *
 * Quitting cannot wait for an asynchronous read, so if the half minute is still
 * running the clipboard is cleared whatever is on it.
 */
export function clearCopiedSecretBeforeQuit(): void {
  if (!pending) {
    return;
  }
  clearTimeout(pending.timer);
  pending = null;
  clipboard.clear();
}

export function copyText(text: string): Promise<void> {
  return clipboard.writeText(text);
}
