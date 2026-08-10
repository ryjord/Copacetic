'use client';

import { create } from 'zustand';
import type { ChromeSurface } from '../../electron/shared/channels';
import type { BrowserState, Settings, TabState } from '../../electron/shared/types';
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/defaults';

interface BrowserStoreState extends BrowserState {
  /** False until the first snapshot arrives, so nothing renders half-built. */
  isReady: boolean;
  /**
   * Tabs in strip order, derived once per snapshot.
   *
   * This has to be stored rather than computed in a selector: zustand compares
   * selector results by reference, and a selector that builds a fresh array on
   * every render never settles.
   */
  orderedTabs: TabState[];
  activeTab: TabState | null;

  /** The overlay currently covering the page area, if any. */
  surface: ChromeSurface;
  /** Incremented to ask the omnibox to take focus and select its contents. */
  omniboxFocusToken: number;

  applyState(next: BrowserState): void;
  setSurface(surface: ChromeSurface): void;
  toggleSurface(surface: Exclude<ChromeSurface, 'none'>): void;
  requestOmniboxFocus(): void;
}

const EMPTY_STATE: BrowserState = {
  tabs: [],
  tabOrder: [],
  activeTabId: null,
  downloads: [],
  find: { isOpen: false, query: '', activeMatch: 0, totalMatches: 0, matchCase: false },
  permissionPrompts: [],
  settings: DEFAULT_SETTINGS_SHAPE,
  hasClosedTabs: false,
  update: {
    status: { state: 'idle' },
    delivery: 'unsupported',
    manualReason: null,
    lastCheckedAt: null,
    releasesUrl: 'https://github.com/ryjord/Copacetic/releases/latest',
  },
};

export const useBrowserStore = create<BrowserStoreState>((set, get) => ({
  ...EMPTY_STATE,
  isReady: false,
  orderedTabs: [],
  activeTab: null,
  surface: 'none',
  omniboxFocusToken: 0,

  applyState: (next) => {
    const byId = new Map(next.tabs.map((tab) => [tab.id, tab]));
    const orderedTabs = next.tabOrder.flatMap((id) => {
      const tab = byId.get(id);
      return tab ? [tab] : [];
    });
    set({
      ...next,
      orderedTabs,
      activeTab: next.activeTabId ? (byId.get(next.activeTabId) ?? null) : null,
      isReady: true,
    });
  },

  setSurface: (surface) => set({ surface }),

  toggleSurface: (surface) => set({ surface: get().surface === surface ? 'none' : surface }),

  requestOmniboxFocus: () => set({ omniboxFocusToken: get().omniboxFocusToken + 1 }),
}));

export function selectSettings(state: BrowserStoreState): Settings {
  return state.settings;
}

export function selectActiveDownloadCount(state: BrowserStoreState): number {
  return state.downloads.filter((download) => download.status === 'progressing' || download.status === 'paused')
    .length;
}
