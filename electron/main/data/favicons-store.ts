// Utils
import { originOf } from '../../shared/browsing/url';
import { importLegacyFile } from './legacy-import';
import { asNumber, asString, isRecord } from './persistence';

// Types
import type { DatabaseSync } from 'node:sqlite';

const MAX_FAVICON_ENTRIES = 600;
const LEGACY_FILE = 'favicons.json';

/**
 * How much disk the icon cache may take, in total.
 *
 * A favicon may be fetched at up to 200KB, about 267KB once it is a data URL,
 * so six hundred of them unbounded would be roughly 160MB. Almost every real
 * favicon is a few kilobytes; the cap exists for the handful that are not.
 * Bounding the total rather than each icon means a large one is still kept
 * while there is room for it.
 */
const MAX_FAVICON_BYTES = 8 * 1024 * 1024;

export interface FaviconRecord {
  dataUrl: string;
  updatedAt: number;
}

/** What deciding to keep an icon needs to know about it, without the icon itself. */
interface FaviconCost {
  origin: string;
  bytes: number;
  updatedAt: number;
}

/**
 * The origins to keep, newest first, until both bounds are reached.
 *
 * A stale favicon costs one small request to fetch again, which is why this can
 * afford to be blunt.
 */
function originsWithinBounds(costs: FaviconCost[], maxEntries: number, maxBytes: number): Set<string> {
  const kept = new Set<string>();
  let bytes = 0;
  [...costs]
    .sort((aCost, bCost) => bCost.updatedAt - aCost.updatedAt)
    .forEach((cost) => {
      // Skipped rather than stopped: a single enormous icon should not evict every smaller one behind it.
      if (kept.size >= maxEntries || bytes + cost.bytes > maxBytes) {
        return;
      }
      kept.add(cost.origin);
      bytes += cost.bytes;
    });
  return kept;
}

/** Drops the least recently updated until the cache is inside both bounds. */
export function withinBounds(
  entries: Record<string, FaviconRecord>,
  maxEntries = MAX_FAVICON_ENTRIES,
  maxBytes = MAX_FAVICON_BYTES,
): Record<string, FaviconRecord> {
  const costs = Object.entries(entries).map(([origin, record]) => ({
    origin,
    bytes: record.dataUrl.length,
    updatedAt: record.updatedAt,
  }));
  const kept = originsWithinBounds(costs, maxEntries, maxBytes);
  return Object.fromEntries(Object.entries(entries).filter(([origin]) => kept.has(origin)));
}

/** Site icons, kept by origin. Bounded, because a page can name endless hosts. */
export class FaviconsStore {
  constructor(
    private readonly database: DatabaseSync,
    directory: string,
  ) {
    const insert = database.prepare(
      'INSERT OR REPLACE INTO favicons (origin, data_url, updated_at) VALUES (?, ?, ?)',
    );
    importLegacyFile(database, directory, LEGACY_FILE, reviveFavicons, (icons) =>
      Object.entries(withinBounds(icons)).forEach(([origin, record]) =>
        insert.run(origin, record.dataUrl, record.updatedAt),
      ),
    );
  }

  get(url: string): string | null {
    const origin = originOf(url);
    if (!origin) {
      return null;
    }
    const row = this.database.prepare('SELECT data_url FROM favicons WHERE origin = ?').get(origin);
    return row ? String(row.data_url) : null;
  }

  set(url: string, dataUrl: string): void {
    const origin = originOf(url);
    if (!origin) {
      return;
    }
    this.database
      .prepare('INSERT OR REPLACE INTO favicons (origin, data_url, updated_at) VALUES (?, ?, ?)')
      .run(origin, dataUrl, Date.now());
    this.keepWithinBounds();
  }

  /** Every origin an icon is cached for, which is a list of places someone has been. */
  origins(): string[] {
    return this.database
      .prepare('SELECT origin FROM favicons')
      .all()
      .map((row) => String(row.origin));
  }

  /** Forgets the icons for one site, subdomains included. */
  forgetSite(site: string): number {
    const { changes } = this.database.prepare('DELETE FROM favicons WHERE same_site(origin, ?)').run(site);
    this.scrub();
    return Number(changes);
  }

  /**
   * Forgets every icon.
   *
   * Called when history is cleared. An icon is a cache nobody chose to keep, and
   * a per-origin cache left behind would be a readable list of where someone had been.
   */
  forgetAll(): number {
    const { changes } = this.database.prepare('DELETE FROM favicons').run();
    this.scrub();
    return Number(changes);
  }

  /** Every write is already on disk; kept so the store's callers flush every part the same way. */
  flush(): void {}

  private keepWithinBounds(): void {
    const totals = this.database
      .prepare('SELECT count(*) AS entries, coalesce(sum(length(data_url)), 0) AS bytes FROM favicons')
      .get();
    if (Number(totals?.entries) <= MAX_FAVICON_ENTRIES && Number(totals?.bytes) <= MAX_FAVICON_BYTES) {
      return;
    }
    const costs = this.database
      // Newest written first, rowid breaking a tie: icons arriving within one millisecond still leave oldest first.
      .prepare(
        'SELECT origin, length(data_url) AS bytes, updated_at FROM favicons ORDER BY updated_at DESC, rowid DESC',
      )
      .all()
      .map((row) => ({ origin: String(row.origin), bytes: Number(row.bytes), updatedAt: Number(row.updated_at) }));
    const kept = originsWithinBounds(costs, MAX_FAVICON_ENTRIES, MAX_FAVICON_BYTES);
    const remove = this.database.prepare('DELETE FROM favicons WHERE origin = ?');
    costs.filter((cost) => !kept.has(cost.origin)).forEach((cost) => remove.run(cost.origin));
  }

  /** The icons named where someone had been, so the old copies in the write-ahead log go too. */
  private scrub(): void {
    this.database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
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
    // Only data URLs are ever cached; a remote URL here would mean the chrome renderer makes a network request.
    if (!dataUrl.startsWith('data:image/')) {
      continue;
    }
    result[origin] = { dataUrl, updatedAt: asNumber(value.updatedAt, 0) };
  }
  return result;
}
