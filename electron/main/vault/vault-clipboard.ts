// Libs
import { clipboard } from 'electron';

export const CLEAR_SECRET_AFTER_MS = 30_000;

let pending: { secret: string; timer: NodeJS.Timeout } | null = null;

/**
 * A password on the clipboard for half a minute. Cleared only if it is still
 * there: whatever was copied since is the person's, not ours to wipe.
 */
export function copySecret(secret: string): void {
  clipboard.writeText(secret);
  if (pending) {
    clearTimeout(pending.timer);
  }
  pending = { secret, timer: setTimeout(clearCopiedSecret, CLEAR_SECRET_AFTER_MS) };
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
