// Libs
import { Notification, type Session, type WebContents, app, powerMonitor } from 'electron';
import { rmSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';

// Utils
import { ActionPopup, type PopupAnchor } from './action-popup';
import {
  ChromeApi,
  type ChromeTab,
  type ChromeWindow,
  type ExtensionBrowsing,
  type ExtensionGrant,
  maySee,
  seenBy,
} from './chrome-api';
import { markLoaded, markUnloaded } from './extension-pages';
import { ExtensionStore, type InstalledExtension } from './extension-store';
import {
  type FetchBytes,
  type StagedExtension,
  discardStaged,
  keepStaged,
  readUnpacked,
  stageFromWebStore,
} from './installer';
import { type Manifest, iconDataUrl, readManifest } from './manifest';
import { ExtensionNetRules, RefusedCall } from './net-rules/extension-net-rules';
import { NetRulesFile } from './net-rules/net-rules-store';
import {
  MOST_UPDATE_CHECK_BYTES,
  asksForMore,
  isNewerExtensionVersion,
  idsWithNewerVersions,
  updateCheckUrl,
} from './store-updates';
import { CHECK_INTERVAL_MS } from '../system/updates';
import { describeError, log } from '../system/diagnostics';
import { isRecord } from '../data/persistence';
import { CALL_REFUSED, EXTENSION_CHANNEL, EXTENSION_EVENT_CHANNEL } from '../../shared/extensions/channels';
import { matchesPattern } from '../../shared/extensions/extensions';
import { t } from '../../shared/i18n/translate';

// Types
import type { BrowserWindow, ServiceWorkerMain } from 'electron';
import type { ExtensionAction, ExtensionRequest, ExtensionSummary } from '../../shared/extensions/extensions';

/** What the host needs from the profile it belongs to. */
export interface ExtensionHostDeps {
  directory: string;
  browsing: ExtensionBrowsing;
  fetchBytes: FetchBytes;
  /** Asks the person whether to add an extension, naming what it would be allowed to do. */
  confirmAdd: (request: ExtensionRequest) => Promise<boolean>;
  /** Asks for a folder holding an extension being built; null if none was chosen. */
  chooseFolder: () => Promise<string | null>;
  workerPreload: string;
  pagePreload: string;
  /** Something about the extensions changed, and the toolbar and Settings should ask again. */
  changed: () => void;
}

const COUNT_SHOWN_AFTER_MS = 250;
// After launch has settled, and after the app's own update check.
const FIRST_UPDATE_AFTER_MS = 60_000;

interface Loaded {
  entry: InstalledExtension;
  manifest: Manifest;
  grant: ExtensionGrant;
  // Read once: the toolbar asks for every extension each time a blocked count changes.
  icon: string | null;
}

interface MenuItem {
  id: string;
  title: string;
  contexts: string[];
  parentId: string | null;
  enabled: boolean;
  documentUrlPatterns: string[];
  targetUrlPatterns: string[];
}

/** What the page menu was opened on, for choosing which extension items to show. */
export interface MenuTarget {
  pageUrl: string;
  linkUrl: string;
  srcUrl: string;
  selectionText: string;
  isEditable: boolean;
  mediaType: string;
  tabId: number;
}

type ActionState = Omit<ExtensionAction, 'iconDataUrl'> & { iconDataUrl: string | null; popup: string | null };

/**
 * One profile's extensions: adding and removing them, loading them into the
 * sessions where they run, and answering what Electron does not.
 *
 * They run in the profile's ordinary session and in every group that keeps its
 * own, and never in Hush: Electron refuses to load an extension into a session
 * that is not written to disk, which is the same promise Hush makes.
 */
export class ExtensionHost {
  readonly store: ExtensionStore;
  /** Every extension's declarativeNetRequest rules, which the blocker asks about each request. */
  readonly netRules: ExtensionNetRules;
  private readonly netRulesFile: NetRulesFile;
  private countsShownTimer: NodeJS.Timeout | null = null;
  private updateTimer: NodeJS.Timeout | null = null;
  private isUpdating = false;
  /** Newer versions that ask for more than the one in use, by id, held until someone agrees to them. */
  private readonly waitingUpdates = new Map<string, string>();
  private readonly api: ChromeApi;
  private readonly loaded = new Map<string, Loaded>();
  private readonly sessions = new Map<string, Session>();
  private readonly preloadedSessions = new Set<Session>();
  private readonly workers = new Map<string, Set<ServiceWorkerMain>>();
  private readonly pages = new Map<string, Set<WebContents>>();
  private readonly listening = new Map<string, Set<string>>();
  private readonly actions = new Map<string, ActionState>();
  /** Changes an extension made for one tab only, keyed `id:tabId`. */
  private readonly tabActions = new Map<string, Partial<ActionState>>();
  private readonly menus = new Map<string, Map<string, MenuItem>>();
  private readonly popup = new ActionPopup();
  private lastTabs = new Map<number, ChromeTab>();
  private lastWindows = new Map<number, ChromeWindow>();
  private lastFocused: number | null = null;

  constructor(private readonly deps: ExtensionHostDeps) {
    this.store = new ExtensionStore(deps.directory);
    this.netRulesFile = new NetRulesFile(deps.directory);
    this.netRules = new ExtensionNetRules(
      this.netRulesFile,
      (id, webContentsId, count) => this.showBlockedCount(id, webContentsId, count),
      (id, problem) => log.warn('an extension’s rules could not all be read', { id, problem }),
    );
    this.api = new ChromeApi(deps.browsing, {
      action: (id, method, args, tabId) => this.actionCall(id, method, args, tabId),
      contextMenus: (id, method, args) => this.menuCall(id, method, args),
      notify: (id, method, args) => this.notificationCall(id, method, args),
      listen: (id, eventName) => this.listening.set(id, new Set([...(this.listening.get(id) ?? []), eventName])),
      openOptions: (grant) => this.openOptions(grant.id),
      idleState: (threshold) => {
        const state = powerMonitor.getSystemIdleState(threshold);
        return state === 'unknown' ? 'active' : state;
      },
      netRules: (id, method, args) => this.netRules.call(id, method, args),
    });
    this.store.list().forEach((entry) => this.remember(entry));
    // Every page made in one of these sessions, so a tab's navigation can be told to extensions holding webNavigation.
    app.on('web-contents-created', (_event, contents) => {
      if ([...this.sessions.values()].includes(contents.session)) {
        this.watchNavigation(contents);
      }
    });
  }

  private watchNavigation(contents: WebContents): void {
    // Only a tab: the id is its page's, and a popup or an extension's own page is not one.
    const isTab = () => this.lastTabs.has(contents.id);
    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument && isTab()) {
        this.navigated('onBeforeNavigate', contents.id, details.url);
      }
    });
    contents.on(
      'did-navigate',
      (_event, url) =>
        isTab() &&
        this.navigated('onCommitted', contents.id, url, { transitionType: 'link', transitionQualifiers: [] }),
    );
    contents.on('dom-ready', () => isTab() && this.navigated('onDOMContentLoaded', contents.id, contents.getURL()));
    contents.on('did-finish-load', () => isTab() && this.navigated('onCompleted', contents.id, contents.getURL()));
    contents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
      if (isMainFrame && isTab()) {
        this.navigated('onErrorOccurred', contents.id, url, { error: `net::${description || code}` });
      }
    });
    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame && isTab()) {
        this.navigated(url.includes('#') ? 'onReferenceFragmentUpdated' : 'onHistoryStateUpdated', contents.id, url);
      }
    });
  }

  get hasAny(): boolean {
    return this.loaded.size > 0;
  }

  // ------------------------------------------------------------- sessions

  /** A session this profile's tabs run in. Only one written to disk ever gets extensions. */
  attach(session: Session, partition: string): void {
    if (!partition.startsWith('persist:') || this.sessions.has(partition)) {
      return;
    }
    this.sessions.set(partition, session);
    session.serviceWorkers.on('running-status-changed', ({ versionId }) => {
      const worker = session.serviceWorkers.getWorkerFromVersionID(versionId);
      if (worker) {
        this.wireWorker(worker);
      }
    });
    if (this.hasAny) {
      void this.loadAllInto(session);
    }
  }

  private async loadAllInto(session: Session): Promise<void> {
    this.preload(session);
    await Promise.all(
      [...this.loaded.values()]
        .filter(({ entry }) => entry.isEnabled)
        .map(({ entry }) => this.loadInto(session, entry)),
    );
  }

  /** Registered only once there is an extension, so a profile without one has nothing of this in any worker. */
  private preload(session: Session): void {
    if (this.preloadedSessions.has(session)) {
      return;
    }
    this.preloadedSessions.add(session);
    session.registerPreloadScript({ type: 'service-worker', filePath: this.deps.workerPreload });
  }

  private async loadInto(session: Session, entry: InstalledExtension): Promise<void> {
    try {
      const extension = await session.extensions.loadExtension(entry.folder, { allowFileAccess: false });
      if (extension.id !== entry.id) {
        log.warn('an extension loaded with an id other than the one it was added with', {
          expected: entry.id,
          loaded: extension.id,
        });
      }
      markLoaded(entry.id);
    } catch (error) {
      log.warn('could not load an extension', describeError(error));
    }
  }

  private unloadEverywhere(id: string): void {
    this.sessions.forEach((session) => {
      if (session.extensions.getExtension(id)) {
        session.extensions.removeExtension(id);
      }
    });
    markUnloaded(id);
    this.workers.delete(id);
  }

  // --------------------------------------------------------- adding things

  /** Fetches a store extension, asks, and adds it. Resolves empty, or with what went wrong. */
  async addFromWebStore(id: string): Promise<string> {
    try {
      const staged = await stageFromWebStore(
        id,
        this.store.extensionsDirectory,
        this.deps.fetchBytes,
        process.versions.chrome,
      );
      const isWanted = await this.deps.confirmAdd(this.requestFor(id, staged.manifest));
      if (!isWanted) {
        discardStaged(staged);
        return '';
      }
      await this.install(staged, this.store.find(id)?.isEnabled ?? true);
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  /** Puts a fetched version in place of any in use, keeping how it was set, and clears out the old version's files. */
  private async install(staged: StagedExtension, isEnabled: boolean): Promise<void> {
    const previous = this.store.find(staged.id);
    if (previous) {
      this.unloadEverywhere(staged.id);
    }
    const folder = this.keepOrRestore(staged, previous);
    if (previous) {
      this.netRules.resetForNewVersion(staged.id);
    }
    await this.add({
      id: staged.id,
      source: 'store',
      folder,
      isEnabled,
      isPinned: previous?.isPinned ?? true,
      installedAt: previous?.installedAt ?? Date.now(),
    });
    this.waitingUpdates.delete(staged.id);
    if (previous?.source === 'store' && previous.folder !== folder) {
      void rm(previous.folder, { recursive: true, force: true });
    }
  }

  // A version that could not be put in place leaves the one in use running, rather than nothing.
  private keepOrRestore(staged: StagedExtension, previous: InstalledExtension | null): string {
    try {
      return keepStaged(staged);
    } catch (error) {
      discardStaged(staged);
      if (previous) {
        void this.add(previous);
      }
      throw error;
    }
  }

  // ------------------------------------------------------------- updating

  /** Asks the store for newer versions on the app update check's schedule, from a minute after launch. */
  keepUpdated(isOn: boolean): void {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    this.updateTimer = null;
    if (!isOn) {
      return;
    }
    const after = (delay: number) => {
      this.updateTimer = setTimeout(() => {
        void this.updateFromStore();
        after(CHECK_INTERVAL_MS);
      }, delay);
      this.updateTimer.unref?.();
    };
    after(FIRST_UPDATE_AFTER_MS);
  }

  /** One question to the store for every store extension, then each newer version that asks for nothing more. */
  async updateFromStore(): Promise<void> {
    const installed = [...this.loaded.values()]
      .filter(({ entry }) => entry.source === 'store')
      .map(({ entry, manifest }) => ({ id: entry.id, version: manifest.version }));
    if (installed.length === 0 || this.isUpdating) {
      return;
    }
    this.isUpdating = true;
    try {
      const answer = await this.deps.fetchBytes(
        updateCheckUrl(installed, process.versions.chrome),
        MOST_UPDATE_CHECK_BYTES,
      );
      // One at a time, since each reloads every extension into each session.
      for (const id of idsWithNewerVersions(answer.toString('utf8'), installed)) {
        await this.updateOne(id);
      }
    } catch (error) {
      log.warn('the store could not be asked for extension updates', describeError(error));
    } finally {
      this.isUpdating = false;
    }
  }

  private async updateOne(id: string): Promise<void> {
    try {
      const staged = await stageFromWebStore(
        id,
        this.store.extensionsDirectory,
        this.deps.fetchBytes,
        process.versions.chrome,
      );
      const found = this.loaded.get(id);
      if (!found || !isNewerExtensionVersion(staged.manifest.version, found.manifest.version)) {
        discardStaged(staged);
        return;
      }
      // As in Chrome: an update that asks for more waits for a yes, and the version in use carries on.
      if (asksForMore(found.manifest, staged.manifest)) {
        discardStaged(staged);
        this.waitingUpdates.set(id, staged.manifest.version);
        this.deps.changed();
        return;
      }
      await this.install(staged, found.entry.isEnabled);
    } catch (error) {
      log.warn('an extension could not be updated', { id, ...describeError(error) });
    }
  }

  /** An extension someone is building, loaded from its own folder. Resolves empty, or with what went wrong. */
  async addFromFolder(): Promise<string> {
    const folder = await this.deps.chooseFolder();
    if (!folder) {
      return '';
    }
    try {
      const manifest = readUnpacked(folder);
      const session = this.sessions.get([...this.sessions.keys()][0] ?? '');
      if (!session) {
        return t('main.extensions.install.badManifest');
      }
      this.preload(session);
      // Loaded once to learn the id Chromium gives it, which for a folder comes from its path or its key.
      const extension = await session.extensions.loadExtension(folder, { allowFileAccess: false });
      session.extensions.removeExtension(extension.id);
      const isWanted = await this.deps.confirmAdd(this.requestFor(extension.id, manifest));
      if (!isWanted) {
        return '';
      }
      await this.add({
        id: extension.id,
        source: 'folder',
        folder,
        isEnabled: true,
        isPinned: this.store.find(extension.id)?.isPinned ?? true,
        installedAt: Date.now(),
      });
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  private async add(entry: InstalledExtension): Promise<void> {
    this.store.put(entry);
    this.remember(entry);
    await Promise.all([...this.sessions.values()].map((session) => this.loadAllInto(session)));
    this.deps.changed();
  }

  setEnabled(id: string, isEnabled: boolean): void {
    const found = this.loaded.get(id);
    if (!found || found.entry.isEnabled === isEnabled) {
      return;
    }
    this.store.change(id, { isEnabled });
    found.entry = { ...found.entry, isEnabled };
    if (isEnabled) {
      this.loadNetRules(found);
      void Promise.all([...this.sessions.values()].map((session) => this.loadInto(session, found.entry))).then(() =>
        this.deps.changed(),
      );
      return;
    }
    this.unloadEverywhere(id);
    this.netRules.unload(id);
    this.deps.changed();
  }

  setPinned(id: string, isPinned: boolean): void {
    const found = this.loaded.get(id);
    if (!found || found.entry.isPinned === isPinned) {
      return;
    }
    this.store.change(id, { isPinned });
    found.entry = { ...found.entry, isPinned };
    this.deps.changed();
  }

  /** Takes an extension away, and its files with it if they were the profile's; a folder being built is left alone. */
  remove(id: string): void {
    const found = this.loaded.get(id);
    if (!found) {
      return;
    }
    this.unloadEverywhere(id);
    this.netRules.forget(id);
    this.waitingUpdates.delete(id);
    this.loaded.delete(id);
    this.actions.delete(id);
    this.menus.delete(id);
    this.store.remove(id);
    if (found.entry.source === 'store') {
      rmSync(path.join(this.store.extensionsDirectory, id), { recursive: true, force: true });
    }
    this.deps.changed();
  }

  private remember(entry: InstalledExtension): void {
    try {
      const manifest = readManifest(entry.folder);
      const raw = manifest.raw;
      const optionsUi =
        isRecord(raw.options_ui) && typeof raw.options_ui.page === 'string' ? raw.options_ui.page : null;
      const optionsPage = typeof raw.options_page === 'string' ? raw.options_page : optionsUi;
      const found: Loaded = {
        entry,
        manifest,
        icon: iconDataUrl(entry.folder, manifest.icon),
        grant: {
          id: entry.id,
          permissions: manifest.permissions,
          hostPermissions: manifest.hostPermissions,
          optionsPage,
        },
      };
      this.loaded.set(entry.id, found);
      if (entry.isEnabled) {
        this.loadNetRules(found);
      }
      if (manifest.action) {
        this.actions.set(entry.id, {
          title: manifest.action.title,
          iconDataUrl: iconDataUrl(entry.folder, manifest.action.icon ?? manifest.icon),
          badgeText: '',
          badgeColour: '#5f6368',
          hasPopup: manifest.action.popup !== null,
          popup: manifest.action.popup,
          isEnabled: true,
        });
      }
    } catch (error) {
      log.warn('an extension could not be read', describeError(error));
    }
  }

  private requestFor(id: string, manifest: Manifest): ExtensionRequest {
    return {
      id,
      name: manifest.name,
      version: manifest.version,
      permissions: manifest.permissions,
      hostPermissions: manifest.hostPermissions,
    };
  }

  // ---------------------------------------------------------- what is shown

  /** Every extension as Settings and the toolbar show it, with any change made for this tab. */
  summaries(tabId: number | null): ExtensionSummary[] {
    return [...this.loaded.values()]
      .toSorted((aExtension, bExtension) => aExtension.manifest.name.localeCompare(bExtension.manifest.name))
      .map(({ entry, manifest, grant, icon }) => {
        const action = this.actionFor(entry.id, tabId);
        return {
          id: entry.id,
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
          source: entry.source,
          isEnabled: entry.isEnabled,
          isPinned: entry.isPinned,
          waitingUpdate: this.waitingUpdates.get(entry.id) ?? null,
          hasOptionsPage: grant.optionsPage !== null,
          iconDataUrl: icon,
          permissions: grant.permissions,
          hostPermissions: grant.hostPermissions,
          action: action
            ? {
                title: action.title,
                iconDataUrl: action.iconDataUrl,
                badgeText: action.badgeText,
                badgeColour: action.badgeColour,
                hasPopup: action.popup !== null,
                isEnabled: action.isEnabled,
              }
            : null,
        };
      });
  }

  private actionFor(id: string, tabId: number | null): ActionState | null {
    const base = this.actions.get(id);
    if (!base) {
      return null;
    }
    return { ...base, ...(tabId === null ? {} : this.tabActions.get(`${id}:${tabId}`)) };
  }

  /** The toolbar button was pressed: its popup opens under it, or the extension is told. */
  press(id: string, window: BrowserWindow, tabId: number | null, anchor: PopupAnchor): void {
    const found = this.loaded.get(id);
    const action = this.actionFor(id, tabId);
    const session = this.sessions.get([...this.sessions.keys()][0] ?? '');
    if (!found?.entry.isEnabled || !action?.isEnabled || !session) {
      return;
    }
    if (action.popup) {
      const origin = `chrome-extension://${id}/`;
      this.popup.open({
        window,
        session,
        url: `${origin}${action.popup}`,
        origin,
        anchor,
        preload: this.deps.pagePreload,
        onContents: (contents) => this.wirePage(id, contents, null),
        openInTab: (url) =>
          this.deps.browsing.createTab(url, { active: true, windowId: null, index: null, pinned: false }),
      });
      return;
    }
    const tab = tabId === null ? null : this.api.allTabs(found.grant).find((candidate) => candidate.id === tabId);
    this.emitTo(id, 'action.onClicked', [tab ?? null], { wake: true });
  }

  closePopup(): void {
    this.popup.close('the page was clicked');
  }

  openOptions(id: string): void {
    const page = this.loaded.get(id)?.grant.optionsPage;
    if (page) {
      this.deps.browsing.createTab(`chrome-extension://${id}/${page.replace(/^\//, '')}`, {
        active: true,
        windowId: null,
        index: null,
        pinned: false,
      });
    }
  }

  // ------------------------------------------------------------ the bridge

  private wireWorker(worker: ServiceWorkerMain): void {
    const id = /^chrome-extension:\/\/([a-p]{32})\//.exec(worker.scope)?.[1];
    const found = id ? this.loaded.get(id) : undefined;
    if (!id || !found) {
      return;
    }
    const known = this.workers.get(id) ?? new Set();
    if (known.has(worker)) {
      return;
    }
    known.add(worker);
    this.workers.set(id, known);
    worker.ipc.handle(EXTENSION_CHANNEL, (_event, method: unknown, args: unknown) =>
      this.answer(id, null, method, args),
    );
  }

  /** A popup or page Copacetic opened for an extension, given the same bridge as its worker. */
  wirePage(id: string, contents: WebContents, tabId: number | null): void {
    const known = this.pages.get(id) ?? new Set();
    known.add(contents);
    this.pages.set(id, known);
    contents.once('destroyed', () => known.delete(contents));
    contents.ipc.handle(EXTENSION_CHANNEL, (event, method: unknown, args: unknown) => {
      // Answered only while the page is the extension's own: a popup that navigated elsewhere gets nothing.
      if (!event.senderFrame?.url.startsWith(`chrome-extension://${id}/`)) {
        return null;
      }
      return this.answer(id, tabId, method, args);
    });
  }

  private answer(id: string, tabId: number | null, method: unknown, args: unknown): unknown {
    const found = this.loaded.get(id);
    if (!found || typeof method !== 'string' || !Array.isArray(args) || method.length > 64) {
      return null;
    }
    try {
      return this.api.call({ grant: found.grant, tabId }, method, args.slice(0, 16));
    } catch (error) {
      // A call Chrome would reject is rejected to the extension too; anything else is ours, written down.
      if (error instanceof RefusedCall) {
        return { [CALL_REFUSED]: error.message };
      }
      log.warn('an extension call failed', { method, ...describeError(error) });
      return null;
    }
  }

  /**
   * Tells one extension, or all of them, that something happened.
   *
   * Sent to workers that are running and pages that are open. A person's own
   * action, such as pressing the toolbar button, starts a worker that has gone
   * to sleep first, as Chrome does; a stream of tab changes does not.
   */
  private emitTo(id: string, name: string, args: unknown[], options: { wake?: boolean } = {}): void {
    const send = () => {
      this.workers.get(id)?.forEach((worker) => {
        if (!worker.isDestroyed()) {
          worker.send(EXTENSION_EVENT_CHANNEL, name, args);
        }
      });
      this.pages.get(id)?.forEach((contents) => {
        if (!contents.isDestroyed()) {
          contents.send(EXTENSION_EVENT_CHANNEL, name, args);
        }
      });
    };
    const isAwake = [...(this.workers.get(id) ?? [])].some((worker) => !worker.isDestroyed());
    if (isAwake || !options.wake) {
      send();
      return;
    }
    const session = this.sessions.get([...this.sessions.keys()][0] ?? '');
    void session?.serviceWorkers
      .startWorkerForScope(`chrome-extension://${id}/`)
      .then((worker) => {
        this.wireWorker(worker);
        // A moment for the worker's own listeners to be added before the event they are waiting for.
        setTimeout(send, 50);
      })
      .catch((error: unknown) => log.warn('an extension worker would not start', describeError(error)));
  }

  private emitToAll(name: string, args: (grant: ExtensionGrant) => unknown[] | null): void {
    this.loaded.forEach(({ entry, grant }) => {
      if (!entry.isEnabled) {
        return;
      }
      const forThis = args(grant);
      // As Chrome does: a worker gone to sleep is woken for an event it added a listener for, and only then.
      if (forThis) {
        this.emitTo(entry.id, name, forThis, { wake: this.listening.get(entry.id)?.has(name) === true });
      }
    });
  }

  // -------------------------------------------------------------- events

  /** The tabs or windows changed: works out what, and tells each extension what it may know of it. */
  tabsChanged(): void {
    if (!this.hasAny) {
      return;
    }
    const windows = this.deps.browsing.windows();
    const tabs = new Map(windows.flatMap(({ tabs: inWindow }) => inWindow.map((tab) => [tab.id, tab] as const)));
    const nextWindows = new Map(windows.map(({ window }) => [window.id, window] as const));

    nextWindows.forEach((window, windowId) => {
      if (!this.lastWindows.has(windowId)) {
        this.emitToAll('windows.onCreated', () => [window]);
      }
    });
    tabs.forEach((tab, tabId) => {
      const before = this.lastTabs.get(tabId);
      if (!before) {
        this.emitToAll('tabs.onCreated', (grant) => [seenBy(grant, tab)]);
        return;
      }
      const changed = changesBetween(before, tab);
      if (Object.keys(changed).length > 0) {
        this.emitToAll('tabs.onUpdated', (grant) => {
          // An address or title changing is news only to an extension that may see it.
          const visible = maySee(grant, tab.url)
            ? changed
            : Object.fromEntries(
                Object.entries(changed).filter(([key]) => !['url', 'title', 'favIconUrl'].includes(key)),
              );
          return Object.keys(visible).length > 0 ? [tabId, visible, seenBy(grant, tab)] : null;
        });
      }
      if (tab.active && !before.active) {
        this.emitToAll('tabs.onActivated', () => [{ tabId, windowId: tab.windowId }]);
      }
    });
    this.lastTabs.forEach((tab, tabId) => {
      if (!tabs.has(tabId)) {
        this.emitToAll('tabs.onRemoved', () => [
          tabId,
          { windowId: tab.windowId, isWindowClosing: !nextWindows.has(tab.windowId) },
        ]);
      }
    });
    this.lastWindows.forEach((_window, windowId) => {
      if (!nextWindows.has(windowId)) {
        this.emitToAll('windows.onRemoved', () => [windowId]);
      }
    });
    const focused = this.deps.browsing.lastFocusedWindowId();
    if (focused !== this.lastFocused) {
      this.emitToAll('windows.onFocusChanged', () => [focused ?? -1]);
    }
    this.lastTabs = tabs;
    this.lastWindows = nextWindows;
    this.lastFocused = focused;
  }

  /** Navigation in a tab, for extensions holding `webNavigation` and allowed to see the page. */
  navigated(eventName: string, tabId: number, url: string, extra: Record<string, unknown> = {}): void {
    if (!this.hasAny) {
      return;
    }
    this.emitToAll(`webNavigation.${eventName}`, (grant) =>
      grant.permissions.includes('webNavigation') && maySee(grant, url)
        ? [{ tabId, url, frameId: 0, parentFrameId: -1, processId: -1, timeStamp: Date.now(), ...extra }]
        : null,
    );
  }

  // -------------------------------------------------------- toolbar button

  private actionCall(id: string, method: string, args: readonly unknown[], callerTabId: number | null): unknown {
    const details = isRecord(args[0]) ? args[0] : {};
    const tabId = typeof details.tabId === 'number' ? details.tabId : typeof args[0] === 'number' ? args[0] : null;
    const base = this.actions.get(id);
    if (!base) {
      return null;
    }
    const current = this.actionFor(id, tabId ?? callerTabId) ?? base;
    const set = (change: Partial<ActionState>) => {
      if (tabId === null) {
        this.actions.set(id, { ...base, ...change });
      } else {
        this.tabActions.set(`${id}:${tabId}`, { ...this.tabActions.get(`${id}:${tabId}`), ...change });
      }
      this.deps.changed();
      return null;
    };
    switch (method) {
      case 'setTitle':
        return typeof details.title === 'string' ? set({ title: details.title.slice(0, 200) }) : null;
      case 'getTitle':
        return current.title;
      case 'setBadgeText':
        return set({ badgeText: typeof details.text === 'string' ? details.text.slice(0, 8) : '' });
      case 'getBadgeText':
        return current.badgeText;
      case 'setBadgeBackgroundColor':
        return set({ badgeColour: colourFrom(details.color) ?? current.badgeColour });
      case 'getBadgeBackgroundColor':
        return current.badgeColour;
      case 'setPopup':
        return set({
          popup: typeof details.popup === 'string' && details.popup ? details.popup.replace(/^\//, '') : null,
        });
      case 'getPopup':
        return current.popup ? `chrome-extension://${id}/${current.popup}` : '';
      case 'setIcon': {
        const folder = this.loaded.get(id)?.entry.folder;
        const icon = folder ? iconDataUrl(folder, pathFromIcon(details.path)) : null;
        return icon ? set({ iconDataUrl: icon }) : null;
      }
      case 'enable':
      case 'disable':
        return set({ isEnabled: method === 'enable' });
      case 'isEnabled':
        return current.isEnabled;
      case 'getUserSettings':
        return { isOnToolbar: true };
      default:
        return null;
    }
  }

  // ------------------------------------------------------------ page menu

  private menuCall(id: string, method: string, args: readonly unknown[]): unknown {
    const items = this.menus.get(id) ?? new Map<string, MenuItem>();
    this.menus.set(id, items);
    const strings = (value: unknown) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    switch (method) {
      case 'create': {
        const options = isRecord(args[0]) ? args[0] : {};
        const itemId =
          typeof options.id === 'string' || typeof options.id === 'number'
            ? String(options.id)
            : `menu-${items.size + 1}`;
        items.set(itemId, {
          id: itemId,
          title: typeof options.title === 'string' ? options.title.slice(0, 200) : '',
          contexts: strings(options.contexts).length > 0 ? strings(options.contexts) : ['page'],
          parentId:
            typeof options.parentId === 'string' || typeof options.parentId === 'number'
              ? String(options.parentId)
              : null,
          enabled: options.enabled !== false,
          documentUrlPatterns: strings(options.documentUrlPatterns),
          targetUrlPatterns: strings(options.targetUrlPatterns),
        });
        return itemId;
      }
      case 'update': {
        const itemId = String(args[0]);
        const existing = items.get(itemId);
        const change = isRecord(args[1]) ? args[1] : {};
        if (existing) {
          items.set(itemId, {
            ...existing,
            ...(typeof change.title === 'string' ? { title: change.title.slice(0, 200) } : {}),
            ...(typeof change.enabled === 'boolean' ? { enabled: change.enabled } : {}),
            ...(strings(change.contexts).length > 0 ? { contexts: strings(change.contexts) } : {}),
          });
        }
        return null;
      }
      case 'remove':
        items.delete(String(args[0]));
        return null;
      case 'removeAll':
        items.clear();
        return null;
      default:
        return null;
    }
  }

  /** The extension items to add to the page menu, each with what to do when chosen. */
  menuItemsFor(target: MenuTarget): { label: string; enabled: boolean; click: () => void }[] {
    const contexts = new Set(
      [
        'all',
        target.isEditable ? 'editable' : '',
        target.linkUrl ? 'link' : '',
        target.selectionText ? 'selection' : '',
        target.mediaType === 'image' ? 'image' : '',
        !target.linkUrl && !target.selectionText && !target.isEditable ? 'page' : '',
      ].filter(Boolean),
    );
    return [...this.menus.entries()].flatMap(([id, items]) => {
      const found = this.loaded.get(id);
      if (!found?.entry.isEnabled) {
        return [];
      }
      return [...items.values()]
        .filter((item) => item.parentId === null && item.contexts.some((context) => contexts.has(context)))
        .filter(
          (item) =>
            item.documentUrlPatterns.length === 0 ||
            item.documentUrlPatterns.some((pattern) => matchesPattern(pattern, target.pageUrl)),
        )
        .map((item) => ({
          label: item.title.replace('%s', target.selectionText.slice(0, 60)),
          enabled: item.enabled,
          click: () => {
            const tab = this.api.allTabs(found.grant).find((candidate) => candidate.id === target.tabId) ?? null;
            const info = {
              menuItemId: item.id,
              editable: target.isEditable,
              ...(maySee(found.grant, target.pageUrl) ? { pageUrl: target.pageUrl } : {}),
              ...(target.linkUrl ? { linkUrl: target.linkUrl } : {}),
              ...(target.srcUrl ? { srcUrl: target.srcUrl, mediaType: target.mediaType } : {}),
              ...(target.selectionText ? { selectionText: target.selectionText } : {}),
            };
            this.emitTo(id, 'contextMenus.onClicked', [info, tab], { wake: true });
          },
        }));
    });
  }

  // -------------------------------------------------------- notifications

  private notificationCall(id: string, method: string, args: readonly unknown[]): unknown {
    if (method === 'create') {
      const hasId = typeof args[0] === 'string';
      const notificationId = hasId ? String(args[0]) : `${id}-${Date.now()}`;
      const options = isRecord(hasId ? args[1] : args[0]) ? (hasId ? args[1] : args[0]) : {};
      const title = isRecord(options) && typeof options.title === 'string' ? options.title : '';
      const body = isRecord(options) && typeof options.message === 'string' ? options.message : '';
      if (Notification.isSupported()) {
        const notification = new Notification({ title: title.slice(0, 120), body: body.slice(0, 400), silent: true });
        notification.on('click', () => this.emitTo(id, 'notifications.onClicked', [notificationId], { wake: true }));
        notification.on('close', () => this.emitTo(id, 'notifications.onClosed', [notificationId, true]));
        notification.show();
      }
      return notificationId;
    }
    if (method === 'getAll') {
      return {};
    }
    if (method === 'getPermissionLevel') {
      return 'granted';
    }
    return method === 'clear' || method === 'update' ? false : null;
  }

  flush(): void {
    this.store.flush();
    this.netRulesFile.flush();
  }

  private loadNetRules(found: Loaded): void {
    this.netRules.load({
      id: found.entry.id,
      folder: found.entry.folder,
      manifest: found.manifest.raw,
      permissions: found.manifest.permissions,
      hostPermissions: found.manifest.hostPermissions,
    });
  }

  /** What an extension blocked on a page, on its toolbar button there, when it asked for that. */
  private showBlockedCount(id: string, webContentsId: number, count: number): void {
    if (!this.actions.has(id)) {
      return;
    }
    // A tab's id to an extension is its page's id, so the count lands on that tab's button.
    const key = `${id}:${webContentsId}`;
    this.tabActions.set(key, { ...this.tabActions.get(key), badgeText: count > 0 ? String(count) : '' });
    // Gathered up: a page full of adverts blocks hundreds of requests, and the toolbar needs telling once.
    this.countsShownTimer ??= setTimeout(() => {
      this.countsShownTimer = null;
      this.deps.changed();
    }, COUNT_SHOWN_AFTER_MS);
  }

  quit(): void {
    this.keepUpdated(false);
    this.popup.close('quitting');
  }
}

function changesBetween(before: ChromeTab, after: ChromeTab): Record<string, unknown> {
  const changed: Record<string, unknown> = {};
  if (before.url !== after.url) {
    changed.url = after.url;
  }
  if (before.title !== after.title) {
    changed.title = after.title;
  }
  if (before.status !== after.status) {
    changed.status = after.status;
  }
  if (before.pinned !== after.pinned) {
    changed.pinned = after.pinned;
  }
  if (before.audible !== after.audible) {
    changed.audible = after.audible;
  }
  if (before.mutedInfo.muted !== after.mutedInfo.muted) {
    changed.mutedInfo = after.mutedInfo;
  }
  if (before.favIconUrl !== after.favIconUrl) {
    changed.favIconUrl = after.favIconUrl;
  }
  if (before.discarded !== after.discarded) {
    changed.discarded = after.discarded;
  }
  return changed;
}

/** `setIcon({ path })` takes a path or a map of sizes to paths; the largest is used. */
function pathFromIcon(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (!isRecord(value)) {
    return null;
  }
  const sizes = Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  return sizes.toSorted(([aSize], [bSize]) => Number(bSize) - Number(aSize))[0]?.[1] ?? null;
}

/** A badge colour as Chrome takes one: a CSS colour string or an RGBA array. */
function colourFrom(value: unknown): string | null {
  if (typeof value === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]{3,20})$/i.test(value)) {
    return value;
  }
  const parts = Array.isArray(value) ? value.filter((part): part is number => typeof part === 'number') : [];
  if (parts.length >= 3) {
    const [red = 0, green = 0, blue = 0, alpha = 255] = parts;
    return `rgba(${red}, ${green}, ${blue}, ${Math.round((alpha / 255) * 100) / 100})`;
  }
  return null;
}
