import { type BrowserWindow, type WebContents, type WebFrameMain, dialog } from 'electron';
import { PUSH, type ChromeSurface } from '../../shared/channels';
import type {
  AppInfo,
  BrowserState,
  ConnectionEntry,
  PermissionDecision,
  PermissionKind,
  Settings,
  SiteInfoState,
  TabId,
} from '../../shared/types';
import { START_PAGE_URL } from '../../shared/url';
import type { OverlayRegion } from '../../shared/overlay-regions';
import type { SuggestionView } from '../../shared/suggestion-view';
import { type SurfaceRequest, stillWanted, worthHolding } from '../../shared/surfaces';
import type { ContentBlocker } from '../security/blocker';
import type { DownloadManager } from '../data/downloads';
import type { BrowserStore } from '../data/store';
import type { SessionSnapshot } from '../data/session-store';
import { hasWallpaper } from '../system/wallpaper';
import { focusContents, showWindow } from '../system/launch-mode';
import type { UpdateManager } from '../system/updates';
import type { Vault } from '../vault/vault';
import type { VaultSession } from '../vault/vault-session';
import { type ContentInsets } from '../tabs/tab-layout';
import { TabManager } from '../tabs/tabs';
import { StatePublisher } from '../state/state-publisher';
import { NoticeCentre } from '../notices/notice-centre';
import { BookmarkCommands } from '../workflows/bookmarks';
import { DataTransfer } from '../workflows/data-transfer';
import { GroupCommands } from '../workflows/groups';
import { PasswordFill } from '../workflows/password-fill';
import { SiteData } from '../workflows/site-data';
import { TabCommands } from '../workflows/tab-commands';
import { OverlayLayer } from '../window/overlay';
import { createChromeWindow } from '../window/window';
import { surfaceColour } from '../window/appearance';
import { showPageContextMenu } from '../menus/context-menu';
import { chromeEntryUrl, isDevelopment } from './env';
import type { Profile } from './profile';

/**
 * One browser window: its tabs, the layers drawn over its pages, and the verbs
 * its menus, shortcuts and chrome call into.
 *
 * What outlives a window - the store, the vault, downloads, sessions - is the
 * profile's, and is reached through it, so every window sees the same.
 */
export class Browser {
  readonly window: BrowserWindow;
  readonly tabs: TabManager;
  readonly notices: NoticeCentre;
  readonly bookmarks: BookmarkCommands;
  readonly groups: GroupCommands;
  readonly sites: SiteData;
  readonly transfer: DataTransfer;
  readonly passwords: PasswordFill;
  readonly commands: TabCommands;

  private readonly overlays: Record<OverlayRegion, OverlayLayer>;
  private readonly publisher: StatePublisher;
  private siteInfo: SiteInfoState | null = null;
  /** A surface asked for before the chrome was listening. See `shared/surfaces.ts` for why it is bounded. */
  private requestedSurface: SurfaceRequest | null = null;

  get store(): BrowserStore {
    return this.profile.store;
  }

  get vaultSession(): VaultSession {
    return this.profile.vaultSession;
  }

  get vault(): Vault {
    return this.profile.vault;
  }

  get blocker(): ContentBlocker {
    return this.profile.blocker;
  }

  get downloads(): DownloadManager {
    return this.profile.downloads;
  }

  get updates(): UpdateManager {
    return this.profile.updates;
  }

  constructor(private readonly profile: Profile) {
    this.window = createChromeWindow();
    this.publisher = new StatePublisher({
      snapshot: () => this.getState(),
      send: (patch) => {
        this.window.webContents.send(PUSH.state, patch);
        this.eachOverlay((overlay) => overlay.send(PUSH.state, patch));
      },
      canSend: () => !this.window.isDestroyed() && !this.window.webContents.isDestroyed(),
      // The tabs changed often enough to tell the interface, which is when they are worth writing down.
      beforeSend: () => this.profile.saveSession(),
    });

    this.tabs = new TabManager(
      this.window,
      this.store,
      this.blocker,
      profile.httpsFirst,
      profile.securityDelegate,
      // No tab is born in a partition the registry has not hardened first.
      (partition) => profile.sessions.prepare(partition),
      () => this.scheduleStatePush(),
      (tabId) => profile.dropPermissionsForTab(tabId),
      // Anything drawn over the page has to follow the page, which moves whenever a row of the chrome does.
      (bounds) => this.eachOverlay((overlay) => overlay.setContentBounds(bounds)),
    );
    this.overlays = {
      leading: new OverlayLayer(this.window, 'leading'),
      trailing: new OverlayLayer(this.window, 'trailing'),
    };
    this.eachOverlay((overlay) => overlay.setContentBounds(this.tabs.contentBounds()));
    // Clicking back into the page is done with the card, as it is with any popover.
    this.tabs.onPageFocus(() => this.closeSiteInfo());
    this.tabs.onPageContextMenu((tabId, params) => showPageContextMenu(this, tabId, params));

    const changed = () => this.scheduleStatePush();
    const push = (channel: string, payload?: unknown) => this.pushToChrome(channel, payload);
    // Saved bookmarks are shown in every window, so a change to them is told to every window.
    const pushEverywhere = (channel: string, payload?: unknown) => profile.broadcast(channel, payload);
    this.notices = new NoticeCentre({ overlay: this.overlays.trailing });
    this.bookmarks = new BookmarkCommands({ store: this.store, changed, push: pushEverywhere });
    this.groups = new GroupCommands({
      store: this.store,
      tabs: this.tabs,
      sessions: profile.sessions,
      notices: this.notices,
      bookmarks: this.bookmarks,
      changed,
      push,
    });
    this.sites = new SiteData({
      store: this.store,
      sessions: profile.sessions,
      blocker: this.blocker,
      downloads: this.downloads,
      notices: this.notices,
      changed: () => profile.scheduleStatePush(),
    });
    this.transfer = new DataTransfer({
      window: this.window,
      store: this.store,
      vaultSession: this.vaultSession,
      bookmarks: this.bookmarks,
      changed,
    });
    this.passwords = new PasswordFill({ tabs: this.tabs, vaultSession: this.vaultSession });
    this.commands = new TabCommands({ store: this.store, tabs: this.tabs, changed, push });

    this.window.on('closed', () => this.dispose());
    // A chrome that loaded again, after a crash or a reload, has nothing yet.
    this.window.webContents.on('did-finish-load', () => {
      this.publisher.forgetWhatWasSent();
      this.scheduleStatePush();
    });
  }

  /** Opens with the tabs a saved window had, a single address, or a new tab. */
  async start(options: { tabs?: SessionSnapshot; url?: string; isHush?: boolean } = {}): Promise<void> {
    await this.window.loadURL(chromeEntryUrl());
    showWindow(this.window);
    if (options.tabs) {
      this.restoreTabs(options.tabs);
    } else {
      this.tabs.create(options.url ?? START_PAGE_URL, { hush: options.isHush === true });
    }
    if (isDevelopment()) {
      this.window.webContents.openDevTools({ mode: 'detach' });
    }
  }

  private restoreTabs(session: SessionSnapshot): void {
    // A group whose tabs were all Hush comes back empty and is left alone: nothing that was in it was written down.
    session.tabs.forEach((tab, index) => {
      this.tabs.create(tab.url, {
        activate: index === session.activeIndex,
        groupId: tab.groupId,
        pinned: tab.isPinned === true,
      });
    });
    if (this.tabs.tabCount === 0) {
      this.tabs.create(START_PAGE_URL);
    }
  }

  // ------------------------------------------------------------------ state

  getState(): BrowserState {
    const { tabs, tabOrder, activeTabId } = this.tabs.snapshot();
    return {
      tabs,
      tabOrder,
      activeTabId,
      groups: this.store.listGroups(),
      downloads: this.downloads.list(),
      find: this.tabs.getFindState(),
      permissionPrompts: this.profile.prompts.permissionPrompts(),
      authPrompts: this.profile.prompts.authPrompts(),
      settings: { ...this.store.getSettings(), hasWallpaper: hasWallpaper() },
      hasClosedTabs: this.tabs.hasClosedTabs(),
      update: this.updates.getState(),
      siteInfo: this.siteInfo,
    };
  }

  /** Something this window shows changed. Pushed shortly, together with anything else that changes meanwhile. */
  scheduleStatePush(): void {
    this.publisher.schedule();
  }

  stopPublishing(): void {
    this.publisher.stop();
  }

  pushToChrome(channel: string, payload?: unknown): void {
    if (this.window.isDestroyed() || this.window.webContents.isDestroyed()) {
      return;
    }
    this.window.webContents.send(channel, payload);
  }

  /** Painted again in the colours of the current appearance. */
  repaint(): void {
    if (!this.window.isDestroyed()) {
      this.window.setBackgroundColor(surfaceColour());
    }
    this.tabs.setBackgroundColor(surfaceColour());
  }

  /** Whether this is the chrome or one of the overlays of this window, which is what may ask it for anything. */
  owns(contents: WebContents): boolean {
    if (this.window.isDestroyed()) {
      return false;
    }
    return (
      contents === this.window.webContents || Object.values(this.overlays).some((overlay) => overlay.holds(contents))
    );
  }

  /**
   * Whether a frame asking for something is one of this window's own.
   *
   * The chrome and the overlays are trusted chrome with the same preload;
   * every page in every tab is not, and has no preload to ask with.
   */
  isOwnFrame(frame: WebFrameMain | null): boolean {
    return frame === this.window.webContents.mainFrame || this.overlayFor(frame) !== null;
  }

  // ------------------------------------------------------- profile verbs

  getAppInfo(): AppInfo {
    return this.profile.getAppInfo();
  }

  updateSettings(patch: Partial<Settings>): Settings {
    return this.profile.updateSettings(patch);
  }

  updateFilterLists(): Promise<{ ok: boolean; message: string }> {
    return this.profile.updateFilterLists();
  }

  revealDiagnostics(): void {
    this.profile.revealDiagnostics();
  }

  /** Asks for a folder with the system's own dialog; only a folder picked there ever becomes where files go. */
  async chooseDownloadFolder(): Promise<string | null> {
    const { canceled, filePaths } = await dialog.showOpenDialog(this.window, {
      title: 'Save downloads to',
      properties: ['openDirectory', 'createDirectory'],
    });
    const [folder] = filePaths;
    if (canceled || !folder) {
      return null;
    }
    this.profile.updateSettings({ downloadDirectory: folder });
    return folder;
  }

  openNewWindow(): void {
    void this.profile.openWindow();
  }

  /**
   * Moves a tab into a window of its own, Hush staying Hush.
   *
   * Reopened there rather than carried across, so the page loads again and its
   * back history stays behind; the tab it came from closes.
   */
  moveTabToNewWindow(tabId: TabId): void {
    const url = this.tabs.urlFor(tabId);
    if (!url) {
      return;
    }
    const isHush = this.tabs.isHush(tabId);
    void this.profile.openWindow({ url, isHush }).then(() => this.tabs.close(tabId));
  }

  openDownloadsFolder(): void {
    this.profile.openDownloadsFolder();
  }

  openExternal(url: string): Promise<void> {
    return this.profile.openExternal(url);
  }

  respondToAuth(id: string, username: string, password: string): void {
    this.profile.respondToAuth(id, username, password);
  }

  cancelAuth(id: string): void {
    this.profile.cancelAuth(id);
  }

  respondToPermission(id: string, decision: PermissionDecision, remember: boolean): void {
    this.profile.respondToPermission(id, decision, remember);
  }

  forgetPermission(origin: string, kind: PermissionKind): void {
    this.profile.forgetPermission(origin, kind);
  }

  // ------------------------------------------------------------- surfaces

  openSurface(surface: ChromeSurface): void {
    this.requestedSurface = worthHolding(surface) ? { surface, askedAt: Date.now() } : null;
    this.pushToChrome(PUSH.openSurface, surface);
  }

  /** What was asked for before anyone was listening, collected as the chrome starts. */
  pendingSurface(): ChromeSurface | null {
    const surface = stillWanted(this.requestedSurface, Date.now());
    // Handed over once. A second chrome asking is a reload, not the person asking again.
    this.requestedSurface = null;
    return surface;
  }

  focusOmnibox(): void {
    // Focusing the field inside the chrome does not take the keyboard from a page view; this does.
    if (!this.window.isDestroyed()) {
      focusContents(this.window.webContents);
    }
    this.pushToChrome(PUSH.focusOmnibox);
  }

  // ------------------------------------------------------------- overlays

  private eachOverlay(action: (overlay: OverlayLayer) => void): void {
    // Unset while the tab manager is being built, which reports bounds before the overlays exist.
    if (this.overlays) {
      Object.values(this.overlays).forEach(action);
    }
  }

  private overlayFor(frame: WebFrameMain | null): OverlayLayer | null {
    return Object.values(this.overlays).find((overlay) => overlay.ownsFrame(frame)) ?? null;
  }

  /** How large an overlay's own content is, which only that overlay can measure. */
  setOverlaySize(frame: WebFrameMain | null, width: number, height: number): void {
    const overlay = this.overlayFor(frame);
    overlay?.setContentBounds(this.tabs.contentBounds());
    overlay?.setSize(width, height);
  }

  /** Opens site information for the active tab, or closes it if it is already open. */
  toggleSiteInfo(): void {
    const { tabs, activeTabId } = this.tabs.snapshot();
    const activeTab = tabs.find((tab) => tab.id === activeTabId);
    if (this.siteInfo || !activeTab || activeTab.isStartPage) {
      this.closeSiteInfo();
      return;
    }
    this.siteInfo = { tabId: activeTab.id, openedAt: Date.now() };
    this.overlays.leading.takeFocus();
    this.scheduleStatePush();
  }

  closeSiteInfo(): void {
    if (!this.siteInfo) {
      return;
    }
    this.siteInfo = null;
    this.tabs.focusActive();
    this.scheduleStatePush();
  }

  /** Drawn by the leading overlay, under the address field the chrome keeps the keyboard in. */
  showSuggestions(view: SuggestionView | null): void {
    this.overlays.leading.send(PUSH.omniboxSuggestions, view);
  }

  /** Committed by the address field itself, so a click and the Enter key take the same path. */
  chooseSuggestion(target: string): void {
    if (target) {
      this.pushToChrome(PUSH.omniboxChosen, target);
    }
  }

  /** Hands the keyboard to the overlay asking for it; a frame that is not an overlay gets nothing. */
  focusOverlay(frame: WebFrameMain | null): void {
    this.overlayFor(frame)?.takeFocus();
  }

  /** Opens find, or brings the keyboard back to it if it is already open. */
  openFind(): void {
    this.tabs.openFind();
    this.overlays.trailing.takeFocus();
    this.overlays.trailing.send(PUSH.focusFind);
  }

  stopFind(): void {
    this.tabs.stopFind();
    // The field that had the keyboard is gone, so it goes back to the page it was searching.
    this.tabs.focusActive();
  }

  // ---------------------------------------------------------------- pages

  connectionsFor(tabId: TabId): ConnectionEntry[] {
    const webContentsId = this.tabs.webContentsIdFor(tabId);
    return webContentsId === undefined ? [] : this.blocker.connectionsFor(webContentsId);
  }

  setContentInsets(insets: ContentInsets): void {
    this.tabs.setContentInsets(insets);
  }

  // -------------------------------------------------------------- teardown

  private dispose(): void {
    this.publisher.stop();
    this.eachOverlay((overlay) => overlay.dispose());
    this.tabs.dispose();
  }
}
