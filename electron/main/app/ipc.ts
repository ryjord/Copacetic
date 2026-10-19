import type { KeptKind } from '../../shared/forgetting';
import { type IpcMainInvokeEvent, ipcMain } from 'electron';
import {
  chooseWallpaper,
  clearWallpaper,
  commitStagedChanges,
  discardStagedWallpaper,
  readWallpaper,
  readWallpaperPreview,
  stageWallpaperRemoval,
  stagedWallpaper,
} from '../system/wallpaper';
import { randomBytes } from 'node:crypto';
import { type ApiArgs, type ApiMethod, type ApiResult, CHANNELS } from '../../shared/ipc-contract';
import { resolverFor } from '../../shared/dns';
import { DEFAULT_RECIPE, generatePassword } from '../../shared/password-generator';
import { clampZoom, isAppearanceId, isThemeId } from '../../shared/types';
import type { ClearRange, PermissionDecision, PermissionKind, Settings } from '../../shared/types';
import { SEARCH_ENGINES } from '../../shared/url';
import type { Browser } from './browser';
import { defaultBrowserStatus, makeDefaultBrowser } from '../system/default-browser';
import { GROUP_COLOURS, type GroupColourId } from '../../shared/tab-groups';
import {
  showBookmarkContextMenu,
  showSiteContextMenu,
  showBookmarkFolderContextMenu,
  showBookmarkFolderMenu,
  showGroupContextMenu,
  showNewTabMenu,
  showTabContextMenu,
} from '../menus/context-menu';
import { showMainMenu } from '../menus/main-menu';
import { toSuggestionView } from '../../shared/suggestion-view';
import { HISTORY_PAGE_SIZE } from '../data/store';

/**
 * The arguments a method declares, each one unknown: they come from a renderer
 * and are narrowed before use, but a handler cannot read one that is not sent.
 */
type Untrusted<Args extends unknown[]> = { [Index in keyof Args]: unknown };

/** Every handler is registered through `handle`, which drops any message that did not come from one of the browser's own top-level frames, the chrome window or the overlay. */
export function registerIpcHandlers(browser: Browser): void {
  const handle = <Method extends ApiMethod>(
    method: Method,
    handler: (
      event: IpcMainInvokeEvent,
      ...args: Untrusted<ApiArgs<Method>>
    ) => ApiResult<Method> | Promise<ApiResult<Method>>,
  ) => {
    const channel = CHANNELS[method];
    ipcMain.handle(channel, (event, ...args) => {
      if (!browser.isOwnFrame(event.senderFrame)) {
        throw new Error(`Rejected ${channel} from an unexpected frame`);
      }
      // Every element is unknown either way; this only gives the list the method's length.
      return handler(event, ...(args as Untrusted<ApiArgs<Method>>));
    });
  };

  // ------------------------------------------------------------------- tabs

  handle('tabs.create', (_event, url, activate) =>
    browser.tabs.create(asString(url) || undefined, { activate: activate !== false }),
  );
  handle('tabs.createHush', () => browser.commands.newHushTab());
  handle('tabs.close', (_event, id) => browser.tabs.close(asString(id)));
  handle('tabs.activate', (_event, id) => browser.tabs.activate(asString(id)));
  handle('tabs.move', (_event, id, index) => browser.tabs.move(asString(id), asInteger(index)));
  handle('tabs.navigate', (_event, id, input) => browser.tabs.navigate(asString(id), asString(input)));
  handle('tabs.goBack', (_event, id) => browser.tabs.goBack(asString(id)));
  handle('tabs.goForward', (_event, id) => browser.tabs.goForward(asString(id)));
  handle('tabs.reload', (_event, id, bypassCache) => browser.tabs.reload(asString(id), bypassCache === true));
  handle('tabs.stop', (_event, id) => browser.tabs.stop(asString(id)));
  handle('tabs.setMuted', (_event, id, muted) => browser.tabs.setMuted(asString(id), muted === true));
  handle('tabs.duplicate', (_event, id) => browser.tabs.duplicate(asString(id)));
  handle('tabs.continueOverHttp', (_event, id) => browser.tabs.continueOverHttp(asString(id)));
  handle('tabs.acceptCertificate', (_event, id) => browser.tabs.acceptCertificate(asString(id)));
  handle('tabs.reopenClosed', () => browser.commands.reopenClosedTab());
  handle('tabs.print', (_event, id) => browser.tabs.print(asString(id)));
  handle('tabs.setZoom', (_event, id, zoom) => browser.tabs.setZoom(asString(id), asNumber(zoom, 1)));
  handle('tabs.openContextMenu', (_event, id) => showTabContextMenu(browser, asString(id)));
  handle('tabs.openNewTabMenu', () => showNewTabMenu(browser));

  // ----------------------------------------------------------------- chrome

  handle('chrome.setContentInsets', (_event, insets) => {
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
  handle('chrome.setOverlayVisible', (_event, visible) => browser.tabs.setOverlayVisible(visible === true));
  handle('chrome.getState', () => browser.getState());

  // ---------------------------------------------------------------- omnibox

  handle('omnibox.suggest', (_event, query) => browser.store.suggest(asString(query)));
  handle('omnibox.showSuggestions', (_event, view) => browser.showSuggestions(toSuggestionView(view)));
  handle('omnibox.choose', (_event, target) => browser.chooseSuggestion(asString(target)));

  // ---------------------------------------------------------------- history

  handle('history.list', (_event, query, offset) =>
    browser.store.listHistory(asString(query), HISTORY_PAGE_SIZE, Math.max(0, Number(offset) || 0)),
  );
  handle('history.remove', (_event, id) => {
    browser.store.removeHistory(asString(id));
    browser.scheduleStatePush();
  });
  handle('history.clear', (_event, range) => browser.sites.clearBrowsing(asClearRange(range)));
  handle('history.topSites', (_event, limit) => browser.store.topSites(asInteger(limit, 8)));

  // -------------------------------------------------------------- bookmarks

  handle('bookmarks.list', () => browser.store.listBookmarks());
  handle('bookmarks.toggle', (_event, url, title) => {
    const bookmarked = browser.store.toggleBookmark(asString(url), asString(title));
    browser.bookmarks.changed();
    browser.scheduleStatePush();
    return bookmarked;
  });
  handle('bookmarks.remove', (_event, id) => {
    browser.store.removeBookmark(asString(id));
    browser.bookmarks.changed();
    browser.scheduleStatePush();
  });
  handle('bookmarks.openInActiveTab', (_event, url) => browser.commands.openInActiveTab(asString(url)));
  handle('bookmarks.openContextMenu', (_event, id) => showBookmarkContextMenu(browser, asString(id)));
  handle('history.traces', (_event, address) => browser.sites.traces(asString(address)));
  handle('history.totalBlocked', () => browser.store.totalBlocked());
  handle('data.kept', () => browser.sites.kept());
  handle('history.openContextMenu', (_event, address) => showSiteContextMenu(browser, asString(address)));
  handle('data.clearKept', (_event, kind) => browser.sites.clearKept(asString(kind) as KeptKind));
  handle('history.forgetSite', (_event, address) => browser.sites.forget(asString(address)));
  handle('notices.answer', (_event, id, confirmed) => browser.notices.answer(asString(id), confirmed === true));
  handle('notices.pending', () => browser.notices.pending());
  handle('chrome.pendingSurface', () => browser.pendingSurface());
  handle('chrome.openMainMenu', (_event, x, y) =>
    showMainMenu(browser, Math.round(asNumber(x, 0)), Math.round(asNumber(y, 0))),
  );
  handle('chrome.focusOverlay', (event) => browser.focusOverlay(event.senderFrame));
  handle('chrome.toggleSiteInfo', () => browser.toggleSiteInfo());
  handle('chrome.closeSiteInfo', () => browser.closeSiteInfo());
  handle('chrome.setOverlaySize', (event, width, height) =>
    browser.setOverlaySize(event.senderFrame, asNumber(width, 0), asNumber(height, 0)),
  );
  handle('favicons.forUrls', (_event, urls) => browser.store.faviconsFor(pickUrls(urls)));
  handle('filters.update', () => browser.updateFilterLists());
  handle('bookmarks.file', (_event, id, folderId) => {
    browser.store.fileBookmark(asString(id), asOptionalId(folderId));
    browser.bookmarks.changed();
    browser.scheduleStatePush();
  });

  handle('bookmarkFolders.list', () => browser.store.listBookmarkFolders());
  handle('bookmarkFolders.create', (_event, name, colour, parentId) =>
    browser.bookmarks.createFolder(asString(name), asGroupColour(colour), asOptionalId(parentId)),
  );
  handle('bookmarkFolders.update', (_event, id, changes) =>
    browser.bookmarks.updateFolder(asString(id), asGroupChanges(changes)),
  );
  handle('bookmarkFolders.move', (_event, id, parentId) =>
    browser.bookmarks.moveFolder(asString(id), asOptionalId(parentId)),
  );
  handle('bookmarkFolders.remove', (_event, id) => browser.bookmarks.deleteFolder(asString(id)));
  handle('bookmarkFolders.openAsGroup', (_event, id) => browser.groups.openFolder(asString(id)));
  handle('bookmarkFolders.openContextMenu', (_event, id) => showBookmarkFolderContextMenu(browser, asString(id)));
  handle('bookmarkFolders.openMenu', (_event, id, x, y) =>
    showBookmarkFolderMenu(browser, asString(id), Math.round(asNumber(x, 0)), Math.round(asNumber(y, 0))),
  );

  // -------------------------------------------------------------- downloads

  handle('downloads.pause', (_event, id) => browser.downloads.pause(asString(id)));
  handle('downloads.resume', (_event, id) => browser.downloads.resume(asString(id)));
  handle('downloads.cancel', (_event, id) => browser.downloads.cancel(asString(id)));
  handle('downloads.openFile', (_event, id) => browser.downloads.openFile(asString(id)));
  handle('downloads.revealFile', (_event, id) => browser.downloads.revealFile(asString(id)));
  handle('downloads.remove', (_event, id) => browser.downloads.remove(asString(id)));
  handle('downloads.clearCompleted', () => browser.downloads.clearCompleted());

  // ------------------------------------------------------------------- find

  handle('find.open', () => browser.openFind());
  handle('find.start', (_event, query) => browser.tabs.startFind(asString(query)));
  handle('find.next', () => browser.tabs.findNext(true));
  handle('find.previous', () => browser.tabs.findNext(false));
  handle('find.stop', () => browser.stopFind());
  handle('find.setMatchCase', (_event, matchCase) => browser.tabs.setFindMatchCase(matchCase === true));

  // --------------------------------------------------------------- settings

  handle('settings.get', () => browser.store.getSettings());
  handle('settings.update', (_event, patch) => browser.updateSettings(asSettingsPatch(patch)));

  // ------------------------------------------------------------ permissions

  handle('permissions.respond', (_event, id, decision, remember) =>
    browser.respondToPermission(
      asString(id),
      decision === 'allow' ? 'allow' : ('deny' as PermissionDecision),
      remember === true,
    ),
  );

  handle('permissions.forget', (_event, origin, kind) =>
    browser.forgetPermission(asString(origin), asString(kind) as PermissionKind),
  );

  // ----------------------------------------------------------------- window

  handle('window.minimize', () => browser.window.minimize());
  handle('window.toggleMaximize', () => {
    if (browser.window.isMaximized()) {
      browser.window.unmaximize();
    } else {
      browser.window.maximize();
    }
  });
  handle('window.close', () => browser.window.close());

  // -------------------------------------------------------------------- app

  handle('app.getInfo', () => browser.getAppInfo());
  handle('app.openExternal', (_event, url) => browser.openExternal(asString(url)));
  handle('app.revealDiagnostics', () => browser.revealDiagnostics());
  handle('app.defaultBrowserStatus', () => defaultBrowserStatus());
  handle('app.makeDefaultBrowser', () => makeDefaultBrowser());

  // ------------------------------------------------------------------ vault

  // Every field is read back off the payload as a string: the renderer is the
  // one place a malformed shape can come from, and a password is not a thing to
  // pass through on trust.
  handle('vault.list', () => browser.vault.state());
  handle('vault.add', (_event, input) =>
    browser.vault.add({
      origin: asString(isRecord(input) ? input.origin : ''),
      username: asString(isRecord(input) ? input.username : ''),
      password: asString(isRecord(input) ? input.password : ''),
    }),
  );
  handle('vault.update', (_event, id, changes) => {
    const patch = isRecord(changes) ? changes : {};
    const result = browser.vault.update(asString(id), pickStrings(patch, ['origin', 'username', 'password']));
    return result?.error ?? '';
  });
  handle('vault.remove', (_event, id) => browser.vault.remove(asString(id)));
  handle('vault.reveal', (_event, id) => browser.vault.reveal(asString(id)));
  handle('vault.exportAll', () => browser.transfer.exportPasswords());
  handle('vault.importFile', () => browser.transfer.importPasswords());
  handle('vault.lockState', () => browser.vaultSession.lockInfo());
  handle('vault.unlock', () => browser.vaultSession.unlock());
  handle('vault.lock', () => browser.vaultSession.lock());
  handle('vault.facts', () => browser.vaultSession.facts());
  handle('vault.generate', (_event, length) =>
    generatePassword(
      { ...DEFAULT_RECIPE, length: Number(length) || DEFAULT_RECIPE.length },
      (count) => new Uint8Array(randomBytes(count)),
    ),
  );

  // -------------------------------------------------------------- wallpaper

  handle('wallpaper.get', () => readWallpaper());
  handle('wallpaper.preview', () => readWallpaperPreview());
  // Each changes what the start page shows, so the chrome is told afterwards.
  const thenPush = <Result>(result: Result): Result => {
    browser.scheduleStatePush();
    return result;
  };
  handle('wallpaper.choose', async () => thenPush(await chooseWallpaper(browser.window)));
  handle('wallpaper.clear', () => thenPush(clearWallpaper()));
  handle('wallpaper.staged', () => stagedWallpaper());
  handle('wallpaper.keep', () => thenPush(commitStagedChanges()));
  handle('wallpaper.remove', () => thenPush(stageWallpaperRemoval()));

  // ------------------------------------------------------------------ groups

  handle('groups.create', (_event, tabId, name, colour, ownSession) =>
    browser.groups.create(asString(tabId), asString(name), asGroupColour(colour), ownSession === true),
  );
  handle('groups.update', (_event, id, changes) => browser.groups.update(asString(id), asGroupChanges(changes)));
  handle('groups.remove', (_event, id) => browser.groups.remove(asString(id)));
  handle('groups.openContextMenu', (_event, id) => showGroupContextMenu(browser, asString(id)));
  handle('groups.setForTab', (_event, tabId, groupId) =>
    browser.groups.setForTab(asString(tabId), typeof groupId === 'string' && groupId ? groupId : null),
  );
  handle('wallpaper.discard', () => thenPush(discardStagedWallpaper()));

  // ------------------------------------------------------------------- data

  handle('data.export', (_event, kind) =>
    browser.transfer.exportData(asString(kind) === 'history' ? 'history' : 'bookmarks'),
  );
  handle('data.importBookmarks', () => browser.transfer.importBookmarks());

  // ------------------------------------------------------------------- auth

  handle('auth.respond', (_event, id, username, password) =>
    browser.respondToAuth(asString(id), asString(username), asString(password)),
  );
  handle('auth.cancel', (_event, id) => browser.cancelAuth(asString(id)));

  // ------------------------------------------------------------ connections

  handle('connections.list', (_event, id) => browser.connectionsFor(asString(id)));

  // ---------------------------------------------------------------- updates

  handle('updates.check', () => browser.updates.check());
  handle('updates.install', () => browser.updates.install());
  handle('updates.openReleases', () => browser.updates.openReleasesPage());
}

export function removeIpcHandlers(): void {
  for (const channel of Object.values(CHANNELS)) {
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

/** An id that may be absent. An empty string is not an id, and neither is anything that is not a string. */
function asOptionalId(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function asGroupColour(value: unknown): GroupColourId {
  const known = GROUP_COLOURS.find((colour) => colour.id === value);
  return known?.id ?? GROUP_COLOURS[0].id;
}

function asGroupChanges(value: unknown): { name?: string; colour?: GroupColourId; collapsed?: boolean } {
  if (!isRecord(value)) {
    return {};
  }
  const changes: { name?: string; colour?: GroupColourId; collapsed?: boolean } = {};
  if (typeof value.name === 'string') {
    changes.name = value.name.slice(0, 60);
  }
  if (GROUP_COLOURS.some((colour) => colour.id === value.colour)) {
    changes.colour = value.colour as GroupColourId;
  }
  if (typeof value.collapsed === 'boolean') {
    changes.collapsed = value.collapsed;
  }
  return changes;
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

  // Checked rather than cast. A cast satisfies the compiler and stores whatever
  // arrived, so an unknown engine or theme was kept in memory and applied until
  // the next start, when the store's own reviver quietly corrected it - a
  // setting that fixes itself overnight and nobody can explain.
  if (typeof value.searchEngine === 'string' && value.searchEngine in SEARCH_ENGINES) {
    patch.searchEngine = value.searchEngine as Settings['searchEngine'];
  }
  if (typeof value.appearance === 'string' && isAppearanceId(value.appearance)) {
    patch.appearance = value.appearance;
  }
  if (typeof value.theme === 'string' && isThemeId(value.theme)) {
    patch.theme = value.theme;
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
  if (typeof value.showBookmarksBar === 'boolean') {
    patch.showBookmarksBar = value.showBookmarksBar;
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
  // Checked and clamped like the per-site levels below it, which it was not:
  // the two sat beside each other doing different things, and this one let a
  // value through that no control can produce.
  if (typeof value.defaultZoomFactor === 'number' && Number.isFinite(value.defaultZoomFactor)) {
    patch.defaultZoomFactor = clampZoom(value.defaultZoomFactor);
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
        // Clamped on the way in as well as when applied. Stored unclamped, a
        // level of 1000 was written down and read back as that site's zoom.
        levels[origin] = clampZoom(level);
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

/** At most a few hundred addresses, each a string: a list on screen, not a dump of history. */
function pickUrls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length < 2048).slice(0, 500);
}
