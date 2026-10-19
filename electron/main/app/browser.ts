import {
  type BrowserWindow,
  app,
  net,
  session as electronSession,
  safeStorage,
  shell,
  systemPreferences,
  type WebFrameMain,
} from 'electron';
import path from 'node:path';
import { PUSH, type ChromeSurface } from '../../shared/channels';
import type {
  AppInfo,
  BrowserState,
  ConnectionEntry,
  PermissionDecision,
  PermissionKind,
  Settings,
  TabId,
} from '../../shared/types';
import { START_PAGE_URL } from '../../shared/url';
import { ContentBlocker } from '../security/blocker';
import { HttpsFirst } from '../security/https-first';
import { hostResolverFor } from '../../shared/dns';
import { Vault } from '../vault/vault';
import { hasWallpaper } from '../system/wallpaper';
import { DownloadManager } from '../data/downloads';
import { chromeEntryUrl, isDevelopment, filtersRoot } from './env';
import { HUSH_PARTITION, WEB_PARTITION, hardenChromeSession } from '../security/security';
import { BrowserStore } from '../data/store';
import { type ContentInsets } from '../tabs/tab-layout';
import { TabManager } from '../tabs/tabs';
import { PendingPrompts } from '../security/pending-prompts';
import { StatePublisher } from '../state/state-publisher';
import { NoticeCentre } from '../notices/notice-centre';
import { BookmarkCommands } from '../workflows/bookmarks';
import { DataTransfer } from '../workflows/data-transfer';
import { GroupCommands } from '../workflows/groups';
import { PasswordFill } from '../workflows/password-fill';
import { SiteData } from '../workflows/site-data';
import { TabCommands } from '../workflows/tab-commands';
import { SessionRegistry } from '../sessions/session-registry';
import { createSecurityDelegate, watchAuthChallenges } from '../security/browser-delegate';
import { sweepOrphanedGroupPartitions } from '../data/group-partitions';
import { type SurfaceRequest, stillWanted, worthHolding } from '../../shared/surfaces';
import { OverlayLayer } from '../window/overlay';
import type { OverlayRegion } from '../../shared/overlay-regions';
import { VaultSession } from '../vault/vault-session';
import { log } from '../system/diagnostics';
import { UpdateManager } from '../system/updates';
import { createChromeWindow } from '../window/window';
import { applyAppearance, onAppearanceChange, surfaceColour } from '../window/appearance';

/** Owns every long-lived piece of the browser and exposes the verbs that menus, shortcuts and IPC all call into. */
export class Browser {
  readonly window: BrowserWindow;
  readonly store: BrowserStore;
  readonly vaultSession: VaultSession;

  /** The vault itself, for the callers that read entries rather than the lock. */
  get vault(): Vault {
    return this.vaultSession.vault;
  }
  readonly blocker: ContentBlocker;
  private readonly httpsFirst: HttpsFirst;
  readonly downloads: DownloadManager;
  readonly tabs: TabManager;
  readonly updates: UpdateManager;
  readonly notices: NoticeCentre;
  readonly bookmarks: BookmarkCommands;
  readonly groups: GroupCommands;
  readonly sites: SiteData;
  readonly transfer: DataTransfer;
  readonly passwords: PasswordFill;
  readonly commands: TabCommands;

  private readonly prompts = new PendingPrompts();
  private readonly sessions: SessionRegistry;
  private readonly stopWatchingAuth: () => void;
  private readonly stopWatchingAppearance: () => void;
  private readonly publisher: StatePublisher;
  private isQuitting = false;

  constructor() {
    this.store = new BrowserStore();
    // Before the window exists, so it is created in the colour it will be painted.
    applyAppearance(this.store.getSettings().appearance);
    hardenChromeSession(electronSession.defaultSession);
    this.window = createChromeWindow();
    this.publisher = new StatePublisher({
      snapshot: () => this.getState(),
      send: (patch) => {
        this.window.webContents.send(PUSH.state, patch);
        this.eachOverlay((overlay) => overlay.send(PUSH.state, patch));
      },
      canSend: () => !this.window.isDestroyed() && !this.window.webContents.isDestroyed(),
      // The tabs changed often enough to be worth telling the interface about,
      // which is exactly when they are worth writing down. The session file has
      // its own longer debounce, so this is not a write per change.
      beforeSend: () => this.saveSession(),
    });
    sweepOrphanedGroupPartitions(
      app.getPath('userData'),
      this.store.listGroups().map((group) => group.id),
    );
    // safeStorage is only reachable after app.ready, which is why the keychain
    // is asked at each call rather than captured once here.
    this.vaultSession = new VaultSession(
      {
        isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
        encryptString: (plainText) => safeStorage.encryptString(plainText),
        decryptString: (cipherText) => safeStorage.decryptString(cipherText),
        platform: process.platform,
        canPromptTouchID: () => systemPreferences.canPromptTouchID?.() ?? false,
        promptTouchID: (reason) => systemPreferences.promptTouchID(reason),
        userDataPath: () => app.getPath('userData'),
      },
      () => this.scheduleStatePush(),
    );
    this.blocker = new ContentBlocker(this.store.getSettings().blockTrackers);
    this.httpsFirst = new HttpsFirst(this.store.getSettings().httpsFirst);
    this.blocker.setAllowlist(this.store.getSettings().blockerAllowlist);
    // Built into the release rather than fetched. Every other blocker asks a
    // server for its lists on a timer, which is a periodic request from your
    // machine — the shape of the thing being blocked. A failure here is
    // survivable: the curated hostnames are still there, and blocking less is
    // better than not starting.
    // A list fetched on request is preferred to the one that shipped, and the
    // shipped one is the floor when there is none.
    if (!this.blocker.loadShippedLists(path.join(app.getPath('userData'), 'filters'))) {
      this.blocker.loadShippedLists(filtersRoot());
    }
    this.downloads = new DownloadManager(() => this.scheduleStatePush());
    this.updates = new UpdateManager(() => this.scheduleStatePush());

    const delegateDeps = {
      window: this.window,
      store: this.store,
      prompts: this.prompts,
      tabs: () => this.tabs,
      onPromptsChanged: () => this.scheduleStatePush(),
    };
    const securityDelegate = createSecurityDelegate(delegateDeps);
    this.sessions = new SessionRegistry({
      securityDelegate,
      blocker: this.blocker,
      downloads: this.downloads,
      groups: () => this.store.listGroups(),
    });
    // Web and Hush are prepared up front because they exist from launch. Every
    // other partition, a group that keeps its own browsing, is prepared the
    // first time a tab asks for it, through the same registry.
    this.sessions.prepare(WEB_PARTITION);
    this.sessions.prepare(HUSH_PARTITION);

    this.blocker.setRedirect((details) => this.httpsFirst.upgradeFor(details));
    this.tabs = new TabManager(
      this.window,
      this.store,
      this.blocker,
      this.httpsFirst,
      securityDelegate,
      // No tab is born in a partition the registry has not hardened first.
      (partition) => this.sessions.prepare(partition),
      () => this.scheduleStatePush(),
      (tabId) => this.dropPermissionsForTab(tabId),
      // Anything drawn over the page has to follow the page. The rectangle
      // moves whenever a row of the chrome opens or closes, not only on a
      // resize, and an overlay refreshed only with its own height stayed where
      // it was while the page moved out from under it.
      (bounds) => this.eachOverlay((overlay) => overlay.setContentBounds(bounds)),
    );

    this.overlays = {
      leading: new OverlayLayer(this.window, 'leading'),
      trailing: new OverlayLayer(this.window, 'trailing'),
    };
    this.eachOverlay((overlay) => overlay.setContentBounds(this.tabs.contentBounds()));

    const changed = () => this.scheduleStatePush();
    const push = (channel: string, payload?: unknown) => this.pushToChrome(channel, payload);
    this.notices = new NoticeCentre({ overlay: this.overlays.trailing });
    this.bookmarks = new BookmarkCommands({ store: this.store, changed, push });
    this.groups = new GroupCommands({
      store: this.store,
      tabs: this.tabs,
      sessions: this.sessions,
      notices: this.notices,
      bookmarks: this.bookmarks,
      changed,
      push,
    });
    this.sites = new SiteData({
      store: this.store,
      sessions: this.sessions,
      blocker: this.blocker,
      downloads: this.downloads,
      notices: this.notices,
      changed,
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

    this.stopWatchingAuth = watchAuthChallenges(delegateDeps);
    this.stopWatchingAppearance = onAppearanceChange(() => {
      if (!this.window.isDestroyed()) {
        this.window.setBackgroundColor(surfaceColour());
      }
      this.tabs.setBackgroundColor(surfaceColour());
    });
    this.window.on('closed', () => this.dispose());
    // A chrome that loaded again, after a crash or a reload, has nothing yet.
    this.window.webContents.on('did-finish-load', () => {
      this.publisher.forgetWhatWasSent();
      this.scheduleStatePush();
    });
  }

  // ------------------------------------------------------------------ start

  async start(): Promise<void> {
    // Applied before the first page, so nothing is looked up the plaintext way first.
    const settings = this.store.getSettings();
    app.configureHostResolver(hostResolverFor(settings.dnsMode, settings.dnsResolverId));
    await this.window.loadURL(chromeEntryUrl());
    this.window.show();
    this.restoreTabs();
    this.updates.start(this.store.getSettings().checkForUpdates);
    if (isDevelopment()) {
      this.window.webContents.openDevTools({ mode: 'detach' });
    }
  }

  private restoreTabs(): void {
    const settings = this.store.getSettings();
    const session = this.store.getSession();

    if (!settings.restoreTabsOnLaunch || session.tabs.length === 0) {
      this.tabs.create(START_PAGE_URL);
      return;
    }

    // A group whose tabs were all Hush comes back empty and is left alone: the
    // group is remembered, and nothing that was in it was ever written down.
    session.tabs.forEach((tab, index) => {
      this.tabs.create(tab.url, { activate: index === session.activeIndex, groupId: tab.groupId });
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
      permissionPrompts: this.prompts.permissionPrompts(),
      authPrompts: this.prompts.authPrompts(),
      settings: { ...this.store.getSettings(), hasWallpaper: hasWallpaper() },
      hasClosedTabs: this.tabs.hasClosedTabs(),
      update: this.updates.getState(),
    };
  }

  /** Something the chrome shows changed. Pushed shortly, together with anything else that changes meanwhile. */
  scheduleStatePush(): void {
    this.publisher.schedule();
  }

  private pushToChrome(channel: string, payload?: unknown): void {
    if (this.window.isDestroyed() || this.window.webContents.isDestroyed()) {
      return;
    }
    this.window.webContents.send(channel, payload);
  }

  getAppInfo(): AppInfo {
    return {
      version: app.getVersion(),
      electronVersion: process.versions.electron ?? 'unknown',
      chromeVersion: process.versions.chrome ?? 'unknown',
      platform: process.platform,
      isDevelopment: isDevelopment(),
      blockerRuleCount: this.blocker.ruleCount,
      filterLists: this.blocker.loadedLists(),
    };
  }

  // -------------------------------------------------------------- prompts

  respondToAuth(id: string, username: string, password: string): void {
    this.prompts.respondToAuth(id, username, password);
  }

  cancelAuth(id: string): void {
    this.prompts.cancelAuth(id);
  }

  respondToPermission(id: string, decision: PermissionDecision, remember: boolean): void {
    if (this.prompts.resolvePermission(id, decision, remember)) {
      this.scheduleStatePush();
    }
  }

  private dropPermissionsForTab(tabId: TabId): void {
    if (this.prompts.dropForTab(tabId)) {
      this.scheduleStatePush();
    }
  }

  forgetPermission(origin: string, kind: PermissionKind): void {
    const decisions = { ...this.store.getSettings().permissionDecisions };
    delete decisions[`${origin}|${kind}`];
    this.store.updateSettings({ permissionDecisions: decisions });
    this.scheduleStatePush();
  }

  /**
   * A surface asked for before the chrome was listening.
   *
   * Kept because pushing to a renderer that has not hydrated reaches nobody,
   * and the menu item then looks broken. See `shared/surfaces.ts` for why it is
   * bounded and why closing is never held.
   */
  private requestedSurface: SurfaceRequest | null = null;

  openSurface(surface: ChromeSurface): void {
    this.requestedSurface = worthHolding(surface) ? { surface, askedAt: Date.now() } : null;
    this.pushToChrome(PUSH.openSurface, surface);
  }

  /** What was asked for before anyone was listening, collected as the chrome starts. */
  pendingSurface(): ChromeSurface | null {
    const surface = stillWanted(this.requestedSurface, Date.now());
    // Handed over once. A second chrome asking is a reload, not the person
    // asking again.
    this.requestedSurface = null;
    return surface;
  }

  focusOmnibox(): void {
    this.pushToChrome(PUSH.focusOmnibox);
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const next = this.store.updateSettings(patch);
    if (patch.appearance !== undefined) {
      applyAppearance(patch.appearance);
    }
    if (patch.httpsFirst !== undefined) {
      this.httpsFirst.setEnabled(patch.httpsFirst);
    }
    if (patch.dnsMode !== undefined || patch.dnsResolverId !== undefined) {
      app.configureHostResolver(hostResolverFor(next.dnsMode, next.dnsResolverId));
    }
    if (patch.blockTrackers !== undefined) {
      this.blocker.setEnabled(patch.blockTrackers);
    }
    if (patch.blockerAllowlist !== undefined) {
      this.blocker.setAllowlist(next.blockerAllowlist);
    }
    if (patch.checkForUpdates !== undefined) {
      this.updates.start(patch.checkForUpdates);
    }
    this.scheduleStatePush();
    return next;
  }

  /** The log is only worth keeping if the person it belongs to can find it. */
  revealDiagnostics(): void {
    const file = log.path();
    if (file) {
      shell.showItemInFolder(file);
    }
  }

  /** The only layers in this window that can be drawn on top of a page, one held to each top corner. */
  private readonly overlays: Record<OverlayRegion, OverlayLayer>;

  private eachOverlay(action: (overlay: OverlayLayer) => void): void {
    // Unset while the tab manager is being built, which reports bounds before the overlays exist.
    if (this.overlays) {
      Object.values(this.overlays).forEach(action);
    }
  }

  private overlayFor(frame: WebFrameMain | null): OverlayLayer | null {
    return Object.values(this.overlays).find((overlay) => overlay.ownsFrame(frame)) ?? null;
  }

  /**
   * Whether a frame asking for something is one of this browser's own.
   *
   * The chrome window and the overlay are both trusted chrome with the same
   * preload; everything else — every page in every tab — is not, and has no
   * preload to ask with in the first place.
   */
  isOwnFrame(frame: WebFrameMain | null): boolean {
    return frame === this.window.webContents.mainFrame || this.overlayFor(frame) !== null;
  }

  /**
   * Fetches the filter lists, because someone asked.
   *
   * Named plainly in the interface before it is pressed: this is the one thing
   * in the browser that talks to a server nobody navigated to, and it happens
   * once, when asked.
   */
  async updateFilterLists(): Promise<{ ok: boolean; message: string }> {
    const outcome = await this.blocker.fetchNewerLists(app.getPath('userData'), async (url) => {
      // Chromium's network stack, not Node's, so the request follows the DNS and proxy settings like any page.
      const response = await net.fetch(url);
      if (!response.ok) {
        throw new Error(String(response.status));
      }
      return response.text();
    });

    const message = outcome.ok
      ? `Filter lists updated — ${outcome.rules.toLocaleString()} rules, from ${outcome.lists.map((list) => list.name).join(' and ')}.`
      : outcome.reason;

    this.notices.notify({ id: 'filters-update', tone: outcome.ok ? 'done' : 'info', key: 'filters-update', message });
    this.scheduleStatePush();
    return { ok: outcome.ok, message };
  }

  /** How large an overlay's own content is, which only that overlay can measure. */
  setOverlaySize(frame: WebFrameMain | null, width: number, height: number): void {
    const overlay = this.overlayFor(frame);
    overlay?.setContentBounds(this.tabs.contentBounds());
    overlay?.setSize(width, height);
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

  openDownloadsFolder(): void {
    void shell.openPath(app.getPath('downloads'));
  }

  /** Hand a link to the system browser. Only ever https, never a local path. */
  async openExternal(url: string): Promise<void> {
    if (!url.startsWith('https://')) {
      return;
    }
    await shell.openExternal(url);
  }

  /** Every host a tab has contacted since its last page load. */
  connectionsFor(tabId: TabId): ConnectionEntry[] {
    const webContentsId = this.tabs.webContentsIdFor(tabId);
    return webContentsId === undefined ? [] : this.blocker.connectionsFor(webContentsId);
  }

  setContentInsets(insets: ContentInsets): void {
    this.tabs.setContentInsets(insets);
  }

  // -------------------------------------------------------------- teardown

  /**
   * Records the tabs that are open.
   *
   * Called whenever they change rather than only at quit. Writing the session
   * once, on the way out, meant a crash or a kill lost every open tab — the one
   * thing someone notices immediately, and the one thing that cannot be
   * reconstructed. The session file flushes on its own longer debounce, so
   * saying so on every change costs a write about once a second at worst.
   */
  saveSession(): void {
    this.store.saveSession(this.tabs.sessionSnapshot());
  }

  prepareForQuit(): void {
    this.vaultSession.flush();
    if (this.isQuitting) {
      return;
    }
    this.isQuitting = true;
    this.publisher.stop();
    this.saveSession();
    this.downloads.cancelAllInFlight();
    this.downloads.flush();
    this.store.flushAll();
  }

  private dispose(): void {
    this.prepareForQuit();
    this.updates.stop();
    this.eachOverlay((overlay) => overlay.dispose());
    this.tabs.dispose();
    this.prompts.settleAll();
    this.stopWatchingAuth();
    this.stopWatchingAppearance();
  }
}
