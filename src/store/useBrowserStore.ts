'use client';

import { create } from 'zustand';
import type { ChromeSurface } from '@shared/ipc/channels';
import type { BrowserStatePatch } from '@shared/ipc/state-slices';
import type { BrowserState, Settings, TabState } from '@shared/types';
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/state/defaults';
import { keepIfSame, stabiliseState } from '@/lib/state/stableState';

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
  /** The settings pane to open on, when something asked for one; settings opens on its first pane otherwise. */
  settingsPane: string | null;

  /** The whole state on first load, then only the parts that changed. */
  applyState(next: BrowserStatePatch): void;
  setSurface(surface: ChromeSurface): void;
  toggleSurface(surface: Exclude<ChromeSurface, 'none'>): void;
  openSettings(paneId: string): void;
  requestOmniboxFocus(): void;
}

const EMPTY_STATE: BrowserState = {
  tabs: [],
  groups: [],
  tabOrder: [],
  activeTabId: null,
  downloads: [],
  find: { isOpen: false, query: '', activeMatch: 0, totalMatches: 0, matchCase: false },
  permissionPrompts: [],
  authPrompts: [],
  settings: DEFAULT_SETTINGS_SHAPE,
  hasClosedTabs: false,
  siteInfo: null,
  split: null,
  namedSessions: [],
  update: {
    status: { state: 'idle' },
    delivery: 'unsupported',
    manualReason: null,
    lastCheckedAt: null,
    releasesUrl: 'https://github.com/ryjord/Copacetic/releases/latest',
  },
  profile: { id: 'default', name: 'Personal', colour: 'ocean' },
  profiles: [],
};

export const useBrowserStore = create<BrowserStoreState>((set, get) => ({
  ...EMPTY_STATE,
  isReady: false,
  orderedTabs: [],
  activeTab: null,
  surface: 'none',
  omniboxFocusToken: 0,
  settingsPane: null,

  applyState: (incoming) => {
    const current = get();
    // A push carries only the parts that changed, and those arrive freshly
    // deserialised, so a changed slice is all new objects even where most of it
    // is the same. Selectors compare by reference, so without this one tab's
    // title re-renders every other tab.
    const next = stabiliseState(current, { ...current, ...incoming });

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

  setSurface: (surface) => set({ surface, settingsPane: null }),

  toggleSurface: (surface) => set({ surface: get().surface === surface ? 'none' : surface, settingsPane: null }),

  openSettings: (paneId) => set({ surface: 'settings', settingsPane: paneId }),

  requestOmniboxFocus: () => set({ omniboxFocusToken: get().omniboxFocusToken + 1 }),
}));

export function selectSettings(state: BrowserStoreState): Settings {
  return state.settings;
}

export function selectActiveDownloadCount(state: BrowserStoreState): number {
  return state.downloads.filter((download) => download.status === 'progressing' || download.status === 'paused')
    .length;
}

/** How far the unfinished downloads have got together, or null while any of them has no known size. */
export function selectDownloadProgress(state: BrowserStoreState): number | null {
  const active = state.downloads.filter(
    (download) => download.status === 'progressing' || download.status === 'paused',
  );
  if (active.length === 0 || active.some((download) => download.totalBytes <= 0)) {
    return null;
  }
  const received = active.reduce((sum, download) => sum + download.receivedBytes, 0);
  const total = active.reduce((sum, download) => sum + download.totalBytes, 0);
  return Math.min(1, received / total);
}
