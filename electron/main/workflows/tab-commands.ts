import { PUSH } from '../../shared/channels';
import type { TabId } from '../../shared/types';
import { START_PAGE_URL, buildSearchUrl, isNavigableUrl } from '../../shared/url';
import type { BrowserStore } from '../data/store';
import type { TabManager } from '../tabs/tabs';

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

interface TabCommandsDeps {
  store: BrowserStore;
  tabs: TabManager;
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
      const currentIndex = nearestZoomIndex(tab.zoomFactor);
      const nextIndex = Math.min(ZOOM_STEPS.length - 1, Math.max(0, currentIndex + (direction === 'in' ? 1 : -1)));
      this.deps.tabs.setZoom(tabId, ZOOM_STEPS[nextIndex] ?? 1);
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

  printActiveTab(): void {
    this.withActiveTab((tabId) => this.deps.tabs.print(tabId));
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
    return buildSearchUrl(query, this.deps.store.getSettings().searchEngine);
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
