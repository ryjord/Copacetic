import { PersistedFile, asNumber, asString, isRecord } from './persistence';
import type { SchemaPlan } from './schema';

export interface SessionTab {
  url: string;
  /** The group it was in. Never set for a Hush tab, which is not written here at all. */
  groupId: string | null;
}

export interface SessionSnapshot {
  tabs: SessionTab[];
  activeIndex: number;
}

/**
 * Version 2 carries which group each tab was in, so a group comes back with its
 * tabs rather than as an empty name. Version 1 was a bare list of addresses.
 */
export const SESSION_PLAN: SchemaPlan = {
  current: 2,
  steps: [
    {
      to: 2,
      describe: 'tabs remember which group they were in',
      up: (raw: unknown) => {
        if (!isRecord(raw)) {
          return raw;
        }
        const urls = Array.isArray(raw.urls) ? raw.urls : [];
        return {
          tabs: urls.filter((url): url is string => typeof url === 'string').map((url) => ({ url, groupId: null })),
          activeIndex: raw.activeIndex,
        };
      },
    },
  ],
};

/** The tabs to reopen next launch. Written often, so it flushes on a longer delay. */
export class SessionStore {
  private readonly file = new PersistedFile<SessionSnapshot>(
    'session.json',
    () => ({ tabs: [], activeIndex: 0 }),
    reviveSession,
    1_000,
    SESSION_PLAN,
  );

  save(snapshot: SessionSnapshot): void {
    this.file.set(snapshot);
  }

  get(): SessionSnapshot {
    return this.file.get();
  }

  flush(): void {
    this.file.flush();
  }
}

export function reviveSession(raw: unknown): SessionSnapshot | null {
  if (!isRecord(raw)) {
    return null;
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
