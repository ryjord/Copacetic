import type { SiteTraces } from '../shared/forgetting';
import { contextBridge, ipcRenderer } from 'electron';
import type { ContentInsetsInput, CopaceticApi } from '../shared/api';
import { INVOKE, PUSH, PUSH_CHANNELS, type ChromeSurface } from '../shared/channels';
import type { GroupColourId } from '../shared/tab-groups';
import type { BookmarkFolder } from '../shared/bookmark-folders';
import type { Notice } from '../shared/notices';
import type {
  AppInfo,
  Bookmark,
  BrowserState,
  ClearRange,
  ConnectionEntry,
  DownloadId,
  ExportKind,
  HistoryPage,
  PermissionDecision,
  PermissionKind,
  Settings,
  Suggestion,
  TabId,
  TopSite,
  VaultInput,
} from '../shared/types';

// The complete surface the chrome renderer can reach.
const api: CopaceticApi = {
  tabs: {
    create: (url?: string, activate = true): Promise<TabId> => ipcRenderer.invoke(INVOKE.tabCreate, url, activate),
    createHush: () => ipcRenderer.invoke(INVOKE.tabCreateHush),
    close: (id: TabId) => ipcRenderer.invoke(INVOKE.tabClose, id),
    activate: (id: TabId) => ipcRenderer.invoke(INVOKE.tabActivate, id),
    move: (id: TabId, index: number) => ipcRenderer.invoke(INVOKE.tabMove, id, index),
    navigate: (id: TabId, input: string) => ipcRenderer.invoke(INVOKE.tabNavigate, id, input),
    goBack: (id: TabId) => ipcRenderer.invoke(INVOKE.tabGoBack, id),
    goForward: (id: TabId) => ipcRenderer.invoke(INVOKE.tabGoForward, id),
    reload: (id: TabId, bypassCache = false) => ipcRenderer.invoke(INVOKE.tabReload, id, bypassCache),
    stop: (id: TabId) => ipcRenderer.invoke(INVOKE.tabStop, id),
    setMuted: (id: TabId, muted: boolean) => ipcRenderer.invoke(INVOKE.tabSetMuted, id, muted),
    duplicate: (id: TabId) => ipcRenderer.invoke(INVOKE.tabDuplicate, id),
    reopenClosed: () => ipcRenderer.invoke(INVOKE.tabReopenClosed),
    setZoom: (id: TabId, zoomFactor: number) => ipcRenderer.invoke(INVOKE.tabSetZoom, id, zoomFactor),
    openContextMenu: (id: TabId) => ipcRenderer.invoke(INVOKE.tabOpenContextMenu, id),
    openNewTabMenu: () => ipcRenderer.invoke(INVOKE.tabOpenNewTabMenu),
  },

  chrome: {
    /** Report how much room the chrome is taking, so tab views can fill the rest. */
    setContentInsets: (insets: ContentInsetsInput) => ipcRenderer.invoke(INVOKE.chromeSetContentBounds, insets),
    setOverlayVisible: (visible: boolean) => ipcRenderer.invoke(INVOKE.chromeSetOverlayVisible, visible),
    setOverlayHeight: (height: number) => ipcRenderer.invoke(INVOKE.chromeSetOverlayHeight, height),
    getState: (): Promise<BrowserState> => ipcRenderer.invoke(INVOKE.chromeGetState),
  },

  omnibox: {
    suggest: (query: string): Promise<Suggestion[]> => ipcRenderer.invoke(INVOKE.omniboxSuggest, query),
  },

  history: {
    list: (query = '', offset = 0): Promise<HistoryPage> => ipcRenderer.invoke(INVOKE.historyList, query, offset),
    remove: (id: string) => ipcRenderer.invoke(INVOKE.historyRemove, id),
    traces: (address: string): Promise<SiteTraces> => ipcRenderer.invoke(INVOKE.historyTraces, address),
    forgetSite: (address: string): Promise<SiteTraces> => ipcRenderer.invoke(INVOKE.historyForgetSite, address),
    totalBlocked: (): Promise<number> => ipcRenderer.invoke(INVOKE.historyTotalBlocked),
    clear: (range: ClearRange) => ipcRenderer.invoke(INVOKE.historyClear, range),
    topSites: (limit = 8): Promise<TopSite[]> => ipcRenderer.invoke(INVOKE.historyTopSites, limit),
  },

  filters: {
    update: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke(INVOKE.filtersUpdate),
  },

  notices: {
    answer: (id: string, confirmed: boolean) => ipcRenderer.invoke(INVOKE.noticeAnswer, id, confirmed),
    pending: (): Promise<Notice[]> => ipcRenderer.invoke(INVOKE.noticesPending),
  },

  bookmarks: {
    list: (): Promise<Bookmark[]> => ipcRenderer.invoke(INVOKE.bookmarksList),
    toggle: (url: string, title: string): Promise<boolean> => ipcRenderer.invoke(INVOKE.bookmarksToggle, url, title),
    remove: (id: string) => ipcRenderer.invoke(INVOKE.bookmarksRemove, id),
    openInActiveTab: (url: string) => ipcRenderer.invoke(INVOKE.bookmarksOpen, url),
    openContextMenu: (id: string) => ipcRenderer.invoke(INVOKE.bookmarksOpenContextMenu, id),
    file: (id: string, folderId: string | null) => ipcRenderer.invoke(INVOKE.bookmarksFile, id, folderId),
  },

  bookmarkFolders: {
    list: (): Promise<BookmarkFolder[]> => ipcRenderer.invoke(INVOKE.bookmarkFoldersList),
    create: (name: string, colour: GroupColourId, parentId: string | null): Promise<BookmarkFolder> =>
      ipcRenderer.invoke(INVOKE.bookmarkFolderCreate, name, colour, parentId),
    update: (id: string, changes: { name?: string; colour?: GroupColourId; collapsed?: boolean }) =>
      ipcRenderer.invoke(INVOKE.bookmarkFolderUpdate, id, changes),
    move: (id: string, parentId: string | null): Promise<boolean> =>
      ipcRenderer.invoke(INVOKE.bookmarkFolderMove, id, parentId),
    remove: (id: string): Promise<{ folders: number; bookmarks: number }> =>
      ipcRenderer.invoke(INVOKE.bookmarkFolderDelete, id),
    openAsGroup: (id: string): Promise<{ opened: number; asked: boolean }> =>
      ipcRenderer.invoke(INVOKE.bookmarkFolderOpenAsGroup, id),
    openContextMenu: (id: string) => ipcRenderer.invoke(INVOKE.bookmarkFolderOpenContextMenu, id),
    openMenu: (id: string, x: number, y: number) => ipcRenderer.invoke(INVOKE.bookmarkFolderOpenMenu, id, x, y),
  },

  downloads: {
    pause: (id: DownloadId) => ipcRenderer.invoke(INVOKE.downloadsPause, id),
    resume: (id: DownloadId) => ipcRenderer.invoke(INVOKE.downloadsResume, id),
    cancel: (id: DownloadId) => ipcRenderer.invoke(INVOKE.downloadsCancel, id),
    openFile: (id: DownloadId): Promise<string> => ipcRenderer.invoke(INVOKE.downloadsOpenFile, id),
    revealFile: (id: DownloadId) => ipcRenderer.invoke(INVOKE.downloadsRevealFile, id),
    remove: (id: DownloadId) => ipcRenderer.invoke(INVOKE.downloadsRemove, id),
    clearCompleted: () => ipcRenderer.invoke(INVOKE.downloadsClearCompleted),
  },

  find: {
    start: (query: string) => ipcRenderer.invoke(INVOKE.findStart, query),
    next: () => ipcRenderer.invoke(INVOKE.findNext),
    previous: () => ipcRenderer.invoke(INVOKE.findPrevious),
    stop: () => ipcRenderer.invoke(INVOKE.findStop),
    setMatchCase: (matchCase: boolean) => ipcRenderer.invoke(INVOKE.findSetMatchCase, matchCase),
  },

  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke(INVOKE.settingsGet),
    update: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke(INVOKE.settingsUpdate, patch),
  },

  permissions: {
    respond: (id: string, decision: PermissionDecision, remember: boolean) =>
      ipcRenderer.invoke(INVOKE.permissionsRespond, id, decision, remember),
    forget: (origin: string, kind: PermissionKind) => ipcRenderer.invoke(INVOKE.permissionsForget, origin, kind),
  },

  window: {
    minimize: () => ipcRenderer.invoke(INVOKE.windowMinimize),
    toggleMaximize: () => ipcRenderer.invoke(INVOKE.windowToggleMaximize),
    close: () => ipcRenderer.invoke(INVOKE.windowClose),
  },

  app: {
    getInfo: (): Promise<AppInfo> => ipcRenderer.invoke(INVOKE.appGetInfo),
    openExternal: (url: string) => ipcRenderer.invoke(INVOKE.appOpenExternal, url),
    revealDiagnostics: () => ipcRenderer.invoke(INVOKE.appRevealDiagnostics),
    defaultBrowserStatus: () => ipcRenderer.invoke(INVOKE.appDefaultBrowserStatus),
    makeDefaultBrowser: () => ipcRenderer.invoke(INVOKE.appMakeDefaultBrowser),
  },

  /** Subscriptions. Each returns an unsubscribe function. */
  vault: {
    list: () => ipcRenderer.invoke(INVOKE.vaultList),
    add: (input: VaultInput) => ipcRenderer.invoke(INVOKE.vaultAdd, input),
    update: (id: string, changes: Partial<VaultInput>) => ipcRenderer.invoke(INVOKE.vaultUpdate, id, changes),
    remove: (id: string) => ipcRenderer.invoke(INVOKE.vaultRemove, id),
    reveal: (id: string) => ipcRenderer.invoke(INVOKE.vaultReveal, id),
    exportAll: () => ipcRenderer.invoke(INVOKE.vaultExport),
    importFile: () => ipcRenderer.invoke(INVOKE.vaultImport),
    generate: (length: number) => ipcRenderer.invoke(INVOKE.vaultGenerate, length),
    lockState: () => ipcRenderer.invoke(INVOKE.vaultLockState),
    unlock: () => ipcRenderer.invoke(INVOKE.vaultUnlock),
    lock: () => ipcRenderer.invoke(INVOKE.vaultLock),
    facts: () => ipcRenderer.invoke(INVOKE.vaultFacts),
  },

  groups: {
    create: (tabId: TabId, name: string, colour: GroupColourId, ownSession: boolean): Promise<string> =>
      ipcRenderer.invoke(INVOKE.groupCreate, tabId, name, colour, ownSession),
    update: (id: string, changes: { name?: string; colour?: GroupColourId; collapsed?: boolean }) =>
      ipcRenderer.invoke(INVOKE.groupUpdate, id, changes),
    remove: (id: string) => ipcRenderer.invoke(INVOKE.groupRemove, id),
    setForTab: (tabId: TabId, groupId: string | null) => ipcRenderer.invoke(INVOKE.groupSetForTab, tabId, groupId),
    openContextMenu: (id: string) => ipcRenderer.invoke(INVOKE.groupOpenContextMenu, id),
  },

  wallpaper: {
    get: (): Promise<string | null> => ipcRenderer.invoke(INVOKE.wallpaperGet),
    preview: (): Promise<string | null> => ipcRenderer.invoke(INVOKE.wallpaperPreview),
    choose: (): Promise<string> => ipcRenderer.invoke(INVOKE.wallpaperChoose),
    staged: () => ipcRenderer.invoke(INVOKE.wallpaperStaged),
    keep: (): Promise<string> => ipcRenderer.invoke(INVOKE.wallpaperKeep),
    remove: () => ipcRenderer.invoke(INVOKE.wallpaperRemove),
    discard: () => ipcRenderer.invoke(INVOKE.wallpaperDiscard),
    clear: () => ipcRenderer.invoke(INVOKE.wallpaperClear),
  },

  data: {
    export: (kind: ExportKind): Promise<string> => ipcRenderer.invoke(INVOKE.dataExport, kind),
    importBookmarks: (): Promise<string> => ipcRenderer.invoke(INVOKE.dataImportBookmarks),
  },

  auth: {
    respond: (id: string, username: string, password: string) =>
      ipcRenderer.invoke(INVOKE.authRespond, id, username, password),
    cancel: (id: string) => ipcRenderer.invoke(INVOKE.authCancel, id),
  },

  connections: {
    list: (id: TabId): Promise<ConnectionEntry[]> => ipcRenderer.invoke(INVOKE.connectionsList, id),
  },

  updates: {
    check: () => ipcRenderer.invoke(INVOKE.updatesCheck),
    install: () => ipcRenderer.invoke(INVOKE.updatesInstall),
    openReleases: () => ipcRenderer.invoke(INVOKE.updatesOpenReleases),
  },

  on: {
    state: (listener: (state: BrowserState) => void) => subscribe(PUSH.state, listener),
    focusOmnibox: (listener: () => void) => subscribe(PUSH.focusOmnibox, listener),
    openSurface: (listener: (surface: ChromeSurface) => void) => subscribe(PUSH.openSurface, listener),
    renameGroup: (listener: (groupId: string) => void) => subscribe(PUSH.renameGroup, listener),
    bookmarksChanged: (listener: () => void) => subscribe(PUSH.bookmarksChanged, listener),
    notice: (listener: (notice: Notice) => void) => subscribe(PUSH.notice, listener),
    noticeSettled: (listener: (id: string) => void) => subscribe(PUSH.noticeSettled, listener),
    renameBookmarkFolder: (listener: (folderId: string) => void) => subscribe(PUSH.renameBookmarkFolder, listener),
  },
};

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  if (!PUSH_CHANNELS.includes(channel as never)) {
    throw new Error(`Refusing to subscribe to undeclared channel ${channel}`);
  }
  const handler = (_event: Electron.IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld('copacetic', api);
