// Libs
import { clipboard } from 'electron';

// Utils
import { describeError, log } from './diagnostics';

/** Puts plain text on the clipboard. Resolves whether it landed; a write the clipboard refuses is logged, not thrown. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await clipboard.writeText(text);
    return true;
  } catch (error) {
    log.warn('could not copy to the clipboard', describeError(error));
    return false;
  }
}
