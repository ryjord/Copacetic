import { originOf } from '../../shared/url';
import { PersistedFile, asNumber, asString, isRecord } from './persistence';

const MAX_FAVICON_ENTRIES = 600;

interface FaviconRecord {
  dataUrl: string;
  updatedAt: number;
}

/** Site icons, kept by origin. Bounded, because a page can name endless hosts. */
export class FaviconsStore {
  private readonly file = new PersistedFile<Record<string, FaviconRecord>>(
    'favicons.json',
    () => ({}),
    reviveFavicons,
    2_000,
  );

  get(url: string): string | null {
    const origin = originOf(url);
    return origin ? (this.file.get()[origin]?.dataUrl ?? null) : null;
  }

  set(url: string, dataUrl: string): void {
    const origin = originOf(url);
    if (!origin) {
      return;
    }
    this.file.update((current) => {
      const next = { ...current, [origin]: { dataUrl, updatedAt: Date.now() } };
      const keys = Object.keys(next);
      if (keys.length <= MAX_FAVICON_ENTRIES) {
        return next;
      }
      // Evict least-recently-updated first; a stale favicon is refetched cheaply.
      const keep = keys
        .sort((a, b) => (next[b]?.updatedAt ?? 0) - (next[a]?.updatedAt ?? 0))
        .slice(0, MAX_FAVICON_ENTRIES);
      return Object.fromEntries(keep.map((key) => [key, next[key]!]));
    });
  }

  flush(): void {
    this.file.flush();
  }
}

export function reviveFavicons(raw: unknown): Record<string, FaviconRecord> | null {
  if (!isRecord(raw)) {
    return null;
  }
  const result: Record<string, FaviconRecord> = {};
  for (const [origin, value] of Object.entries(raw)) {
    if (!isRecord(value)) {
      continue;
    }
    const dataUrl = asString(value.dataUrl);
    // Only data URLs are ever cached; a remote URL here would mean the chrome
    // renderer makes a network request, which it must never do.
    if (!dataUrl.startsWith('data:image/')) {
      continue;
    }
    result[origin] = { dataUrl, updatedAt: asNumber(value.updatedAt, 0) };
  }
  return result;
}
