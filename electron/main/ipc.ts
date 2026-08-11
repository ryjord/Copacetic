import { type IpcMainInvokeEvent, ipcMain } from 'electron';
import { INVOKE } from '../shared/channels';
import type { ClearRange, PermissionDecision, PermissionKind, Settings } from '../shared/types';
import type { Browser } from './browser';
import { showTabContextMenu } from './context-menu';

/**
 * Every handler is registered through `handle`, which drops any message that
 * did not come from the chrome window's own top-level frame.
 *
 * Page content is loaded with no preload script and cannot reach `ipcRenderer`
 * at all, so this is belt and braces — but it is the belt that stops a future
 * change to webPreferences from quietly opening the whole surface up.
 */
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

  // ----------------------------------------------------------------- chrome

  handle(INVOKE.chromeSetContentBounds, (_event, insets) => {
    if (!isRecord(insets)) return;
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

  handle(INVOKE.historyList, (_event, query) => browser.store.listHistory(asString(query)));
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
    if (browser.window.isMaximized()) browser.window.unmaximize();
    else browser.window.maximize();
  });
  handle(INVOKE.windowClose, () => browser.window.close());

  // -------------------------------------------------------------------- app

  handle(INVOKE.appGetInfo, () => browser.getAppInfo());
  handle(INVOKE.appOpenExternal, (_event, url) => browser.openExternal(asString(url)));

  // ------------------------------------------------------------------- data

  handle(INVOKE.dataExport, (_event, kind) =>
    browser.exportData(asString(kind) === 'history' ? 'history' : 'bookmarks'),
  );

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
  for (const channel of Object.values(INVOKE)) ipcMain.removeHandler(channel);
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

function asClearRange(value: unknown): ClearRange {
  return value === 'hour' || value === 'day' || value === 'week' || value === 'all' ? value : 'hour';
}

/** Only keys the settings schema actually declares survive the trip. */
function asSettingsPatch(value: unknown): Partial<Settings> {
  if (!isRecord(value)) return {};
  const patch: Partial<Settings> = {};

  if (typeof value.searchEngine === 'string') patch.searchEngine = value.searchEngine as Settings['searchEngine'];
  if (typeof value.theme === 'string') patch.theme = value.theme as Settings['theme'];
  if (typeof value.httpsFirst === 'boolean') patch.httpsFirst = value.httpsFirst;
  if (typeof value.blockTrackers === 'boolean') patch.blockTrackers = value.blockTrackers;
  if (typeof value.restoreTabsOnLaunch === 'boolean') patch.restoreTabsOnLaunch = value.restoreTabsOnLaunch;
  if (typeof value.showStartPageClock === 'boolean') patch.showStartPageClock = value.showStartPageClock;
  if (typeof value.showTopSites === 'boolean') patch.showTopSites = value.showTopSites;
  if (typeof value.sidebarWidth === 'number') patch.sidebarWidth = value.sidebarWidth;
  if (typeof value.defaultZoomFactor === 'number') patch.defaultZoomFactor = value.defaultZoomFactor;

  return patch;
}
