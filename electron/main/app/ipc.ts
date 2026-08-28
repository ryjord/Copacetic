import { type IpcMainInvokeEvent, ipcMain } from 'electron';
import { readWallpaper, readWallpaperPreview } from '../system/wallpaper';
import { randomBytes } from 'node:crypto';
import { INVOKE } from '../../shared/channels';
import { resolverFor } from '../../shared/dns';
import { DEFAULT_RECIPE, generatePassword } from '../../shared/password-generator';
import type { ClearRange, PermissionDecision, PermissionKind, Settings } from '../../shared/types';
import type { Browser } from './browser';
import { defaultBrowserStatus, makeDefaultBrowser } from './default-browser';
import { showNewTabMenu, showTabContextMenu } from '../menus/context-menu';
import { HISTORY_PAGE_SIZE } from '../data/store';

/** Every handler is registered through `handle`, which drops any message that did not come from the chrome window's own top-level frame. */
export function registerIpcHandlers(browser: Browser): void {
  const handle = <T>(channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => T) => {
    ipcMain.handle(channel, (event, ...args) => {
      if (event.senderFrame !== browser.window.webContents.mainFrame) {
        throw new Error(`Rejected ${channel} from an unexpected frame`);
      }
      return handler(event, ...args);
    });
  };

  // ------------------------------------------------------------------- tabs

  handle(INVOKE.tabCreate, (_event, url, activate) =>
    browser.tabs.create(asString(url) || undefined, { activate: activate !== false }),
  );
  handle(INVOKE.tabCreateHush, () => browser.newHushTab());
  handle(INVOKE.tabClose, (_event, id) => browser.tabs.close(asString(id)));
  handle(INVOKE.tabActivate, (_event, id) => browser.tabs.activate(asString(id)));
  handle(INVOKE.tabMove, (_event, id, index) => browser.tabs.move(asString(id), asInteger(index)));
  handle(INVOKE.tabNavigate, (_event, id, input) => browser.tabs.navigate(asString(id), asString(input)));
  handle(INVOKE.tabGoBack, (_event, id) => browser.tabs.goBack(asString(id)));
  handle(INVOKE.tabGoForward, (_event, id) => browser.tabs.goForward(asString(id)));
  handle(INVOKE.tabReload, (_event, id, bypassCache) => browser.tabs.reload(asString(id), bypassCache === true));
  handle(INVOKE.tabStop, (_event, id) => browser.tabs.stop(asString(id)));
  handle(INVOKE.tabSetMuted, (_event, id, muted) => browser.tabs.setMuted(asString(id), muted === true));
  handle(INVOKE.tabDuplicate, (_event, id) => browser.tabs.duplicate(asString(id)));
  handle(INVOKE.tabReopenClosed, () => browser.reopenClosedTab());
  handle(INVOKE.tabSetZoom, (_event, id, zoom) => browser.tabs.setZoom(asString(id), asNumber(zoom, 1)));
  handle(INVOKE.tabOpenContextMenu, (_event, id) => showTabContextMenu(browser, asString(id)));
  handle(INVOKE.tabOpenNewTabMenu, () => showNewTabMenu(browser));

  // ----------------------------------------------------------------- chrome

  handle(INVOKE.chromeSetContentBounds, (_event, insets) => {
    if (!isRecord(insets)) {
      return;
    }
    browser.setContentInsets({
      top: asNumber(insets.top, 0),
      left: asNumber(insets.left, 0),
      right: asNumber(insets.right, 0),
      bottom: asNumber(insets.bottom, 0),
    });
  });
  handle(INVOKE.chromeSetOverlayVisible, (_event, visible) => browser.tabs.setOverlayVisible(visible === true));
  handle(INVOKE.chromeGetState, () => browser.getState());

  // ---------------------------------------------------------------- omnibox

  handle(INVOKE.omniboxSuggest, (_event, query) => browser.store.suggest(asString(query)));

  // ---------------------------------------------------------------- history

  handle(INVOKE.historyList, (_event, query, offset) =>
    browser.store.listHistory(asString(query), HISTORY_PAGE_SIZE, Math.max(0, Number(offset) || 0)),
  );
  handle(INVOKE.historyRemove, (_event, id) => {
    browser.store.removeHistory(asString(id));
    browser.scheduleStatePush();
  });
  handle(INVOKE.historyClear, (_event, range) => browser.clearBrowsingData(asClearRange(range)));
  handle(INVOKE.historyTopSites, (_event, limit) => browser.store.topSites(asInteger(limit, 8)));

  // -------------------------------------------------------------- bookmarks

  handle(INVOKE.bookmarksList, () => browser.store.listBookmarks());
  handle(INVOKE.bookmarksToggle, (_event, url, title) => {
    const bookmarked = browser.store.toggleBookmark(asString(url), asString(title));
    browser.scheduleStatePush();
    return bookmarked;
  });
  handle(INVOKE.bookmarksRemove, (_event, id) => {
    browser.store.removeBookmark(asString(id));
    browser.scheduleStatePush();
  });

  // -------------------------------------------------------------- downloads

  handle(INVOKE.downloadsPause, (_event, id) => browser.downloads.pause(asString(id)));
  handle(INVOKE.downloadsResume, (_event, id) => browser.downloads.resume(asString(id)));
  handle(INVOKE.downloadsCancel, (_event, id) => browser.downloads.cancel(asString(id)));
  handle(INVOKE.downloadsOpenFile, (_event, id) => browser.downloads.openFile(asString(id)));
  handle(INVOKE.downloadsRevealFile, (_event, id) => browser.downloads.revealFile(asString(id)));
  handle(INVOKE.downloadsRemove, (_event, id) => browser.downloads.remove(asString(id)));
  handle(INVOKE.downloadsClearCompleted, () => browser.downloads.clearCompleted());

  // ------------------------------------------------------------------- find

  handle(INVOKE.findStart, (_event, query) => browser.tabs.startFind(asString(query)));
  handle(INVOKE.findNext, () => browser.tabs.findNext(true));
  handle(INVOKE.findPrevious, () => browser.tabs.findNext(false));
  handle(INVOKE.findStop, () => browser.tabs.stopFind());
  handle(INVOKE.findSetMatchCase, (_event, matchCase) => browser.tabs.setFindMatchCase(matchCase === true));

  // --------------------------------------------------------------- settings

  handle(INVOKE.settingsGet, () => browser.store.getSettings());
  handle(INVOKE.settingsUpdate, (_event, patch) => browser.updateSettings(asSettingsPatch(patch)));

  // ------------------------------------------------------------ permissions

  handle(INVOKE.permissionsRespond, (_event, id, decision, remember) =>
    browser.respondToPermission(
      asString(id),
      decision === 'allow' ? 'allow' : ('deny' as PermissionDecision),
      remember === true,
    ),
  );

  handle(INVOKE.permissionsForget, (_event, origin, kind) =>
    browser.forgetPermission(asString(origin), asString(kind) as PermissionKind),
  );

  // ----------------------------------------------------------------- window

  handle(INVOKE.windowMinimize, () => browser.window.minimize());
  handle(INVOKE.windowToggleMaximize, () => {
    if (browser.window.isMaximized()) {
      browser.window.unmaximize();
    } else {
      browser.window.maximize();
    }
  });
  handle(INVOKE.windowClose, () => browser.window.close());

  // -------------------------------------------------------------------- app

  handle(INVOKE.appGetInfo, () => browser.getAppInfo());
  handle(INVOKE.appOpenExternal, (_event, url) => browser.openExternal(asString(url)));
  handle(INVOKE.appRevealDiagnostics, () => browser.revealDiagnostics());
  handle(INVOKE.appDefaultBrowserStatus, () => defaultBrowserStatus());
  handle(INVOKE.appMakeDefaultBrowser, () => makeDefaultBrowser());

  // ------------------------------------------------------------------ vault

  // Every field is read back off the payload as a string: the renderer is the
  // one place a malformed shape can come from, and a password is not a thing to
  // pass through on trust.
  handle(INVOKE.vaultList, () => browser.vault.state());
  handle(INVOKE.vaultAdd, (_event, input) =>
    browser.vault.add({
      origin: asString(isRecord(input) ? input.origin : ''),
      username: asString(isRecord(input) ? input.username : ''),
      password: asString(isRecord(input) ? input.password : ''),
    }),
  );
  handle(INVOKE.vaultUpdate, (_event, id, changes) => {
    const patch = isRecord(changes) ? changes : {};
    const result = browser.vault.update(asString(id), pickStrings(patch, ['origin', 'username', 'password']));
    return result?.error ?? '';
  });
  handle(INVOKE.vaultRemove, (_event, id) => browser.vault.remove(asString(id)));
  handle(INVOKE.vaultReveal, (_event, id) => browser.vault.reveal(asString(id)));
  handle(INVOKE.vaultExport, () => browser.exportVault());
  handle(INVOKE.vaultImport, () => browser.importVault());
  handle(INVOKE.vaultLockState, () => browser.vaultLock());
  handle(INVOKE.vaultUnlock, () => browser.unlockVault());
  handle(INVOKE.vaultLock, () => browser.lockVault());
  handle(INVOKE.vaultFacts, () => browser.vaultFacts());
  handle(INVOKE.vaultGenerate, (_event, length) =>
    generatePassword(
      { ...DEFAULT_RECIPE, length: Number(length) || DEFAULT_RECIPE.length },
      (count) => new Uint8Array(randomBytes(count)),
    ),
  );

  // -------------------------------------------------------------- wallpaper

  handle(INVOKE.wallpaperGet, () => readWallpaper());
  handle(INVOKE.wallpaperPreview, () => readWallpaperPreview());
  handle(INVOKE.wallpaperChoose, () => browser.chooseWallpaper());
  handle(INVOKE.wallpaperClear, () => browser.clearWallpaper());

  // ------------------------------------------------------------------- data

  handle(INVOKE.dataExport, (_event, kind) =>
    browser.exportData(asString(kind) === 'history' ? 'history' : 'bookmarks'),
  );
  handle(INVOKE.dataImportBookmarks, () => browser.importBookmarks());

  // ------------------------------------------------------------------- auth

  handle(INVOKE.authRespond, (_event, id, username, password) =>
    browser.respondToAuth(asString(id), asString(username), asString(password)),
  );
  handle(INVOKE.authCancel, (_event, id) => browser.cancelAuth(asString(id)));

  // ------------------------------------------------------------ connections

  handle(INVOKE.connectionsList, (_event, id) => browser.connectionsFor(asString(id)));

  // ---------------------------------------------------------------- updates

  handle(INVOKE.updatesCheck, () => browser.updates.check());
  handle(INVOKE.updatesInstall, () => browser.updates.install());
  handle(INVOKE.updatesOpenReleases, () => browser.updates.openReleasesPage());
}

export function removeIpcHandlers(): void {
  for (const channel of Object.values(INVOKE)) {
    ipcMain.removeHandler(channel);
  }
}

// ---------------------------------------------------------------- coercion
//
// Arguments arrive from a renderer. They are shaped like the API says they are
// right up until they are not, so every one is narrowed before use.

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asInteger(value: unknown, fallback = 0): number {
  return Math.trunc(asNumber(value, fallback));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Keeps only the listed keys, and only where the value actually arrived as a string. */
function pickStrings<K extends string>(
  source: Record<string, unknown>,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const picked: Partial<Record<K, string>> = {};
  for (const key of keys) {
    if (typeof source[key] === 'string') {
      picked[key] = source[key] as string;
    }
  }
  return picked;
}

function asClearRange(value: unknown): ClearRange {
  return value === 'hour' || value === 'day' || value === 'week' || value === 'all' ? value : 'hour';
}

/** Everything the renderer is allowed to change, checked one field at a time. */
export function asSettingsPatch(value: unknown): Partial<Settings> {
  if (!isRecord(value)) {
    return {};
  }
  const patch: Partial<Settings> = {};

  if (typeof value.searchEngine === 'string') {
    patch.searchEngine = value.searchEngine as Settings['searchEngine'];
  }
  if (typeof value.theme === 'string') {
    patch.theme = value.theme as Settings['theme'];
  }
  // Stored the moment it is chosen; Chromium only reads it at the next start,
  // which the interface says rather than pretending the change is immediate.
  if (value.dnsMode === 'system' || value.dnsMode === 'encrypted') {
    patch.dnsMode = value.dnsMode;
  }
  if (typeof value.dnsResolverId === 'string' && resolverFor(value.dnsResolverId)) {
    patch.dnsResolverId = value.dnsResolverId;
  }
  if (value.density === 'comfortable' || value.density === 'compact') {
    patch.density = value.density;
  }
  if (typeof value.checkForUpdates === 'boolean') {
    patch.checkForUpdates = value.checkForUpdates;
  }
  if (typeof value.httpsFirst === 'boolean') {
    patch.httpsFirst = value.httpsFirst;
  }
  if (typeof value.blockTrackers === 'boolean') {
    patch.blockTrackers = value.blockTrackers;
  }
  if (typeof value.restoreTabsOnLaunch === 'boolean') {
    patch.restoreTabsOnLaunch = value.restoreTabsOnLaunch;
  }
  if (typeof value.hushNoticeDismissed === 'boolean') {
    patch.hushNoticeDismissed = value.hushNoticeDismissed;
  }
  if (typeof value.ambientHue === 'number' && Number.isFinite(value.ambientHue)) {
    patch.ambientHue = value.ambientHue;
  }
  if (Array.isArray(value.startPageWidgets)) {
    const allowed = ['clock', 'search', 'topSites', 'bookmarks'];
    const seen = new Set<string>();
    for (const id of value.startPageWidgets) {
      if (typeof id === 'string' && allowed.includes(id)) {
        seen.add(id);
      }
    }
    patch.startPageWidgets = [...seen] as Settings['startPageWidgets'];
  }
  if (typeof value.sidebarWidth === 'number') {
    patch.sidebarWidth = value.sidebarWidth;
  }
  if (typeof value.defaultZoomFactor === 'number') {
    patch.defaultZoomFactor = value.defaultZoomFactor;
  }

  if (isRecord(value.permissionDecisions)) {
    const decisions: Settings['permissionDecisions'] = {};
    for (const [key, decision] of Object.entries(value.permissionDecisions)) {
      if (decision === 'allow' || decision === 'deny') {
        decisions[key] = decision;
      }
    }
    patch.permissionDecisions = decisions;
  }

  if (isRecord(value.zoomLevels)) {
    const levels: Settings['zoomLevels'] = {};
    for (const [origin, level] of Object.entries(value.zoomLevels)) {
      if (typeof level === 'number' && Number.isFinite(level)) {
        levels[origin] = level;
      }
    }
    patch.zoomLevels = levels;
  }

  if (Array.isArray(value.blockerAllowlist)) {
    patch.blockerAllowlist = value.blockerAllowlist.filter(
      (site): site is string => typeof site === 'string' && site.length > 0,
    );
  }

  return patch;
}

/** Refused on purpose, so the coverage test has something to check against. */
export const SETTINGS_NOT_PATCHABLE: readonly string[] = ['hasWallpaper'];
