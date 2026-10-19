import { PersistedFile, asNumber, asString, isRecord } from './persistence';
import type { SchemaPlan } from './schema';

export interface SessionTab {
  url: string;
  /** The group it was in. Never set for a Hush tab, which is not written here at all. */
  groupId: string | null;
}

/** One window's tabs, and which of them was in front. */
export interface SessionSnapshot {
  tabs: SessionTab[];
  activeIndex: number;
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
  private readonly file = new PersistedFile<SavedSession>(
    'session.json',
    () => ({ windows: [] }),
    reviveSession,
    1_000,
    SESSION_PLAN,
  );

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
        return [{ url, groupId: groupId || null }];
      })
    : [];
  return { tabs, activeIndex: clamp(asNumber(raw.activeIndex, 0), 0, Math.max(0, tabs.length - 1)) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
