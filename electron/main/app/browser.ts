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
  VaultFacts,
  VaultLock,
} from '../../shared/types';
import { START_PAGE_URL, buildSearchUrl, isNavigableUrl } from '../../shared/url';
import { ContentBlocker } from '../security/blocker';
import { HttpsFirst } from '../security/https-first';
import { hostResolverFor } from '../../shared/dns';
import { Vault } from '../data/vault';
import {
  chooseWallpaper,
  clearWallpaper,
  commitStagedChanges,
  discardStagedWallpaper,
  hasWallpaper,
  stageWallpaperRemoval,
} from '../system/wallpaper';
import { DownloadManager } from '../data/downloads';
import { chromeEntryUrl, isDevelopment, filtersRoot } from './env';
import { HUSH_PARTITION, WEB_PARTITION, hardenChromeSession } from '../security/security';
import { BrowserStore } from '../data/store';
import { type ContentInsets } from '../tabs/tab-layout';
import { TabManager } from '../tabs/tabs';
import { PendingPrompts } from './pending-prompts';
import { NoticeCentre } from './notice-centre';
import { BookmarkCommands } from '../workflows/bookmarks';
import { DataTransfer } from '../workflows/data-transfer';
import { GroupCommands } from '../workflows/groups';
import { PasswordFill } from '../workflows/password-fill';
import { SiteData } from '../workflows/site-data';
import { SessionRegistry } from '../sessions/session-registry';
import { createSecurityDelegate, watchAuthChallenges } from '../security/browser-delegate';
import { sweepOrphanedGroupPartitions } from '../data/group-partitions';
import { type SurfaceRequest, stillWanted, worthHolding } from '../../shared/surfaces';
import { OverlayLayer } from './overlay';
import { VaultSession } from './vault-session';
import { log } from '../system/diagnostics';
import { UpdateManager } from '../system/updates';
import { createChromeWindow } from './window';

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

/** Owns every long-lived piece of the browser and exposes the verbs that menus, shortcuts and IPC all call into. */
export class Browser {
  readonly window: BrowserWindow;
  readonly store: BrowserStore;
  private readonly vaultSession: VaultSession;

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

  private readonly prompts = new PendingPrompts();
  private readonly sessions: SessionRegistry;
  private readonly stopWatchingAuth: () => void;
  private pushQueued = false;
  private isQuitting = false;

  constructor() {
    this.store = new BrowserStore();
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

    hardenChromeSession(electronSession.defaultSession);
    this.window = createChromeWindow();

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
      (bounds) => this.overlay?.setContentBounds(bounds),
    );

    this.overlay = new OverlayLayer(this.window);
    this.overlay.setContentBounds(this.tabs.contentBounds());

    const changed = () => this.scheduleStatePush();
    const push = (channel: string, payload?: unknown) => this.pushToChrome(channel, payload);
    this.notices = new NoticeCentre({ overlay: this.overlay });
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

    this.stopWatchingAuth = watchAuthChallenges(delegateDeps);
    this.window.on('closed', () => this.dispose());
    this.window.webContents.on('did-finish-load', () => this.scheduleStatePush());
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

  // Navigation fires many events in quick succession.
  scheduleStatePush(): void {
    if (this.pushQueued || this.isQuitting) {
      return;
    }
    this.pushQueued = true;
    setImmediate(() => {
      this.pushQueued = false;
      if (this.window.isDestroyed() || this.window.webContents.isDestroyed()) {
        return;
      }
      // The tabs changed often enough to be worth telling the interface about,
      // which is exactly when they are worth writing down. The session file has
      // its own longer debounce, so this is not a write per change.
      this.saveSession();
      this.window.webContents.send(PUSH.state, this.getState());
    });
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

  // -------------------------------------------------------------- commands

  newTab(url: string = START_PAGE_URL): void {
    this.tabs.create(url);
    this.pushToChrome(PUSH.focusOmnibox);
  }

  newHushTab(): void {
    this.tabs.create(START_PAGE_URL, { hush: true });
    this.pushToChrome(PUSH.focusOmnibox);
  }

  closeActiveTab(): void {
    const active = this.tabs.getActiveTabId();
    if (active) {
      this.tabs.close(active);
    }
  }

  reopenClosedTab(): void {
    this.tabs.reopenClosed();
  }

  cycleTab(offset: number): void {
    const { tabOrder, activeTabId } = this.tabs.snapshot();
    if (tabOrder.length === 0 || !activeTabId) {
      return;
    }
    const index = tabOrder.indexOf(activeTabId);
    const next = tabOrder[(index + offset + tabOrder.length) % tabOrder.length];
    if (next) {
      this.tabs.activate(next);
    }
  }

  /** `index` is zero-based; `-1` selects the last tab, matching every browser. */
  selectTabAt(index: number): void {
    const { tabOrder } = this.tabs.snapshot();
    const target = index === -1 ? tabOrder[tabOrder.length - 1] : tabOrder[index];
    if (target) {
      this.tabs.activate(target);
    }
  }

  withActiveTab(action: (tabId: TabId) => void): void {
    const active = this.tabs.getActiveTabId();
    if (active) {
      action(active);
    }
  }

  navigateActive(input: string): void {
    this.withActiveTab((tabId) => this.tabs.navigate(tabId, input));
  }

  goHome(): void {
    this.withActiveTab((tabId) => this.tabs.navigate(tabId, START_PAGE_URL));
  }

  adjustZoom(direction: 'in' | 'out' | 'reset'): void {
    this.withActiveTab((tabId) => {
      const tab = this.tabs.snapshot().tabs.find((candidate) => candidate.id === tabId);
      if (!tab) {
        return;
      }
      if (direction === 'reset') {
        this.tabs.setZoom(tabId, this.store.getSettings().defaultZoomFactor);
        return;
      }
      const currentIndex = nearestZoomIndex(tab.zoomFactor);
      const nextIndex = Math.min(ZOOM_STEPS.length - 1, Math.max(0, currentIndex + (direction === 'in' ? 1 : -1)));
      this.tabs.setZoom(tabId, ZOOM_STEPS[nextIndex] ?? 1);
    });
  }

  toggleBookmarkForActiveTab(): void {
    const { tabs, activeTabId } = this.tabs.snapshot();
    const tab = tabs.find((candidate) => candidate.id === activeTabId);
    if (!tab || tab.isStartPage) {
      return;
    }
    this.store.toggleBookmark(tab.url, tab.title);
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

  toggleTabDevTools(): void {
    this.withActiveTab((tabId) => this.tabs.toggleDevTools(tabId));
  }

  printActiveTab(): void {
    this.withActiveTab((tabId) => this.tabs.print(tabId));
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const next = this.store.updateSettings(patch);
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

  /** Everything the honesty page claims, read from where it actually is rather than written out. */
  vaultFacts(): VaultFacts {
    return this.vaultSession.facts();
  }

  vaultLock(): VaultLock {
    return this.vaultSession.lockInfo();
  }

  unlockVault(): Promise<string> {
    return this.vaultSession.unlock();
  }

  lockVault(): void {
    this.vaultSession.lock();
  }

  /** Resolves empty on success, or with a sentence for the user. */
  async chooseWallpaper(): Promise<string> {
    const error = await chooseWallpaper(this.window);
    this.scheduleStatePush();
    return error;
  }

  /** Applies what the pane staged. Returns what to say if it could not be written. */
  keepWallpaper(): string {
    const failure = commitStagedChanges();
    this.scheduleStatePush();
    return failure;
  }

  /** A removal waits with everything else, so Discard can undo it. */
  removeWallpaper(): void {
    stageWallpaperRemoval();
    this.scheduleStatePush();
  }

  /** Forgets it, leaving whatever was there before exactly as it was. */
  discardWallpaper(): void {
    discardStagedWallpaper();
    this.scheduleStatePush();
  }

  clearWallpaper(): void {
    clearWallpaper();
    this.scheduleStatePush();
  }

  /** The log is only worth keeping if the person it belongs to can find it. */
  revealDiagnostics(): void {
    const file = log.path();
    if (file) {
      shell.showItemInFolder(file);
    }
  }

  // -------------------------------------------------------------------- groups

  /**
   * Opens a saved address in the tab someone is looking at, or a new one.
   *
   * A bookmark opened from the bar replaces what is in front of you, the way
   * clicking a link does; with no tab to replace, it makes one rather than
   * doing nothing.
   */
  openInActiveTab(url: string): void {
    const activeId = this.tabs.getActiveTabId();
    if (activeId) {
      this.tabs.navigate(activeId, url);
    } else {
      this.tabs.create(url, { activate: true });
    }
    this.scheduleStatePush();
  }

  /** The only layer in this window that can be drawn on top of a page. */
  private readonly overlay: OverlayLayer;

  /**
   * Whether a frame asking for something is one of this browser's own.
   *
   * The chrome window and the overlay are both trusted chrome with the same
   * preload; everything else — every page in every tab — is not, and has no
   * preload to ask with in the first place.
   */
  isOwnFrame(frame: WebFrameMain | null): boolean {
    return frame === this.window.webContents.mainFrame || this.overlay.ownsFrame(frame);
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

  /** How tall the overlay's own content is, which only the overlay can measure. */
  setOverlayHeight(height: number): void {
    this.overlay.setContentBounds(this.tabs.contentBounds());
    this.overlay.setHeight(height);
  }

  openDownloadsFolder(): void {
    void shell.openPath(app.getPath('downloads'));
  }

  downloadUrl(url: string): void {
    if (!isNavigableUrl(url)) {
      return;
    }
    this.tabs.downloadUrl(url);
  }

  searchUrlFor(query: string): string {
    return buildSearchUrl(query, this.store.getSettings().searchEngine);
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
    this.saveSession();
    this.downloads.cancelAllInFlight();
    this.downloads.flush();
    this.store.flushAll();
  }

  private dispose(): void {
    this.prepareForQuit();
    this.updates.stop();
    this.overlay.dispose();
    this.tabs.dispose();
    this.prompts.settleAll();
    this.stopWatchingAuth();
  }
}

function nearestZoomIndex(zoomFactor: number): number {
  let bestIndex = ZOOM_STEPS.indexOf(1);
  let bestDistance = Number.POSITIVE_INFINITY;
  ZOOM_STEPS.forEach((step, index) => {
    const distance = Math.abs(step - zoomFactor);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}
