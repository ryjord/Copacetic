import { type Session, type WebContents, session as electronSession, shell } from 'electron';
import type { PermissionDecision, PermissionKind } from '../shared/types';
import { INTERNAL_SCHEME, PAGE_NAVIGABLE_SCHEMES, isLoopbackHost } from '../shared/url';
import { observeCertificates } from './certificates';
import { APP_ORIGIN, DEV_SERVER_ORIGIN, isDevelopment } from './env';

/**
 * Web content lives in its own persistent partition, separate from the session
 * that runs Copacetic's own UI. Cookies, storage and service workers belonging
 * to visited sites therefore cannot be reached from the chrome renderer, even
 * if the chrome renderer were compromised.
 */
export const WEB_PARTITION = 'persist:copacetic-web';

/**
 * The partition a Hush tab uses.
 *
 * No `persist:` prefix, which is what makes it real rather than a promise:
 * Chromium keeps the whole session in memory and drops it when the last
 * reference goes, so cookies, storage and cache never reach the disk to be
 * deleted later. A "private" mode that writes and then tidies up is one crash
 * away from not having tidied up.
 */
export const HUSH_PARTITION = 'copacetic-hush';

export function getWebSession(): Session {
  return electronSession.fromPartition(WEB_PARTITION);
}

export function getHushSession(): Session {
  return electronSession.fromPartition(HUSH_PARTITION);
}

export interface SecurityDelegate {
  /** Ask the user, via the chrome UI, and resolve with their answer. */
  requestPermission(input: {
    webContentsId: number;
    origin: string;
    kind: PermissionKind;
    description: string;
  }): Promise<PermissionDecision>;
  /** A page tried to open a new window; route it into a tab instead. */
  openInNewTab(url: string, options: { activate: boolean; openerWebContentsId: number }): void;
  /** A page tried to hand off to another application. */
  confirmExternalOpen(url: string, openerWebContentsId: number): Promise<boolean>;
  getStoredDecision(origin: string, kind: PermissionKind): PermissionDecision | null;
  rememberDecision(origin: string, kind: PermissionKind, decision: PermissionDecision): void;
}

/**
 * Permissions a normal page may use without interrupting the user.
 * All of these already require a user gesture at the Chromium level.
 */
const AUTO_ALLOWED = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write']);

/** Permissions worth interrupting the user for, with the wording they will read. */
const PROMPTED: Partial<Record<string, { kind: PermissionKind; description: string }>> = {
  geolocation: { kind: 'geolocation', description: 'know your location' },
  notifications: { kind: 'notifications', description: 'send you notifications' },
  media: { kind: 'media', description: 'use your camera and microphone' },
  'display-capture': { kind: 'display-capture', description: 'record your screen' },
  midi: { kind: 'midi', description: 'use your MIDI devices' },
  midiSysex: { kind: 'midi', description: 'send system messages to your MIDI devices' },
  'clipboard-read': { kind: 'clipboard-read', description: 'read your clipboard' },
  openExternal: { kind: 'openExternal', description: 'open another application' },
};

/**
 * Everything not listed above is denied without asking. Device access
 * (`serial`, `hid`, `usb`), ambient signals (`idle-detection`, `local-fonts`,
 * `window-placement`) and cross-site storage (`storage-access`) have no place
 * in a browser that has not been asked to support them, and a prompt the user
 * cannot evaluate is worse than a quiet no.
 */

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
  // ever loads local, build-time assets — `connect-src` and `img-src` below
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

  // Called for synchronous checks (for example `navigator.permissions.query`).
  // It must never prompt, so it answers purely from decisions already stored.
  session.setPermissionCheckHandler((_contents, permission, requestingOrigin) => {
    if (AUTO_ALLOWED.has(permission)) return true;
    const prompted = PROMPTED[permission];
    if (!prompted || !requestingOrigin) return false;
    return delegate.getStoredDecision(requestingOrigin, prompted.kind) === 'allow';
  });

  // Record what Chromium decided about each certificate, so the connection
  // badge can say who issued it and when it expires. This observes only — see
  // certificates.ts for why that distinction is load-bearing.
  observeCertificates(session);

  session.setDevicePermissionHandler(() => false);
  session.setBluetoothPairingHandler((_details, callback) => callback({ confirmed: false }));

  // A site claiming to be Electron invites bespoke, often broken code paths.
  // Presenting as plain Chrome is both better for compatibility and one less
  // signal that fingerprints this user as unusual.
  session.setUserAgent(stripElectronFromUserAgent(session.getUserAgent()));
}

async function resolvePermission(
  delegate: SecurityDelegate,
  contents: WebContents | null,
  permission: string,
  requestingUrl: string,
): Promise<boolean> {
  if (AUTO_ALLOWED.has(permission)) return true;

  const prompted = PROMPTED[permission];
  if (!prompted) return false;

  let origin: string;
  try {
    origin = new URL(requestingUrl || contents?.getURL() || '').origin;
  } catch {
    return false;
  }
  if (!origin || origin === 'null') return false;

  const stored = delegate.getStoredDecision(origin, prompted.kind);
  if (stored) return stored === 'allow';

  const decision = await delegate.requestPermission({
    webContentsId: contents?.id ?? -1,
    origin,
    kind: prompted.kind,
    description: prompted.description,
  });
  delegate.rememberDecision(origin, prompted.kind, decision);
  return decision === 'allow';
}

export function stripElectronFromUserAgent(userAgent: string): string {
  return userAgent
    .replace(/ Electron\/[\d.]+/, '')
    .replace(/ Copacetic\/[\d.]+/, '')
    .trim();
}

/**
 * Guards applied to every tab's webContents.
 *
 * The webContents itself is already sandboxed and context-isolated; these rules
 * govern where it is allowed to take the user.
 */
export function guardTabWebContents(contents: WebContents, delegate: SecurityDelegate): void {
  contents.setWindowOpenHandler(({ url, disposition }) => {
    if (isNavigable(url)) {
      delegate.openInNewTab(url, {
        activate: disposition !== 'background-tab',
        openerWebContentsId: contents.id,
      });
    } else {
      void delegate.confirmExternalOpen(url, contents.id);
    }
    // Copacetic never lets a page create a real window. Everything becomes a
    // tab, so there is no surface for a popup that imitates browser chrome.
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (isNavigable(url)) return;
    event.preventDefault();
    void delegate.confirmExternalOpen(url, contents.id);
  });

  contents.on('will-redirect', (event, url) => {
    if (isNavigable(url)) return;
    event.preventDefault();
  });

  hardenAttachedFrames(contents);
}

/**
 * Guards for the window that renders Copacetic's own interface.
 *
 * This webContents has the preload bridge attached, so letting it navigate
 * anywhere would hand that bridge to whatever it navigated to.
 */
export function guardChromeWebContents(contents: WebContents): void {
  contents.on('will-navigate', (event, url) => {
    if (isChromeDocument(url)) return;
    event.preventDefault();
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url);
  });

  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
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

/**
 * Every caller here is reacting to something *page code* did, so this is the
 * strict set — a page cannot reach `file:` even though the user can type it.
 */
function isNavigable(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === `${INTERNAL_SCHEME}:`) return true;
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
    if (parsed.protocol === 'https:') return true;
    // Loopback is exempt for the same reason Chromium treats it as a secure
    // context: the traffic never leaves the machine.
    return parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
}
