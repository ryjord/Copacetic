import type { WebContents } from 'electron';
import { clientHintsFor } from '../../shared/client-hints';
import { describeError, log } from '../system/diagnostics';

/**
 * Corrects what a tab reports about itself, through the DevTools protocol.
 *
 * The debugger has to stay attached: detaching drops the override. Opening
 * DevTools on the tab still works alongside it, which was checked rather than
 * assumed.
 */
export function applyClientHints(contents: WebContents, platform: string): void {
  const userAgent = contents.session.getUserAgent();
  const hints = clientHintsFor(userAgent, platform);
  if (!hints) {
    return;
  }

  try {
    contents.debugger.attach('1.3');
  } catch (error) {
    // Nothing here is worth failing a tab over; the browser simply keeps
    // describing itself the way Electron does.
    log.warn('could not correct the client hints for a tab', describeError(error));
    return;
  }

  void contents.debugger
    .sendCommand('Emulation.setUserAgentOverride', {
      userAgent,
      platform: hints.platform,
      userAgentMetadata: hints,
    })
    .catch((error: unknown) => {
      log.warn('the client hints override was refused', describeError(error));
    });
}
