import { PersistedFile, asNumber, asString, isRecord } from './persistence';
import { EVEN_SPLIT_RATIO, clampSplitRatio } from '../../shared/tabs/split-view';
import { isPageNavigableUrl } from '../../shared/browsing/url';
import type { SchemaPlan } from './schema';

/**
 * Where a tab could go back and forward to. Addresses and titles only: the
 * page state that would bring back the scroll position also holds what was
 * typed into the page's forms, which is not written to disk.
 */
export interface SessionHistory {
  entries: { url: string; title: string }[];
  index: number;
}

/** Enough back history for the Back button, without a long session making the file grow without end. */
export const MAX_SESSION_HISTORY = 50;

export interface SessionTab {
  url: string;
  /** The group it was in. Never set for a Hush tab, which is not written here at all. */
  groupId: string | null;
  /** Written only when true, so a session from before pinning reads the same. */
  isPinned?: boolean;
  /** Written only when there is somewhere to go back or forward to. */
  history?: SessionHistory;
}

/** Two of a window's tabs shown side by side, by their place in its list. */
export interface SessionSplit {
  leftIndex: number;
  rightIndex: number;
  ratio: number;
}

/** One window's tabs, which of them was in front, and the pair it showed side by side. */
export interface SessionSnapshot {
  tabs: SessionTab[];
  activeIndex: number;
  /** Written only when both tabs were, so a split with a Hush or new tab in it is not kept. */
  split?: SessionSplit;
}

/** Every window to reopen, the one that was in front last so it comes back in front. */
export interface SavedSession {
  windows: SessionSnapshot[];
}

/**
 * Version 2 carries which group each tab was in, so a group comes back with its
 * tabs rather than as an empty name. Version 1 was a bare list of addresses.
 * Version 3 holds a list of windows; everything before it was one window.
 */
export const SESSION_PLAN: SchemaPlan = {
  current: 3,
  steps: [
    {
      to: 2,
      describe: 'tabs remember which group they were in',
      up: (raw: unknown) => {
        if (!isRecord(raw)) {
          return raw;
        }
        // Already at version 2. Running this step again on its own output read
        // `urls` off a record that no longer has one, took the empty list, and
        // returned a session with no tabs in it - every saved tab destroyed,
        // for anyone whose schema.json went missing.
        if (Array.isArray(raw.tabs)) {
          return raw;
        }
        const urls = Array.isArray(raw.urls) ? raw.urls : [];
        return {
          tabs: urls.filter((url): url is string => typeof url === 'string').map((url) => ({ url, groupId: null })),
          activeIndex: raw.activeIndex,
        };
      },
    },
    {
      to: 3,
      describe: 'a session holds every window, not just one',
      up: (raw: unknown) => {
        // Already a list of windows: wrapping it again would bury every tab one level too deep.
        if (!isRecord(raw) || Array.isArray(raw.windows)) {
          return raw;
        }
        return { windows: Array.isArray(raw.tabs) ? [{ tabs: raw.tabs, activeIndex: raw.activeIndex }] : [] };
      },
    },
  ],
};

/** The tabs to reopen next launch. Written often, so it flushes on a longer delay. */
export class SessionStore {
  private readonly file: PersistedFile<SavedSession>;

  constructor(directory?: string) {
    this.file = new PersistedFile<SavedSession>('session.json', () => ({ windows: [] }), reviveSession, {
      directory,
      flushDelayMs: 1_000,
      plan: SESSION_PLAN,
    });
  }

  save(session: SavedSession): void {
    this.file.set(session);
  }

  get(): SavedSession {
    return this.file.get();
  }

  flush(): void {
    this.file.flush();
  }
}

export function reviveSession(raw: unknown): SavedSession | null {
  if (!isRecord(raw) || !Array.isArray(raw.windows)) {
    return null;
  }
  // A window with nothing to reopen, every tab Hush or a start page, is not a window to bring back.
  return { windows: raw.windows.map(reviveWindow).filter((window) => window.tabs.length > 0) };
}

function reviveWindow(raw: unknown): SessionSnapshot {
  if (!isRecord(raw)) {
    return { tabs: [], activeIndex: 0 };
  }
  const tabs = Array.isArray(raw.tabs)
    ? raw.tabs.flatMap((entry) => {
        if (!isRecord(entry)) {
          return [];
        }
        const url = asString(entry.url);
        if (!url) {
          return [];
        }
        const groupId = asString(entry.groupId);
        const history = reviveHistory(entry.history);
        return [
          {
            url,
            groupId: groupId || null,
            ...(entry.isPinned === true ? { isPinned: true } : {}),
            ...(history ? { history } : {}),
          },
        ];
      })
    : [];
  const split = reviveSplit(raw.split, tabs.length);
  return {
    tabs,
    activeIndex: clamp(asNumber(raw.activeIndex, 0), 0, Math.max(0, tabs.length - 1)),
    ...(split ? { split } : {}),
  };
}

/** Back history read from disk, kept only whole: an entry that is not a page drops the history, not the tab. */
export function reviveHistory(raw: unknown): SessionHistory | null {
  if (!isRecord(raw) || !Array.isArray(raw.entries)) {
    return null;
  }
  const entries = raw.entries
    .slice(0, MAX_SESSION_HISTORY)
    .map((entry) =>
      isRecord(entry) ? { url: asString(entry.url), title: asString(entry.title) } : { url: '', title: '' },
    );
  const index = asNumber(raw.index, -1);
  const isWhole = entries.length > 1 && entries.every((entry) => isPageNavigableUrl(entry.url));
  if (!isWhole || !Number.isInteger(index) || index < 0 || index >= entries.length) {
    return null;
  }
  return { entries, index };
}

function reviveSplit(raw: unknown, tabCount: number): SessionSplit | null {
  if (!isRecord(raw)) {
    return null;
  }
  const leftIndex = asNumber(raw.leftIndex, -1);
  const rightIndex = asNumber(raw.rightIndex, -1);
  const isPlace = (index: number) => Number.isInteger(index) && index >= 0 && index < tabCount;
  if (!isPlace(leftIndex) || !isPlace(rightIndex) || leftIndex === rightIndex) {
    return null;
  }
  return { leftIndex, rightIndex, ratio: clampSplitRatio(asNumber(raw.ratio, EVEN_SPLIT_RATIO)) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
