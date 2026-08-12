'use client';

import { create } from 'zustand';
import type { ChromeSurface } from '../../electron/shared/channels';
import type { BrowserState, Settings, TabState } from '../../electron/shared/types';
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/defaults';
import { keepIfSame, stabiliseState } from '@/lib/stableState';

interface BrowserStoreState extends BrowserState {
  /** False until the first snapshot arrives, so nothing renders half-built. */
  isReady: boolean;
  // Tabs in strip order, derived once per snapshot.
  orderedTabs: TabState[];
  activeTab: TabState | null;

  /** The overlay currently covering the page area, if any. */
  surface: ChromeSurface;
  /** Incremented to ask the omnibox to take focus and select its contents. */
  omniboxFocusToken: number;
  // Whether the connection panel is open.
  isConnectionPanelOpen: boolean;
  // When the panel was opened, so it can say how long a certificate has left without reading the clock during render.
  connectionPanelOpenedAt: number | null;

  applyState(next: BrowserState): void;
  setSurface(surface: ChromeSurface): void;
  toggleSurface(surface: Exclude<ChromeSurface, 'none'>): void;
  requestOmniboxFocus(): void;
  toggleConnectionPanel(): void;
  closeConnectionPanel(): void;
}

const EMPTY_STATE: BrowserState = {
  tabs: [],
  tabOrder: [],
  activeTabId: null,
  downloads: [],
  find: { isOpen: false, query: '', activeMatch: 0, totalMatches: 0, matchCase: false },
  permissionPrompts: [],
  authPrompts: [],
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
  isConnectionPanelOpen: false,
  connectionPanelOpenedAt: null,

  applyState: (incoming) => {
    const current = get();
    // The main process sends the whole state on every change, freshly
    // deserialised, so everything is a new object even when nothing differs.
    // Selectors compare by reference, so without this a download's byte
    // counter re-renders every tab several times a second.
    const next = stabiliseState(current, incoming);

    const byId = new Map(next.tabs.map((tab) => [tab.id, tab]));
    const orderedTabs = keepIfSame(
      current.orderedTabs,
      next.tabOrder.flatMap((id) => {
        const tab = byId.get(id);
        return tab ? [tab] : [];
      }),
    );

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

  toggleConnectionPanel: () =>
    set({ isConnectionPanelOpen: !get().isConnectionPanelOpen, connectionPanelOpenedAt: Date.now() }),

  closeConnectionPanel: () => {
    if (get().isConnectionPanelOpen) set({ isConnectionPanelOpen: false });
  },
}));

export function selectSettings(state: BrowserStoreState): Settings {
  return state.settings;
}

export function selectActiveDownloadCount(state: BrowserStoreState): number {
  return state.downloads.filter((download) => download.status === 'progressing' || download.status === 'paused')
    .length;
}
