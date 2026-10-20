/** Where an extension came from: the Chrome Web Store, or a folder someone chose while building one. */
export type ExtensionSource = 'store' | 'folder';

/** What the toolbar shows for an extension, and what pressing it does. */
export interface ExtensionAction {
  title: string;
  /** A data URL, read from the extension's own files; nothing is fetched to draw it. */
  iconDataUrl: string | null;
  badgeText: string;
  badgeColour: string;
  hasPopup: boolean;
  isEnabled: boolean;
}

/** One installed extension, as Settings and the toolbar show it. */
export interface ExtensionSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  source: ExtensionSource;
  isEnabled: boolean;
  iconDataUrl: string | null;
  /** API permissions, such as `tabs` or `storage`, as the manifest names them. */
  permissions: string[];
  /** The sites it may read and change, as match patterns. */
  hostPermissions: string[];
  /** Null for an extension with no toolbar button. */
  action: ExtensionAction | null;
}

/** What an extension asks for, shown before it is added. */
export interface ExtensionRequest {
  id: string;
  name: string;
  version: string;
  permissions: string[];
  hostPermissions: string[];
}

const ID = /^[a-p]{32}$/;

/**
 * The extension id in what someone pasted: a store address, old or new, or an
 * id on its own. Null for anything else, so a typo is never fetched as if it
 * were an id.
 */
export function webStoreIdFrom(input: string): string | null {
  const trimmed = input.trim();
  if (ID.test(trimmed)) {
    return trimmed;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const isStore =
    url.protocol === 'https:' &&
    (url.hostname === 'chromewebstore.google.com' ||
      (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore/')));
  if (!isStore) {
    return null;
  }
  const id = url.pathname.split('/').find((part) => ID.test(part));
  return id ?? null;
}

/** Whether an extension may see every page's address, which is what reading tabs or any site lets it do. */
export function canReadEverySite(permissions: readonly string[], hostPermissions: readonly string[]): boolean {
  return (
    permissions.includes('tabs') ||
    hostPermissions.some((pattern) => pattern === '<all_urls>' || /^\*:\/\/\*\//.test(pattern))
  );
}

/**
 * Whether a match pattern covers an address, as Chrome reads them:
 * `<all_urls>`, or a scheme, a host with an optional leading `*.`, and a path
 * with `*` standing for anything.
 */
export function matchesPattern(pattern: string, address: string): boolean {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return false;
  }
  if (pattern === '<all_urls>') {
    return ['http:', 'https:', 'file:', 'ws:', 'wss:'].includes(url.protocol);
  }
  const parts = /^(\*|https?|wss?|file):\/\/(\*|\*\.[^/*]+|[^/*]+)?(\/.*)$/.exec(pattern);
  if (!parts) {
    return false;
  }
  const [, scheme = '', host = '', path = '/'] = parts;
  const schemeMatches =
    scheme === '*' ? url.protocol === 'http:' || url.protocol === 'https:' : url.protocol === `${scheme}:`;
  const hostMatches =
    host === '*' ||
    (host.startsWith('*.')
      ? url.hostname === host.slice(2) || url.hostname.endsWith(host.slice(1))
      : url.hostname === host);
  const pathPattern = new RegExp(`^${path.split('*').map(escapeRegExp).join('.*')}$`);
  return schemeMatches && (scheme === 'file' || hostMatches) && pathPattern.test(`${url.pathname}${url.search}`);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}
