import { type BrowserWindow, type ContextMenuParams, WebContentsView, type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import type { FindState, TabId, TabState } from '../../shared/types';
import {
  START_PAGE_URL,
  fallbackTitleFor,
  hostOf,
  isNavigableUrl,
  originOf,
  resolveOmniboxInput,
} from '../../shared/url';
import type { ContentBlocker } from '../security/blocker';
import { CLOSED_FIND, closedFind, findForQuery, findWithMatchCase, findWithMatches, openedFind } from './find-state';
import { fetchFaviconDataUrl } from './tab-favicon';
import {
  DEFAULT_INSETS,
  type ContentBounds,
  type ContentInsets,
  contentBoundsWithin,
  normaliseInsets,
  shouldTabBeVisible,
} from './tab-layout';
import { describeSecurity } from './tab-security';
import { partitionFor, tabAfterCollapsing } from '../../shared/tab-groups';
import type { SessionSnapshot, SessionTab } from '../data/session-store';
import { trustedLocally } from '../security/local-certificates';
import { describeTab } from '../system/browser-identity';
import { attachTabEvents } from './tab-events';
import { ClosedTabs } from './closed-tabs';
import type { TabRecord } from './tab-record';
import { certificateFor } from '../security/certificates';
import { compareCertificate, rememberCertificate } from '../../shared/certificate-changes';
import {
  HUSH_PARTITION,
  WEB_PARTITION,
  type SecurityDelegate,
  getWebSession,
  guardTabWebContents,
} from '../security/security';
import type { BrowserStore } from '../data/store';

export class TabManager {
  private readonly tabs = new Map<TabId, TabRecord>();
  private order: TabId[] = [];
  private activeId: TabId | null = null;
  private insets: ContentInsets = DEFAULT_INSETS;
  private overlayVisible = false;
  private readonly closedTabs = new ClosedTabs();
  private find: FindState = CLOSED_FIND;
  private isDisposed = false;
  /** What has already been added to history per tab, so only the difference is. */
  private readonly countedBlocked = new Map<number, number>();
  private contextMenuHandler: ((tabId: TabId, params: ContextMenuParams) => void) | null = null;

  constructor(
    private readonly window: BrowserWindow,
    private readonly store: BrowserStore,
    private readonly blocker: ContentBlocker,
    private readonly securityDelegate: SecurityDelegate,
    private readonly onChanged: () => void,
    /** Fired once per closed tab so owners can drop state keyed to it. */
    private readonly onTabClosed: (id: TabId) => void = () => {},
    /** The rectangle the page occupies, for anything drawn over it. */
    private readonly onContentBounds: (bounds: ContentBounds) => void = () => {},
  ) {
    this.window.on('resize', () => this.applyBounds());
    this.blocker.onCount((webContentsId, count) => {
      const tab = this.findByWebContentsId(webContentsId);
      if (!tab) {
        return;
      }

      /*
       * Counted here rather than when the visit is recorded. A visit is
       * recorded when the title arrives, which is early: most trackers have
       * not been refused yet, and sampling then would report almost nothing on
       * every page in the browser.
       *
       * Only the difference is added, because the blocker's number is a
       * running total for the tab and this is called once per refusal.
       *
       * A Hush tab is skipped entirely. Its visits are not written down, and a
       * count is something written down.
       */
      if (!tab.isHush && tab.url.startsWith('http')) {
        const already = this.countedBlocked.get(webContentsId) ?? 0;
        if (count > already) {
          this.countedBlocked.set(webContentsId, count);
          this.store.addBlocked(tab.url, count - already);
        }
      }

      this.onChanged();
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
    return this.closedTabs.canReopen;
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

  sessionSnapshot(): SessionSnapshot {
    // The list skips start-page tabs, so the active tab's index has to be
    // counted against the filtered list as it is built. Taking it from
    // `this.order` instead would be off by one for every start-page tab
    // sitting to the left of the active one, and restore the wrong site.
    const saved: SessionTab[] = [];
    let activeIndex = 0;

    for (const id of this.order) {
      const tab = this.tabs.get(id);
      // A Hush tab is excluded rather than merely not reopened: the session
      // file is on disk, so listing its URL there would be the one place the
      // tab left a trace. Its group membership goes with it, because the tab
      // it belongs to is never written here at all.
      if (!tab || tab.isStartPage || tab.isHush) {
        continue;
      }
      if (id === this.activeId) {
        activeIndex = saved.length;
      }
      saved.push({ url: tab.url, groupId: tab.groupId });
    }

    return { tabs: saved, activeIndex };
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
      security: describeSecurity(
        tab.isStartPage ? START_PAGE_URL : tab.url,
        tab.isStartPage ? null : certificateFor(hostOf(tab.url)),
        tab.isStartPage || tab.error !== null ? '' : this.certificateChangeFor(tab.url, tab.isHush),
        !tab.isStartPage && trustedLocally(originOf(tab.url)),
        tab.error !== null,
      ),
      error: tab.error,
      blockedCount: alive ? this.blocker.countFor(contents.id) : 0,
      loadMs: tab.loadMs,
      zoomFactor: tab.zoomFactor,
      isStartPage: tab.isStartPage,
      isHush: tab.isHush,
      groupId: tab.groupId,
      isBookmarked: !tab.isStartPage && this.store.isBookmarked(tab.url),
    };
  }

  /**
   * Compares what this site is presenting against what it presented before, and
   * records it. Reading and remembering happen together so a site cannot be
   * flagged twice for the same change.
   */
  private certificateChangeFor(url: string, isHush: boolean): string {
    const origin = originOf(url);
    const current = certificateFor(hostOf(url));
    if (!origin || !current) {
      return '';
    }

    const remembered = this.store.rememberedCertificateFor(origin);
    const { detail } = compareCertificate(remembered, current);

    /*
     * Compared, never written, for a Hush tab.
     *
     * This runs for every https page with no action from anyone, so it was
     * putting the origin of everything opened in a Hush tab into
     * certificates.json, timestamped, where it stayed after the tab closed —
     * the same shape of leak as the favicon cache and the download record, and
     * against the same sentence: nothing it does reaches the disk.
     *
     * The comparison still happens, so a certificate that changed mid-session
     * is still reported; there is simply nothing kept afterwards to compare
     * against next time, which is what a tab that remembers nothing means.
     */
    if (!isHush) {
      this.store.rememberCertificate(origin, rememberCertificate(remembered, current, Date.now()));
    }
    return detail;
  }

  /**
   * Puts a tab in a group, or takes it out of one.
   *
   * The tab keeps the session it was born with. Moving an ordinary tab into a
   * group that keeps its own browsing does not move its cookies across, and
   * saying otherwise would be the sort of quiet untruth this browser avoids —
   * so the group's separation applies to tabs opened in it, and the interface
   * says so.
   */
  setGroup(id: TabId, groupId: string | null): void {
    const tab = this.tabs.get(id);
    if (!tab || tab.groupId === groupId) {
      return;
    }
    // A group that does not exist cannot be joined. Without this a stale id
    // from a session file or a slow renderer sticks to the tab for good: it
    // draws as ungrouped, so there is no way to see it or shake it off.
    if (groupId !== null && !this.store.groupFor(groupId)) {
      return;
    }
    tab.groupId = groupId;
    this.onChanged();
  }

  groupIdFor(id: TabId): string | null {
    return this.tabs.get(id)?.groupId ?? null;
  }

  isHush(id: TabId): boolean {
    return this.tabs.get(id)?.isHush === true;
  }

  /** Every tab currently in a group, in strip order. */
  /**
   * Moves off a tab that is about to be hidden by its group collapsing.
   *
   * Reports whether the group may collapse at all: if every tab is in it there
   * is nowhere for activation to go, and collapsing would leave the window
   * showing a page with nothing in the strip pointing at it.
   */
  leaveCollapsingGroup(groupId: string): boolean {
    const activeIndex = this.activeId ? this.order.indexOf(this.activeId) : -1;
    if (activeIndex === -1) {
      return true;
    }

    const inOrder = this.order.map((id) => ({ id, groupId: this.tabs.get(id)?.groupId ?? null }));
    // Every group that will be hiding its tabs once this one closes, not just
    // this one. A tab inside a group that is already collapsed has no entry in
    // the strip either, so activating it would move the fault rather than fix it.
    const hidden = new Set<string>([groupId]);
    for (const tab of inOrder) {
      if (tab.groupId && this.store.groupFor(tab.groupId)?.collapsed) {
        hidden.add(tab.groupId);
      }
    }
    const next = tabAfterCollapsing(inOrder, activeIndex, hidden);
    if (!next) {
      return false;
    }
    if (next.id !== this.activeId) {
      this.activate(next.id);
    }
    return true;
  }

  tabsInGroup(groupId: string): TabRecord[] {
    return this.order
      .map((tabId) => this.tabs.get(tabId))
      .filter((tab): tab is TabRecord => tab !== undefined && tab.groupId === groupId);
  }

  /** Whether a group is holding anything that keeps nothing, which is what stops it claiming to be separate. */
  groupHoldsHush(groupId: string): boolean {
    return this.tabsInGroup(groupId).some((tab) => tab.isHush);
  }

  private findByWebContentsId(webContentsId: number): TabRecord | null {
    for (const tab of this.tabs.values()) {
      if (!tab.view.webContents.isDestroyed() && tab.view.webContents.id === webContentsId) {
        return tab;
      }
    }
    return null;
  }

  tabIdForWebContentsId(webContentsId: number): TabId | null {
    return this.findByWebContentsId(webContentsId)?.id ?? null;
  }

  urlFor(id: TabId): string | null {
    const tab = this.tabs.get(id);
    if (!tab || tab.isStartPage) {
      return null;
    }
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
    if (!word) {
      return;
    }
    this.contentsFor(id)?.session.addWordToSpellCheckerDictionary(word);
  }

  closeOthers(id: TabId): void {
    for (const other of [...this.order]) {
      if (other !== id) {
        this.close(other);
      }
    }
  }

  closeToTheRight(id: TabId): void {
    const index = this.order.indexOf(id);
    if (index === -1) {
      return;
    }
    for (const other of this.order.slice(index + 1)) {
      this.close(other);
    }
  }

  /** Ask the network stack to download a URL rather than render it. */
  downloadUrl(url: string): void {
    const contents = this.activeId ? this.contentsFor(this.activeId) : null;
    contents?.downloadURL(url);
  }

  toggleDevTools(id: TabId): void {
    const contents = this.contentsFor(id);
    if (!contents) {
      return;
    }
    if (contents.isDevToolsOpened()) {
      contents.closeDevTools();
    } else {
      contents.openDevTools({ mode: 'detach' });
    }
  }

  print(id: TabId): void {
    this.contentsFor(id)?.print({}, () => {});
  }

  inspectAt(id: TabId, x: number, y: number): void {
    this.contentsFor(id)?.inspectElement(Math.round(x), Math.round(y));
  }

  // ------------------------------------------------------------------ layout

  setContentInsets(insets: ContentInsets): void {
    this.insets = normaliseInsets(insets);
    this.applyBounds();
  }

  // Overlays are chrome surfaces that cover the whole content area.
  setOverlayVisible(visible: boolean): void {
    if (this.overlayVisible === visible) {
      return;
    }
    this.overlayVisible = visible;
    this.applyVisibility();
  }

  /** The rectangle the page occupies, which is also where an overlay sits. */
  contentBounds(): ContentBounds {
    return this.currentBounds();
  }

  private currentBounds(): ContentBounds {
    const [width, height] = this.window.getContentSize();
    return contentBoundsWithin({ width: width ?? 0, height: height ?? 0 }, this.insets);
  }

  // Only the tab the user is looking at is resized here.
  private applyBounds(): void {
    if (this.isDisposed || this.window.isDestroyed()) {
      return;
    }

    // Told every time, not only when there is a tab to move: anything else
    // drawn over the page has to follow the same rectangle, and it moves
    // whenever a row of the chrome opens or closes, not just on a resize.
    const bounds = this.currentBounds();
    this.onContentBounds(bounds);

    const active = this.activeId ? this.tabs.get(this.activeId) : null;
    if (!active || active.view.webContents.isDestroyed()) {
      return;
    }
    active.view.setBounds(bounds);
  }

  private applyVisibility(): void {
    if (this.isDisposed) {
      return;
    }
    for (const [id, tab] of this.tabs) {
      if (tab.view.webContents.isDestroyed()) {
        continue;
      }
      const isVisible = shouldTabBeVisible(
        { isActive: id === this.activeId, isStartPage: tab.isStartPage, hasError: tab.error !== null },
        this.overlayVisible,
      );
      tab.view.setVisible(isVisible);
    }
  }

  // ------------------------------------------------------------- lifecycle

  create(
    requestedUrl: string = START_PAGE_URL,
    options: {
      activate?: boolean;
      index?: number;
      openerWebContentsId?: number;
      hush?: boolean;
      groupId?: string | null;
    } = {},
  ): TabId {
    // Last line of defence. Callers are expected to have already decided the
    // URL is allowed, but this is the single place every tab is born, so
    // refusing here means no future caller can quietly open a `data:` or
    // `javascript:` tab by forgetting a check of its own.
    const rawUrl = requestedUrl === START_PAGE_URL || isNavigableUrl(requestedUrl) ? requestedUrl : START_PAGE_URL;

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
        // Hush wins over a group's own session: see shared/tab-groups.ts.
        partition: partitionFor(
          { isHush: options.hush === true, group: this.store.groupFor(options.groupId ?? null) },
          { web: WEB_PARTITION, hush: HUSH_PARTITION },
        ),
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
      isHush: options.hush === true,
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
      groupId: options.groupId && this.store.groupFor(options.groupId) ? options.groupId : null,
    };

    this.tabs.set(id, tab);
    const insertAt = options.index ?? this.insertionIndexFor(options.openerWebContentsId);
    this.order.splice(Math.min(Math.max(0, insertAt), this.order.length), 0, id);

    this.window.contentView.addChildView(view);
    // Sized once up front so a background tab loads against the real viewport
    // rather than a zero-sized one and picks the wrong responsive breakpoint.
    view.setBounds(this.currentBounds());
    view.setVisible(false);
    attachTabEvents(tab, {
      store: this.store,
      blocker: this.blocker,
      forgetBlockedCount: (webContentsId: number) => this.countedBlocked.delete(webContentsId),
      onChanged: () => this.onChanged(),
      applyVisibility: () => this.applyVisibility(),
      cacheFavicon: (record, faviconUrl) => void this.cacheFavicon(record, faviconUrl),
      onFoundInPage: (activeMatch, matches) => {
        this.find = findWithMatches(this.find, activeMatch, matches);
      },
      onContextMenu: (tabId, params) => this.contextMenuHandler?.(tabId, params),
    });
    guardTabWebContents(view.webContents, this.securityDelegate);
    // A view with no document yet answers no DevTools command at all, so it is
    // given the empty one first. Navigation then waits for the description to
    // land, because a tab that starts loading before it does is exactly the tab
    // that needed it. `about:blank` is ignored when a navigation commits, so
    // none of this reaches the tab's state.
    const described = view.webContents
      .loadURL('about:blank')
      .catch(() => {})
      .then(() => describeTab(view.webContents, process.platform));

    if (!isStartPage) {
      void described.then(() => {
        // It can be closed, or sent somewhere else, while it waits.
        if (this.tabs.get(id) === tab && tab.url === rawUrl) {
          void this.loadUrl(tab, rawUrl);
        }
      });
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
    if (typeof openerWebContentsId !== 'number') {
      return this.order.length;
    }
    const opener = this.findByWebContentsId(openerWebContentsId);
    if (!opener) {
      return this.order.length;
    }
    const openerIndex = this.order.indexOf(opener.id);
    return openerIndex === -1 ? this.order.length : openerIndex + 1;
  }

  close(id: TabId): void {
    const tab = this.tabs.get(id);
    if (!tab) {
      return;
    }

    const index = this.order.indexOf(id);
    if (!tab.isStartPage && !tab.isHush) {
      this.closedTabs.remember({ url: tab.url, title: tab.title, index });
    }

    this.destroyTab(tab);
    this.tabs.delete(id);
    this.order = this.order.filter((tabId) => tabId !== id);
    this.onTabClosed(id);

    if (this.activeId === id) {
      // Select the neighbour on the right, matching every other browser, and
      // fall back to the left when the closed tab was last.
      const next = this.order[Math.min(index, this.order.length - 1)] ?? null;
      this.activeId = null;
      if (next) {
        this.activate(next);
      }
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
      this.countedBlocked.delete(contents.id);
      contents.stop();
    }
    if (!this.window.isDestroyed()) {
      this.window.contentView.removeChildView(tab.view);
    }
    if (!contents.isDestroyed()) {
      contents.close();
    }
  }

  reopenClosed(): void {
    const restored = this.closedTabs.takeMostRecent();
    if (!restored) {
      return;
    }
    this.create(restored.url, { index: restored.index, activate: true });
  }

  duplicate(id: TabId): void {
    const tab = this.tabs.get(id);
    if (!tab || tab.isStartPage) {
      return;
    }
    this.create(tab.url, { index: this.order.indexOf(id) + 1, activate: true });
  }

  activate(id: TabId): void {
    if (!this.tabs.has(id) || this.activeId === id) {
      if (this.activeId === id) {
        this.focusActive();
      }
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
    if (!tab || tab.isStartPage || tab.error) {
      return;
    }
    const contents = tab.view.webContents;
    if (!contents.isDestroyed()) {
      contents.focus();
    }
  }

  move(id: TabId, toIndex: number): void {
    const from = this.order.indexOf(id);
    if (from === -1) {
      return;
    }
    const clamped = Math.min(Math.max(0, toIndex), this.order.length - 1);
    if (from === clamped) {
      return;
    }
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
    if (!tab) {
      return;
    }

    if (input === START_PAGE_URL) {
      tab.isStartPage = true;
      tab.url = START_PAGE_URL;
      tab.title = '';
      tab.error = null;
      tab.faviconDataUrl = null;
      tab.isLoading = false;
      if (!tab.view.webContents.isDestroyed()) {
        tab.view.webContents.loadURL('about:blank').catch(() => {});
      }
      this.applyVisibility();
      this.onChanged();
      return;
    }

    const settings = this.store.getSettings();
    const resolution = resolveOmniboxInput(input, settings.searchEngine, { httpsFirst: settings.httpsFirst });
    if (!resolution) {
      return;
    }
    void this.loadUrl(tab, resolution.target);
  }

  private async loadUrl(tab: TabRecord, url: string): Promise<void> {
    const contents = tab.view.webContents;
    if (contents.isDestroyed()) {
      return;
    }

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
      if (process.env.COPACETIC_DEBUG) {
        console.error('[tabs] loadURL rejected', url, error);
      }
    }
  }

  goBack(id: TabId): void {
    const contents = this.contentsFor(id);
    if (contents?.navigationHistory.canGoBack()) {
      contents.navigationHistory.goBack();
    }
  }

  goForward(id: TabId): void {
    const contents = this.contentsFor(id);
    if (contents?.navigationHistory.canGoForward()) {
      contents.navigationHistory.goForward();
    }
  }

  reload(id: TabId, bypassCache = false): void {
    const tab = this.tabs.get(id);
    if (!tab) {
      return;
    }
    if (tab.isStartPage) {
      this.onChanged();
      return;
    }
    const contents = tab.view.webContents;
    if (contents.isDestroyed()) {
      return;
    }
    tab.error = null;
    this.applyVisibility();
    if (bypassCache) {
      contents.reloadIgnoringCache();
    } else {
      contents.reload();
    }
  }

  stop(id: TabId): void {
    this.contentsFor(id)?.stop();
  }

  setMuted(id: TabId, muted: boolean): void {
    const tab = this.tabs.get(id);
    const contents = this.contentsFor(id);
    if (!tab || !contents) {
      return;
    }
    tab.isMuted = muted;
    contents.setAudioMuted(muted);
    this.onChanged();
  }

  setZoom(id: TabId, zoomFactor: number): void {
    const tab = this.tabs.get(id);
    const contents = this.contentsFor(id);
    if (!tab || !contents) {
      return;
    }
    tab.zoomFactor = Math.min(5, Math.max(0.25, zoomFactor));
    contents.setZoomFactor(tab.zoomFactor);

    // Remembered against the origin: a site that needs zooming needs it every
    // visit, and setting it again on every visit is the kind of small friction
    // that makes a browser tiring to use.
    // Kept for the tab, not for the site, when the tab is Hush. Settings lists
    // everywhere zoom was changed, so remembering it would put a site opened in
    // a Hush tab into a list shown by name.
    if (!tab.isStartPage && !tab.isHush) {
      this.store.setZoomForOrigin(originOf(tab.url), tab.zoomFactor);
    }

    this.onChanged();
  }

  /** The live page for a tab, or null for a start page that has no view. */
  contentsForTab(id: TabId): WebContents | null {
    return this.contentsFor(id);
  }

  private contentsFor(id: TabId): WebContents | null {
    const tab = this.tabs.get(id);
    if (!tab || tab.view.webContents.isDestroyed()) {
      return null;
    }
    return tab.view.webContents;
  }

  // ------------------------------------------------------------------ find

  /** Begin a new search. Every keystroke in the find bar lands here. */
  startFind(query: string): void {
    this.find = findForQuery(this.find, query);

    const contents = this.activeId ? this.contentsFor(this.activeId) : null;
    if (!contents || !query) {
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
    if (!contents || !this.find.query) {
      return;
    }
    this.runFind(contents, this.find.query, { forward, isNewSession: false });
  }

  // Electron's `findNext` option reads backwards from its name: it means "this request starts a new finding session", so it is true for the first request and false for every follow-up.
  private runFind(contents: WebContents, query: string, options: { forward: boolean; isNewSession: boolean }): void {
    contents.findInPage(query, {
      forward: options.forward,
      findNext: options.isNewSession,
      matchCase: this.find.matchCase,
    });
  }

  setFindMatchCase(matchCase: boolean): void {
    this.find = findWithMatchCase(this.find, matchCase);
    if (this.find.query) {
      this.startFind(this.find.query);
    } else {
      this.onChanged();
    }
  }

  stopFind(): void {
    if (!this.find.isOpen && !this.find.query) {
      return;
    }
    if (this.activeId) {
      this.contentsFor(this.activeId)?.stopFindInPage('clearSelection');
    }
    this.find = closedFind(this.find);
    this.onChanged();
  }

  openFind(): void {
    this.find = openedFind(this.find);
    this.onChanged();
  }

  // ---------------------------------------------------------------- events

  onPageContextMenu(handler: (tabId: TabId, params: ContextMenuParams) => void): void {
    this.contextMenuHandler = handler;
  }

  // Fetch the favicon in the web session and hand the chrome a data URL.
  private async cacheFavicon(tab: TabRecord, faviconUrl: string): Promise<void> {
    if (tab.pendingFaviconUrl === faviconUrl) {
      return;
    }
    tab.pendingFaviconUrl = faviconUrl;

    const cached = this.store.getFavicon(tab.url);
    if (cached) {
      tab.faviconDataUrl = cached;
      this.onChanged();
    }

    const dataUrl = await fetchFaviconDataUrl(tab.url, faviconUrl, (url, options) =>
      getWebSession().fetch(url, options),
    );
    if (!dataUrl) {
      return;
    }

    this.store.setFavicon(tab.url, dataUrl);
    tab.faviconDataUrl = dataUrl;
    this.onChanged();
  }

  // --------------------------------------------------------------- teardown

  dispose(): void {
    this.isDisposed = true;
    for (const tab of this.tabs.values()) {
      this.destroyTab(tab);
    }
    this.tabs.clear();
    this.order = [];
    this.activeId = null;
  }
}
