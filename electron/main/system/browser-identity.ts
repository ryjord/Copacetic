import type { Session, WebContents } from 'electron';
import type { ClientHints } from '../../shared/browser-identity';
import {
  CHROME_OBJECT_SCRIPT,
  acceptLanguagesFor,
  clientHintHeaders,
  clientHintsFor,
  stripElectronFromUserAgent,
} from '../../shared/browser-identity';
import { describeError, log } from './diagnostics';

/**
 * Applies what `electron/shared/browser-identity.ts` decides.
 *
 * There are two halves because a browser is looked at in two places. A server
 * sees headers before any script runs, and a page sees the objects Chrome puts
 * in front of it. Both have to say the same thing, so both are built from the
 * same values.
 */

/**
 * The half a server sees: the user agent, the languages offered with it, and
 * the client hints Chrome sends on every secure request. Electron sends no
 * hints at all, which is a plain contradiction with a user agent that says
 * Chrome — visible without a line of script, and enough on its own for a
 * sign-in page to refuse the browser.
 *
 * Nothing here is new information: the version and platform are already in the
 * user agent this same session sends.
 */
export function describeSession(session: Session, platform: string, locale: string): void {
  const userAgent = stripElectronFromUserAgent(session.getUserAgent());
  session.setUserAgent(userAgent, acceptLanguagesFor(locale));

  const hints = clientHintsFor(userAgent, platform, process.arch);
  if (!hints) {
    return;
  }

  const headers = clientHintHeaders(hints);
  session.webRequest.onBeforeSendHeaders((details, callback) => {
    // Chrome sends these to secure origins only.
    if (!details.url.startsWith('https://')) {
      callback({ requestHeaders: details.requestHeaders });
      return;
    }
    callback({ requestHeaders: { ...details.requestHeaders, ...headers } });
  });
}

/**
 * The half a page sees, installed through the DevTools protocol rather than a
 * preload — page content still runs no script of Copacetic's, and there is
 * nothing here for a page to reach even if it knew.
 *
 * Two things were measured rather than assumed: the debugger has to stay
 * attached, because detaching drops the override, and opening DevTools on the
 * tab works alongside it.
 *
 * The caller waits for this before the tab's first navigation. A view with no
 * document answers no DevTools command at all, so the empty document comes
 * first.
 */
export async function describeTab(contents: WebContents, platform: string): Promise<void> {
  // The caller waits for an empty document first, and a tab can be closed
  // during it. Everything below would then throw on a destroyed object.
  if (contents.isDestroyed()) {
    return;
  }

  try {
    const userAgent = contents.session.getUserAgent();
    const hints = clientHintsFor(userAgent, platform, process.arch);
    if (!hints) {
      return;
    }
    await describeAsChrome(contents, userAgent, hints);
  } catch (error) {
    log.warn('could not describe a tab as Chrome', describeError(error));
  }
}

async function describeAsChrome(contents: WebContents, userAgent: string, hints: ClientHints): Promise<void> {
  try {
    contents.debugger.attach('1.3');
  } catch (error) {
    // Nothing here is worth failing a tab over. Without it the browser simply
    // goes back to describing itself the way Electron does.
    log.warn('could not attach to a tab to describe it', describeError(error));
    return;
  }

  await contents.debugger.sendCommand('Emulation.setUserAgentOverride', {
    userAgent,
    platform: hints.platform,
    userAgentMetadata: hints,
  });

  // Electron leaves window.chrome empty where a real Chrome has three objects
  // on it, so they are added to every document this tab loads.
  await contents.debugger.sendCommand('Page.enable');
  await contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: CHROME_OBJECT_SCRIPT });
}
