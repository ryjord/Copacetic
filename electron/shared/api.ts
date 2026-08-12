import type { ChromeSurface } from './channels';
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
} from './types';

export interface ContentInsetsInput {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/** Cancels a subscription made through `copacetic.on.*`. */
export type Unsubscribe = () => void;

/**
 * The contract between the chrome renderer and the main process.
 *
 * Declared here — with no Electron import — so the renderer can depend on the
 * shape of the bridge without pulling any main-process types into its build.
 */
export interface CopaceticApi {
  tabs: {
    create(url?: string, activate?: boolean): Promise<TabId>;
    /** A Hush tab: nothing it does is written to this machine. */
    createHush(): Promise<void>;
    close(id: TabId): Promise<void>;
    activate(id: TabId): Promise<void>;
    move(id: TabId, index: number): Promise<void>;
    navigate(id: TabId, input: string): Promise<void>;
    goBack(id: TabId): Promise<void>;
    goForward(id: TabId): Promise<void>;
    reload(id: TabId, bypassCache?: boolean): Promise<void>;
    stop(id: TabId): Promise<void>;
    setMuted(id: TabId, muted: boolean): Promise<void>;
    duplicate(id: TabId): Promise<void>;
    reopenClosed(): Promise<void>;
    setZoom(id: TabId, zoomFactor: number): Promise<void>;
    openContextMenu(id: TabId): Promise<void>;
  };
  chrome: {
    setContentInsets(insets: ContentInsetsInput): Promise<void>;
    setOverlayVisible(visible: boolean): Promise<void>;
    getState(): Promise<BrowserState>;
  };
  omnibox: {
    suggest(query: string): Promise<Suggestion[]>;
  };
  history: {
    list(query?: string, offset?: number): Promise<HistoryPage>;
    remove(id: string): Promise<void>;
    clear(range: ClearRange): Promise<void>;
    topSites(limit?: number): Promise<TopSite[]>;
  };
  bookmarks: {
    list(): Promise<Bookmark[]>;
    toggle(url: string, title: string): Promise<boolean>;
    remove(id: string): Promise<void>;
  };
  downloads: {
    pause(id: DownloadId): Promise<void>;
    resume(id: DownloadId): Promise<void>;
    cancel(id: DownloadId): Promise<void>;
    /** Resolves with an empty string, or a message explaining why it failed. */
    openFile(id: DownloadId): Promise<string>;
    revealFile(id: DownloadId): Promise<void>;
    remove(id: DownloadId): Promise<void>;
    clearCompleted(): Promise<void>;
  };
  find: {
    start(query: string): Promise<void>;
    next(): Promise<void>;
    previous(): Promise<void>;
    stop(): Promise<void>;
    setMatchCase(matchCase: boolean): Promise<void>;
  };
  settings: {
    get(): Promise<Settings>;
    update(patch: Partial<Settings>): Promise<Settings>;
  };
  permissions: {
    respond(id: string, decision: PermissionDecision, remember: boolean): Promise<void>;
    forget(origin: string, kind: PermissionKind): Promise<void>;
  };
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
  };
  app: {
    getInfo(): Promise<AppInfo>;
    openExternal(url: string): Promise<void>;
  };
  wallpaper: {
    /** The image as a data URL, or null. Fetched on demand, never pushed. */
    get(): Promise<string | null>;
    /** A small version, for showing what is set without the whole image. */
    preview(): Promise<string | null>;
    /** Opens a picker. Resolves empty on success, or with a message. */
    choose(): Promise<string>;
    clear(): Promise<void>;
  };
  data: {
    /** Write bookmarks or history to a file the user chooses. */
    export(kind: ExportKind): Promise<string>;
  };
  auth: {
    /** Answer a challenge. Credentials go straight to the request, unstored. */
    respond(id: string, username: string, password: string): Promise<void>;
    cancel(id: string): Promise<void>;
  };
  connections: {
    /** Every host the tab has contacted since its last page load. */
    list(id: TabId): Promise<ConnectionEntry[]>;
  };
  updates: {
    /** Ask now, rather than waiting for the periodic check. */
    check(): Promise<void>;
    /** Restart into an update that has already been downloaded. */
    install(): Promise<void>;
    /** Open the releases page for a build that cannot update itself. */
    openReleases(): Promise<void>;
  };
  on: {
    state(listener: (state: BrowserState) => void): Unsubscribe;
    focusOmnibox(listener: () => void): Unsubscribe;
    openSurface(listener: (surface: ChromeSurface) => void): Unsubscribe;
  };
}
