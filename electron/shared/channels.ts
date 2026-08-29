/** The complete list of IPC channels. */

export const INVOKE = {
  tabCreate: 'tab:create',
  tabCreateHush: 'tab:create-hush',
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
  tabOpenNewTabMenu: 'tab:open-new-tab-menu',

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
  bookmarksFile: 'bookmarks:file',
  bookmarksOpen: 'bookmarks:open',
  bookmarksOpenContextMenu: 'bookmarks:open-context-menu',
  noticeAnswer: 'notice:answer',
  noticesPending: 'notice:pending',
  bookmarkFoldersList: 'bookmark-folders:list',
  bookmarkFolderCreate: 'bookmark-folders:create',
  bookmarkFolderUpdate: 'bookmark-folders:update',
  bookmarkFolderMove: 'bookmark-folders:move',
  bookmarkFolderDelete: 'bookmark-folders:delete',
  bookmarkFolderOpenAsGroup: 'bookmark-folders:open-as-group',
  bookmarkFolderOpenContextMenu: 'bookmark-folders:open-context-menu',
  bookmarkFolderOpenMenu: 'bookmark-folders:open-menu',

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
  appRevealDiagnostics: 'app:reveal-diagnostics',
  appDefaultBrowserStatus: 'app:default-browser-status',
  appMakeDefaultBrowser: 'app:make-default-browser',
  wallpaperStaged: 'wallpaper:staged',
  wallpaperKeep: 'wallpaper:keep',
  wallpaperDiscard: 'wallpaper:discard',
  wallpaperRemove: 'wallpaper:remove',
  groupCreate: 'group:create',
  groupUpdate: 'group:update',
  groupRemove: 'group:remove',
  groupSetForTab: 'group:set-for-tab',
  groupOpenContextMenu: 'group:open-context-menu',

  connectionsList: 'connections:list',

  dataExport: 'data:export',
  dataImportBookmarks: 'data:import-bookmarks',

  vaultList: 'vault:list',
  vaultAdd: 'vault:add',
  vaultUpdate: 'vault:update',
  vaultRemove: 'vault:remove',
  vaultReveal: 'vault:reveal',
  vaultExport: 'vault:export',
  vaultImport: 'vault:import',
  vaultGenerate: 'vault:generate',
  vaultLockState: 'vault:lock-state',
  vaultUnlock: 'vault:unlock',
  vaultLock: 'vault:lock',
  vaultFacts: 'vault:facts',

  wallpaperGet: 'wallpaper:get',
  wallpaperPreview: 'wallpaper:preview',
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
  /** A native menu cannot hold a text field, so renaming asks the chrome to make the group's label editable. */
  renameGroup: 'push:rename-group',
  /** Saved bookmarks or folders changed. No tab changes when one is filed, so the tab snapshot cannot say it. */
  bookmarksChanged: 'push:bookmarks-changed',
  /** Something the app finished, or a question it has to ask before finishing. */
  notice: 'push:notice',
  /** The same, for a bookmark folder: a native menu cannot hold a text field. */
  renameBookmarkFolder: 'push:rename-bookmark-folder',
} as const;

export type InvokeChannel = (typeof INVOKE)[keyof typeof INVOKE];
export type PushChannel = (typeof PUSH)[keyof typeof PUSH];

export const INVOKE_CHANNELS: readonly InvokeChannel[] = Object.values(INVOKE);
export const PUSH_CHANNELS: readonly PushChannel[] = Object.values(PUSH);

/** Chrome surfaces that cover the page content and therefore hide the tab view. */
export type ChromeSurface = 'settings' | 'downloads' | 'history' | 'bookmarks' | 'palette' | 'none';
