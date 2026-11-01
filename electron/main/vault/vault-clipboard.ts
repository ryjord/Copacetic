// Utils
import { clipboard } from '../engine/system';
import { writeConcealed } from './concealed-clipboard';

export const CLEAR_SECRET_AFTER_MS = 30_000;
export const READ_BACK_TIMEOUT_MS = 1_000;

let pending: { secret: string; timer: NodeJS.Timeout } | null = null;
let readBacksInFlight = 0;

/** A call rather than a comparison, since a copy made during an await replaces what was pending. */
function isCleared(): boolean {
  return pending === null;
}

/** A clipboard that fails or never answers counts as still holding it: leaving a password behind is the worse mistake. */
async function stillHolds(secret: string): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<string>((resolve) => {
    timer = setTimeout(() => resolve(secret), READ_BACK_TIMEOUT_MS);
  });
  const found = await Promise.race([clipboard.readText().catch(() => secret), timedOut]);
  clearTimeout(timer);
  return found === secret;
}

/** Clears the clipboard if it still holds this password and nothing was copied since; a quit meanwhile clears outright. */
async function clearIfStillHeld(secret: string): Promise<void> {
  readBacksInFlight += 1;
  try {
    if ((await stillHolds(secret)) && isCleared()) {
      clipboard.clear();
    }
  } finally {
    readBacksInFlight -= 1;
  }
}

/** Stops the half-minute timer and hands back what was pending. */
function takePending(): string | null {
  if (!pending) {
    return null;
  }
  const { secret, timer } = pending;
  clearTimeout(timer);
  pending = null;
  return secret;
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
  if (isCleared()) {
    await clearIfStillHeld(secret);
  }
}

/** Clears a copied password now rather than at the end of its half minute, as the vault locks. */
export async function clearCopiedSecret(): Promise<void> {
  const secret = takePending();
  if (secret !== null) {
    await clearIfStillHeld(secret);
  }
}

/** Clears a copied password at once on quit, without the read back, which cannot be awaited there. */
export function clearCopiedSecretBeforeQuit(): void {
  const hadPending = takePending() !== null;
  if (hadPending || readBacksInFlight > 0) {
    clipboard.clear();
  }
}
