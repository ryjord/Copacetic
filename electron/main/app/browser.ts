import {
  type BrowserWindow,
  app,
  dialog,
  session as electronSession,
  safeStorage,
  shell,
  systemPreferences,
} from 'electron';
import { randomUUID } from 'node:crypto';
import { PUSH, type ChromeSurface } from '../../shared/channels';
import { sanitiseChromeText } from '../../shared/chrome-text';
import type {
  AppInfo,
  BrowserState,
  ClearRange,
  ConnectionEntry,
  ExportKind,
  PermissionDecision,
  PermissionKind,
  PermissionPrompt,
  Settings,
  TabId,
  VaultFacts,
  VaultLock,
} from '../../shared/types';
import { START_PAGE_URL, buildSearchUrl, isNavigableUrl, isPageNavigableUrl } from '../../shared/url';
import { describeAuthPrompt, isPromptWorthy } from '../security/auth';
import { ContentBlocker } from '../security/blocker';
import { forgetCertificates } from '../security/certificates';
import { forgetLocalCertificates } from '../security/local-certificates';
import { bookmarksToHtml, historyToJson } from '../data/export';
import { bookmarksFromHtml } from '../../shared/bookmark-import';
import { offerFor } from '../../shared/credential-matching';
import { fillScriptFor } from '../system/fill-script';
import { credentialsFromCsv, credentialsToCsv } from '../../shared/credential-csv';
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
import { chromeEntryUrl, isDevelopment } from './env';
import {
  type SecurityDelegate,
  getHushSession,
  getWebSession,
  hardenChromeSession,
  hardenWebSession,
} from '../security/security';
import { BrowserStore } from '../data/store';
import { type ContentInsets } from '../tabs/tab-layout';
import { TabManager } from '../tabs/tabs';
import { PendingPrompts } from './pending-prompts';
import type { GroupColourId } from '../../shared/tab-groups';
import { VaultSession } from './vault-session';
import { log } from '../system/diagnostics';
import { fileStamp, readChosenFile, writeChosenFile } from './file-dialogs';
import { UpdateManager } from '../system/updates';
import { createChromeWindow } from './window';

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

// Schemes that are never passed to `shell.openExternal`, whatever the user answers to the confirmation dialog.
const NEVER_HANDED_TO_OS = new Set(['javascript:', 'data:', 'blob:', 'vbscript:', 'filesystem:', 'file:', 'about:']);

/**
 * Everything refused for navigation reaches the external-open path too, so
 * without this the schemes the security model rejects would just be handed to
 * whichever application the OS associates with them — routing around the
 * refusal rather than enforcing it.
 */
export function mayBeHandedToOs(url: string): boolean {
  const scheme = safeScheme(url);
  if (!scheme) {
    return false;
  }
  return !NEVER_HANDED_TO_OS.has(`${scheme}:`);
}

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
  readonly downloads: DownloadManager;
  readonly tabs: TabManager;
  readonly updates: UpdateManager;

  private readonly prompts = new PendingPrompts();
  private pushQueued = false;
  private isQuitting = false;

  constructor() {
    this.store = new BrowserStore();
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
    this.blocker.setAllowlist(this.store.getSettings().blockerAllowlist);
    this.downloads = new DownloadManager(() => this.scheduleStatePush());
    this.updates = new UpdateManager(() => this.scheduleStatePush());

    hardenChromeSession(electronSession.defaultSession);

    const webSession = getWebSession();
    hardenWebSession(webSession, this.securityDelegate());
    this.blocker.attach(webSession);
    this.downloads.attach(webSession);

    // A Hush tab is a different session, so every guard has to be installed on
    // it separately. Forgetting one would mean the tab that promises the most
    // is the one running with the least protection — no permission handling,
    // no tracker blocking, no certificate reporting.
    const hushSession = getHushSession();
    hardenWebSession(hushSession, this.securityDelegate());
    this.blocker.attach(hushSession);
    this.downloads.attach(hushSession);

    this.window = createChromeWindow();
    this.tabs = new TabManager(
      this.window,
      this.store,
      this.blocker,
      this.securityDelegate(),
      () => this.scheduleStatePush(),
      (tabId) => this.dropPermissionsForTab(tabId),
    );

    this.attachAuthHandler();
    this.window.on('closed', () => this.dispose());
    this.window.webContents.on('did-finish-load', () => this.scheduleStatePush());
  }

  // ------------------------------------------------------------------ start

  async start(): Promise<void> {
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
    };
  }

  // -------------------------------------------------------------- security

  private securityDelegate(): SecurityDelegate {
    return {
      requestPermission: (input) =>
        new Promise<PermissionDecision>((resolve) => {
          const tabId = this.tabs.tabIdForWebContentsId(input.webContentsId);
          if (!tabId) {
            resolve('deny');
            return;
          }
          const prompt: PermissionPrompt = {
            id: randomUUID(),
            tabId,
            origin: input.origin,
            kind: input.kind,
            description: input.description,
          };
          this.prompts.addPermission(prompt, resolve);
          this.scheduleStatePush();
        }),

      openInNewTab: (url, options) => {
        // Page-initiated, so the strict set: `window.open('file:///…')` must
        // not become a tab.
        if (!isPageNavigableUrl(url)) {
          return;
        }
        this.tabs.create(url, {
          activate: options.activate,
          openerWebContentsId: options.openerWebContentsId,
        });
      },

      confirmExternalOpen: async (url) => {
        const scheme = safeScheme(url);
        if (!scheme || !mayBeHandedToOs(url)) {
          return false;
        }
        const { response } = await dialog.showMessageBox(this.window, {
          type: 'question',
          buttons: ['Open', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          title: 'Leave Copacetic?',
          message: `Open this link in another application?`,
          detail: `This page wants to hand a ${scheme} link to whichever app handles it on this machine.\n\n${sanitiseChromeText(url, 240)}`,
          noLink: true,
        });
        if (response !== 0) {
          return false;
        }
        await shell.openExternal(url);
        return true;
      },

      getStoredDecision: (origin, kind) => this.store.getPermissionDecision(origin, kind),
      rememberDecision: (origin, kind, decision) => this.store.setPermissionDecision(origin, kind, decision),
    };
  }

  // HTTP Basic, Digest and friends.
  private attachAuthHandler(): void {
    app.on('login', (event, webContents, details, authInfo, callback) => {
      // Only challenges a person can actually evaluate. A subresource buried in
      // a cross-origin frame gives the user nothing to judge, so it is left to
      // fail the way Chromium would leave it.
      const tabId = webContents ? this.tabs.tabIdForWebContentsId(webContents.id) : null;
      const tabUrl = tabId ? this.tabs.urlFor(tabId) : null;

      if (!isPromptWorthy({ isProxy: authInfo.isProxy, challengeUrl: details.url, tabUrl })) {
        return;
      }

      // Taking the event means Copacetic owns the answer; without this
      // Chromium cancels the challenge itself.
      event.preventDefault();

      const id = randomUUID();

      let settled = false;
      const respond = (username?: string, password?: string) => {
        if (settled) {
          return;
        }
        settled = true;
        this.prompts.forgetAuth(id);
        // Calling back with nothing cancels the challenge, which is what the
        // user asked for when they dismissed the prompt.
        if (username === undefined) {
          callback();
        } else {
          callback(username, password);
        }
        this.scheduleStatePush();
      };

      this.prompts.addAuth(
        describeAuthPrompt({
          id,
          tabId,
          isProxy: authInfo.isProxy,
          host: authInfo.host,
          port: authInfo.port,
          realm: authInfo.realm,
          scheme: authInfo.scheme,
        }),
        respond,
      );
      this.scheduleStatePush();
    });
  }

  respondToAuth(id: string, username: string, password: string): void {
    this.prompts.respondToAuth(id, username, password);
  }

  cancelAuth(id: string): void {
    this.prompts.cancelAuth(id);
  }

  respondToPermission(id: string, decision: PermissionDecision, remember: boolean): void {
    const prompt = this.prompts.resolvePermission(id, decision);
    if (!prompt) {
      return;
    }
    if (remember) {
      this.store.setPermissionDecision(prompt.origin, prompt.kind, decision);
    }
    this.scheduleStatePush();
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

  openSurface(surface: ChromeSurface): void {
    this.pushToChrome(PUSH.openSurface, surface);
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

  async clearBrowsingData(range: ClearRange): Promise<void> {
    this.store.clearHistory(range);
    if (range === 'all') {
      // Certificate summaries are browsing data too: they name every host
      // visited this session.
      forgetCertificates();
      forgetLocalCertificates();
      await getWebSession().clearStorageData();
      await getWebSession().clearCache();
    }
    this.scheduleStatePush();
  }

  /** What could be filled into the page in this tab, or why nothing can be. */
  fillOfferFor(tabId: TabId): { entries: { id: string; username: string }[]; refusal: string } {
    const url = this.tabs.urlFor(tabId) ?? '';
    const offer = offerFor(url, this.vaultSession.vault.state().entries);
    return { entries: offer.entries.map(({ id, username }) => ({ id, username })), refusal: offer.refusal };
  }

  /**
   * The only time Copacetic runs code inside a page, and only because you asked
   * for it by name. The offer is checked again here rather than trusted from the
   * renderer: the page may have navigated since the menu was built, and filling
   * into wherever it went now would be handing a password to whoever asked.
   */
  async fillPassword(tabId: TabId, entryId: string): Promise<string> {
    const url = this.tabs.urlFor(tabId) ?? '';
    const offer = offerFor(url, this.vaultSession.vault.state().entries);
    const entry = offer.entries.find((candidate) => candidate.id === entryId);
    if (!entry) {
      return offer.refusal || 'That password does not belong to this page.';
    }

    const password = this.vaultSession.vault.reveal(entryId);
    if (password === null) {
      return 'The vault is locked, or that password cannot be decrypted on this machine.';
    }

    const contents = this.tabs.contentsForTab(tabId);
    if (!contents) {
      return 'There is no page here to fill.';
    }

    try {
      const result = (await contents.executeJavaScript(fillScriptFor(entry.username, password), true)) as {
        filled: boolean;
        exact?: boolean;
      };
      if (!result?.filled) {
        return 'No password box was found on this page.';
      }
      if (result.exact === false) {
        return 'Filled, but this password contains a line break and the box on this page cannot hold one. Sign-in will fail; paste it yourself.';
      }
      return '';
    } catch {
      return 'The page would not accept it.';
    }
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

  async exportVault(): Promise<string> {
    if (!this.vaultSession.isOpen()) {
      return 'Your vault is locked. Unlock it, then try exporting again.';
    }

    const { credentials, unreadable } = this.vaultSession.vault.exportAll();
    if (credentials.length === 0) {
      return unreadable > 0
        ? `None of your ${unreadable} saved passwords could be decrypted on this machine, so there was nothing to write.`
        : 'There are no saved passwords to export.';
    }

    const written = await writeChosenFile(
      this.window,
      {
        title: 'Export passwords',
        defaultPath: `copacetic-passwords-${fileStamp(Date.now())}.csv`,
        filters: [{ name: 'Passwords', extensions: ['csv'] }],
      },
      () => credentialsToCsv(credentials),
    );
    if (written.value === null) {
      return written.message;
    }

    // A short count has to be explained, or it reads as everything.
    return unreadable > 0
      ? `Wrote ${credentials.length}. ${unreadable} could not be decrypted on this machine and were left out.`
      : '';
  }

  /**
   * Reads the bookmark file every browser exports. Reading a live Chrome or
   * Firefox database would mean shipping a SQLite dependency inside the app for
   * a once-ever operation; this needs nothing and works for all of them.
   */
  async importBookmarks(): Promise<string> {
    const chosen = await readChosenFile(this.window, {
      title: 'Import bookmarks',
      filters: [{ name: 'Bookmarks', extensions: ['html', 'htm'] }],
    });
    if (chosen.value === null) {
      return chosen.message;
    }
    const html = chosen.value;

    const { bookmarks, skipped } = bookmarksFromHtml(html);
    if (bookmarks.length === 0) {
      return skipped > 0
        ? `Nothing in that file could be imported. ${skipped} entries were not ordinary web addresses.`
        : 'No bookmarks were found in that file.';
    }

    const { added, alreadyHad } = this.store.addBookmarks(bookmarks);
    this.scheduleStatePush();

    const parts = [`added ${added}`];
    if (alreadyHad > 0) {
      parts.push(`${alreadyHad} you already had`);
    }
    if (skipped > 0) {
      parts.push(`${skipped} refused for not being web addresses`);
    }
    return `Imported: ${parts.join(', ')}.`;
  }

  async importVault(): Promise<string> {
    const chosen = await readChosenFile(this.window, {
      title: 'Import passwords',
      filters: [{ name: 'Passwords', extensions: ['csv'] }],
    });
    if (chosen.value === null) {
      return chosen.message;
    }
    const text = chosen.value;

    const { credentials, skipped: unusable } = credentialsFromCsv(text);
    if (credentials.length === 0) {
      return 'No passwords were found in that file. It needs a header row naming a url and a password column.';
    }

    const { added, updated, skipped } = this.vaultSession.vault.importMany(credentials);
    const parts = [];
    if (added > 0) {
      parts.push(`added ${added}`);
    }
    if (updated > 0) {
      parts.push(`updated ${updated}`);
    }
    const ignored = skipped + unusable;
    if (ignored > 0) {
      parts.push(`ignored ${ignored} that had no site or no password`);
    }
    return parts.length > 0 ? `Imported: ${parts.join(', ')}.` : 'Nothing in that file could be imported.';
  }

  async exportData(kind: ExportKind): Promise<string> {
    const now = Date.now();
    const stamp = fileStamp(now);
    const isBookmarks = kind === 'bookmarks';

    const written = await writeChosenFile(
      this.window,
      {
        title: isBookmarks ? 'Export bookmarks' : 'Export history',
        defaultPath: isBookmarks ? `copacetic-bookmarks-${stamp}.html` : `copacetic-history-${stamp}.json`,
        filters: isBookmarks
          ? [{ name: 'Bookmarks', extensions: ['html'] }]
          : [{ name: 'History', extensions: ['json'] }],
      },
      () =>
        isBookmarks ? bookmarksToHtml(this.store.listBookmarks(), now) : historyToJson(this.store.allHistory(), now),
    );
    return written.value === null ? written.message : '';
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

  /** Makes a group and puts the tab that asked for it inside. */
  createGroup(tabId: TabId, name: string, colour: GroupColourId, ownSession: boolean): string {
    const group = this.store.createGroup(name, colour, ownSession);
    this.tabs.setGroup(tabId, group.id);
    this.scheduleStatePush();
    return group.id;
  }

  updateGroup(id: string, changes: { name?: string; colour?: GroupColourId; collapsed?: boolean }): void {
    this.store.updateGroup(id, changes);
    this.scheduleStatePush();
  }

  /** The group goes; its tabs stay open with nothing to belong to. */
  removeGroup(id: string): void {
    for (const tab of this.tabs.tabsInGroup(id)) {
      this.tabs.setGroup(tab.id, null);
    }
    this.store.removeGroup(id);
    this.scheduleStatePush();
  }

  /** Closes everything in a group and the group with it. */
  closeGroup(id: string): void {
    for (const tab of this.tabs.tabsInGroup(id)) {
      this.tabs.close(tab.id);
    }
    this.store.removeGroup(id);
    this.scheduleStatePush();
  }

  /** Asks the chrome to put the group's name into an editable field in the strip. */
  renameGroup(id: string): void {
    this.pushToChrome(PUSH.renameGroup, id);
  }

  setTabGroup(tabId: TabId, groupId: string | null): void {
    this.tabs.setGroup(tabId, groupId);
    this.scheduleStatePush();
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
    this.tabs.dispose();
    this.prompts.settleAll();
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

function safeScheme(url: string): string | null {
  try {
    return new URL(url).protocol.replace(/:$/, '');
  } catch {
    return null;
  }
}
