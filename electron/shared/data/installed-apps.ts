/** A site installed as an app: opened in a window of its own, from a shortcut the system lists with its apps. */
export interface InstalledApp {
  id: string;
  name: string;
  /** Where it opens; the site it stays on is this address's site. */
  url: string;
  createdAt: number;
}

/** What the window is told of the app it is, or null for an ordinary browser window. */
export interface AppWindowState {
  id: string;
  name: string;
}

// The scheme a macOS launcher opens, which Copacetic answers by opening the app.
export const APP_LINK_SCHEME = 'copacetic-app';

// What newId makes: base64url, so letters, digits, - and _.
const APP_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function isAppId(value: unknown): value is string {
  return typeof value === 'string' && APP_ID.test(value);
}

export function appLinkFor(id: string): string {
  return `${APP_LINK_SCHEME}://open/${id}`;
}

/** The app a copacetic-app:// link opens, or null for anything else. */
export function appIdFromLink(url: string): string | null {
  const id = new RegExp(`^${APP_LINK_SCHEME}://open/([^/?#]+)$`).exec(url)?.[1];
  return isAppId(id) ? id : null;
}

/** The app a shortcut on Windows or Linux asked for with --app=<id>, or null. */
export function appIdFromArguments(argv: readonly string[]): string | null {
  const id = argv.map((argument) => /^--app=(.+)$/.exec(argument)?.[1]).find((found) => found !== undefined);
  return isAppId(id) ? id : null;
}
