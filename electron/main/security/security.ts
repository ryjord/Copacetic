// Libs
import { type Session, type WebContents, app, desktopCapturer, shell } from 'electron';

// Utils
import { type DisplaySource, displayChoices } from '../../shared/chrome/display-sources';
import { INTERNAL_SCHEME, PAGE_NAVIGABLE_SCHEMES, isLoopbackHost } from '../../shared/browsing/url';
import { observeCertificates } from './certificates';
import { installRequestHeaders } from './request-headers';
import { describeSession } from '../system/browser-identity';
import { APP_ORIGIN, DEV_SERVER_ORIGIN, isDevelopment } from '../app/env';
import { t } from '../../shared/i18n/translate';
import { isLoadedExtensionPage } from '../extensions/extension-pages';

// Types
import type { PermissionAnswer, PermissionDecision, PermissionDefault, PermissionKind } from '../../shared/types';

export interface SecurityDelegate {
  /** Ask the user, via the chrome UI, and resolve with their answer. */
  requestPermission(input: {
    webContentsId: number;
    origin: string;
    kind: PermissionKind;
    description: string;
  }): Promise<PermissionAnswer>;
  /** A page tried to open a new window; route it into a tab instead. */
  openInNewTab(url: string, options: { activate: boolean; openerWebContentsId: number }): void;
  /** Makes a page a tab opened, with its opener kept, a tab; false when it could not, and it is then closed. */
  adoptOpenedPage(
    contents: WebContents,
    url: string,
    options: { activate: boolean; openerWebContentsId: number },
  ): boolean;
  /** A page tried to hand off to another application. */
  confirmExternalOpen(url: string, openerWebContentsId: number): Promise<boolean>;
  getStoredDecision(origin: string, kind: PermissionKind): PermissionDecision | null;
  /** What a site gets when nothing is stored for it. */
  getDefaultPermission(kind: PermissionKind): PermissionDefault;
  rememberDecision(origin: string, kind: PermissionKind, decision: PermissionDecision): void;
  /** Whether a page on this site keeps third-party cookies out; the site's tracker exception lets them in. */
  blocksThirdPartyCookiesOn(site: string): boolean;
  /** A page wants to share the screen; resolves with the id of what the person picked, or null. */
  chooseDisplaySource(origin: string, choices: DisplaySource[]): Promise<string | null>;
}

/** The window title the display chooser leaves out of its list. */
export const OWN_WINDOW_NAME = 'Copacetic';

// Permissions a normal page may use without interrupting the user. Screen
// sharing is here because the display chooser below is its prompt: nothing is
// shared until a person picks something, every time.
const AUTO_ALLOWED = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write', 'display-capture']);

/** Permissions worth interrupting the user for, with the wording they will read. */
const PROMPTED: Partial<Record<string, { kind: PermissionKind; description: string }>> = {
  geolocation: { kind: 'geolocation', description: t('main.permissions.prompts.geolocation') },
  notifications: { kind: 'notifications', description: t('main.permissions.prompts.notifications') },
  media: { kind: 'media', description: t('main.permissions.prompts.media') },
  midi: { kind: 'midi', description: t('main.permissions.prompts.midi') },
  midiSysex: { kind: 'midi', description: t('main.permissions.prompts.midiSysex') },
  'clipboard-read': { kind: 'clipboard-read', description: t('main.permissions.prompts.clipboardRead') },
  openExternal: { kind: 'openExternal', description: t('main.permissions.prompts.openExternal') },
};

/** Everything not listed above is denied without asking. */

/**
 * What can be asked for on this platform.
 *
 * Electron has no location provider on Linux without a Google API key, which
 * Copacetic does not ship, so a yes there could never produce a position.
 * Refusing quietly is honest; asking would be a prompt for nothing.
 */
export function promptFor(
  permission: string,
  platform: NodeJS.Platform,
): { kind: PermissionKind; description: string } | null {
  if (permission === 'geolocation' && platform === 'linux') {
    return null;
  }
  return PROMPTED[permission] ?? null;
}

export function hardenChromeSession(session: Session): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);

  session.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith(`${APP_ORIGIN}/`) && !details.url.startsWith(DEV_SERVER_ORIGIN)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [chromeContentSecurityPolicy()],
      },
    });
  });
}

function chromeContentSecurityPolicy(): string {
  // `'unsafe-inline'` on scripts is not a choice: a statically exported Next
  // app inlines its bootstrap and flight payload, and static export cannot emit
  // a per-request nonce. It is contained by the fact that this document only
  // ever loads local, build-time assets - `connect-src` and `img-src` below
  // make sure the chrome cannot talk to the network at all.
  const scriptSrc = isDevelopment() ? `'self' 'unsafe-inline' 'unsafe-eval'` : `'self' 'unsafe-inline'`;
  const connectSrc = isDevelopment() ? `'self' ws: http://localhost:3000` : `'self'`;

  return [
    `default-src 'none'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline'`,
    `font-src 'self' data:`,
    // Favicons reach the chrome as data URLs fetched by the main process, so
    // the chrome renderer itself never makes a request to a visited site.
    `img-src 'self' data:`,
    `connect-src ${connectSrc}`,
    `object-src 'none'`,
    `frame-src 'none'`,
    `child-src 'none'`,
    `worker-src 'self'`,
    `base-uri 'none'`,
    `form-action 'none'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

export function hardenWebSession(session: Session, delegate: SecurityDelegate): void {
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    void resolvePermission(delegate, contents, permission, details?.requestingUrl ?? '').then(callback);
  });

  // On macOS 15 and later the system's own picker is used and this is never called.
  session.setDisplayMediaRequestHandler(
    (request, callback) => {
      void chooseDisplayMedia(delegate, request.securityOrigin, request.userGesture).then((source) =>
        // An empty answer is a refusal: getDisplayMedia rejects.
        callback(source ? { video: source } : {}),
      );
    },
    { useSystemPicker: true },
  );

  // Called for synchronous checks (for example `navigator.permissions.query`).
  // It must never prompt, so it answers purely from decisions already stored.
  session.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    if (AUTO_ALLOWED.has(permission)) {
      return true;
    }
    const prompted = promptFor(permission, process.platform);
    if (!prompted || !requestingOrigin) {
      return false;
    }
    return delegate.getStoredDecision(requestingOrigin, prompted.kind) === 'allow';
  });

  // Record what Chromium decided about each certificate, so the connection
  // badge can say who issued it and when it expires. This observes only - see
  // certificates.ts for why that distinction is load-bearing.
  observeCertificates(session);

  session.setDevicePermissionHandler(() => false);
  session.setBluetoothPairingHandler((_details, callback) => callback({ confirmed: false }));

  // What this browser says it is, on the wire and in the languages it offers, and which cookies cross sites.
  installRequestHeaders(session, {
    clientHints: describeSession(session, process.platform, app.getLocale()),
    blocksThirdPartyCookiesOn: (site) => delegate.blocksThirdPartyCookiesOn(site),
  });
}

/** Screen sharing needs a click on the page and a choice in the chooser, every time. */
async function chooseDisplayMedia(
  delegate: SecurityDelegate,
  origin: string,
  hasUserGesture: boolean,
): Promise<DisplaySource | null> {
  if (!hasUserGesture) {
    return null;
  }
  let sources: DisplaySource[];
  try {
    const found = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 0, height: 0 },
    });
    sources = found.map((source) => ({ id: source.id, name: source.name }));
  } catch {
    // The Linux PipeWire picker cancelled, or capture is unavailable.
    return null;
  }
  const choices = displayChoices(sources, OWN_WINDOW_NAME);
  if (choices.length === 0) {
    return null;
  }
  const chosen = await delegate.chooseDisplaySource(origin, choices);
  return choices.find((choice) => choice.id === chosen) ?? null;
}

async function resolvePermission(
  delegate: SecurityDelegate,
  contents: WebContents | null,
  permission: string,
  requestingUrl: string,
): Promise<boolean> {
  if (AUTO_ALLOWED.has(permission)) {
    return true;
  }

  const prompted = promptFor(permission, process.platform);
  if (!prompted) {
    return false;
  }

  let origin: string;
  try {
    origin = new URL(requestingUrl || contents?.getURL() || '').origin;
  } catch {
    return false;
  }
  if (!origin || origin === 'null') {
    return false;
  }

  const stored = delegate.getStoredDecision(origin, prompted.kind);
  if (stored) {
    return stored === 'allow';
  }
  if (delegate.getDefaultPermission(prompted.kind) === 'block') {
    return false;
  }

  const answer = await delegate.requestPermission({
    webContentsId: contents?.id ?? -1,
    origin,
    kind: prompted.kind,
    description: prompted.description,
  });
  // Never for a Hush tab, ticked or not: the decision is keyed by origin, so it would write the site's name to disk.
  // Only a page known to be in a persistent session: without one, remembering would be a guess that writes to disk.
  if (answer.remember && contents?.session.isPersistent() === true) {
    delegate.rememberDecision(origin, prompted.kind, answer.decision);
  }
  return answer.decision === 'allow';
}

function isWebContents(value: unknown): value is WebContents {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'id') === 'number' &&
    typeof Reflect.get(value, 'loadURL') === 'function'
  );
}

/** How long after a click or key press a page may still hand a link to another app. */
export const GESTURE_WINDOW_MS = 5_000;
const GESTURE_INPUTS = new Set(['mouseDown', 'rawKeyDown', 'keyDown', 'gestureTap', 'touchStart']);

/** Whether someone used the page recently enough that an app link can be theirs. */
export function isRecentGesture(lastInputAt: number | null, now: number): boolean {
  return lastInputAt !== null && now - lastInputAt <= GESTURE_WINDOW_MS;
}

/** Guards applied to every tab's webContents. */
export function guardTabWebContents(contents: WebContents, delegate: SecurityDelegate): void {
  // Seen by the main process before the page, so a script cannot fake one.
  let lastInputAt: number | null = null;
  contents.on('input-event', (_event, input) => {
    if (GESTURE_INPUTS.has(input.type)) {
      lastInputAt = Date.now();
    }
  });
  // An app link with no click or key behind it is refused without a question: asking is itself the nuisance.
  const offerExternalOpen = (url: string) => {
    if (isRecentGesture(lastInputAt, Date.now())) {
      void delegate.confirmExternalOpen(url, contents.id);
    }
  };

  contents.setWindowOpenHandler(({ url, disposition }) => {
    const activate = disposition !== 'background-tab';
    // A pop-up, such as a "Sign in with Google" window, waits to report back to
    // the page that opened it through window.opener. Opened as a tab of its own
    // the link was lost and every such sign-in silently went nowhere. So
    // Chromium makes the page, already linked to its opener, and it is handed
    // to a tab rather than a window: still never a window, so there is no
    // surface for a pop-up that imitates browser chrome.
    if (disposition === 'new-window' && (url === '' || url === 'about:blank' || isNavigable(url))) {
      return {
        action: 'allow',
        outlivesOpener: true,
        createWindow: (options) => {
          // Electron hands over the page it made in these options; that is what keeps the opener.
          const adopted: unknown = Reflect.get(options, 'webContents');
          if (!isWebContents(adopted)) {
            throw new Error('Electron made no page to adopt for a window a page opened');
          }
          if (!delegate.adoptOpenedPage(adopted, url, { activate, openerWebContentsId: contents.id })) {
            adopted.close();
          }
          return adopted;
        },
      };
    }
    if (isNavigable(url)) {
      delegate.openInNewTab(url, { activate, openerWebContentsId: contents.id });
    } else {
      offerExternalOpen(url);
    }
    // Copacetic never lets a page create a real window. Everything becomes a
    // tab, so there is no surface for a popup that imitates browser chrome.
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (isNavigable(url)) {
      return;
    }
    event.preventDefault();
    offerExternalOpen(url);
  });

  contents.on('will-redirect', (event, url) => {
    if (isNavigable(url)) {
      return;
    }
    event.preventDefault();
  });

  hardenAttachedFrames(contents);
}

/** Guards for the window that renders Copacetic's own interface. */
export function guardChromeWebContents(contents: WebContents): void {
  contents.on('will-navigate', (event, url) => {
    if (isChromeDocument(url)) {
      return;
    }
    event.preventDefault();
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url);
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  hardenAttachedFrames(contents);
}

function hardenAttachedFrames(contents: WebContents): void {
  // `<webview>` is disabled on every webPreferences Copacetic creates, but a
  // renderer compromise could still try to attach one. Refusing here means the
  // check does not depend on any single webPreferences object being right.
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}

// Every caller here is reacting to something *page code* did, so this is the strict set - a page cannot reach `file:` even though the user can type it.
function isNavigable(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === `${INTERNAL_SCHEME}:` || isLoadedExtensionPage(url)) {
      return true;
    }
    return PAGE_NAVIGABLE_SCHEMES.has(parsed.protocol);
  } catch {
    return false;
  }
}

function isChromeDocument(url: string): boolean {
  return url.startsWith(`${APP_ORIGIN}/`) || (isDevelopment() && url.startsWith(DEV_SERVER_ORIGIN));
}

/** True when a URL's transport genuinely protects the user. */
export function isTransportSecure(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') {
      return true;
    }
    // Loopback is exempt for the same reason Chromium treats it as a secure
    // context: the traffic never leaves the machine.
    return parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
}
