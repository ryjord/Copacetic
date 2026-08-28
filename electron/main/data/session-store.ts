import { PersistedFile, asNumber, isRecord } from './persistence';

export interface SessionSnapshot {
  urls: string[];
  activeIndex: number;
}

/** The tabs to reopen next launch. Written often, so it flushes on a longer delay. */
export class SessionStore {
  private readonly file = new PersistedFile<SessionSnapshot>(
    'session.json',
    () => ({ urls: [], activeIndex: 0 }),
    reviveSession,
    1_000,
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
  const urls = Array.isArray(raw.urls) ? raw.urls.filter((url): url is string => typeof url === 'string') : [];
  return { urls, activeIndex: clamp(asNumber(raw.activeIndex, 0), 0, Math.max(0, urls.length - 1)) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
