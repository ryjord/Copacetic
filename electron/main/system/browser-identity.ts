// Utils
import { engineVersions, systemVersion } from '../engine/system';
import {
  CHROME_OBJECT_SCRIPT,
  acceptLanguagesFor,
  clientHintHeaders,
  clientHintsFor,
  stripElectronFromUserAgent,
} from '../../shared/browsing/browser-identity';
import { describeError, log } from './diagnostics';

// Types
import type { EngineSession } from '../engine/sessions';
import type { EnginePage } from '../engine/views';
import type { ClientHints } from '../../shared/browsing/browser-identity';

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
 * Chrome - visible without a line of script, and enough on its own for a
 * sign-in page to refuse the browser.
 *
 * Nothing here is new information: the version and platform are already in the
 * user agent this same session sends.
 */
export function describeSession(session: EngineSession, platform: string, locale: string): Record<string, string> {
  const userAgent = stripElectronFromUserAgent(session.getUserAgent());
  session.setUserAgent(userAgent, acceptLanguagesFor(locale));

  // Handed back rather than sent from here: a session has one request-headers listener, and it is shared.
  const hints = clientHintsFor(userAgent, platform, process.arch, actualVersions());
  return hints ? clientHintHeaders(hints) : {};
}

/**
 * The half a page sees, installed through the DevTools protocol rather than a
 * preload - page content still runs no script of Copacetic's, and there is
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
export async function describeTab(contents: EnginePage, platform: string): Promise<void> {
  // The caller waits for an empty document first, and a tab can be closed
  // during it. Everything below would then throw on a destroyed object.
  if (contents.isDestroyed()) {
    return;
  }

  try {
    const userAgent = contents.session.getUserAgent();
    const hints = clientHintsFor(userAgent, platform, process.arch, actualVersions());
    if (!hints) {
      return;
    }
    await describeAsChrome(contents, userAgent, hints);
  } catch (error) {
    log.warn('could not describe a tab as Chrome', describeError(error));
  }
}

/** The real Chromium build and system version, which Chrome answers in full when a page asks. */
function actualVersions(): { chromium?: string; system?: string } {
  // Electron's own additions to process, absent when this runs under plain Node in a test.
  return { chromium: engineVersions().chromium, system: systemVersion() ?? undefined };
}

async function describeAsChrome(contents: EnginePage, userAgent: string, hints: ClientHints): Promise<void> {
  try {
    contents.debugger.attach('1.3');
  } catch (error) {
    // Nothing here is worth failing a tab over. Without it the browser simply
    // goes back to describing itself the way Electron does.
    log.warn('could not attach to a tab to describe it', describeError(error));
    return;
  }

  const debuggerSession = contents.debugger;
  const override = { userAgent, platform: hints.platform, userAgentMetadata: hints };
  const send = (method: string, parameters: object, sessionId?: string) =>
    debuggerSession.sendCommand(method, parameters, sessionId);

  // A cross-site frame is a target of its own, held at its start until it is told what the tab was told.
  debuggerSession.on('message', (_event, method, parameters) => {
    if (method !== 'Target.attachedToTarget') {
      return;
    }
    const { sessionId, targetInfo } = parameters as AttachedTarget;
    // A service worker is shared by every page of its site, and one held for a tab is closed under it.
    if (!DESCRIBED_TARGETS.has(targetInfo.type)) {
      void send('Runtime.runIfWaitingForDebugger', {}, sessionId)
        .then(() => send('Target.detachFromTarget', { sessionId }))
        .catch(() => {});
      return;
    }
    void describeTarget(send, sessionId, targetInfo.type, override)
      .catch((error: unknown) => log.warn('could not describe a frame as Chrome', describeError(error)))
      // Always let go: a frame still held never loads.
      .finally(() => send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {}));
  });

  await describeTarget(send, undefined, 'page', override);
}

/** The targets that belong to one tab: its frames from other sites, and the workers its pages start. */
const DESCRIBED_TARGETS: ReadonlySet<string> = new Set(['iframe', 'worker']);

interface AttachedTarget {
  sessionId: string;
  targetInfo: { type: string };
}

type SendCommand = (method: string, parameters: object, sessionId?: string) => Promise<unknown>;

/** What a page, a frame inside it, or a worker it starts is told to say, so all of them say the same thing. */
async function describeTarget(
  send: SendCommand,
  sessionId: string | undefined,
  type: string,
  override: { userAgent: string; platform: string; userAgentMetadata: ClientHints },
): Promise<void> {
  if (type === 'worker') {
    // A worker has no Emulation domain; its navigator answers from the network override.
    await send('Network.setUserAgentOverride', override, sessionId);
    return;
  }
  await send('Emulation.setUserAgentOverride', override, sessionId);
  // Electron leaves window.chrome empty where a real Chrome has three objects on it.
  await send('Page.enable', {}, sessionId);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: CHROME_OBJECT_SCRIPT }, sessionId);
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId);
}
