import { type BrowserWindow, type ContextMenuParams, WebContentsView, type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import type { FindState, PageError, SecurityState, TabId, TabState } from '../shared/types';
import { START_PAGE_URL, fallbackTitleFor, hostOf, isLoopbackHost, resolveOmniboxInput } from '../shared/url';
import type { ContentBlocker } from './blocker';
import { describeNetError, isAbortError } from './net-errors';
import { WEB_PARTITION, type SecurityDelegate, guardTabWebContents } from './security';
import type { BrowserStore } from './store';

/** Chrome insets in CSS pixels, measured by the renderer. */
export interface ContentInsets {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

interface TabRecord {
  id: TabId;
  view: WebContentsView;
  /** True while the tab shows Copacetic's own start page instead of a site. */
  isStartPage: boolean;
  url: string;
  title: string;
  faviconDataUrl: string | null;
  isLoading: boolean;
  error: PageError | null;
  loadStartedAt: number | null;
  loadMs: number | null;
  zoomFactor: number;
  isMuted: boolean;
  /** The favicon URL we last kicked off a fetch for, to avoid refetching. */
  pendingFaviconUrl: string | null;
}

interface ClosedTab {
  url: string;
  title: string;
  index: number;
}

const MAX_REOPENABLE = 12;
const MAX_FAVICON_BYTES = 200 * 1024;
const DEFAULT_INSETS: ContentInsets = { top: 88, left: 0, right: 0, bottom: 0 };

export class TabManager {
  private readonly tabs = new Map<TabId, TabRecord>();
  private order: TabId[] = [];
  private activeId: TabId | null = null;
  private insets: ContentInsets = DEFAULT_INSETS;
  private overlayVisible = false;
  private readonly closedTabs: ClosedTab[] = [];
  private find: FindState = { isOpen: false, query: '', activeMatch: 0, totalMatches: 0, matchCase: false };
  private isDisposed = false;
  private contextMenuHandler: ((tabId: TabId, params: ContextMenuParams) => void) | null = null;

  constructor(
    private readonly window: BrowserWindow,
    private readonly store: BrowserStore,
    private readonly blocker: ContentBlocker,
    private readonly securityDelegate: SecurityDelegate,
    private readonly onChanged: () => void,
  ) {
    this.window.on('resize', () => this.applyBounds());
    this.blocker.onCount((webContentsId) => {
      if (this.findByWebContentsId(webContentsId)) this.onChanged();
    });
  }

  // ------------------------------------------------------------------ queries

  get tabCount(): number {
    return this.order.length;
  }

  getActiveTabId(): TabId | null {
    return this.activeId;
  }

  getFindState(): FindState {
    return this.find;
  }

  hasClosedTabs(): boolean {
    return this.closedTabs.length > 0;
  }

  snapshot(): { tabs: TabState[]; tabOrder: TabId[]; activeTabId: TabId | null } {
    return {
      tabs: this.order.flatMap((id) => {
        const tab = this.tabs.get(id);
        return tab ? [this.toState(tab)] : [];
      }),
      tabOrder: [...this.order],
      activeTabId: this.activeId,
    };
  }

  sessionSnapshot(): { urls: string[]; activeIndex: number } {
    const urls = this.order.flatMap((id) => {
      const tab = this.tabs.get(id);
      if (!tab || tab.isStartPage) return [];
      return [tab.url];
    });
    const activeIndex = Math.max(0, this.activeId ? this.order.indexOf(this.activeId) : 0);
    return { urls, activeIndex: Math.min(activeIndex, Math.max(0, urls.length - 1)) };
  }

  private toState(tab: TabRecord): TabState {
    const contents = tab.view.webContents;
    const alive = !contents.isDestroyed();
    return {
      id: tab.id,
      url: tab.isStartPage ? START_PAGE_URL : tab.url,
      displayUrl: tab.isStartPage ? '' : tab.url,
      title: tab.title || fallbackTitleFor(tab.url),
      faviconDataUrl: tab.faviconDataUrl,
      isLoading: tab.isLoading,
      canGoBack: alive && !tab.isStartPage && contents.navigationHistory.canGoBack(),
      canGoForward: alive && !tab.isStartPage && contents.navigationHistory.canGoForward(),
      isAudible: alive ? contents.isCurrentlyAudible() : false,
      isMuted: tab.isMuted,
      security: describeSecurity(tab.isStartPage ? START_PAGE_URL : tab.url),
      error: tab.error,
      blockedCount: alive ? this.blocker.countFor(contents.id) : 0,
      loadMs: tab.loadMs,
      zoomFactor: tab.zoomFactor,
      isStartPage: tab.isStartPage,
      isBookmarked: !tab.isStartPage && this.store.isBookmarked(tab.url),
    };
  }

  private findByWebContentsId(webContentsId: number): TabRecord | null {
    for (const tab of this.tabs.values()) {
      if (!tab.view.webContents.isDestroyed() && tab.view.webContents.id === webContentsId) return tab;
    }
    return null;
  }

  tabIdForWebContentsId(webContentsId: number): TabId | null {
    return this.findByWebContentsId(webContentsId)?.id ?? null;
  }

  urlFor(id: TabId): string | null {
    const tab = this.tabs.get(id);
    if (!tab || tab.isStartPage) return null;
    return tab.url;
  }

  titleFor(id: TabId): string {
    const tab = this.tabs.get(id);
    return tab ? tab.title || fallbackTitleFor(tab.url) : '';
  }

  webContentsIdFor(id: TabId): number | undefined {
    return this.contentsFor(id)?.id;
  }

  canGoBack(id: TabId): boolean {
    return this.contentsFor(id)?.navigationHistory.canGoBack() ?? false;
  }

  canGoForward(id: TabId): boolean {
    return this.contentsFor(id)?.navigationHistory.canGoForward() ?? false;
  }

  copyImageAt(id: TabId, x: number, y: number): void {
    this.contentsFor(id)?.copyImageAt(Math.round(x), Math.round(y));
  }

  replaceMisspelling(id: TabId, replacement: string): void {
    this.contentsFor(id)?.replaceMisspelling(replacement);
  }

  addToDictionary(id: TabId, word: string): void {
    if (!word) return;
    this.contentsFor(id)?.session.addWordToSpellCheckerDictionary(word);
  }

  closeOthers(id: TabId): void {
    for (const other of [...this.order]) if (other !== id) this.close(other);
  }

  closeToTheRight(id: TabId): void {
    const index = this.order.indexOf(id);
    if (index === -1) return;
    for (const other of this.order.slice(index + 1)) this.close(other);
  }

  /** Ask the network stack to download a URL rather than render it. */
  downloadUrl(url: string): void {
    const contents = this.activeId ? this.contentsFor(this.activeId) : null;
    contents?.downloadURL(url);
  }

  toggleDevTools(id: TabId): void {
    const contents = this.contentsFor(id);
    if (!contents) return;
    if (contents.isDevToolsOpened()) contents.closeDevTools();
    else contents.openDevTools({ mode: 'detach' });
  }

  print(id: TabId): void {
    this.contentsFor(id)?.print({}, () => {});
  }

  inspectAt(id: TabId, x: number, y: number): void {
    this.contentsFor(id)?.inspectElement(Math.round(x), Math.round(y));
  }

  // ------------------------------------------------------------------ layout

  setContentInsets(insets: ContentInsets): void {
    this.insets = {
      top: Math.max(0, Math.round(insets.top)),
      left: Math.max(0, Math.round(insets.left)),
      right: Math.max(0, Math.round(insets.right)),
      bottom: Math.max(0, Math.round(insets.bottom)),
    };
    this.applyBounds();
  }

  /**
   * Overlays are chrome surfaces that cover the whole content area. Because a
   * WebContentsView is a native child that always paints above the chrome's
   * HTML, the only way for an overlay to sit on top is for the view to step
   * aside while it is open.
   */
  setOverlayVisible(visible: boolean): void {
    if (this.overlayVisible === visible) return;
    this.overlayVisible = visible;
    this.applyVisibility();
  }

  private applyBounds(): void {
    if (this.isDisposed || this.window.isDestroyed()) return;
    const [width, height] = this.window.getContentSize();
    const bounds = {
      x: this.insets.left,
      y: this.insets.top,
      width: Math.max(0, (width ?? 0) - this.insets.left - this.insets.right),
      height: Math.max(0, (height ?? 0) - this.insets.top - this.insets.bottom),
    };
    for (const tab of this.tabs.values()) {
      if (!tab.view.webContents.isDestroyed()) tab.view.setBounds(bounds);
    }
  }

  private applyVisibility(): void {
    if (this.isDisposed) return;
    for (const [id, tab] of this.tabs) {
      if (tab.view.webContents.isDestroyed()) continue;
      const shouldShow = id === this.activeId && !this.overlayVisible && !tab.isStartPage && tab.error === null;
      tab.view.setVisible(shouldShow);
    }
  }

  // ------------------------------------------------------------- lifecycle

  create(
    rawUrl: string = START_PAGE_URL,
    options: { activate?: boolean; index?: number; openerWebContentsId?: number } = {},
  ): TabId {
    const id = randomUUID();
    const settings = this.store.getSettings();
    const view = new WebContentsView({
      webPreferences: {
        // Page content gets no bridge, no Node, and its own persistent
        // partition. It is as close to a plain browser tab as Electron allows.
        preload: undefined,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        partition: WEB_PARTITION,
        spellcheck: true,
        safeDialogs: true,
      },
    });
    // Matches the chrome's surface so a slow first paint does not flash white.
    view.setBackgroundColor('#0b0f14');

    const isStartPage = rawUrl === START_PAGE_URL;
    const tab: TabRecord = {
      id,
      view,
      isStartPage,
      url: isStartPage ? START_PAGE_URL : rawUrl,
      title: '',
      faviconDataUrl: isStartPage ? null : this.store.getFavicon(rawUrl),
      isLoading: false,
      error: null,
      loadStartedAt: null,
      loadMs: null,
      zoomFactor: settings.defaultZoomFactor,
      isMuted: false,
      pendingFaviconUrl: null,
    };

    this.tabs.set(id, tab);
    const insertAt = options.index ?? this.insertionIndexFor(options.openerWebContentsId);
    this.order.splice(Math.min(Math.max(0, insertAt), this.order.length), 0, id);

    this.window.contentView.addChildView(view);
    view.setVisible(false);
    this.attachEvents(tab);
    guardTabWebContents(view.webContents, this.securityDelegate);

    if (!isStartPage) {
      void this.loadUrl(tab, rawUrl);
    }

    if (options.activate !== false) {
      this.activate(id);
    } else {
      this.applyBounds();
      this.onChanged();
    }
    return id;
  }

  /** New tabs opened by a page land immediately after the tab that opened them. */
  private insertionIndexFor(openerWebContentsId?: number): number {
    if (typeof openerWebContentsId !== 'number') return this.order.length;
    const opener = this.findByWebContentsId(openerWebContentsId);
    if (!opener) return this.order.length;
    const openerIndex = this.order.indexOf(opener.id);
    return openerIndex === -1 ? this.order.length : openerIndex + 1;
  }

  close(id: TabId): void {
    const tab = this.tabs.get(id);
    if (!tab) return;

    const index = this.order.indexOf(id);
    if (!tab.isStartPage) {
      this.closedTabs.unshift({ url: tab.url, title: tab.title, index });
      this.closedTabs.length = Math.min(this.closedTabs.length, MAX_REOPENABLE);
    }

    this.destroyTab(tab);
    this.tabs.delete(id);
    this.order = this.order.filter((tabId) => tabId !== id);

    if (this.activeId === id) {
      // Select the neighbour on the right, matching every other browser, and
      // fall back to the left when the closed tab was last.
      const next = this.order[Math.min(index, this.order.length - 1)] ?? null;
      this.activeId = null;
      if (next) this.activate(next);
    }

    // A browser with no tabs has no way back. Always leave one.
    if (this.order.length === 0) {
      this.create(START_PAGE_URL);
      return;
    }

    this.applyVisibility();
    this.onChanged();
  }

  private destroyTab(tab: TabRecord): void {
    const contents = tab.view.webContents;
    if (!contents.isDestroyed()) {
      this.blocker.forget(contents.id);
      contents.stop();
    }
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(tab.view);
    if (!contents.isDestroyed()) contents.close();
  }

  reopenClosed(): void {
    const restored = this.closedTabs.shift();
    if (!restored) return;
    this.create(restored.url, { index: restored.index, activate: true });
  }

  duplicate(id: TabId): void {
    const tab = this.tabs.get(id);
    if (!tab || tab.isStartPage) return;
    this.create(tab.url, { index: this.order.indexOf(id) + 1, activate: true });
  }

  activate(id: TabId): void {
    if (!this.tabs.has(id) || this.activeId === id) {
      if (this.activeId === id) this.focusActive();
      return;
    }
    this.activeId = id;
    this.stopFind();
    this.applyBounds();
    this.applyVisibility();
    this.focusActive();
    this.onChanged();
  }

  private focusActive(): void {
    const tab = this.activeTab();
    if (!tab || tab.isStartPage || tab.error) return;
    const contents = tab.view.webContents;
    if (!contents.isDestroyed()) contents.focus();
  }

  move(id: TabId, toIndex: number): void {
    const from = this.order.indexOf(id);
    if (from === -1) return;
    const clamped = Math.min(Math.max(0, toIndex), this.order.length - 1);
    if (from === clamped) return;
    this.order.splice(from, 1);
    this.order.splice(clamped, 0, id);
    this.onChanged();
  }

  private activeTab(): TabRecord | null {
    return this.activeId ? (this.tabs.get(this.activeId) ?? null) : null;
  }

  // ----------------------------------------------------------- navigation

  /** Accepts either a URL or raw omnibox text. */
  navigate(id: TabId, input: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;

    if (input === START_PAGE_URL) {
      tab.isStartPage = true;
      tab.url = START_PAGE_URL;
      tab.title = '';
      tab.error = null;
      tab.faviconDataUrl = null;
      tab.isLoading = false;
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.loadURL('about:blank').catch(() => {});
      this.applyVisibility();
      this.onChanged();
      return;
    }

    const settings = this.store.getSettings();
    const resolution = resolveOmniboxInput(input, settings.searchEngine, { httpsFirst: settings.httpsFirst });
    if (!resolution) return;
    void this.loadUrl(tab, resolution.target);
  }

  private async loadUrl(tab: TabRecord, url: string): Promise<void> {
    const contents = tab.view.webContents;
    if (contents.isDestroyed()) return;

    tab.isStartPage = false;
    tab.error = null;
    tab.url = url;
    tab.title = tab.title || fallbackTitleFor(url);
    tab.faviconDataUrl = this.store.getFavicon(url);
    this.blocker.resetCount(contents.id);
    this.applyVisibility();
    this.applyBounds();
    this.onChanged();

    try {
      await contents.loadURL(url);
    } catch (error) {
      // `loadURL` rejects on the same failures `did-fail-load` reports, which
      // has already recorded a richer error. Swallow the duplicate.
      if (process.env.COPACETIC_DEBUG) console.error('[tabs] loadURL rejected', url, error);
    }
  }

  goBack(id: TabId): void {
    const contents = this.contentsFor(id);
    if (contents?.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
  }

  goForward(id: TabId): void {
    const contents = this.contentsFor(id);
    if (contents?.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
  }

  reload(id: TabId, bypassCache = false): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    if (tab.isStartPage) {
      this.onChanged();
      return;
    }
    const contents = tab.view.webContents;
    if (contents.isDestroyed()) return;
    tab.error = null;
    this.applyVisibility();
    if (bypassCache) contents.reloadIgnoringCache();
    else contents.reload();
  }

  stop(id: TabId): void {
    this.contentsFor(id)?.stop();
  }

  setMuted(id: TabId, muted: boolean): void {
    const tab = this.tabs.get(id);
    const contents = this.contentsFor(id);
    if (!tab || !contents) return;
    tab.isMuted = muted;
    contents.setAudioMuted(muted);
    this.onChanged();
  }

  setZoom(id: TabId, zoomFactor: number): void {
    const tab = this.tabs.get(id);
    const contents = this.contentsFor(id);
    if (!tab || !contents) return;
    tab.zoomFactor = Math.min(5, Math.max(0.25, zoomFactor));
    contents.setZoomFactor(tab.zoomFactor);
    this.onChanged();
  }

  private contentsFor(id: TabId): WebContents | null {
    const tab = this.tabs.get(id);
    if (!tab || tab.view.webContents.isDestroyed()) return null;
    return tab.view.webContents;
  }

  // ------------------------------------------------------------------ find

  /** Begin a new search. Every keystroke in the find bar lands here. */
  startFind(query: string): void {
    this.find = { ...this.find, isOpen: true, query };

    const contents = this.activeId ? this.contentsFor(this.activeId) : null;
    if (!contents || !query) {
      if (!query) this.find = { ...this.find, activeMatch: 0, totalMatches: 0 };
      contents?.stopFindInPage('clearSelection');
      this.onChanged();
      return;
    }

    this.runFind(contents, query, { forward: true, isNewSession: true });
    this.onChanged();
  }

  /** Step through the matches of the search already running. */
  findNext(forward: boolean): void {
    const contents = this.activeId ? this.contentsFor(this.activeId) : null;
    if (!contents || !this.find.query) return;
    this.runFind(contents, this.find.query, { forward, isNewSession: false });
  }

  /**
   * Electron's `findNext` option reads backwards from its name: it means
   * "this request starts a new finding session", so it is true for the first
   * request and false for every follow-up. Passing it the other way round
   * finds nothing at all, because the follow-up has no session to continue.
   */
  private runFind(contents: WebContents, query: string, options: { forward: boolean; isNewSession: boolean }): void {
    contents.findInPage(query, {
      forward: options.forward,
      findNext: options.isNewSession,
      matchCase: this.find.matchCase,
    });
  }

  setFindMatchCase(matchCase: boolean): void {
    this.find = { ...this.find, matchCase };
    if (this.find.query) this.startFind(this.find.query);
    else this.onChanged();
  }

  stopFind(): void {
    if (!this.find.isOpen && !this.find.query) return;
    if (this.activeId) this.contentsFor(this.activeId)?.stopFindInPage('clearSelection');
    this.find = { isOpen: false, query: '', activeMatch: 0, totalMatches: 0, matchCase: this.find.matchCase };
    this.onChanged();
  }

  openFind(): void {
    this.find = { ...this.find, isOpen: true };
    this.onChanged();
  }

  // ---------------------------------------------------------------- events

  private attachEvents(tab: TabRecord): void {
    const contents = tab.view.webContents;
    const changed = () => this.onChanged();

    contents.on('did-start-loading', () => {
      tab.isLoading = true;
      tab.loadStartedAt = Date.now();
      changed();
    });

    contents.on('did-stop-loading', () => {
      tab.isLoading = false;
      if (tab.loadStartedAt !== null) {
        tab.loadMs = Date.now() - tab.loadStartedAt;
        tab.loadStartedAt = null;
      }
      changed();
    });

    contents.on('did-start-navigation', (details) => {
      if (!details.isMainFrame) return;
      this.blocker.resetCount(contents.id);
    });

    const commitNavigation = (url: string, isInPage: boolean) => {
      if (url === 'about:blank') return;
      tab.url = url;
      tab.isStartPage = false;
      tab.error = null;
      if (!isInPage) {
        tab.title = fallbackTitleFor(url);
        tab.faviconDataUrl = this.store.getFavicon(url);
      }
      contents.setZoomFactor(tab.zoomFactor);
      this.applyVisibility();
      changed();
    };

    contents.on('did-navigate', (_event, url) => commitNavigation(url, false));
    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) commitNavigation(url, true);
    });

    contents.on('page-title-updated', (_event, title) => {
      tab.title = title;
      if (!tab.isStartPage && !tab.error && tab.url.startsWith('http')) {
        this.store.recordVisit(tab.url, title);
      }
      changed();
    });

    contents.on('page-favicon-updated', (_event, favicons) => {
      const [faviconUrl] = favicons;
      if (faviconUrl) void this.cacheFavicon(tab, faviconUrl);
    });

    contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || isAbortError(errorCode)) return;
      const info = describeNetError(errorCode, errorDescription);
      tab.isLoading = false;
      tab.error = {
        code: errorCode,
        name: info.name,
        description: info.description,
        url: validatedURL || tab.url,
      };
      tab.url = validatedURL || tab.url;
      this.applyVisibility();
      changed();
    });

    contents.on('render-process-gone', (_event, details) => {
      tab.isLoading = false;
      tab.error = {
        code: 0,
        name: `RENDERER_${details.reason.toUpperCase().replace(/-/g, '_')}`,
        description:
          details.reason === 'oom'
            ? 'This page ran out of memory. Reloading usually recovers it.'
            : 'The process rendering this page stopped unexpectedly.',
        url: tab.url,
      };
      this.applyVisibility();
      changed();
    });

    contents.on('found-in-page', (_event, result) => {
      this.find = {
        ...this.find,
        activeMatch: result.activeMatchOrdinal ?? 0,
        totalMatches: result.matches ?? 0,
      };
      changed();
    });

    contents.on('audio-state-changed', changed);
    contents.on('media-started-playing', changed);
    contents.on('media-paused', changed);

    // A WebContentsView paints above the chrome's HTML, so an in-page context
    // menu drawn in React would be hidden behind the page. Native menus are
    // both the only thing that can sit on top and the correct platform answer.
    contents.on('context-menu', (_event, params) => {
      this.contextMenuHandler?.(tab.id, params);
    });
  }

  onPageContextMenu(handler: (tabId: TabId, params: ContextMenuParams) => void): void {
    this.contextMenuHandler = handler;
  }

  /**
   * Fetch the favicon in the web session and hand the chrome a data URL.
   *
   * Letting the chrome renderer load `<img src="https://site/favicon.ico">`
   * would leak a request to every site in the tab strip and every history row,
   * from a document that is otherwise forbidden from touching the network.
   */
  private async cacheFavicon(tab: TabRecord, faviconUrl: string): Promise<void> {
    if (tab.pendingFaviconUrl === faviconUrl) return;
    tab.pendingFaviconUrl = faviconUrl;

    const cached = this.store.getFavicon(tab.url);
    if (cached) {
      tab.faviconDataUrl = cached;
      this.onChanged();
    }

    try {
      const { getWebSession } = await import('./security');
      const response = await getWebSession().fetch(faviconUrl, { bypassCustomProtocolHandlers: true });
      if (!response.ok) return;

      const contentType = response.headers.get('content-type') ?? 'image/png';
      if (!contentType.startsWith('image/')) return;

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_FAVICON_BYTES) return;

      const dataUrl = `data:${contentType.split(';')[0]};base64,${buffer.toString('base64')}`;
      this.store.setFavicon(tab.url, dataUrl);
      tab.faviconDataUrl = dataUrl;
      this.onChanged();
    } catch {
      // A missing favicon is not worth surfacing; the chrome falls back to a
      // generated monogram.
    }
  }

  // --------------------------------------------------------------- teardown

  dispose(): void {
    this.isDisposed = true;
    for (const tab of this.tabs.values()) this.destroyTab(tab);
    this.tabs.clear();
    this.order = [];
    this.activeId = null;
  }
}

export function describeSecurity(url: string): SecurityState {
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }

  if (!parsed || url === START_PAGE_URL) {
    return {
      level: 'internal',
      scheme: 'copacetic',
      host: 'start',
      detail: 'A Copacetic page. Nothing here touches the network.',
    };
  }

  const scheme = parsed.protocol.replace(/:$/, '');
  const host = parsed.hostname;

  if (scheme === 'copacetic' || scheme === 'about') {
    return { level: 'internal', scheme, host, detail: 'A Copacetic page. Nothing here touches the network.' };
  }

  if (scheme === 'file') {
    return {
      level: 'internal',
      scheme,
      host: hostOf(url) || 'local file',
      detail: 'A file on this machine. It was never sent over a network.',
    };
  }

  if (scheme === 'https') {
    return {
      level: 'secure',
      scheme,
      host,
      detail: 'Encrypted. Chromium checked this site’s certificate against your system’s trusted authorities.',
    };
  }

  if (scheme === 'http' && isLoopbackHost(host)) {
    return {
      level: 'secure',
      scheme,
      host,
      detail: 'Loopback connection. This traffic never leaves your machine.',
    };
  }

  if (scheme === 'http') {
    return {
      level: 'insecure',
      scheme,
      host,
      detail: 'Not encrypted. Anyone on this network can read this page and change it before you see it.',
    };
  }

  return { level: 'unknown', scheme, host, detail: 'Copacetic cannot describe this connection.' };
}
