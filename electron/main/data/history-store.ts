import type { ClearRange, HistoryEntry, TopSite } from '../../shared/types';
import { hostOf, originOf } from '../../shared/url';
import { PersistedFile, asNumber, asString, isRecord, newId } from './persistence';

const MAX_HISTORY_ENTRIES = 10_000;
const MAX_HISTORY_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/** One page of history, shared so the caller and the default cannot drift apart. */
export const HISTORY_PAGE_SIZE = 300;

export interface HistoryPage {
  entries: HistoryEntry[];
  /** Every entry matching the query, not just the ones in this page. */
  total: number;
}

/** Where you have been, pruned by age and by count so it cannot grow without limit. */
export class HistoryStore {
  private readonly file = new PersistedFile<HistoryEntry[]>('history.json', () => [], reviveHistory);

  constructor() {
    this.pruneHistory();
  }

  recordVisit(url: string, title: string): void {
    this.file.update((entries) => {
      const now = Date.now();
      const index = entries.findIndex((entry) => entry.url === url);
      if (index === -1) {
        return [{ id: newId(), url, title, lastVisitedAt: now, visitCount: 1 }, ...entries].slice(
          0,
          MAX_HISTORY_ENTRIES,
        );
      }

      const existing = entries[index]!;
      // Reloading or bouncing within the same page should refresh the title but
      // not inflate the visit count, which drives top sites and ranking.
      const isRepeatVisit = now - existing.lastVisitedAt > 30_000;
      const updated: HistoryEntry = {
        ...existing,
        title: title || existing.title,
        lastVisitedAt: now,
        visitCount: existing.visitCount + (isRepeatVisit ? 1 : 0),
      };
      const rest = entries.slice(0, index).concat(entries.slice(index + 1));
      return [updated, ...rest];
    });
  }

  // A page of history, and how many entries there are in total.
  listHistory(query = '', limit = HISTORY_PAGE_SIZE, offset = 0): HistoryPage {
    const matches = this.matchingHistory(query);
    return { entries: matches.slice(offset, offset + limit), total: matches.length };
  }

  private matchingHistory(query: string): HistoryEntry[] {
    const entries = this.file.get();
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return entries;
    }
    return entries.filter(
      (entry) => entry.url.toLowerCase().includes(needle) || entry.title.toLowerCase().includes(needle),
    );
  }

  /** Everything matching, for the export, which must never be a partial one. */
  allHistory(): HistoryEntry[] {
    return this.file.get();
  }

  removeHistory(id: string): void {
    this.file.update((entries) => entries.filter((entry) => entry.id !== id));
  }

  clearHistory(range: ClearRange): void {
    if (range === 'all') {
      this.file.set([]);
      return;
    }
    const windows: Record<Exclude<ClearRange, 'all'>, number> = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    };
    const cutoff = Date.now() - windows[range];
    this.file.update((entries) => entries.filter((entry) => entry.lastVisitedAt < cutoff));
  }

  private pruneHistory(): void {
    const cutoff = Date.now() - MAX_HISTORY_AGE_MS;
    this.file.update((entries) =>
      entries.filter((entry) => entry.lastVisitedAt >= cutoff).slice(0, MAX_HISTORY_ENTRIES),
    );
  }

  topSites(faviconFor: (url: string) => string | null, limit = 8): TopSite[] {
    const byHost = new Map<string, TopSite>();
    for (const entry of this.file.get()) {
      const host = hostOf(entry.url);
      if (!host) {
        continue;
      }
      const existing = byHost.get(host);
      if (existing) {
        existing.visitCount += entry.visitCount;
        continue;
      }
      byHost.set(host, {
        url: `${originOf(entry.url)}/`,
        host: host.replace(/^www\./, ''),
        title: entry.title || host,
        visitCount: entry.visitCount,
        faviconDataUrl: faviconFor(entry.url),
      });
    }
    return [...byHost.values()].sort((a, b) => b.visitCount - a.visitCount).slice(0, limit);
  }

  flush(): void {
    this.file.flush();
  }
}

function reviveHistory(raw: unknown): HistoryEntry[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  return raw.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const url = asString(item.url);
    if (!url) {
      return [];
    }
    return [
      {
        id: asString(item.id) || newId(),
        url,
        title: asString(item.title),
        lastVisitedAt: asNumber(item.lastVisitedAt, Date.now()),
        visitCount: Math.max(1, asNumber(item.visitCount, 1)),
      },
    ];
  });
}
