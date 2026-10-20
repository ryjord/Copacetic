// Utils
import { isRecord } from '../data/persistence';
import { canReadEverySite, matchesPattern } from '../../shared/extensions/extensions';

/** A tab as Chrome's API describes one. Its id is the page's web contents id, which Electron's own tab calls use too. */
export interface ChromeTab {
  id: number;
  windowId: number;
  index: number;
  url?: string;
  title?: string;
  favIconUrl?: string;
  active: boolean;
  highlighted: boolean;
  pinned: boolean;
  audible: boolean;
  discarded: boolean;
  status: 'loading' | 'complete';
  mutedInfo: { muted: boolean };
  incognito: false;
  groupId: -1;
  width?: number;
  height?: number;
}

export interface ChromeWindow {
  id: number;
  focused: boolean;
  type: 'normal';
  state: 'normal' | 'maximized' | 'fullscreen' | 'minimized';
  incognito: false;
  alwaysOnTop: false;
  left: number;
  top: number;
  width: number;
  height: number;
  tabs?: ChromeTab[];
}

/** The browser as an extension may see and change it. Hush tabs are never part of it. */
export interface ExtensionBrowsing {
  windows(): { window: ChromeWindow; tabs: ChromeTab[] }[];
  lastFocusedWindowId(): number | null;
  createTab(
    url: string,
    options: { active: boolean; windowId: number | null; index: number | null; pinned: boolean },
  ): number | null;
  updateTab(tabId: number, change: { url?: string; active?: boolean; muted?: boolean; pinned?: boolean }): void;
  removeTab(tabId: number): void;
  reloadTab(tabId: number, bypassCache: boolean): void;
  goBack(tabId: number): void;
  goForward(tabId: number): void;
  duplicateTab(tabId: number): void;
  discardTab(tabId: number): void;
  zoomOf(tabId: number): number;
  setZoom(tabId: number, factor: number): void;
  focusWindow(windowId: number): void;
  openWindow(url: string | null): void;
}

/** What one extension is allowed, read from its manifest. */
export interface ExtensionGrant {
  id: string;
  permissions: string[];
  hostPermissions: string[];
  optionsPage: string | null;
}

/** Who is calling: an extension's worker, or one of its pages Copacetic opened, and from which tab if any. */
export interface CallContext {
  grant: ExtensionGrant;
  /** The tab the calling page is in, for `tabs.getCurrent`; null for a worker or a popup. */
  tabId: number | null;
}

/** The parts of the API that hold state of their own: toolbar buttons, menus, notifications. */
export interface ExtensionSurfaces {
  action(id: string, method: string, args: readonly unknown[], tabId: number | null): unknown;
  contextMenus(id: string, method: string, args: readonly unknown[]): unknown;
  notify(id: string, method: string, args: readonly unknown[]): unknown;
  listen(id: string, eventName: string): void;
  openOptions(grant: ExtensionGrant): void;
  idleState(threshold: number): 'active' | 'idle' | 'locked';
}

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const asText = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const record = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});
const asIds = (value: unknown): number[] =>
  (Array.isArray(value) ? value : [value]).filter((id): id is number => typeof id === 'number');

export const WINDOW_ID_CURRENT = -2;

/** Whether an extension may see this page's address and title, as Chrome decides it. */
export function maySee(grant: ExtensionGrant, url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  return (
    canReadEverySite(grant.permissions, grant.hostPermissions) ||
    url.startsWith(`chrome-extension://${grant.id}/`) ||
    grant.hostPermissions.some((pattern) => matchesPattern(pattern, url))
  );
}

/** A tab with its address, title and icon taken out unless the extension may see them. */
export function seenBy(grant: ExtensionGrant, tab: ChromeTab): ChromeTab {
  if (maySee(grant, tab.url)) {
    return tab;
  }
  const { url: _url, title: _title, favIconUrl: _icon, ...rest } = tab;
  return rest;
}

/** A glob as `tabs.query` takes one for a title: `*` for anything. */
function globMatches(glob: string, text: string): boolean {
  return new RegExp(
    `^${glob
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
    'i',
  ).test(text);
}

/**
 * The calls an extension makes that Electron does not answer itself.
 *
 * Every argument arrives from extension code and is read as unknown. Anything
 * that would hand over a page's address is filtered by what the extension's
 * manifest grants, so an extension with neither `tabs` nor that site gets the
 * tab without its address, as it would in Chrome.
 */
export class ChromeApi {
  constructor(
    private readonly browsing: ExtensionBrowsing,
    private readonly surfaces: ExtensionSurfaces,
  ) {}

  call(context: CallContext, method: string, args: readonly unknown[]): unknown {
    const [namespace = '', member = ''] = method.split('.');
    const { grant } = context;
    switch (namespace) {
      case 'events':
        if (member === 'listen' && typeof args[0] === 'string') {
          this.surfaces.listen(grant.id, args[0]);
        }
        return null;
      case 'tabs':
        return this.tabs(context, member, args);
      case 'windows':
        return this.windows(context, member, args);
      case 'webNavigation':
        return this.webNavigation(context, member, args);
      case 'action':
        return this.surfaces.action(grant.id, member, args, context.tabId);
      case 'contextMenus':
        return this.surfaces.contextMenus(grant.id, member, args);
      case 'notifications':
        return this.surfaces.notify(grant.id, member, args);
      case 'permissions':
        return this.permissions(grant, member, args);
      case 'commands':
        return member === 'getAll' ? [] : null;
      case 'idle':
        if (member === 'queryState') {
          return this.surfaces.idleState(asNumber(args[0]) ?? 60);
        }
        return member === 'getAutoLockDelay' ? 0 : null;
      case 'runtime':
        if (member === 'openOptionsPage') {
          this.surfaces.openOptions(grant);
        }
        return null;
      case 'sidePanel':
        return member.startsWith('get') ? {} : null;
      case 'userScripts':
        return member === 'getScripts' ? [] : null;
      default:
        return null;
    }
  }

  /** Every tab an extension may know of, as it may see it. */
  allTabs(grant: ExtensionGrant): ChromeTab[] {
    return this.browsing.windows().flatMap(({ tabs }) => tabs.map((tab) => seenBy(grant, tab)));
  }

  private findTab(tabId: unknown): ChromeTab | null {
    const id = asNumber(tabId);
    return (
      this.browsing
        .windows()
        .flatMap(({ tabs }) => tabs)
        .find((tab) => tab.id === id) ?? null
    );
  }

  private currentWindowId(): number | null {
    return this.browsing.lastFocusedWindowId();
  }

  private tabs(context: CallContext, member: string, args: readonly unknown[]): unknown {
    const { grant } = context;
    switch (member) {
      case 'query':
        return this.query(grant, record(args[0]));
      case 'get': {
        const tab = this.findTab(args[0]);
        return tab ? seenBy(grant, tab) : null;
      }
      case 'getCurrent': {
        const tab = context.tabId === null ? null : this.findTab(context.tabId);
        return tab ? seenBy(grant, tab) : null;
      }
      case 'create': {
        const options = record(args[0]);
        const id = this.browsing.createTab(this.resolve(grant, asText(options.url)), {
          active: options.active !== false,
          windowId: asNumber(options.windowId),
          index: asNumber(options.index),
          pinned: options.pinned === true,
        });
        const tab = id === null ? null : this.findTab(id);
        return tab ? seenBy(grant, tab) : null;
      }
      case 'update': {
        // `update(change)` acts on the active tab of the current window; `update(id, change)` on that one.
        const hasId = typeof args[0] === 'number';
        const tabId = hasId ? asNumber(args[0]) : this.activeTabId();
        const change = record(hasId ? args[1] : args[0]);
        if (tabId === null) {
          return null;
        }
        const url = asText(change.url);
        this.browsing.updateTab(tabId, {
          ...(url ? { url: this.resolve(grant, url) } : {}),
          ...(typeof change.active === 'boolean' ? { active: change.active } : {}),
          ...(typeof change.highlighted === 'boolean' && change.highlighted ? { active: true } : {}),
          ...(typeof change.muted === 'boolean' ? { muted: change.muted } : {}),
          ...(typeof change.pinned === 'boolean' ? { pinned: change.pinned } : {}),
        });
        const tab = this.findTab(tabId);
        return tab ? seenBy(grant, tab) : null;
      }
      case 'remove':
        asIds(args[0]).forEach((id) => this.browsing.removeTab(id));
        return null;
      case 'reload': {
        const tabId = typeof args[0] === 'number' ? args[0] : this.activeTabId();
        if (tabId !== null) {
          this.browsing.reloadTab(
            tabId,
            record(typeof args[0] === 'number' ? args[1] : args[0]).bypassCache === true,
          );
        }
        return null;
      }
      case 'goBack':
      case 'goForward': {
        const tabId = asNumber(args[0]) ?? this.activeTabId();
        if (tabId !== null) {
          (member === 'goBack' ? this.browsing.goBack : this.browsing.goForward).call(this.browsing, tabId);
        }
        return null;
      }
      case 'duplicate':
        if (asNumber(args[0]) !== null) {
          this.browsing.duplicateTab(asNumber(args[0]) ?? -1);
        }
        return null;
      case 'discard':
        if (asNumber(args[0]) !== null) {
          this.browsing.discardTab(asNumber(args[0]) ?? -1);
        }
        return null;
      case 'highlight': {
        const first = asIds(record(args[0]).tabs)[0];
        if (first !== undefined) {
          this.browsing.updateTab(first, { active: true });
        }
        return null;
      }
      case 'getZoom': {
        const tabId = asNumber(args[0]) ?? this.activeTabId();
        return tabId === null ? 1 : this.browsing.zoomOf(tabId);
      }
      case 'setZoom': {
        const hasId = typeof args[0] === 'number';
        const tabId = hasId ? asNumber(args[0]) : this.activeTabId();
        const factor = asNumber(hasId ? args[1] : args[0]);
        if (tabId !== null && factor !== null && factor > 0) {
          this.browsing.setZoom(tabId, Math.min(5, Math.max(0.25, factor)));
        }
        return null;
      }
      case 'group':
        return -1;
      default:
        return null;
    }
  }

  private activeTabId(): number | null {
    const current = this.currentWindowId();
    return (
      this.browsing
        .windows()
        .find(({ window }) => window.id === current)
        ?.tabs.find((tab) => tab.active)?.id ?? null
    );
  }

  private query(grant: ExtensionGrant, info: Record<string, unknown>): ChromeTab[] {
    const current = this.currentWindowId();
    const windowId = asNumber(info.windowId);
    const urls = (Array.isArray(info.url) ? info.url : [info.url]).filter(
      (url): url is string => typeof url === 'string',
    );
    const title = asText(info.title);
    return this.browsing
      .windows()
      .filter(({ window }) => {
        if (info.currentWindow === true || info.lastFocusedWindow === true || windowId === WINDOW_ID_CURRENT) {
          return window.id === current;
        }
        if (info.currentWindow === false || info.lastFocusedWindow === false) {
          return window.id !== current;
        }
        return windowId === null || window.id === windowId;
      })
      .flatMap(({ tabs }) => tabs)
      .filter((tab) => {
        const flags: [unknown, boolean][] = [
          [info.active, tab.active],
          [info.highlighted, tab.highlighted],
          [info.pinned, tab.pinned],
          [info.audible, tab.audible],
          [info.muted, tab.mutedInfo.muted],
          [info.discarded, tab.discarded],
        ];
        const statusMatches = typeof info.status !== 'string' || info.status === tab.status;
        const indexMatches = asNumber(info.index) === null || info.index === tab.index;
        // Matching on an address or title needs leave to see it, as in Chrome.
        const urlMatches =
          urls.length === 0 ||
          (maySee(grant, tab.url) && urls.some((pattern) => matchesPattern(pattern, tab.url ?? '')));
        const titleMatches = title === null || (maySee(grant, tab.url) && globMatches(title, tab.title ?? ''));
        return (
          flags.every(([wanted, actual]) => typeof wanted !== 'boolean' || wanted === actual) &&
          statusMatches &&
          indexMatches &&
          urlMatches &&
          titleMatches
        );
      })
      .map((tab) => seenBy(grant, tab));
  }

  private windows(context: CallContext, member: string, args: readonly unknown[]): unknown {
    const { grant } = context;
    const all = this.browsing.windows();
    const describe = (entry: { window: ChromeWindow; tabs: ChromeTab[] }, options: unknown) =>
      record(options).populate === true
        ? { ...entry.window, tabs: entry.tabs.map((tab) => seenBy(grant, tab)) }
        : entry.window;
    const current = this.currentWindowId();
    switch (member) {
      case 'get': {
        const id = asNumber(args[0]);
        const found = all.find(({ window }) => window.id === (id === WINDOW_ID_CURRENT ? current : id));
        return found ? describe(found, args[1]) : null;
      }
      case 'getAll':
        return all.map((entry) => describe(entry, args[0]));
      case 'getCurrent':
      case 'getLastFocused': {
        const found = all.find(({ window }) => window.id === current) ?? all[0];
        return found ? describe(found, args[0]) : null;
      }
      case 'create': {
        const asked: unknown = record(args[0]).url;
        const url = asText(Array.isArray(asked) ? asked[0] : asked);
        this.browsing.openWindow(url ? this.resolve(grant, url) : null);
        return null;
      }
      case 'update': {
        const id = asNumber(args[0]);
        if (id !== null && record(args[1]).focused === true) {
          this.browsing.focusWindow(id === WINDOW_ID_CURRENT ? (current ?? -1) : id);
        }
        const found = all.find(({ window }) => window.id === id);
        return found ? found.window : null;
      }
      default:
        return null;
    }
  }

  private webNavigation(context: CallContext, member: string, args: readonly unknown[]): unknown {
    const tab = this.findTab(record(args[0]).tabId);
    if (!tab || !context.grant.permissions.includes('webNavigation')) {
      return null;
    }
    // Only the page itself: frames are not tracked separately here.
    const frame = {
      frameId: 0,
      parentFrameId: -1,
      url: tab.url ?? '',
      errorOccurred: false,
      documentLifecycle: 'active',
    };
    if (member === 'getFrame') {
      return record(args[0]).frameId === 0 ? frame : null;
    }
    return member === 'getAllFrames' ? [frame] : null;
  }

  private permissions(grant: ExtensionGrant, member: string, args: readonly unknown[]): unknown {
    const asked = record(args[0]);
    const wanted = (Array.isArray(asked.permissions) ? asked.permissions : []).filter(
      (permission): permission is string => typeof permission === 'string',
    );
    const origins = (Array.isArray(asked.origins) ? asked.origins : []).filter(
      (origin): origin is string => typeof origin === 'string',
    );
    const holds =
      wanted.every((permission) => grant.permissions.includes(permission)) &&
      origins.every(
        (origin) => grant.hostPermissions.includes(origin) || grant.hostPermissions.includes('<all_urls>'),
      );
    switch (member) {
      case 'getAll':
        return { permissions: grant.permissions, origins: grant.hostPermissions };
      case 'contains':
        return holds;
      // Only what was granted when it was added: there is no prompt yet for asking for more.
      case 'request':
        return holds;
      case 'remove':
        return false;
      default:
        return null;
    }
  }

  /** A path inside the extension, as `tabs.create({ url: 'options.html' })` passes one, made into its full address. */
  private resolve(grant: ExtensionGrant, url: string | null): string {
    if (!url) {
      return '';
    }
    try {
      return new URL(url).toString();
    } catch {
      return new URL(url, `chrome-extension://${grant.id}/`).toString();
    }
  }
}
