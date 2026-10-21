// Utils
import { START_PAGE_URL } from '../../shared/browsing/url';
import { chromeNameOf } from '../../shared/tabs/internal-pages';

// Types
import type { ChromeTab, ChromeWindow, ExtensionBrowsing } from './chrome-api';
import type { Browser } from '../app/browser';
import type { TabId, TabState } from '../../shared/types';

// Chosen for a sleeping tab, which has no page and so no web contents id; far above any real one.
const FIRST_SLEEPING_ID = 1_000_000_000;

/**
 * A profile's windows and tabs as an extension sees them.
 *
 * Hush tabs are left out entirely, and the start page appears as a new tab
 * with no address, so nothing about either reaches an extension.
 */
export function profileBrowsing(options: {
  windows: () => readonly Browser[];
  focused: () => Browser | null;
  openWindow: (url: string | null) => void;
}): ExtensionBrowsing {
  const sleepingIds = new Map<TabId, number>();
  const chromeIdFor = (browser: Browser, tabId: TabId): number => {
    const live = browser.tabs.webContentsIdFor(tabId);
    if (live !== undefined) {
      return live;
    }
    const known = sleepingIds.get(tabId);
    if (known !== undefined) {
      return known;
    }
    const next = FIRST_SLEEPING_ID + sleepingIds.size;
    sleepingIds.set(tabId, next);
    return next;
  };

  const describe = (browser: Browser): { window: ChromeWindow; tabs: ChromeTab[] } => {
    const { tabs, tabOrder, activeTabId } = browser.tabs.snapshot();
    const byId = new Map(tabs.map((tab) => [tab.id, tab]));
    const bounds = browser.window.getBounds();
    const focused = options.focused();
    const window: ChromeWindow = {
      id: browser.window.id,
      focused: focused === browser,
      type: 'normal',
      state: browser.window.isFullScreen()
        ? 'fullscreen'
        : browser.window.isMinimized()
          ? 'minimized'
          : browser.window.isMaximized()
            ? 'maximized'
            : 'normal',
      incognito: false,
      alwaysOnTop: false,
      left: bounds.x,
      top: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
    const ordered = tabOrder
      .map((id) => byId.get(id))
      .filter((tab): tab is TabState => tab !== undefined && !tab.isHush)
      .map((tab, index): ChromeTab => {
        const isActive = tab.id === activeTabId;
        return {
          id: chromeIdFor(browser, tab.id),
          windowId: browser.window.id,
          index,
          ...(tab.internalPage === null
            ? { url: tab.url, title: tab.title }
            : { url: `chrome://${chromeNameOf(tab.internalPage)}/`, title: '' }),
          ...(tab.faviconDataUrl ? { favIconUrl: tab.faviconDataUrl } : {}),
          active: isActive,
          highlighted: isActive,
          pinned: tab.isPinned,
          audible: tab.isAudible,
          discarded: tab.isAsleep,
          status: tab.isLoading ? 'loading' : 'complete',
          mutedInfo: { muted: tab.isMuted },
          incognito: false,
          groupId: -1,
        };
      });
    return { window, tabs: ordered };
  };

  /** Which window and which of Copacetic's tabs a Chrome tab id is. */
  const locate = (chromeTabId: number): { browser: Browser; tabId: TabId } | null =>
    options
      .windows()
      .map((browser) => ({
        browser,
        tabId: browser.tabs
          .snapshot()
          .tabs.find((candidate) => !candidate.isHush && chromeIdFor(browser, candidate.id) === chromeTabId)?.id,
      }))
      .find((entry): entry is { browser: Browser; tabId: TabId } => entry.tabId !== undefined) ?? null;

  return {
    windows: () =>
      options
        .windows()
        .filter((browser) => !browser.window.isDestroyed())
        .map(describe),
    lastFocusedWindowId: () => options.focused()?.window.id ?? null,
    createTab: (url, { active, windowId, index, pinned }) => {
      const browser = options.windows().find((candidate) => candidate.window.id === windowId) ?? options.focused();
      if (!browser) {
        return null;
      }
      const tabId = browser.tabs.create(url || START_PAGE_URL, {
        activate: active,
        ...(index === null ? {} : { index }),
        pinned,
      });
      return chromeIdFor(browser, tabId);
    },
    updateTab: (chromeTabId, change) => {
      const found = locate(chromeTabId);
      if (!found) {
        return;
      }
      const { browser, tabId } = found;
      if (change.url) {
        browser.tabs.navigate(tabId, change.url);
      }
      if (change.active) {
        browser.tabs.activate(tabId);
        browser.window.focus();
      }
      if (change.muted !== undefined) {
        browser.tabs.setMuted(tabId, change.muted);
      }
      if (change.pinned !== undefined) {
        browser.tabs.setPinned(tabId, change.pinned);
      }
    },
    removeTab: (chromeTabId) => {
      const found = locate(chromeTabId);
      found?.browser.tabs.close(found.tabId);
    },
    reloadTab: (chromeTabId, bypassCache) => {
      const found = locate(chromeTabId);
      found?.browser.tabs.reload(found.tabId, bypassCache);
    },
    goBack: (chromeTabId) => {
      const found = locate(chromeTabId);
      found?.browser.tabs.goBack(found.tabId);
    },
    goForward: (chromeTabId) => {
      const found = locate(chromeTabId);
      found?.browser.tabs.goForward(found.tabId);
    },
    duplicateTab: (chromeTabId) => {
      const found = locate(chromeTabId);
      found?.browser.tabs.duplicate(found.tabId);
    },
    discardTab: (chromeTabId) => {
      const found = locate(chromeTabId);
      found?.browser.tabs.sleep(found.tabId);
    },
    zoomOf: (chromeTabId) => {
      const found = locate(chromeTabId);
      return found?.browser.tabs.snapshot().tabs.find((tab) => tab.id === found.tabId)?.zoomFactor ?? 1;
    },
    setZoom: (chromeTabId, factor) => {
      const found = locate(chromeTabId);
      found?.browser.tabs.setZoom(found.tabId, factor);
    },
    focusWindow: (windowId) =>
      options
        .windows()
        .find((browser) => browser.window.id === windowId)
        ?.window.focus(),
    openWindow: options.openWindow,
  };
}
