import type { WebContents } from 'electron';
import { CHROME_OBJECT_SCRIPT, clientHintsFor } from '../../shared/client-hints';
import { describeError, log } from '../system/diagnostics';

/**
 * Corrects what a tab reports about itself, through the DevTools protocol.
 *
 * The debugger has to stay attached: detaching drops the override. Opening
 * DevTools on the tab still works alongside it, which was checked rather than
 * assumed.
 */
export function applyClientHints(contents: WebContents, platform: string): Promise<void> {
  const userAgent = contents.session.getUserAgent();
  const hints = clientHintsFor(userAgent, platform);
  if (!hints) {
    return Promise.resolve();
  }

  try {
    contents.debugger.attach('1.3');
  } catch (error) {
    // Nothing here is worth failing a tab over; the browser simply keeps
    // describing itself the way Electron does.
    log.warn('could not correct the client hints for a tab', describeError(error));
    return Promise.resolve();
  }

  return (async () => {
    await contents.debugger.sendCommand('Emulation.setUserAgentOverride', {
      userAgent,
      platform: hints.platform,
      userAgentMetadata: hints,
    });

    // Electron leaves window.chrome empty where a real Chrome has three
    // objects on it. This adds them to every document the tab loads, from out
    // here rather than through a preload: page content still gets no script of
    // ours that knows anything about Copacetic.
    await contents.debugger.sendCommand('Page.enable');
    await contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: CHROME_OBJECT_SCRIPT,
    });
  })().catch((error: unknown) => {
    log.warn('could not finish describing the browser to a tab', describeError(error));
  });
}
