// Libs
import { clipboard } from 'electron';

// Utils
import { writeConcealed } from './concealed-clipboard';

export const CLEAR_SECRET_AFTER_MS = 30_000;

let pending: { secret: string; timer: NodeJS.Timeout } | null = null;

/**
 * A password on the clipboard for half a minute. Cleared only if it is still
 * there: whatever was copied since is the person's, not ours to wipe.
 */
export async function copySecret(secret: string): Promise<void> {
  if (pending) {
    clearTimeout(pending.timer);
  }
  const copied = { secret, timer: setTimeout(clearCopiedSecret, CLEAR_SECRET_AFTER_MS) };
  pending = copied;
  if (!(await writeConcealed(secret))) {
    clipboard.writeText(secret);
  }
  // Locked or quit while it was being written, so it goes as soon as it lands.
  if (pending !== copied && clipboard.readText() === secret) {
    clipboard.clear();
  }
}

/** Clears a copied password now rather than at the end of its half minute, as the vault locks or the app quits. */
export function clearCopiedSecret(): void {
  if (!pending) {
    return;
  }
  clearTimeout(pending.timer);
  if (clipboard.readText() === pending.secret) {
    clipboard.clear();
  }
  pending = null;
}

export function copyText(text: string): void {
  clipboard.writeText(text);
}
