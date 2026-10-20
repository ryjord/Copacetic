// Libs
import { clipboard } from 'electron';

export const CLEAR_SECRET_AFTER_MS = 30_000;

let pendingClear: NodeJS.Timeout | null = null;

/**
 * A password on the clipboard for half a minute. Cleared only if it is still
 * there: whatever was copied since is the person's, not ours to wipe.
 */
export function copySecret(secret: string): void {
  clipboard.writeText(secret);
  if (pendingClear) {
    clearTimeout(pendingClear);
  }
  pendingClear = setTimeout(() => {
    pendingClear = null;
    if (clipboard.readText() === secret) {
      clipboard.clear();
    }
  }, CLEAR_SECRET_AFTER_MS);
}

export function copyText(text: string): void {
  clipboard.writeText(text);
}
