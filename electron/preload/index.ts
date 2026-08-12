import { contextBridge, ipcRenderer } from 'electron';
import type { ContentInsetsInput, CopaceticApi } from '../shared/api';
import { INVOKE, PUSH, PUSH_CHANNELS, type ChromeSurface } from '../shared/channels';
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
    getState: (): Promise<BrowserState> => ipcRenderer.invoke(INVOKE.chromeGetState),
  },

  omnibox: {
    suggest: (query: string): Promise<Suggestion[]> => ipcRenderer.invoke(INVOKE.omniboxSuggest, query),
  },

  history: {
    list: (query = '', offset = 0): Promise<HistoryPage> => ipcRenderer.invoke(INVOKE.historyList, query, offset),
    remove: (id: string) => ipcRenderer.invoke(INVOKE.historyRemove, id),
    clear: (range: ClearRange) => ipcRenderer.invoke(INVOKE.historyClear, range),
    topSites: (limit = 8): Promise<TopSite[]> => ipcRenderer.invoke(INVOKE.historyTopSites, limit),
  },

  bookmarks: {
    list: (): Promise<Bookmark[]> => ipcRenderer.invoke(INVOKE.bookmarksList),
    toggle: (url: string, title: string): Promise<boolean> => ipcRenderer.invoke(INVOKE.bookmarksToggle, url, title),
    remove: (id: string) => ipcRenderer.invoke(INVOKE.bookmarksRemove, id),
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
  },

  wallpaper: {
    get: (): Promise<string | null> => ipcRenderer.invoke(INVOKE.wallpaperGet),
    preview: (): Promise<string | null> => ipcRenderer.invoke(INVOKE.wallpaperPreview),
    choose: (): Promise<string> => ipcRenderer.invoke(INVOKE.wallpaperChoose),
    clear: () => ipcRenderer.invoke(INVOKE.wallpaperClear),
  },

  data: {
    export: (kind: ExportKind): Promise<string> => ipcRenderer.invoke(INVOKE.dataExport, kind),
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
