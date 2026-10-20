// Utils
import { PUSH } from '../../shared/ipc/channels';
import { START_PAGE_URL, isNavigableUrl, viewSourceUrlFor } from '../../shared/browsing/url';
import { buildSearchUrl } from '../../shared/browsing/search-engines';
import { nextZoomStep } from '../../shared/tabs/zoom';
import { t } from '../../shared/i18n/translate';

// Types
import type { TabId } from '../../shared/types';
import type { BrowserStore } from '../data/store';
import type { NoticeCentre } from '../notices/notice-centre';
import type { TabManager } from '../tabs/tabs';

interface TabCommandsDeps {
  store: BrowserStore;
  tabs: TabManager;
  notices: NoticeCentre;
  changed: () => void;
  push: (channel: string, payload?: unknown) => void;
}

/** What the menus, shortcuts and context menus ask of the tabs, in the words they use. */
export class TabCommands {
  constructor(private readonly deps: TabCommandsDeps) {}

  newTab(url: string = START_PAGE_URL): void {
    this.deps.tabs.create(url);
    this.deps.push(PUSH.focusOmnibox);
  }

  newHushTab(): void {
    this.deps.tabs.create(START_PAGE_URL, { hush: true });
    this.deps.push(PUSH.focusOmnibox);
  }

  closeActiveTab(): void {
    const active = this.deps.tabs.getActiveTabId();
    if (active) {
      this.deps.tabs.close(active);
    }
  }

  reopenClosedTab(): void {
    this.deps.tabs.reopenClosed();
  }

  cycleTab(offset: number): void {
    const { tabOrder, activeTabId } = this.deps.tabs.snapshot();
    if (tabOrder.length === 0 || !activeTabId) {
      return;
    }
    const index = tabOrder.indexOf(activeTabId);
    const next = tabOrder[(index + offset + tabOrder.length) % tabOrder.length];
    if (next) {
      this.deps.tabs.activate(next);
    }
  }

  /** `index` is zero-based; `-1` selects the last tab, matching every browser. */
  selectTabAt(index: number): void {
    const { tabOrder } = this.deps.tabs.snapshot();
    const target = index === -1 ? tabOrder[tabOrder.length - 1] : tabOrder[index];
    if (target) {
      this.deps.tabs.activate(target);
    }
  }

  withActiveTab(action: (tabId: TabId) => void): void {
    const active = this.deps.tabs.getActiveTabId();
    if (active) {
      action(active);
    }
  }

  goHome(): void {
    this.withActiveTab((tabId) => this.deps.tabs.navigate(tabId, START_PAGE_URL));
  }

  adjustZoom(direction: 'in' | 'out' | 'reset'): void {
    this.withActiveTab((tabId) => {
      const tab = this.deps.tabs.snapshot().tabs.find((candidate) => candidate.id === tabId);
      if (!tab) {
        return;
      }
      if (direction === 'reset') {
        this.deps.tabs.setZoom(tabId, this.deps.store.getSettings().defaultZoomFactor);
        return;
      }
      this.deps.tabs.setZoom(tabId, nextZoomStep(tab.zoomFactor, direction));
    });
  }

  toggleBookmarkForActiveTab(): void {
    const { tabs, activeTabId } = this.deps.tabs.snapshot();
    const tab = tabs.find((candidate) => candidate.id === activeTabId);
    if (!tab || tab.isStartPage) {
      return;
    }
    this.deps.store.toggleBookmark(tab.url, tab.title);
    this.deps.changed();
  }

  toggleTabDevTools(): void {
    this.withActiveTab((tabId) => this.deps.tabs.toggleDevTools(tabId));
  }

  saveActiveTab(): void {
    this.withActiveTab((tabId) => this.savePage(tabId));
  }

  saveScreenshotOfActiveTab(): void {
    this.withActiveTab((tabId) => this.saveScreenshot(tabId));
  }

  saveScreenshot(tabId: TabId): void {
    void this.deps.tabs.saveScreenshot(tabId).then((problem) => {
      if (problem) {
        this.deps.notices.notify({
          id: `screenshot-failed-${tabId}`,
          tone: 'info',
          key: 'screenshot-failed',
          message: t('main.notices.screenshotFailed', { problem }),
        });
      }
    });
  }

  savePage(tabId: TabId): void {
    void this.deps.tabs.savePage(tabId).then((problem) => {
      if (problem) {
        this.deps.notices.notify({
          id: `save-failed-${tabId}`,
          tone: 'info',
          key: 'save-failed',
          message: t('main.notices.saveFailed', { problem }),
        });
      }
    });
  }

  viewSourceOfActiveTab(): void {
    this.withActiveTab((tabId) => this.viewSource(tabId));
  }

  /** In a tab of its own beside the page, as every browser does, so the page itself is left alone. */
  viewSource(tabId: TabId): void {
    const target = viewSourceUrlFor(this.deps.tabs.urlFor(tabId) ?? '');
    // A Hush page's source is browsing too, so it opens Hush as well.
    if (target) {
      this.deps.tabs.create(target, { hush: this.deps.tabs.isHush(tabId) });
    }
  }

  printActiveTab(): void {
    this.withActiveTab((tabId) => this.print(tabId));
  }

  print(tabId: TabId): void {
    this.deps.tabs.print(tabId, (reason) =>
      this.deps.notices.notify({
        id: `print-failed-${tabId}`,
        tone: 'info',
        key: 'print-failed',
        message: t('main.notices.printFailed', { reason }),
      }),
    );
  }

  /**
   * Opens a saved address in the tab someone is looking at, or a new one.
   *
   * A bookmark opened from the bar replaces what is in front of you, the way
   * clicking a link does; with no tab to replace, it makes one rather than
   * doing nothing.
   */
  openInActiveTab(url: string): void {
    const activeId = this.deps.tabs.getActiveTabId();
    if (activeId) {
      this.deps.tabs.navigate(activeId, url);
    } else {
      this.deps.tabs.create(url, { activate: true });
    }
    this.deps.changed();
  }

  downloadUrl(url: string): void {
    if (!isNavigableUrl(url)) {
      return;
    }
    this.deps.tabs.downloadUrl(url);
  }

  searchUrlFor(query: string): string {
    return buildSearchUrl(query, this.deps.store.getSettings());
  }
}
