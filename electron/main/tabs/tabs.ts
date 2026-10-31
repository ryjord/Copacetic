// Libs
import {
  type BrowserWindow,
  type ContextMenuParams,
  type Session,
  WebContentsView,
  type WebContents,
  app,
  dialog,
} from 'electron';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

// Utils
import { sanitiseFilename } from '../data/downloads';
import { focusContents } from '../system/launch-mode';
import {
  START_PAGE_URL,
  fallbackTitleFor,
  hostOf,
  isInternalUrl,
  isNavigableUrl,
  originOf,
  resolveOmniboxInput,
} from '../../shared/browsing/url';
import {
  internalAddressOf,
  internalPageOf,
  internalPageTitle,
  internalPageUrl,
} from '../../shared/tabs/internal-pages';
import {
  CLOSED_FIND,
  closedFind,
  findForQuery,
  findWithMatchCase,
  findWithMatches,
  findWithWholeWord,
  findWithWholeWordMatches,
  openedFind,
} from './find-state';
import { renderedTextOf, wholeWordFlags, wholeWordPosition } from './whole-word';
import { fetchFaviconDataUrl, fetchImageDataUrl, fetchImagesWithinBudget } from './tab-favicon';
import { extensionPageOf, isLoadedExtensionPage, isOwnPage } from '../extensions/extension-pages';
import {
  DEFAULT_INSETS,
  type ContentBounds,
  type ContentInsets,
  contentBoundsWithin,
  normaliseInsets,
  shouldTabBeVisible,
} from './tab-layout';
import { describeSecurity } from './tab-security';
import { inheritFromOpener } from '../../shared/tabs/opening';
import {
  type SessionCandidate,
  historyToKeep,
  sessionFrom,
  tabAfterClosing,
  clampToRun,
  pinnedFirst,
  tabToSleepForMemory,
  tabsToSleep,
} from './tab-choices';
import { clampZoom } from '../../shared/types';
import { partitionFor, tabAfterCollapsing } from '../../shared/tabs/tab-groups';
import { type Placement, placeByRule, openRuleFor } from '../../shared/tabs/open-rules';
import {
  EVEN_SPLIT_RATIO,
  type SplitView,
  clampSplitRatio,
  isInSplit,
  pageWithinPane,
  partnerIn,
  shownSplit,
  splitPanes,
} from '../../shared/tabs/split-view';
import {
  acceptRefused,
  exceptionFor,
  forgetTab as forgetRefusedCertificate,
} from '../security/certificate-exceptions';
import { describeTab } from '../system/browser-identity';
import { log } from '../system/diagnostics';
import { isThisMachineLowOnMemory } from '../system/memory';
import { readScroll, restoreScroll } from './scroll-memory';
import { surfaceColour } from '../window/appearance';
import { attachTabEvents, markLoadRequested, settleUnstartedLoad } from './tab-events';
import type { ClosedEntry, ClosedGroup, ClosedTabs } from './closed-tabs';
import { applyWebRtcPolicy } from '../security/web-rtc';
import { type BrowsingRecord, HUSH_RECORD, storedRecord } from './browsing-record';
import { type TabRecord, pageOf } from './tab-record';
import { certificateFor } from '../security/certificates';
import { compareCertificate, rememberCertificate } from '../../shared/browsing/certificate-changes';
import { type SecurityDelegate, guardTabWebContents } from '../security/security';
import { t } from '../../shared/i18n/translate';

// Types
import type { FindState, TabId, TabState, WebRtcPolicy } from '../../shared/types';
import type { InternalPage } from '../../shared/tabs/internal-pages';
import type { ContentBlocker } from '../security/blocker';
import type { HttpsFirst } from '../security/https-first';
import type { SessionHistory, SessionSnapshot } from '../data/session-store';
import type { ScrollPosition } from '../../shared/tabs/scroll-position';
import type { NamedSessionTab } from '../../shared/data/named-sessions';
import { type TabMemory, memoryByTab } from '../../shared/tabs/tab-memory';
import type { ProfilePartitions } from '../../shared/data/partitions';
import type { BrowserStore } from '../data/store';
import type { PageChange } from './tab-events';

// The page's frame, rounded as the chrome draws it (--frame-radius in globals.css).
const PAGE_FRAME_RADIUS = 10;

export class TabManager {
  private readonly tabs = new Map<TabId, TabRecord>();
  private order: TabId[] = [];
  private activeId: TabId | null = null;
  private insets: ContentInsets = DEFAULT_INSETS;
  private overlayVisible = false;
  private stored: BrowsingRecord | null = null;
  private readonly sleepTimer: NodeJS.Timeout;
  private readonly stopCounting: () => void;
  private find: FindState = CLOSED_FIND;
  /** The page's text for a whole-words search, read once while the bar is open rather than at every keystroke. */
  private pageText: { contents: WebContents; url: string; text: Promise<string> } | null = null;
  /** Which of the occurrences of a whole-words search are whole words, read once per search. */
  private wholeWordPlan: { query: string; matchCase: boolean; flags: boolean[] } | null = null;
  // The way the last step went, so a skip past a part of a word keeps going that way.
  private findForward = true;
  private isDisposed = false;
  /** What has already been added to history per tab, so only the difference is. */
  private readonly countedBlocked = new Map<number, number>();
  private contextMenuHandler: ((tabId: TabId, params: ContextMenuParams) => void) | null = null;
  private pageChangeHandler: ((tabId: TabId, change: PageChange) => void) | null = null;
  private lastTabClosedHandler: (() => void) | null = null;
  private pageFocusHandler: (() => void) | null = null;
  private fullscreen: { tabId: TabId; wasWindowFullscreen: boolean } | null = null;
  private windowIsEnteringFullscreen = false;
  private split: SplitView | null = null;

  constructor(
    private readonly window: BrowserWindow,
    private readonly store: BrowserStore,
    private readonly blocker: ContentBlocker,
    private readonly httpsFirst: HttpsFirst,
    private readonly securityDelegate: SecurityDelegate,
    /** The sessions this profile's tabs run in; another profile's are never reachable from here. */
    private readonly partitions: ProfilePartitions,
    /** Shared by every window of the profile. */
    private readonly closedTabs: ClosedTabs,
    /**
     * Hardens a partition and returns its session. Called before a tab exists,
     * because a session that is hardened afterwards has already been used.
     */
    private readonly prepareSession: (partition: string) => Session,
    private readonly onChanged: () => void,
    /** Fired once per closed tab so owners can drop state keyed to it. */
    private readonly onTabClosed: (id: TabId) => void = () => {},
    /** The rectangle the page occupies, for anything drawn over it. */
    private readonly onContentBounds: (bounds: ContentBounds) => void = () => {},
  ) {
    this.sleepTimer = setInterval(() => this.sleepIdleTabs(), 60_000);
    this.sleepTimer.unref?.();
    this.window.on('resize', () => this.applyBounds());
    this.stopCounting = this.blocker.onCount((webContentsId, count) => {
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
       * A Hush tab's record keeps no count, as it keeps no visit.
       */
      if (tab.url.startsWith('http')) {
        const already = this.countedBlocked.get(webContentsId) ?? 0;
        if (count > already) {
          this.countedBlocked.set(webContentsId, count);
          tab.record.addBlocked(tab.url, count - already);
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

  snapshot(): { tabs: TabState[]; tabOrder: TabId[]; activeTabId: TabId | null; split: SplitView | null } {
    return {
      tabs: this.order.flatMap((id) => {
        const tab = this.tabs.get(id);
        return tab ? [this.toState(tab)] : [];
      }),
      tabOrder: [...this.order],
      activeTabId: this.activeId,
      split: this.split,
    };
  }

  /** What to reopen next launch. The rules are in tab-choices.ts, where they can be tested. */
  sessionSnapshot(): SessionSnapshot {
    const candidates: SessionCandidate[] = [];
    for (const id of this.order) {
      const tab = this.tabs.get(id);
      if (tab) {
        const internalPage = internalPageOf(tab.url);
        candidates.push({
          id,
          url: tab.url,
          groupId: tab.groupId,
          isStartPage: internalPage === 'start',
          isHush: tab.isHush,
          isPinned: tab.isPinned,
          // A page Copacetic draws has only the blank page behind it to go back to.
          history: internalPage === null ? this.historyOf(tab) : null,
          scroll: tab.scroll?.url === tab.url ? tab.scroll.position : null,
        });
      }
    }
    return sessionFrom(candidates, this.activeId, this.split);
  }

  private historyOf(tab: TabRecord): SessionCandidate['history'] {
    const contents = pageOf(tab);
    if (contents && !contents.isDestroyed()) {
      return {
        entries: contents.navigationHistory.getAllEntries(),
        index: contents.navigationHistory.getActiveIndex(),
      };
    }
    return tab.sleptHistory;
  }

  private toState(tab: TabRecord): TabState {
    const contents = pageOf(tab);
    const alive = contents !== null;
    const internalPage = internalPageOf(tab.url);
    const isSite = internalPage === null;
    return {
      id: tab.id,
      url: tab.url,
      // The start page's field stays empty for typing; any other page of ours shows where it is.
      displayUrl: internalPage === 'start' ? '' : tab.url,
      title: internalPage ? internalPageTitle(internalPage) : tab.title || fallbackTitleFor(tab.url),
      faviconDataUrl: tab.faviconDataUrl,
      isLoading: tab.isLoading,
      // A sleeping tab keeps its history to restore, so it can still go back once it wakes.
      canGoBack: alive ? isSite && contents.navigationHistory.canGoBack() : (tab.sleptHistory?.index ?? 0) > 0,
      canGoForward: alive
        ? isSite && contents.navigationHistory.canGoForward()
        : (tab.sleptHistory?.index ?? 0) < (tab.sleptHistory?.entries.length ?? 0) - 1,
      isAudible: contents?.isCurrentlyAudible() ?? false,
      isMuted: tab.isMuted,
      security: describeSecurity(
        tab.url,
        isSite ? certificateFor(hostOf(tab.url)) : null,
        !isSite || tab.error !== null ? '' : this.certificateChangeFor(tab),
        isSite ? exceptionFor(originOf(tab.url), contents?.session) : null,
        tab.error !== null,
      ),
      error: tab.error,
      blockedCount: alive ? this.blocker.countFor(contents.id) : 0,
      loadMs: tab.loadMs,
      zoomFactor: tab.zoomFactor,
      internalPage,
      isHush: tab.isHush,
      isPinned: tab.isPinned,
      isAsleep: tab.isAsleep,
      groupId: tab.groupId,
      isBookmarked: isSite && this.store.isBookmarked(tab.url),
    };
  }

  /**
   * Compares what this site is presenting against what it presented before, and
   * records it. Reading and remembering happen together so a site cannot be
   * flagged twice for the same change.
   */
  private certificateChangeFor(tab: TabRecord): string {
    const origin = originOf(tab.url);
    const current = certificateFor(hostOf(tab.url));
    if (!origin || !current) {
      return '';
    }

    const remembered = this.store.rememberedCertificateFor(origin);
    const { detail } = compareCertificate(remembered, current);

    // Compared for every tab, kept only by a record that keeps things: a Hush tab still sees a change mid-session.
    tab.record.rememberCertificate(origin, rememberCertificate(remembered, current, Date.now()));
    return detail;
  }

  /**
   * Puts a tab in a group, or takes it out of one.
   *
   * A view cannot change session, so a tab whose new group keeps a different
   * one is reopened there at the same address and position. Leaving it in its
   * old session made "its own cookies and logins" untrue for the tab that
   * founded the group, until a restart moved it without saying so.
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
    const partition = partitionFor({ isHush: tab.isHush, group: this.store.groupFor(groupId) }, this.partitions);
    if (partition !== tab.partition) {
      this.reopenInGroup(tab, groupId);
      return;
    }
    tab.groupId = groupId;
    this.onChanged();
  }

  private reopenInGroup(tab: TabRecord, groupId: string | null): void {
    const replacement = this.create(tab.url, {
      index: this.order.indexOf(tab.id),
      activate: this.activeId === tab.id,
      hush: tab.isHush,
      groupId,
      history: historyToKeep(this.historyOf(tab)) ?? undefined,
    });
    this.setMuted(replacement, tab.isMuted);
    this.close(tab.id, { isReplaced: true });
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

  isMuted(id: TabId): boolean {
    return this.tabs.get(id)?.isMuted ?? false;
  }

  // For a shortcut, which has no tab to name: the one in front, if there is one.
  private withActive(act: (id: TabId) => void): void {
    if (this.activeId) {
      act(this.activeId);
    }
  }

  togglePinnedActive(): void {
    this.withActive((id) => this.setPinned(id, !this.isPinned(id)));
  }

  toggleMutedActive(): void {
    this.withActive((id) => this.setMuted(id, !this.isMuted(id)));
  }

  sleepAllButActive(): void {
    this.withActive((id) => this.sleepOthers(id));
  }

  /** Every other tab that can give its memory back does, as when they have all been left alone: one playing sound plays on. */
  sleepOthers(id: TabId): void {
    this.sleepableOthers(id).forEach((tab) => this.sleep(tab.id));
  }

  sleepableOthers(id: TabId): TabRecord[] {
    return this.tabsInOrder().filter(
      (tab) => tab.id !== id && this.canSleep(tab.id) && !(pageOf(tab)?.isCurrentlyAudible() ?? false),
    );
  }

  /** Every tab in the window, in strip order. */
  tabsInOrder(): TabRecord[] {
    return this.order.map((tabId) => this.tabs.get(tabId)).filter((tab): tab is TabRecord => tab !== undefined);
  }

  tabsInGroup(groupId: string): TabRecord[] {
    return this.tabsInOrder().filter((tab) => tab.groupId === groupId);
  }

  /** Whether a group is holding anything that keeps nothing, which is what stops it claiming to be separate. */
  groupHoldsHush(groupId: string): boolean {
    return this.tabsInGroup(groupId).some((tab) => tab.isHush);
  }

  private findByWebContentsId(webContentsId: number): TabRecord | null {
    for (const tab of this.tabs.values()) {
      if (pageOf(tab)?.id === webContentsId) {
        return tab;
      }
    }
    return null;
  }

  isPinned(id: TabId): boolean {
    return this.tabs.get(id)?.isPinned === true;
  }

  has(id: TabId): boolean {
    return this.tabs.has(id);
  }

  tabIdForWebContentsId(webContentsId: number): TabId | null {
    return this.findByWebContentsId(webContentsId)?.id ?? null;
  }

  urlFor(id: TabId): string | null {
    const tab = this.tabs.get(id);
    if (!tab || internalPageOf(tab.url) !== null) {
      return null;
    }
    return tab.url;
  }

  titleFor(id: TabId): string {
    const tab = this.tabs.get(id);
    return tab ? tab.title || fallbackTitleFor(tab.url) : '';
  }

  /** The id of a tab's page while it has one; a sleeping tab has none, and asking does not wake it. */
  webContentsIdFor(id: TabId): number | undefined {
    return this.livePageFor(id)?.id;
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

  /** Asks where, then writes the page and what it is made of. Resolves empty, or with why it was not saved. */
  async savePage(id: TabId): Promise<string> {
    const contents = this.contentsFor(id);
    if (!contents || this.window.isDestroyed()) {
      return t('main.dialogs.savePage.noPage');
    }
    const { canceled, filePath } = await dialog.showSaveDialog(this.window, {
      title: t('main.dialogs.savePage.title'),
      defaultPath: `${sanitiseFilename(contents.getTitle() || t('main.dialogs.savePage.defaultName'))}.html`,
      filters: [{ name: t('main.dialogs.savePage.filterName'), extensions: ['html', 'htm'] }],
    });
    if (canceled || !filePath) {
      return '';
    }
    try {
      await contents.savePage(filePath, 'HTMLComplete');
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : t('main.dialogs.savePage.failed');
    }
  }

  /**
   * The whole page as one image, saved where the person chooses. Captured by
   * Chromium itself past the visible area, rather than stitched from scrolled
   * pieces, and capped so an endless page cannot exhaust memory.
   */
  async saveScreenshot(id: TabId): Promise<string> {
    const contents = this.contentsFor(id);
    if (!contents || this.window.isDestroyed()) {
      return t('main.dialogs.screenshot.noPage');
    }
    const image = await captureWholePage(contents);
    if (typeof image === 'string') {
      return image;
    }
    const { canceled, filePath } = await dialog.showSaveDialog(this.window, {
      title: t('main.dialogs.screenshot.title'),
      defaultPath: path.join(
        app.getPath('downloads'),
        `${sanitiseFilename(contents.getTitle() || t('main.dialogs.savePage.defaultName'))}.png`,
      ),
      filters: [{ name: t('main.dialogs.screenshot.filter'), extensions: ['png'] }],
    });
    if (canceled || !filePath) {
      return '';
    }
    try {
      await writeFile(filePath, image);
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : t('main.dialogs.screenshot.notWritten');
    }
  }

  /** Measured when asked, never on a timer: only tabs with a page have a process to measure. */
  memoryUse(): Record<TabId, TabMemory> {
    const tabs = [...this.tabs.values()].flatMap((tab) => {
      const contents = pageOf(tab);
      return contents && !contents.isDestroyed() ? [{ id: tab.id, processId: contents.getOSProcessId() }] : [];
    });
    const processes = app
      .getAppMetrics()
      .map((metric) => ({ processId: metric.pid, kilobytes: metric.memory.workingSetSize }));
    return memoryByTab(tabs, processes);
  }

  /**
   * The images an article names, fetched in the tab's own session so blocking
   * and its cookies apply as they did on the page; one that fails is left out.
   */
  async readerImages(id: TabId, urls: readonly string[]): Promise<Record<string, string>> {
    const tab = this.tabs.get(id);
    if (!tab) {
      return {};
    }
    const session = this.prepareSession(tab.partition);
    const wanted = [...new Set(urls)].slice(0, MAX_READER_IMAGES);
    return fetchImagesWithinBudget(wanted, (url) =>
      fetchImageDataUrl(tab.url, url, (target, options) => session.fetch(target, options), MAX_READER_IMAGE_BYTES),
    );
  }

  /** The page's document for reader view, or null when there is no page to read. */
  async readerDocument(id: TabId): Promise<{ url: string; html: string } | null> {
    const tab = this.tabs.get(id);
    const contents = tab ? pageOf(tab) : null;
    if (!tab || !contents || internalPageOf(tab.url) !== null || tab.error) {
      return null;
    }
    const html = await documentOf(contents);
    return html ? { url: contents.getURL(), html } : null;
  }

  print(id: TabId, onFailed: (reason: string) => void): void {
    this.contentsFor(id)?.print({}, (isPrinted, failureReason) => {
      // Cancelling the dialog is an answer, not a failure.
      if (!isPrinted && failureReason && !/cancel/i.test(failureReason)) {
        log.warn('a page did not print', { reason: failureReason });
        onFailed(failureReason);
      }
    });
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
    const isFullscreen = this.fullscreen !== null && this.fullscreen.tabId === this.activeId;
    return contentBoundsWithin({ width: width ?? 0, height: height ?? 0 }, this.insets, isFullscreen);
  }

  /** Where one tab's page goes: the whole content area, or its half of a split that is on screen. */
  private boundsFor(id: TabId): ContentBounds {
    const content = this.currentBounds();
    const shown = shownSplit(this.split, this.activeId);
    if (!shown || !isInSplit(shown, id) || this.fullscreen !== null) {
      return content;
    }
    const panes = splitPanes(content, shown.ratio);
    return pageWithinPane(shown.leftId === id ? panes.left : panes.right);
  }

  /** The split on screen, unless a page in it has gone fullscreen and taken the window for itself. */
  private visibleSplit(): SplitView | null {
    return this.fullscreen === null ? shownSplit(this.split, this.activeId) : null;
  }

  /**
   * A page asked for fullscreen, usually a video. Electron leaves a view where
   * it was, so without this the video filled a rectangle under the chrome. The
   * window goes fullscreen only if it was not already, and comes back the same.
   */
  private enterFullscreen(tabId: TabId): void {
    if (this.window.isDestroyed()) {
      return;
    }
    const wasWindowFullscreen = this.window.isFullScreen();
    this.fullscreen = { tabId, wasWindowFullscreen };
    if (!wasWindowFullscreen) {
      this.windowIsEnteringFullscreen = true;
      const settled = () => {
        if (!this.windowIsEnteringFullscreen) {
          return;
        }
        this.windowIsEnteringFullscreen = false;
        // The page left while macOS was still animating in, and a request made then is ignored.
        if (this.fullscreen === null && !this.window.isDestroyed()) {
          this.window.setFullScreen(false);
        }
      };
      this.window.once('enter-full-screen', settled);
      // In case a platform never says the transition finished.
      setTimeout(settled, 2_000).unref?.();
    }
    this.window.setFullScreen(true);
    this.applyBounds();
  }

  private leaveFullscreen(tabId: TabId): void {
    if (this.fullscreen?.tabId !== tabId) {
      return;
    }
    const { wasWindowFullscreen } = this.fullscreen;
    this.fullscreen = null;
    if (!this.window.isDestroyed() && !wasWindowFullscreen && !this.windowIsEnteringFullscreen) {
      this.window.setFullScreen(false);
    }
    this.applyBounds();
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

    const visible = this.visibleSplit();
    const onScreen = visible ? [visible.leftId, visible.rightId] : this.activeId ? [this.activeId] : [];
    // Square in full screen, where there is no frame round it.
    const radius = this.fullscreen === null ? PAGE_FRAME_RADIUS : 0;
    onScreen.forEach((id) => {
      const tab = this.tabs.get(id);
      if (tab && pageOf(tab) !== null) {
        tab.view.setBounds(this.boundsFor(id));
        tab.view.setBorderRadius(radius);
      }
    });
  }

  private applyVisibility(): void {
    if (this.isDisposed) {
      return;
    }
    const visible = this.visibleSplit();
    for (const [id, tab] of this.tabs) {
      if (pageOf(tab) === null) {
        continue;
      }
      const isVisible = shouldTabBeVisible(
        {
          isActive: id === this.activeId || isInSplit(visible, id),
          isInternalPage: internalPageOf(tab.url) !== null,
          hasError: tab.error !== null,
        },
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
      pinned?: boolean;
      /** Where it can go back and forward to, from a restored session. */
      history?: SessionHistory;
      /** How far down its page it was, from a restored session. */
      scroll?: ScrollPosition;
      /**
       * A page a tab opened with `window.open`, already made by Chromium and
       * linked to its opener. It becomes this tab as it is, never loaded again,
       * so `window.opener` still reaches the page that opened it.
       */
      adopting?: Electron.WebContents;
    } = {},
  ): TabId {
    // Last line of defence. Callers are expected to have already decided the
    // URL is allowed, but this is the single place every tab is born, so
    // refusing here means no future caller can quietly open a `data:` or
    // `javascript:` tab by forgetting a check of its own.
    // An installed extension's own page, such as its options, is the one other kind of address a tab may open.
    // A copacetic:// address is one of our own pages or nothing: an unknown one opens a new tab instead.
    const isOurAddress = isInternalUrl(requestedUrl);
    const isAllowed =
      (isOurAddress ? internalAddressOf(requestedUrl) !== null : isNavigableUrl(requestedUrl)) ||
      isLoadedExtensionPage(requestedUrl);
    const rawUrl = isAllowed ? requestedUrl : START_PAGE_URL;

    // What the opener was, this tab is, unless the caller said otherwise. A
    // link followed out of a Hush tab used to open an ordinary recorded one -
    // see shared/opening.ts. Applied here because this is the single place
    // every tab is born, so no caller can forget it.
    const opener =
      options.openerWebContentsId === undefined ? null : this.findByWebContentsId(options.openerWebContentsId);
    const fromOpener = inheritFromOpener(opener ? { isHush: opener.isHush, groupId: opener.groupId } : null, {
      hush: options.hush,
      groupId: options.groupId,
    });
    // A caller that said where the tab goes has already decided; otherwise the site's rule does.
    // An adopted page is already in its opener's session, so no rule can move it elsewhere.
    const isPlacedByCaller =
      options.hush !== undefined || options.groupId !== undefined || options.adopting !== undefined;
    const inherited = isPlacedByCaller ? fromOpener : this.placementFor(fromOpener, rawUrl);

    const id = randomUUID();
    const settings = this.store.getSettings();
    // Hush wins over a group's own session: see shared/tab-groups.ts.
    const partition = partitionFor(
      { isHush: inherited.hush, group: this.store.groupFor(inherited.groupId) },
      this.partitions,
    );
    // Before the view exists, not after. A group's own session had nothing
    // installed on it at all, so its tabs ran with permissions approved by
    // default, no tracker blocking and no download handling.
    const tabSession = this.prepareSession(partition);

    // No extension runs in Hush, so a Hush tab has nothing to give the page.
    const extensionPage = options.adopting || inherited.hush ? null : extensionPageOf(rawUrl, tabSession);
    const view = this.makeView(partition, options.adopting, extensionPage?.host.preload);

    const internal = options.adopting ? null : internalAddressOf(rawUrl);
    // Reached with one of our addresses only for an adopted page, which is a site whatever it was opened at.
    const siteUrl = isInternalUrl(rawUrl) ? 'about:blank' : rawUrl;
    const tab: TabRecord = {
      id,
      view,
      isHush: inherited.hush,
      isPinned: options.pinned === true,
      record: inherited.hush ? HUSH_RECORD : this.storedRecord(),
      url: internal ? internalPageUrl(internal.page, internal.section) : siteUrl,
      title: '',
      faviconDataUrl: internal ? null : this.store.getFavicon(rawUrl),
      isLoading: false,
      error: null,
      loadStartedAt: null,
      loadMs: null,
      zoomFactor: settings.defaultZoomFactor,
      isMuted: false,
      pendingFaviconUrl: null,
      groupId: inherited.groupId && this.store.groupFor(inherited.groupId) ? inherited.groupId : null,
      partition,
      isAsleep: false,
      lastActiveAt: Date.now(),
      sleptHistory: null,
      extensionPage: extensionPage?.id ?? null,
      scroll: null,
      pendingScroll: options.scroll && !internal ? { url: rawUrl, position: options.scroll } : null,
    };

    this.tabs.set(id, tab);
    const insertAt = options.index ?? this.insertionIndexFor(options.openerWebContentsId);
    this.order.splice(Math.min(Math.max(0, insertAt), this.order.length), 0, id);
    this.order = pinnedFirst(this.order, (tabId) => this.tabs.get(tabId)?.isPinned === true);

    const history = internal ? null : (options.history ?? null);
    const described = this.wireView(tab, options.adopting !== undefined, history);
    extensionPage?.host.wire(view.webContents);

    if (!internal && !options.adopting) {
      void described.then(() => {
        // It can be closed, or sent somewhere else, while it waits.
        if (this.tabs.get(id) !== tab || tab.url !== rawUrl) {
          return;
        }
        const page = pageOf(tab);
        if (page) {
          this.arrive(tab, page, history, rawUrl);
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

  /**
   * A page's own view: no bridge, no Node, its session's partition, as close to a plain browser tab as Electron allows.
   * `extensionPreload` is given only for an extension's own page; a website never loads in a view that has one.
   */
  private makeView(partition: string, adopting?: Electron.WebContents, extensionPreload?: string): WebContentsView {
    const view = new WebContentsView({
      ...(adopting ? { webContents: adopting } : {}),
      webPreferences: {
        preload: extensionPreload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        partition,
        spellcheck: true,
        safeDialogs: true,
        // Only Chromium's own PDF viewer is a plugin here; without it a PDF downloads instead of opening.
        plugins: true,
        // Sound waits for someone to use the page, as in Chrome; Electron's own default lets any page play at once.
        autoplayPolicy: 'document-user-activation-required',
      },
    });
    // Matches the chrome's surface so a slow first paint does not flash white.
    view.setBackgroundColor(surfaceColour());
    return view;
  }

  /**
   * Puts a tab's view in the window with everything a page view needs, and
   * resolves once it is ready to navigate. The same for a new tab and one
   * waking, so a woken tab is guarded exactly as it was when it was made.
   */
  private wireView(tab: TabRecord, isAdopted = false, history: SessionHistory | null = null): Promise<void> {
    const { view, id } = tab;
    const settings = this.store.getSettings();
    this.window.contentView.addChildView(view);
    // Sized once up front so a background tab loads against the real viewport
    // rather than a zero-sized one and picks the wrong responsive breakpoint.
    view.setBounds(this.currentBounds());
    view.setVisible(false);
    attachTabEvents(tab, {
      store: this.store,
      blocker: this.blocker,
      httpsFirst: this.httpsFirst,
      forgetBlockedCount: (webContentsId: number) => this.countedBlocked.delete(webContentsId),
      onChanged: () => this.onChanged(),
      applyVisibility: () => this.applyVisibility(),
      cacheFavicon: (record, faviconUrl) => void this.cacheFavicon(record, faviconUrl),
      onFoundInPage: (activeMatch, matches, isFinal) => {
        // A background tab finishing a search must not overwrite the count for the one on screen.
        if (this.activeId !== id) {
          return;
        }
        this.foundInPage(activeMatch, matches, isFinal);
      },
      onContextMenu: (tabId, params) => this.contextMenuHandler?.(tabId, params),
      onPageChanged: (tabId, change) => this.pageChangeHandler?.(tabId, change),
    });
    guardTabWebContents(view.webContents, this.securityDelegate);
    // Before the first navigation, so no page gets a moment to ask for the local address.
    applyWebRtcPolicy(view.webContents, settings.webRtcPolicy);
    view.webContents.on('focus', () => {
      // Clicking into the other half of a split is choosing that page.
      if (this.activeId !== id && isInSplit(this.visibleSplit(), id)) {
        this.activate(id);
      }
      this.pageFocusHandler?.();
    });
    const followRule = (event: Electron.Event<{ url: string; isMainFrame: boolean }>) => {
      if (event.isMainFrame && this.placeByOpenRule(tab, event.url)) {
        event.preventDefault();
      }
    };
    view.webContents.on('will-navigate', followRule);
    view.webContents.on('will-redirect', followRule);
    if (tab.extensionPage !== null) {
      this.guardExtensionView(tab, tab.extensionPage);
    }
    view.webContents.on('did-finish-load', () => this.putBackScroll(tab, view.webContents));
    view.webContents.on('enter-html-full-screen', () => this.enterFullscreen(id));
    view.webContents.on('leave-html-full-screen', () => this.leaveFullscreen(id));
    // An adopted page already has a document and is on its way somewhere; loading the empty one would stop it.
    if (isAdopted) {
      return describeTab(view.webContents, process.platform);
    }
    // A view with no document yet answers no DevTools command at all, so it is
    // given the empty one first. Navigation then waits for the description to
    // land, because a tab that starts loading before it does is exactly the tab
    // that needed it. `about:blank` is ignored when a navigation commits, so
    // none of this reaches the tab's state.
    return this.prime(view.webContents, history)
      .catch(() => {})
      .then(() => describeTab(view.webContents, process.platform));
  }

  // Electron restores history only into a view that has loaded nothing, so a restored one is primed by the restore,
  // with the empty page after it; the empty page is dropped once the real one commits.
  private prime(page: WebContents, history: SessionHistory | null): Promise<unknown> {
    if (!history || history.entries.length === 0) {
      return page.loadURL('about:blank');
    }
    return page.navigationHistory.restore({
      entries: [...history.entries, { url: 'about:blank', title: '' }],
      index: history.entries.length,
    });
  }

  /** Whether a tab has a page that could be closed to save memory; the one in front never does. */
  canSleep(id: TabId): boolean {
    const tab = this.tabs.get(id);
    return Boolean(
      tab &&
      pageOf(tab) &&
      internalPageOf(tab.url) === null &&
      id !== this.activeId &&
      !isInSplit(this.visibleSplit(), id),
    );
  }

  /** Closes a tab's page to give back its memory, keeping its address, title and history. */
  sleep(id: TabId): void {
    const tab = this.tabs.get(id);
    const contents = tab ? pageOf(tab) : null;
    if (!tab || !contents || !this.canSleep(id)) {
      return;
    }
    tab.sleptHistory = {
      entries: contents.navigationHistory.getAllEntries(),
      index: contents.navigationHistory.getActiveIndex(),
    };
    this.destroyTab(tab);
    tab.isAsleep = true;
    tab.isLoading = false;
    this.onChanged();
  }

  /** Gives a sleeping tab a page again, at the address and with the history it had. */
  private wake(tab: TabRecord): void {
    if (!tab.isAsleep) {
      return;
    }
    tab.pendingScroll = tab.scroll;
    const history = tab.sleptHistory;
    void this.givePageBack(tab, history).then(() => {
      const page = pageOf(tab);
      if (this.tabs.get(tab.id) === tab && page) {
        this.arrive(tab, page, history, tab.url);
      }
    });
  }

  /** A new page for a sleeping tab, there at once; resolves when it can be navigated. */
  private givePageBack(tab: TabRecord, history: SessionHistory | null = null): Promise<unknown> {
    const extensionPage = tab.isHush ? null : extensionPageOf(tab.url, this.prepareSession(tab.partition));
    tab.view = this.makeView(tab.partition, undefined, extensionPage?.host.preload);
    tab.extensionPage = extensionPage?.id ?? null;
    tab.isAsleep = false;
    tab.sleptHistory = null;
    const described = this.wireView(tab, false, history);
    extensionPage?.host.wire(tab.view.webContents);
    return described;
  }

  /**
   * Keeps a view carrying an extension's preload to that extension's pages. A
   * link or script leaving for a website is cancelled before its request; any
   * other way out (Back, say) is noticed as it starts. Either way the tab then
   * gets a plain view, with its history, and goes there.
   */
  private guardExtensionView(tab: TabRecord, extensionId: string): void {
    const contents = tab.view.webContents;
    // After the event that asked: stopping or closing a page inside its own navigation event crashes Chromium.
    const leave = (url: string) =>
      setImmediate(() => {
        if (pageOf(tab) === contents && tab.extensionPage === extensionId) {
          this.leaveExtensionView(tab, url);
        }
      });
    const stopAtTheDoor = (event: Electron.Event<{ url: string; isMainFrame: boolean }>) => {
      if (event.isMainFrame && !isOwnPage(extensionId, event.url)) {
        event.preventDefault();
        leave(event.url);
      }
    };
    contents.on('will-navigate', stopAtTheDoor);
    contents.on('will-redirect', stopAtTheDoor);
    contents.on('did-start-navigation', (event) => {
      if (event.isMainFrame && !event.isSameDocument && !isOwnPage(extensionId, event.url)) {
        leave(event.url);
      }
    });
  }

  private leaveExtensionView(tab: TabRecord, url: string): void {
    const contents = pageOf(tab);
    if (!contents) {
      return;
    }
    const history: SessionHistory = {
      entries: contents.navigationHistory.getAllEntries(),
      index: contents.navigationHistory.getActiveIndex(),
    };
    this.destroyTab(tab);
    tab.extensionPage = null;
    tab.view = this.makeView(tab.partition);
    void this.wireView(tab, false, history).then(() => {
      if (this.tabs.get(tab.id) === tab && pageOf(tab)) {
        void this.loadUrl(tab, url);
      }
    });
    this.applyVisibility();
    this.applyBounds();
    this.onChanged();
  }

  /** Takes a primed page where it was going: to its place in the history restored, or to its address. */
  private arrive(tab: TabRecord, page: WebContents, history: SessionHistory | null, url: string): void {
    const isRestored =
      history !== null && page.navigationHistory.getAllEntries().length === history.entries.length + 1;
    if (isRestored) {
      page.navigationHistory.goToIndex(history.index);
      return;
    }
    void this.loadUrl(tab, url);
  }

  /** Reads how far down its page a tab is, for a restore or a wake to put back; never for Hush or a page of ours. */
  private async rememberScroll(tab: TabRecord): Promise<void> {
    const contents = pageOf(tab);
    if (!contents || tab.isHush || internalPageOf(tab.url) !== null) {
      return;
    }
    const url = contents.getURL();
    const position = await readScroll(contents);
    if (pageOf(tab) === contents && contents.getURL() === url) {
      tab.scroll = position ? { url, position } : null;
    }
  }

  private putBackScroll(tab: TabRecord, contents: WebContents): void {
    const pending = tab.pendingScroll;
    // The primed empty page loads first, and is no reason to give up waiting.
    if (!pending || pageOf(tab) !== contents || contents.getURL() === 'about:blank') {
      return;
    }
    tab.pendingScroll = null;
    if (contents.getURL() === pending.url) {
      void restoreScroll(contents, pending.position);
    }
  }

  private sleepIdleTabs(): void {
    const afterMinutes = this.store.getSettings().sleepTabsAfterMinutes;
    const visible = this.visibleSplit();
    // The tabs on screen are read once a minute too, since a quit gives no moment to ask them.
    const front = this.activeTab();
    const beside = visible && this.activeId ? this.tabs.get(partnerIn(visible, this.activeId)) : undefined;
    if (front) {
      void this.rememberScroll(front);
    }
    if (beside) {
      void this.rememberScroll(beside);
    }
    const candidates = [...this.tabs.values()].map((tab) => ({
      id: tab.id,
      isActive: tab.id === this.activeId || isInSplit(visible, tab.id),
      isInternalPage: internalPageOf(tab.url) !== null,
      isAsleep: tab.isAsleep,
      isAudible: pageOf(tab)?.isCurrentlyAudible() ?? false,
      lastActiveAt: tab.lastActiveAt,
    }));
    const now = Date.now();
    const idle = tabsToSleep(candidates, now, afterMinutes);
    idle.forEach((id) => this.sleep(id));
    const slept = new Set(idle);
    // Asked of the machine only when there is a tab it could put to sleep.
    const forMemory = tabToSleepForMemory(
      candidates.filter((tab) => !slept.has(tab.id)),
      now,
      afterMinutes,
    );
    if (forMemory && isThisMachineLowOnMemory()) {
      this.sleep(forMemory);
    }
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

  close(id: TabId, options: { isReplaced?: boolean } = {}): void {
    const tab = this.tabs.get(id);
    if (!tab) {
      return;
    }

    const index = this.order.indexOf(id);
    if (internalPageOf(tab.url) !== 'start' && !options.isReplaced) {
      const internalPage = internalPageOf(tab.url);
      tab.record.rememberClosedTab({
        url: tab.url,
        title: internalPage ? internalPageTitle(internalPage) : tab.title,
        index,
        groupId: tab.groupId,
        isPinned: tab.isPinned,
      });
    }

    this.leaveFullscreen(id);
    this.destroyTab(tab);
    this.tabs.delete(id);
    this.order = this.order.filter((tabId) => tabId !== id);
    this.onTabClosed(id);

    // A split of one is no split; the page beside it is the one left to look at.
    const partner = this.split && isInSplit(this.split, id) ? partnerIn(this.split, id) : null;
    if (partner) {
      this.split = null;
    }

    if (this.activeId === id) {
      const next = partner ?? tabAfterClosing(this.order, index);
      this.activeId = null;
      if (next) {
        this.activate(next);
      }
    }

    // Closing the last tab closes its window, as in Chrome; with nothing to close it, one is left to go back from.
    if (this.order.length === 0) {
      if (this.lastTabClosedHandler) {
        this.lastTabClosedHandler();
      } else {
        this.create(START_PAGE_URL);
      }
      return;
    }

    this.applyVisibility();
    this.onChanged();
  }

  private destroyTab(tab: TabRecord): void {
    const contents = pageOf(tab);
    if (contents) {
      this.blocker.forget(contents.id);
      this.httpsFirst.forget(contents.id);
      forgetRefusedCertificate(contents.id);
      this.countedBlocked.delete(contents.id);
      contents.stop();
    }
    // A sleeping tab's view is already out of the window and its page already closed.
    if (!this.window.isDestroyed() && !tab.isAsleep) {
      this.window.contentView.removeChildView(tab.view);
    }
    contents?.close();
  }

  reopenClosed(): void {
    this.reopen(this.closedTabs.takeMostRecent());
  }

  /** One entry from the recently closed list, by its place in it. */
  reopenClosedAt(position: number): void {
    this.reopen(this.closedTabs.take(position));
  }

  closedEntries(): readonly ClosedEntry[] {
    return this.closedTabs.entries();
  }

  /** Closes a group's tabs as one thing to reopen, rather than a handful of loose tabs. */
  closeAsGroup(groupId: string, group: ClosedGroup): void {
    this.closedTabs.beginGroup(group);
    try {
      this.tabsInGroup(groupId).forEach((tab) => this.close(tab.id));
    } finally {
      this.closedTabs.endGroup();
    }
  }

  private reopen(entry: ClosedEntry | null): void {
    const internal = entry?.kind === 'tab' ? internalAddressOf(entry.tab.url) : null;
    // One of our pages comes back the way any request for it does, so a second copy never opens.
    if (internal) {
      this.showInternalPage(internal.page, internal.section);
      return;
    }
    if (entry?.kind === 'tab') {
      // A group that has since been deleted is dropped by create, which leaves an ordinary tab.
      this.create(entry.tab.url, {
        index: entry.tab.index,
        activate: true,
        groupId: entry.tab.groupId,
        pinned: entry.tab.isPinned,
      });
      return;
    }
    if (entry?.kind === 'group') {
      // A new group, since the old one went with its tabs; one with its own session starts signed out.
      const group = this.store.createGroup(entry.group.name, entry.group.colour, entry.group.ownSession);
      entry.tabs.forEach((tab, position) =>
        this.create(tab.url, { index: tab.index, activate: position === 0, groupId: group.id }),
      );
    }
  }

  /** The person read why the HTTPS version failed and chose the plain one. */
  continueOverHttp(id: TabId): void {
    const tab = this.tabs.get(id);
    const plainUrl = tab?.error?.plainUrl;
    // Loaded directly: the address bar would upgrade it straight back.
    if (tab && plainUrl && this.httpsFirst.allowPlain(plainUrl)) {
      void this.loadUrl(tab, plainUrl);
    }
  }

  /** The person read why the certificate was refused and chose to continue to this one site. */
  acceptCertificate(id: TabId): void {
    const tab = this.tabs.get(id);
    const failedUrl = tab?.error?.url;
    const page = tab ? pageOf(tab) : null;
    if (tab && page && failedUrl && acceptRefused(page.id, failedUrl)) {
      void this.loadUrl(tab, failedUrl);
    }
  }

  duplicate(id: TabId): void {
    const tab = this.tabs.get(id);
    if (!tab || internalPageOf(tab.url) !== null) {
      return;
    }
    // Named outright rather than through its page, which a sleeping tab does not have.
    this.create(tab.url, {
      index: this.order.indexOf(id) + 1,
      activate: true,
      hush: tab.isHush,
      groupId: tab.groupId,
      pinned: tab.isPinned,
    });
  }

  /** Behind every page before it paints, so a new tab never flashes the other theme's colour. */
  setWebRtcPolicy(policy: WebRtcPolicy): void {
    // A sleeping tab is given the setting as it stands when it wakes.
    this.tabs.forEach((tab) => {
      const page = pageOf(tab);
      if (page) {
        applyWebRtcPolicy(page, policy);
      }
    });
  }

  setBackgroundColor(colour: string): void {
    for (const tab of this.tabs.values()) {
      if (pageOf(tab)) {
        tab.view.setBackgroundColor(colour);
      }
    }
  }

  /** Brings one of our pages forward: its tab in this window if one is open, otherwise a new one beside the tab in front. */
  showInternalPage(page: InternalPage, section: string | null = null): TabId {
    const url = internalPageUrl(page, section);
    // Hush from a Hush tab, so a site reached from History opened there stays out of the record too.
    const isHush = this.activeTab()?.isHush ?? false;
    const openId = this.order.find((id) => {
      const tab = this.tabs.get(id);
      return tab !== undefined && internalPageOf(tab.url) === page && tab.isHush === isHush;
    });
    if (openId) {
      if (section !== null) {
        this.navigate(openId, url);
      }
      this.activate(openId);
      return openId;
    }
    const activeIndex = this.activeId ? this.order.indexOf(this.activeId) : this.order.length - 1;
    // Placed here on purpose, so no open rule decides where Settings goes.
    return this.create(url, { index: activeIndex + 1, hush: isHush, groupId: null });
  }

  activate(id: TabId): void {
    if (!this.tabs.has(id) || this.activeId === id) {
      if (this.activeId === id) {
        this.focusActive();
      }
      return;
    }
    // Before the switch, so the highlights cleared are the ones on the tab being left.
    this.stopFind();
    if (this.fullscreen && this.fullscreen.tabId !== id) {
      // The third script in pages, named on the transparency page: only the page itself can leave its full screen.
      void this.contentsFor(this.fullscreen.tabId)
        ?.executeJavaScript('document.exitFullscreen?.()')
        .catch(() => {});
    }
    const now = Date.now();
    const leaving = this.activeTab();
    if (leaving) {
      leaving.lastActiveAt = now;
      void this.rememberScroll(leaving);
    }
    this.activeId = id;
    const arriving = this.tabs.get(id);
    if (arriving) {
      arriving.lastActiveAt = now;
      this.wake(arriving);
    }
    const visible = this.visibleSplit();
    const beside = visible ? this.tabs.get(partnerIn(visible, id)) : undefined;
    if (beside) {
      beside.lastActiveAt = now;
      this.wake(beside);
    }
    this.applyBounds();
    this.applyVisibility();
    this.focusActive();
    this.onChanged();
  }

  focusActive(): void {
    const tab = this.activeTab();
    // A page of ours or an error is drawn by the chrome, so the keyboard belongs there rather than in a hidden view.
    if (!tab || internalPageOf(tab.url) !== null || tab.error) {
      if (!this.window.isDestroyed()) {
        focusContents(this.window.webContents);
      }
      return;
    }
    const page = pageOf(tab);
    if (page) {
      focusContents(page);
    }
  }

  move(id: TabId, toIndex: number): void {
    const from = this.order.indexOf(id);
    if (from === -1) {
      return;
    }
    const clamped = clampToRun(this.order, (tabId) => this.tabs.get(tabId)?.isPinned === true, id, toIndex);
    if (from === clamped) {
      return;
    }
    this.order.splice(from, 1);
    this.order.splice(clamped, 0, id);
    // A split's two tabs sit side by side in the strip; moving one away from the other is taking it out.
    if (this.split && isInSplit(this.split, id)) {
      const distance = this.order.indexOf(this.split.leftId) - this.order.indexOf(this.split.rightId);
      if (Math.abs(distance) !== 1) {
        this.leaveSplit();
        return;
      }
    }
    this.onChanged();
  }

  /** Pins a tab to the start of the strip, or lets it go. A pinned tab leaves its group, as in every other browser. */
  setPinned(id: TabId, isPinned: boolean): void {
    const tab = this.tabs.get(id);
    if (!tab || tab.isPinned === isPinned) {
      return;
    }
    tab.isPinned = isPinned;
    if (isPinned) {
      tab.groupId = null;
    }
    this.order = pinnedFirst(this.order, (tabId) => this.tabs.get(tabId)?.isPinned === true);
    this.onChanged();
  }

  /** What a saved session keeps of this window: every page, but nothing from Hush, which is never written down. */
  namedSessionTabs(): NamedSessionTab[] {
    return this.order.flatMap((id) => {
      const tab = this.tabs.get(id);
      return tab && !tab.isHush && internalPageOf(tab.url) === null && isNavigableUrl(tab.url)
        ? [{ url: tab.url, title: tab.title }]
        : [];
    });
  }

  // ------------------------------------------------------------ split view

  getSplit(): SplitView | null {
    return this.split;
  }

  /**
   * Shows the tab in front beside another, or beside a new tab when none is
   * named. The other tab moves next to it in the strip and takes the keyboard.
   */
  splitWith(otherId: TabId | null): void {
    const leftId = this.activeId;
    if (!leftId || otherId === leftId || (otherId !== null && !this.tabs.has(otherId))) {
      return;
    }
    const leftIndex = this.order.indexOf(leftId);
    const rightId = otherId ?? this.create(START_PAGE_URL, { activate: false, index: leftIndex + 1 });
    const rightIndex = this.order.indexOf(rightId);
    // Taken out before it goes back in, so one from before the left tab lands at the left tab's old index.
    this.move(rightId, rightIndex > leftIndex ? leftIndex + 1 : leftIndex);
    this.split = { leftId, rightId, ratio: this.split?.ratio ?? EVEN_SPLIT_RATIO };
    this.activate(rightId);
    this.applyBounds();
    this.applyVisibility();
    this.onChanged();
  }

  /**
   * Puts another open tab in one half of the split, beside the other half in
   * the strip. The tab it replaces stays open, unless it is the new tab the
   * split opened with and still shows nothing, which would only be clutter.
   */
  replaceSplitPane(paneId: TabId, replacementId: TabId): void {
    const split = this.split;
    if (!split || !isInSplit(split, paneId) || !this.tabs.has(replacementId) || isInSplit(split, replacementId)) {
      return;
    }
    const isLeft = split.leftId === paneId;
    const partnerId = partnerIn(split, paneId);
    this.split = isLeft ? { ...split, leftId: replacementId } : { ...split, rightId: replacementId };

    const partnerIndex = this.order.indexOf(partnerId);
    // Taken out before it goes back in, so a tab from before the partner lands one place earlier.
    const partnerIndexWithout = this.order.indexOf(replacementId) < partnerIndex ? partnerIndex - 1 : partnerIndex;
    this.move(replacementId, isLeft ? partnerIndexWithout : partnerIndexWithout + 1);

    const displaced = this.tabs.get(paneId);
    if (displaced && internalPageOf(displaced.url) === 'start') {
      this.close(paneId, { isReplaced: true });
    }
    if (!this.split) {
      // The move could not seat it beside its partner, such as a pinned tab, so there is no split to show.
      return;
    }
    this.activate(replacementId);
    this.applyBounds();
    this.applyVisibility();
    this.onChanged();
  }

  /** The split view shortcut: leaves the split in front, or makes one with a new tab. */
  toggleSplit(): void {
    if (isInSplit(this.split, this.activeId)) {
      this.leaveSplit();
      return;
    }
    this.splitWith(null);
  }

  /** A pair coming back after a restart: shown again as it was, without moving or choosing either tab. */
  restoreSplit(leftId: TabId, rightId: TabId, ratio: number): void {
    if (leftId === rightId || !this.tabs.has(leftId) || !this.tabs.has(rightId)) {
      return;
    }
    this.split = { leftId, rightId, ratio: clampSplitRatio(ratio) };
    this.applyBounds();
    this.applyVisibility();
    this.onChanged();
  }

  leaveSplit(): void {
    if (!this.split) {
      return;
    }
    this.split = null;
    this.applyBounds();
    this.applyVisibility();
    this.onChanged();
  }

  setSplitRatio(ratio: number): void {
    if (!this.split) {
      return;
    }
    this.split = { ...this.split, ratio: clampSplitRatio(ratio) };
    this.applyBounds();
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

    const internal = internalAddressOf(input);
    if (internal) {
      const wasSite = internalPageOf(tab.url) === null;
      tab.url = internalPageUrl(internal.page, internal.section);
      tab.title = '';
      tab.error = null;
      tab.faviconDataUrl = null;
      tab.isLoading = false;
      // A sleeping tab gets a fresh view, blank already, and its site's history goes with the site.
      if (tab.isAsleep) {
        void this.givePageBack(tab);
      } else if (wasSite) {
        pageOf(tab)
          ?.loadURL('about:blank')
          .catch(() => {});
      }
      this.applyVisibility();
      this.onChanged();
      return;
    }

    const settings = this.store.getSettings();
    const resolution = resolveOmniboxInput(input, settings, { httpsFirst: settings.httpsFirst });
    if (!resolution || this.placeByOpenRule(tab, resolution.target)) {
      return;
    }
    // Woken without its old history, which would otherwise be restored over the address just asked for.
    const ready = tab.isAsleep ? this.givePageBack(tab) : Promise.resolve();
    const page = pageOf(tab);
    const target =
      resolution.type === 'url' && page
        ? this.httpsFirst.typed(page.id, input, resolution.target)
        : resolution.target;
    void ready.then(() => this.loadUrl(tab, target));
  }

  private placementFor(place: Placement, url: string): Placement {
    const target = openRuleFor(this.store.getSettings().openRules, url);
    return placeByRule(place, target, (groupId) => this.store.groupFor(groupId) !== null);
  }

  /**
   * Hands a page to a tab where its site's rule says it opens, and reports
   * whether it did. A tab with nothing in it yet gives itself up; one with a
   * page keeps it, as following a link never loses the page it was on.
   */
  private placeByOpenRule(tab: TabRecord, url: string): boolean {
    const current: Placement = { hush: tab.isHush, groupId: tab.groupId };
    const place = this.placementFor(current, url);
    if (place === current) {
      return false;
    }
    // Same session either way, so joining the group is enough and the page loads where it is.
    if (
      !place.hush &&
      partitionFor({ isHush: false, group: this.store.groupFor(place.groupId) }, this.partitions) === tab.partition
    ) {
      tab.groupId = place.groupId;
      this.onChanged();
      return false;
    }
    const isEmpty = internalPageOf(tab.url) === 'start' || ['', 'about:blank'].includes(pageOf(tab)?.getURL() ?? '');
    this.create(url, {
      index: this.order.indexOf(tab.id) + 1,
      activate: this.activeId === tab.id,
      hush: place.hush,
      groupId: place.groupId,
    });
    if (isEmpty) {
      // After the navigation event that asked has returned, since closing a page from inside its own event is not safe.
      setImmediate(() => this.close(tab.id, { isReplaced: true }));
    }
    return true;
  }

  private async loadUrl(tab: TabRecord, url: string): Promise<void> {
    const contents = pageOf(tab);
    if (!contents) {
      return;
    }
    if (tab.extensionPage !== null && !isOwnPage(tab.extensionPage, url)) {
      this.leaveExtensionView(tab, url);
      return;
    }

    tab.error = null;
    tab.url = url;
    markLoadRequested(tab);
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
    if (settleUnstartedLoad(tab, contents)) {
      this.onChanged();
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
    if (internalPageOf(tab.url) !== null) {
      this.onChanged();
      return;
    }
    const contents = pageOf(tab);
    if (!contents) {
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
    tab.zoomFactor = clampZoom(zoomFactor);
    contents.setZoomFactor(tab.zoomFactor);

    // Remembered against the origin: a site that needs zooming needs it every
    // visit, and setting it again on every visit is the kind of small friction
    // that makes a browser tiring to use.
    // A Hush tab keeps its zoom on the tab: Settings lists every site zoomed, so its record keeps none.
    if (internalPageOf(tab.url) === null) {
      tab.record.setZoomForOrigin(originOf(tab.url), tab.zoomFactor);
    }

    this.onChanged();
  }

  /**
   * A tab's page if it has one, for anything looking from the background: a
   * sleeping tab stays asleep, since waking reloads its page, and a video in it
   * starts playing in a tab nobody chose.
   */
  livePageFor(id: TabId): WebContents | null {
    const tab = this.tabs.get(id);
    return tab ? pageOf(tab) : null;
  }

  // For an action on the tab itself: reloading or going back in one asleep is asking for it back.
  private contentsFor(id: TabId): WebContents | null {
    const tab = this.tabs.get(id);
    if (tab?.isAsleep) {
      this.wake(tab);
    }
    return tab ? pageOf(tab) : null;
  }

  // ------------------------------------------------------------------ find

  /** Begin a new search. Every keystroke in the find bar lands here. */
  startFind(query: string): void {
    this.find = findForQuery({ ...this.find, isWholeWordUnavailable: false }, query);
    this.wholeWordPlan = null;
    // A new search goes forward from where it starts, whichever way the last one was stepped.
    this.findForward = true;

    const contents = this.activeId ? this.contentsFor(this.activeId) : null;
    if (!contents || !query) {
      contents?.stopFindInPage('clearSelection');
      this.onChanged();
      return;
    }

    if (this.find.wholeWord) {
      void this.findWholeWords(contents, query);
    } else {
      this.runFind(contents, query, { forward: true, isNewSession: true });
    }
    this.onChanged();
  }

  /**
   * Chromium's find has no whole-words option, so the page's rendered text is
   * read through DevTools, as reader view reads it, to know which of the
   * occurrences find will step through are whole words; no script runs in it.
   */
  private pageTextFor(contents: WebContents): Promise<string> {
    const url = contents.getURL();
    if (this.pageText?.contents !== contents || this.pageText.url !== url) {
      const text = withPageDebugger(contents, (send) =>
        send('DOMSnapshot.captureSnapshot', { computedStyles: [] }),
      ).then((snapshot) => ('value' in snapshot ? renderedTextOf(snapshot.value) : ''));
      this.pageText = { contents, url, text };
    }
    return this.pageText.text;
  }

  private async findWholeWords(contents: WebContents, query: string): Promise<void> {
    const { matchCase } = this.find;
    const text = await this.pageTextFor(contents);
    const isStillAsked =
      this.find.query === query &&
      this.find.wholeWord &&
      this.find.matchCase === matchCase &&
      this.activeTab()?.view.webContents === contents;
    if (!isStillAsked) {
      return;
    }
    const flags = wholeWordFlags(text, query, matchCase);
    this.wholeWordPlan = { query, matchCase, flags };
    // Not one whole word: find would only light up the parts of other words.
    if (flags.length > 0 && !flags.includes(true)) {
      contents.stopFindInPage('clearSelection');
      this.find = findWithMatches(this.find, 0, 0);
      this.onChanged();
      return;
    }
    this.runFind(contents, query, { forward: true, isNewSession: true });
  }

  private foundInPage(activeMatch: number, matches: number, isFinal: boolean): void {
    const plan = this.find.wholeWord ? this.wholeWordPlan : null;
    if (!plan || plan.query !== this.find.query) {
      this.find = findWithMatches(this.find, activeMatch, matches);
      return;
    }
    if (!isFinal) {
      return;
    }
    const position = wholeWordPosition(plan.flags, activeMatch, matches);
    if (!position) {
      // Counted differently from find, say for text that spans elements: every match is shown, and the bar says why.
      this.find = findWithWholeWordMatches(this.find, activeMatch, matches, true);
      return;
    }
    const active = this.activeTab();
    const contents = active ? pageOf(active) : null;
    if (!position.isWhole && contents) {
      this.runFind(contents, plan.query, { forward: this.findForward, isNewSession: false });
      return;
    }
    this.find = findWithWholeWordMatches(this.find, position.activeMatch, position.totalMatches, false);
  }

  /** Step through the matches of the search already running. */
  findNext(forward: boolean): void {
    const contents = this.activeId ? this.contentsFor(this.activeId) : null;
    if (!contents || !this.find.query) {
      return;
    }
    this.findForward = forward;
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

  setFindWholeWord(wholeWord: boolean): void {
    this.find = findWithWholeWord(this.find, wholeWord);
    if (this.find.query) {
      this.startFind(this.find.query);
    } else {
      this.onChanged();
    }
  }

  stopFind(): void {
    this.pageText = null;
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

  /** The window's last tab closed, which closes the window. */
  onLastTabClosed(handler: () => void): void {
    this.lastTabClosedHandler = handler;
  }

  /** A tab's page moved on or finished loading, for what watches sign-ins. */
  onPageChange(handler: (tabId: TabId, change: PageChange) => void): void {
    this.pageChangeHandler = handler;
  }

  /** A page took the keyboard, which is someone going back to it. */
  onPageFocus(handler: () => void): void {
    this.pageFocusHandler = handler;
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

    // The tab's own session, so a group that keeps its own logins fetches with its own cookies.
    const dataUrl = await fetchFaviconDataUrl(tab.url, faviconUrl, (url, options) =>
      this.prepareSession(tab.partition).fetch(url, options),
    );
    if (!dataUrl) {
      return;
    }

    tab.record.keepFavicon(tab.url, dataUrl);
    tab.faviconDataUrl = dataUrl;
    this.onChanged();
  }

  // Built on first use: the store is a constructor parameter, not yet assigned when fields are.
  private storedRecord(): BrowsingRecord {
    this.stored ??= storedRecord(this.store, this.closedTabs);
    return this.stored;
  }

  // --------------------------------------------------------------- teardown

  dispose(): void {
    this.isDisposed = true;
    clearInterval(this.sleepTimer);
    this.stopCounting();
    for (const tab of this.tabs.values()) {
      this.destroyTab(tab);
    }
    this.tabs.clear();
    this.order = [];
    this.activeId = null;
  }
}

// Taller than this is a page that keeps growing as it scrolls, not one anyone wants as a single picture.
const MAX_READER_IMAGES = 40;
const MAX_READER_IMAGE_BYTES = 4 * 1024 * 1024;
// Past this a page is not an article, and parsing it would stall the chrome.
const MAX_READER_DOCUMENT = 10 * 1024 * 1024;
const MAX_SCREENSHOT_HEIGHT = 16_384;

/** A PNG of the whole page, or why there is none. Through the page's own debugger, which DevTools may already hold. */
/**
 * Runs DevTools commands against a page without a script in it. Usually
 * borrowed from describeTab, which keeps it attached because detaching drops
 * the tab's identity; attached and let go here only when nobody holds it.
 */
async function withPageDebugger<T>(
  contents: WebContents,
  work: (send: (method: string, parameters?: object) => Promise<unknown>) => Promise<T>,
): Promise<{ value: T } | { problem: string }> {
  const debuggerSession = contents.debugger;
  const isOurs = !debuggerSession.isAttached();
  if (isOurs) {
    try {
      debuggerSession.attach('1.3');
    } catch {
      return { problem: t('main.dialogs.screenshot.devToolsOpen') };
    }
  }
  try {
    return { value: await work((method, parameters) => debuggerSession.sendCommand(method, parameters)) };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : t('main.dialogs.screenshot.notWritten') };
  } finally {
    if (isOurs) {
      debuggerSession.detach();
    }
  }
}

async function captureWholePage(contents: WebContents): Promise<Buffer | string> {
  const outcome = await withPageDebugger(contents, async (send): Promise<Buffer | string> => {
    const metrics: unknown = await send('Page.getLayoutMetrics');
    const size = typeof metrics === 'object' && metrics !== null ? Reflect.get(metrics, 'cssContentSize') : null;
    const width = Math.ceil(Number(typeof size === 'object' && size !== null ? Reflect.get(size, 'width') : 0));
    const height = Math.ceil(Number(typeof size === 'object' && size !== null ? Reflect.get(size, 'height') : 0));
    if (!width || !height) {
      return t('main.dialogs.screenshot.noPage');
    }
    const result: unknown = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height: Math.min(height, MAX_SCREENSHOT_HEIGHT), scale: 1 },
    });
    const data = typeof result === 'object' && result !== null ? Reflect.get(result, 'data') : null;
    return typeof data === 'string' ? Buffer.from(data, 'base64') : t('main.dialogs.screenshot.notWritten');
  });
  return 'value' in outcome ? outcome.value : outcome.problem;
}

/** The page as it stands now, serialised by DevTools, so reading it runs nothing in it. */
async function documentOf(contents: WebContents): Promise<string> {
  const outcome = await withPageDebugger(contents, async (send) => {
    const document: unknown = await send('DOM.getDocument', { depth: 0 });
    const root = typeof document === 'object' && document !== null ? Reflect.get(document, 'root') : null;
    const nodeId = typeof root === 'object' && root !== null ? Reflect.get(root, 'nodeId') : null;
    const result: unknown = typeof nodeId === 'number' ? await send('DOM.getOuterHTML', { nodeId }) : null;
    const html = typeof result === 'object' && result !== null ? Reflect.get(result, 'outerHTML') : null;
    return typeof html === 'string' ? html : '';
  });
  return 'value' in outcome && outcome.value.length <= MAX_READER_DOCUMENT ? outcome.value : '';
}
