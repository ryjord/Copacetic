import {
  BrowserWindow,
  type WebContents,
  app,
  net,
  session as electronSession,
  safeStorage,
  shell,
  systemPreferences,
} from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { AppInfo, PermissionDecision, PermissionKind, Settings, TabId } from '../../shared/types';
import { hostResolverFor } from '../../shared/dns';
import { ContentBlocker } from '../security/blocker';
import { BlockingPolicy } from '../security/blocking-policy';
import { HttpsFirst } from '../security/https-first';
import { hardenChromeSession, type SecurityDelegate } from '../security/security';
import { type ProfilePartitions, partitionsFor } from '../../shared/partitions';
import { PendingPrompts } from '../security/pending-prompts';
import { type TabDirectory, createSecurityDelegate, watchAuthChallenges } from '../security/browser-delegate';
import { SessionRegistry } from '../sessions/session-registry';
import { BrowserStore } from '../data/store';
import { DownloadManager } from '../data/downloads';
import { sweepOrphanedGroupPartitions } from '../data/group-partitions';
import { VaultSession } from '../vault/vault-session';
import type { Vault } from '../vault/vault';
import type { SessionSnapshot } from '../data/session-store';
import { UpdateManager } from '../system/updates';
import { log } from '../system/diagnostics';
import { Wallpaper } from '../system/wallpaper';
import { applyAppearance, onAppearanceChange } from '../window/appearance';
import { filtersRoot, isDevelopment } from './env';
import { Browser } from './browser';
import { launchRestore } from './launch-restore';

/**
 * Everything that belongs to the person rather than to a window.
 *
 * One for the life of the app: the store and its database, the vault, the
 * blocker, downloads, updates, every session and the questions pages ask. A
 * window comes and goes; closing the last one on macOS used to throw all of
 * this away and build it again, cancelling every download in progress.
 */
export class Profile {
  readonly store: BrowserStore;
  readonly vaultSession: VaultSession;
  readonly blocker: ContentBlocker;
  /** Whether this profile blocks, and where it does not; the lists themselves are the blocker's. */
  readonly blocking: BlockingPolicy;
  readonly httpsFirst: HttpsFirst;
  readonly downloads: DownloadManager;
  readonly updates: UpdateManager;
  readonly prompts = new PendingPrompts();
  readonly sessions: SessionRegistry;
  readonly securityDelegate: SecurityDelegate;
  readonly wallpaper: Wallpaper;
  readonly partitions: ProfilePartitions;

  private readonly windows = new Set<Browser>();
  /** The window last in front, for menus and notices when none is focused at this moment. */
  private lastFocused: Browser | null = null;
  private readonly stopWatchingAuth: () => void;
  private readonly stopWatchingAppearance: () => void;
  private isQuitting = false;

  get vault(): Vault {
    return this.vaultSession.vault;
  }

  /** `directory` is where this profile keeps everything; the first profile's is the app's own folder. */
  constructor(
    readonly id: string,
    readonly directory: string,
  ) {
    this.partitions = partitionsFor(id);
    this.store = new BrowserStore(directory);
    this.wallpaper = new Wallpaper(directory);
    // Before any window exists, so each is created in the colour it will be painted.
    applyAppearance(this.store.getSettings().appearance);
    hardenChromeSession(electronSession.defaultSession);
    sweepOrphanedGroupPartitions(
      app.getPath('userData'),
      this.store.listGroups().map((group) => group.id),
      this.partitions,
    );
    // safeStorage is only reachable after app.ready, which is why the keychain is asked at each call.
    this.vaultSession = new VaultSession(
      {
        isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
        encryptString: (plainText) => safeStorage.encryptString(plainText),
        decryptString: (cipherText) => safeStorage.decryptString(cipherText),
        platform: process.platform,
        canPromptTouchID: () => systemPreferences.canPromptTouchID?.() ?? false,
        promptTouchID: (reason) => systemPreferences.promptTouchID(reason),
        profileDirectory: () => directory,
      },
      () => this.scheduleStatePush(),
    );
    const settings = this.store.getSettings();
    this.blocker = new ContentBlocker();
    this.blocking = new BlockingPolicy(settings.blockTrackers, settings.blockerAllowlist);
    this.httpsFirst = new HttpsFirst(settings.httpsFirst);
    // A list fetched on request is preferred to the one that shipped, and the shipped one is the floor.
    if (!this.blocker.loadShippedLists(path.join(app.getPath('userData'), 'filters'))) {
      this.blocker.loadShippedLists(filtersRoot());
    }
    this.downloads = new DownloadManager(
      () => this.scheduleStatePush(),
      this.store.downloadsTable,
      Date.now,
      existsSync,
      () => this.store.getSettings(),
      (download) =>
        this.focused()?.notices.notify(
          {
            id: `keep-${download.id}`,
            key: `keep-${download.id}`,
            tone: 'ask',
            message: `${download.filename} is a program or installer, and runs when opened. Keep it only if you meant to download it.`,
            confirm: 'Keep',
          },
          () => this.downloads.keep(download.id),
        ),
    );
    this.updates = new UpdateManager(() => this.scheduleStatePush());

    const delegateDeps = {
      window: () => this.focused()?.window,
      store: this.store,
      prompts: this.prompts,
      tabs: () => this.tabDirectory,
      onPromptsChanged: () => this.scheduleStatePush(),
    };
    this.securityDelegate = createSecurityDelegate(delegateDeps);
    this.sessions = new SessionRegistry({
      partitions: this.partitions,
      securityDelegate: this.securityDelegate,
      blocker: this.blocker,
      blocking: this.blocking,
      downloads: this.downloads,
      groups: () => this.store.listGroups(),
      isSpellcheckOn: () => this.store.getSettings().spellcheck,
    });
    // Web and Hush exist from launch; a group that keeps its own browsing is prepared when a tab first asks.
    this.sessions.prepare(this.partitions.web);
    this.sessions.prepare(this.partitions.hush);
    this.blocking.setRedirect((details) => this.httpsFirst.upgradeFor(details));

    this.stopWatchingAuth = watchAuthChallenges(delegateDeps);
    this.stopWatchingAppearance = onAppearanceChange(() => this.windows.forEach((window) => window.repaint()));
  }

  /** Applied before the first page, so nothing is looked up the plaintext way first. */
  start(): void {
    const settings = this.store.getSettings();
    app.configureHostResolver(hostResolverFor(settings.dnsMode, settings.dnsResolverId));
    this.updates.start(settings.checkForUpdates);
  }

  /**
   * Opens a window. The first of a launch brings back the saved session;
   * any after that start on a new tab, as a new window does everywhere else.
   */
  async openWindow(options: { tabs?: SessionSnapshot; url?: string; isHush?: boolean } = {}): Promise<Browser> {
    const window = new Browser(this);
    this.windows.add(window);
    this.lastFocused = window;
    window.window.on('focus', () => {
      this.lastFocused = window;
    });
    // Saved on close, while its tabs are still there: by closed the window has already disposed them.
    window.window.on('close', () => this.saveSession(this.windows.size > 1 ? window : null));
    window.window.on('closed', () => this.windowClosed(window));
    await window.start(options);
    return window;
  }

  /** Opens the windows from last time, or one new one, offering last time's back if the app crashed. */
  async restoreWindows(didLastRunEndBadly: boolean): Promise<void> {
    // Held here: the new window saves over the session long before anyone answers.
    const saved = this.store.getSession().windows;
    const choice = launchRestore({
      isReopenOn: this.store.getSettings().restoreTabsOnLaunch,
      hasSavedWindows: saved.length > 0,
      didLastRunEndBadly,
    });
    if (choice === 'reopen') {
      await this.reopenWindows(saved);
      return;
    }
    const fresh = await this.openWindow();
    if (choice === 'offer') {
      fresh.notices.notify(
        {
          id: 'reopen-after-crash',
          key: 'reopen-after-crash',
          tone: 'ask',
          message: 'Copacetic did not close properly last time. Reopen the tabs you had open?',
          confirm: 'Reopen tabs',
        },
        () => void this.reopenInPlaceOf(fresh, saved),
      );
    }
  }

  // In the order they were saved, which puts the one that was in front last, so it is in front again.
  private async reopenWindows(saved: readonly SessionSnapshot[]): Promise<void> {
    for (const tabs of saved) {
      await this.openWindow({ tabs });
    }
  }

  /** Reopens last time's windows, closing the new one if nothing was done in it. */
  private async reopenInPlaceOf(fresh: Browser, saved: readonly SessionSnapshot[]): Promise<void> {
    await this.reopenWindows(saved);
    const isUntouched = this.windows.has(fresh) && fresh.tabs.snapshot().tabs.every((tab) => tab.isStartPage);
    if (isUntouched) {
      fresh.window.close();
    }
  }

  /** The window in front, or the one that last was. Null only when every window is closed. */
  focused(): Browser | null {
    const inFront = BrowserWindow.getFocusedWindow();
    const match = [...this.windows].find((window) => window.window === inFront);
    return match ?? (this.lastFocused && this.windows.has(this.lastFocused) ? this.lastFocused : null);
  }

  /** For a menu item with no window to act on, which on macOS is a normal state to be in. */
  async focusedOrNew(): Promise<Browser> {
    return this.focused() ?? this.openWindow();
  }

  /** The window whose chrome or overlay this is, for routing what it asks to the right place. */
  browserFor(contents: WebContents): Browser | null {
    return [...this.windows].find((window) => window.owns(contents)) ?? null;
  }

  allWindows(): Browser[] {
    return [...this.windows];
  }

  scheduleStatePush(): void {
    this.windows.forEach((window) => window.scheduleStatePush());
  }

  /** Told to every window: something they all show changed, such as saved bookmarks. */
  broadcast(channel: string, payload?: unknown): void {
    this.windows.forEach((window) => window.pushToChrome(channel, payload));
  }

  /** Where a page's request for a new tab or a dialog goes: the window that holds the page. */
  private readonly tabDirectory: TabDirectory = {
    tabIdForWebContentsId: (id) => {
      const holder = this.windowHoldingContents(id);
      return holder?.tabs.tabIdForWebContentsId(id) ?? null;
    },
    urlFor: (tabId) => this.windowHoldingTab(tabId)?.tabs.urlFor(tabId) ?? null,
    create: (url, options) => {
      const opener = options?.openerWebContentsId;
      const holder = (opener === undefined ? null : this.windowHoldingContents(opener)) ?? this.focused();
      holder?.tabs.create(url, options);
    },
  };

  windowHoldingTab(tabId: TabId): Browser | null {
    return [...this.windows].find((window) => window.tabs.has(tabId)) ?? null;
  }

  private windowHoldingContents(webContentsId: number): Browser | null {
    return [...this.windows].find((window) => window.tabs.tabIdForWebContentsId(webContentsId) !== null) ?? null;
  }

  // -------------------------------------------------------------- settings

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
      this.blocking.setEnabled(patch.blockTrackers);
    }
    if (patch.blockerAllowlist !== undefined) {
      this.blocking.setAllowlist(next.blockerAllowlist);
    }
    if (patch.checkForUpdates !== undefined) {
      this.updates.start(patch.checkForUpdates);
    }
    if (patch.spellcheck !== undefined) {
      this.sessions.setSpellcheck(next.spellcheck);
    }
    if (patch.webRtcPolicy !== undefined) {
      this.windows.forEach((window) => window.tabs.setWebRtcPolicy(next.webRtcPolicy));
    }
    this.scheduleStatePush();
    return next;
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

  /**
   * Fetches the filter lists, because someone asked.
   *
   * Named plainly in the interface before it is pressed: this is the one thing
   * in the browser that talks to a server nobody navigated to.
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
      ? `Filter lists updated: ${outcome.rules.toLocaleString()} rules, from ${outcome.lists.map((list) => list.name).join(' and ')}.`
      : outcome.reason;
    this.focused()?.notices.notify({
      id: 'filters-update',
      tone: outcome.ok ? 'done' : 'info',
      key: 'filters-update',
      message,
    });
    this.scheduleStatePush();
    return { ok: outcome.ok, message };
  }

  /** The log is only worth keeping if the person it belongs to can find it. */
  revealDiagnostics(): void {
    const file = log.path();
    if (file) {
      shell.showItemInFolder(file);
    }
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

  dropPermissionsForTab(tabId: TabId): void {
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

  // ------------------------------------------------------------- sessions

  /**
   * Records the tabs open in every window, the one in front last.
   *
   * `closing` leaves out a window being closed while others stay open, as a
   * closed window is not brought back. The last window closing is kept: on
   * macOS the app stays running, and that is the session to reopen.
   */
  saveSession(closing: Browser | null = null): void {
    const windows = [...this.windows].filter((window) => window !== closing);
    if (windows.length === 0) {
      return;
    }
    const inFront = this.focused();
    const ordered = [
      ...windows.filter((window) => window !== inFront),
      ...windows.filter((window) => window === inFront),
    ];
    this.store.saveSession({
      windows: ordered.map((window) => window.tabs.sessionSnapshot()).filter((snapshot) => snapshot.tabs.length > 0),
    });
  }

  private windowClosed(window: Browser): void {
    this.windows.delete(window);
    if (this.lastFocused === window) {
      this.lastFocused = [...this.windows].at(-1) ?? null;
    }
  }

  prepareForQuit(): void {
    this.vaultSession.flush();
    if (this.isQuitting) {
      return;
    }
    this.isQuitting = true;
    this.saveSession();
    this.windows.forEach((window) => window.stopPublishing());
    this.downloads.cancelAllInFlight();
    this.downloads.flush();
    this.store.flushAll();
  }

  dispose(): void {
    this.prepareForQuit();
    this.updates.stop();
    this.prompts.settleAll();
    this.stopWatchingAuth();
    this.stopWatchingAppearance();
  }
}
