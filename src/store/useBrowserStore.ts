'use client';

// Libs
import { create } from 'zustand';

// Utils
import { DEFAULT_SETTINGS_SHAPE } from '@/lib/state/defaults';
import { keepIfSame, stabiliseState } from '@/lib/state/stableState';

// Types
import type { ChromeSurface } from '@shared/ipc/channels';
import type { BrowserStatePatch } from '@shared/ipc/state-slices';
import type { BrowserState, Settings, TabState } from '@shared/types';

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

  /** The whole state on first load, then only the parts that changed. */
  applyState(next: BrowserStatePatch): void;
  setSurface(surface: ChromeSurface): void;
  toggleSurface(surface: Exclude<ChromeSurface, 'none'>): void;
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
  bookmarkSheet: null,
  split: null,
  namedSessions: [],
  update: {
    status: { state: 'idle' },
    delivery: 'unsupported',
    manualReason: null,
    lastCheckedAt: null,
    releasesUrl: 'https://github.com/ryjord/Copacetic/releases/latest',
    releaseNotes: null,
    currentVersion: '',
    includesBetas: false,
    canOpenInstaller: false,
  },
  profile: { id: 'default', name: 'Personal', colour: 'ocean', pictureVersion: null },
  profiles: [],
};

export const useBrowserStore = create<BrowserStoreState>((set, get) => ({
  ...EMPTY_STATE,
  isReady: false,
  orderedTabs: [],
  activeTab: null,
  surface: 'none',
  omniboxFocusToken: 0,

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
