// Libs
import { clipboard } from 'electron';

// Utils
import { writeConcealed } from './concealed-clipboard';

export const CLEAR_SECRET_AFTER_MS = 30_000;
export const READ_BACK_TIMEOUT_MS = 1_000;

let pending: { secret: string; timer: NodeJS.Timeout } | null = null;

// A clipboard that never answers counts as still holding it: leaving a password behind is the worse mistake.
async function stillHolds(secret: string): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(secret), READ_BACK_TIMEOUT_MS);
  });
  const found = await Promise.race([clipboard.readText(), timedOut]);
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
  // Locked or quit while it was being written, so it goes as soon as it lands.
  if (pending !== copied && (await stillHolds(secret))) {
    clipboard.clear();
  }
}

export function hasCopiedSecret(): boolean {
  return pending !== null;
}

/** Clears a copied password now rather than at the end of its half minute, as the vault locks or the app quits. */
export async function clearCopiedSecret(): Promise<void> {
  if (!pending) {
    return;
  }
  const { secret, timer } = pending;
  clearTimeout(timer);
  pending = null;
  if (await stillHolds(secret)) {
    clipboard.clear();
  }
}

export function copyText(text: string): Promise<void> {
  return clipboard.writeText(text);
}
