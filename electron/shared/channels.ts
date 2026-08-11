/**
 * The complete list of IPC channels.
 *
 * The preload bridge only ever forwards names from this file, and the main
 * process only ever registers names from this file. Anything else is dropped,
 * so a compromised renderer cannot reach a channel that was never declared.
 */

export const INVOKE = {
  tabCreate: 'tab:create',
  tabClose: 'tab:close',
  tabActivate: 'tab:activate',
  tabMove: 'tab:move',
  tabNavigate: 'tab:navigate',
  tabGoBack: 'tab:go-back',
  tabGoForward: 'tab:go-forward',
  tabReload: 'tab:reload',
  tabStop: 'tab:stop',
  tabSetMuted: 'tab:set-muted',
  tabDuplicate: 'tab:duplicate',
  tabReopenClosed: 'tab:reopen-closed',
  tabSetZoom: 'tab:set-zoom',
  tabOpenContextMenu: 'tab:open-context-menu',

  chromeSetContentBounds: 'chrome:set-content-bounds',
  chromeSetOverlayVisible: 'chrome:set-overlay-visible',
  chromeGetState: 'chrome:get-state',

  omniboxSuggest: 'omnibox:suggest',

  historyList: 'history:list',
  historyRemove: 'history:remove',
  historyClear: 'history:clear',
  historyTopSites: 'history:top-sites',

  bookmarksList: 'bookmarks:list',
  bookmarksToggle: 'bookmarks:toggle',
  bookmarksRemove: 'bookmarks:remove',

  downloadsPause: 'downloads:pause',
  downloadsResume: 'downloads:resume',
  downloadsCancel: 'downloads:cancel',
  downloadsOpenFile: 'downloads:open-file',
  downloadsRevealFile: 'downloads:reveal-file',
  downloadsRemove: 'downloads:remove',
  downloadsClearCompleted: 'downloads:clear-completed',

  findStart: 'find:start',
  findNext: 'find:next',
  findPrevious: 'find:previous',
  findStop: 'find:stop',
  findSetMatchCase: 'find:set-match-case',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  permissionsRespond: 'permissions:respond',
  permissionsForget: 'permissions:forget',

  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',

  appGetInfo: 'app:get-info',
  appOpenExternal: 'app:open-external',

  connectionsList: 'connections:list',

  dataExport: 'data:export',

  wallpaperGet: 'wallpaper:get',
  wallpaperChoose: 'wallpaper:choose',
  wallpaperClear: 'wallpaper:clear',

  authRespond: 'auth:respond',
  authCancel: 'auth:cancel',

  updatesCheck: 'updates:check',
  updatesInstall: 'updates:install',
  updatesOpenReleases: 'updates:open-releases',
} as const;

/** Pushes from main to the chrome renderer. */
export const PUSH = {
  state: 'push:state',
  /** Fired when the main process wants the chrome to focus the omnibox. */
  focusOmnibox: 'push:focus-omnibox',
  /** Fired when a menu item or shortcut wants the chrome to open a surface. */
  openSurface: 'push:open-surface',
} as const;

export type InvokeChannel = (typeof INVOKE)[keyof typeof INVOKE];
export type PushChannel = (typeof PUSH)[keyof typeof PUSH];

export const INVOKE_CHANNELS: readonly InvokeChannel[] = Object.values(INVOKE);
export const PUSH_CHANNELS: readonly PushChannel[] = Object.values(PUSH);

/** Chrome surfaces that cover the page content and therefore hide the tab view. */
export type ChromeSurface = 'settings' | 'downloads' | 'history' | 'bookmarks' | 'palette' | 'none';
