import { originOf } from '../../shared/url';
import { sameSite } from '../../shared/forgetting';
import { PersistedFile, asNumber, asString, isRecord } from './persistence';

const MAX_FAVICON_ENTRIES = 600;

/**
 * How much disk the icon cache may take, in total.
 *
 * The count was bounded and the size was not. A favicon may be fetched at up to
 * 200KB, which is about 267KB once it is a data URL, so six hundred of them is
 * roughly 160MB — read from disk, synchronously, before the first window
 * appears. Almost every real favicon is a few kilobytes; the cap exists for the
 * handful that are not, and for the arithmetic that follows from them.
 *
 * Bounding the total rather than each icon means a large one is still kept
 * while there is room for it, and the file stays a size a browser can read at
 * startup without anyone noticing.
 */
const MAX_FAVICON_BYTES = 8 * 1024 * 1024;

/**
 * Drops the least recently updated until the cache is inside both bounds.
 *
 * A stale favicon costs one small request to fetch again, which is why this can
 * afford to be blunt.
 */
export function withinBounds(
  entries: Record<string, FaviconRecord>,
  maxEntries = MAX_FAVICON_ENTRIES,
  maxBytes = MAX_FAVICON_BYTES,
): Record<string, FaviconRecord> {
  const newestFirst = Object.entries(entries).sort(([, a], [, b]) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0));

  const kept: Record<string, FaviconRecord> = {};
  let bytes = 0;
  for (const [origin, record] of newestFirst) {
    if (Object.keys(kept).length >= maxEntries) {
      break;
    }
    // The data URL is the whole cost of an entry; the origin beside it is noise
    // by comparison.
    const cost = record.dataUrl.length;
    if (bytes + cost > maxBytes) {
      // Skipped rather than stopped: a single enormous icon should not evict
      // every smaller one behind it.
      continue;
    }
    kept[origin] = record;
    bytes += cost;
  }
  return kept;
}

export interface FaviconRecord {
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
    this.file.update((current) => withinBounds({ ...current, [origin]: { dataUrl, updatedAt: Date.now() } }));
  }

  /** Every origin an icon is cached for, which is a list of places someone has been. */
  origins(): string[] {
    return Object.keys(this.file.get());
  }

  /** Forgets the icons for one site, subdomains included. */
  forgetSite(site: string): number {
    let removed = 0;
    this.file.update((current) => {
      const kept: Record<string, FaviconRecord> = {};
      for (const [origin, record] of Object.entries(current)) {
        if (sameSite(origin, site)) {
          removed += 1;
        } else {
          kept[origin] = record;
        }
      }
      return kept;
    });
    return removed;
  }

  /**
   * Forgets every icon.
   *
   * Called when history is cleared. An icon is a cache — nobody chose to keep
   * it — and leaving a per-origin cache behind after clearing history leaves a
   * readable list of where someone had been.
   */
  forgetAll(): number {
    const count = Object.keys(this.file.get()).length;
    this.file.set({});
    return count;
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
