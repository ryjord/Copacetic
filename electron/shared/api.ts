import type { ChromeSurface } from './channels';
import type {
  AppInfo,
  DefaultBrowserStatus,
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
  VaultFacts,
  VaultInput,
  VaultLock,
  VaultState,
} from './types';

export interface ContentInsetsInput {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/** Cancels a subscription made through `copacetic.on.*`. */
export type Unsubscribe = () => void;

/** The contract between the chrome renderer and the main process. */
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
    /** The menu behind the caret beside the new-tab button. */
    openNewTabMenu(): Promise<void>;
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
    /** Show the diagnostics log in the file manager, so it can be read before it is shared. */
    revealDiagnostics(): Promise<void>;
    /** What this platform will actually allow, so the control can say it. */
    defaultBrowserStatus(): Promise<DefaultBrowserStatus>;
    /** Empty when it worked or there was nothing to do; otherwise a sentence for the user. */
    makeDefaultBrowser(): Promise<string>;
  };
  vault: {
    /** Fetched when the pane is open rather than pushed: it is not needed to render a page. */
    list(): Promise<VaultState>;
    /** Resolves with the new id, or a message explaining why nothing was saved. */
    add(input: VaultInput): Promise<{ id: string } | { error: string }>;
    /** Resolves empty on success, or with a message. */
    update(id: string, changes: Partial<VaultInput>): Promise<string>;
    remove(id: string): Promise<void>;
    /** One password, by id, only when asked. Never part of the listed state. */
    reveal(id: string): Promise<string | null>;
    /** Writes a plain-text CSV where the user chooses. Resolves empty, or with what to tell them. */
    exportAll(): Promise<string>;
    /** Reads a CSV another manager wrote. Resolves with a summary of what came of it. */
    importFile(): Promise<string>;
    /** A generated password. Made in the main process, where the random source is. */
    generate(length: number): Promise<string>;
    /** Whether the vault is open, and what this machine can ask to open it. */
    lockState(): Promise<VaultLock>;
    /** Resolves empty when unlocked, or with what to tell the user. */
    unlock(): Promise<string>;
    lock(): Promise<void>;
    /** Where the file is and what is actually protecting it. */
    facts(): Promise<VaultFacts>;
  };

  wallpaper: {
    /** The image as a data URL, or null. Fetched on demand, never pushed. */
    get(): Promise<string | null>;
    /** A small version, for showing what is set without the whole image. */
    preview(): Promise<string | null>;
    /** Opens a picker. The choice waits to be kept, exactly like the rest of the pane. */
    choose(): Promise<string>;
    /** What has been picked but not yet kept, as a data URL. */
    staged(): Promise<string | null>;
    /** Writes what was picked. */
    keep(): Promise<void>;
    /** Forgets what was picked, leaving whatever was there before. */
    discard(): Promise<void>;
    clear(): Promise<void>;
  };
  data: {
    /** Write bookmarks or history to a file the user chooses. */
    export(kind: ExportKind): Promise<string>;
    /** Reads the bookmark file any browser exports. Resolves with a summary. */
    importBookmarks(): Promise<string>;
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
