// Utils
import { hostOf, originOf } from '../../shared/browsing/url';
import { inTransaction } from './database';
import { importLegacyFile } from './legacy-import';
import { asNumber, asString, isRecord, newId } from './persistence';

// Types
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import type { ClearRange, HistoryEntry, TopSite } from '../../shared/types';
import type { ImportedVisit } from '../import/chromium-history';

export const MAX_HISTORY_ENTRIES = 10_000;
// Below three characters a trigram index has nothing to match, so those searches scan instead.
const MIN_INDEXED_QUERY = 3;
const LEGACY_FILE = 'history.json';
// Pruning sorts the whole table, so it runs at start and then once per this many new pages rather than on each.
const VISITS_BETWEEN_PRUNES = 200;

/** One page of history, shared so the caller and the default cannot drift apart. */
export const HISTORY_PAGE_SIZE = 300;

export interface HistoryPage {
  entries: HistoryEntry[];
  /** Every entry matching the query, not just the ones in this page. */
  total: number;
}

const CLEAR_WINDOWS_MS: Record<Exclude<ClearRange, 'all'>, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

const COLUMNS = 'id, url, title, last_visited_at, visit_count, blocked_count';

/** Where you have been, pruned by age and by count so it cannot grow without limit. */
export class HistoryStore {
  private visitsSincePrune = 0;

  constructor(
    private readonly database: DatabaseSync,
    directory: string,
    /** The oldest visit still kept, read each time so a change in Settings applies at the next prune. */
    private readonly keptSince: () => number,
  ) {
    this.importFromJson(directory);
    this.prune();
  }

  recordVisit(url: string, title: string): void {
    const now = Date.now();
    const existing = this.database.prepare('SELECT last_visited_at, title FROM history WHERE url = ?').get(url);
    if (!existing) {
      this.database
        .prepare('INSERT INTO history (id, url, title, last_visited_at) VALUES (?, ?, ?, ?)')
        .run(newId(), url, title, now);
      this.visitsSincePrune += 1;
      if (this.visitsSincePrune >= VISITS_BETWEEN_PRUNES) {
        this.prune();
      }
      return;
    }
    // Reloading or bouncing within the same page refreshes the title but is not another visit: the count drives top sites.
    const isRepeatVisit = now - Number(existing.last_visited_at) > 30_000;
    this.database
      .prepare('UPDATE history SET title = ?, last_visited_at = ?, visit_count = visit_count + ? WHERE url = ?')
      .run(title || String(existing.title), now, isRepeatVisit ? 1 : 0, url);
  }

  /** Another browser's history, merged so each page keeps the later visit and the higher count of the two. */
  importVisits(visits: readonly ImportedVisit[]): { added: number; alreadyHad: number } {
    const known = this.database.prepare('SELECT 1 FROM history WHERE url = ?');
    const alreadyHad = visits.filter((visit) => known.get(visit.url) !== undefined).length;
    const merge = this.database.prepare(
      `INSERT INTO history (id, url, title, last_visited_at, visit_count) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (url) DO UPDATE SET
         title = CASE WHEN excluded.last_visited_at > last_visited_at AND excluded.title != '' THEN excluded.title ELSE title END,
         last_visited_at = max(last_visited_at, excluded.last_visited_at),
         visit_count = max(visit_count, excluded.visit_count)`,
    );
    inTransaction(this.database, () =>
      visits.forEach((visit) => merge.run(newId(), visit.url, visit.title, visit.lastVisitedAt, visit.visitCount)),
    );
    this.prune();
    return { added: visits.length - alreadyHad, alreadyHad };
  }

  // A page of history, and how many entries there are in total.
  listHistory(query = '', limit = HISTORY_PAGE_SIZE, offset = 0): HistoryPage {
    const { where, parameters } = matching(query);
    const total = Number(
      this.database.prepare(`SELECT count(*) AS total FROM history ${where}`).get(...parameters)?.total ?? 0,
    );
    const rows = this.database
      .prepare(`SELECT ${COLUMNS} FROM history ${where} ORDER BY last_visited_at DESC LIMIT ? OFFSET ?`)
      .all(...parameters, limit, offset);
    return { entries: rows.map(toEntry), total };
  }

  /** Every entry whose address or title holds the query, most recent first, for ranking the omnibox's suggestions. */
  searchHistory(query: string, limit: number): HistoryEntry[] {
    const { where, parameters } = matching(query);
    return this.database
      .prepare(`SELECT ${COLUMNS} FROM history ${where} ORDER BY last_visited_at DESC LIMIT ?`)
      .all(...parameters, limit)
      .map(toEntry);
  }

  /** Everything, most recent first, for the export, which must never be a partial one. */
  allHistory(): HistoryEntry[] {
    return this.database.prepare(`SELECT ${COLUMNS} FROM history ORDER BY last_visited_at DESC`).all().map(toEntry);
  }

  find(id: string): HistoryEntry | null {
    const row = this.database.prepare(`SELECT ${COLUMNS} FROM history WHERE id = ?`).get(id);
    return row ? toEntry(row) : null;
  }

  /** Puts a removed entry back as it was, counts and all; a visit since then wins. */
  restore(entry: HistoryEntry): void {
    this.database
      .prepare(
        'INSERT OR IGNORE INTO history (id, url, title, last_visited_at, visit_count, blocked_count) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(entry.id, entry.url, entry.title, entry.lastVisitedAt, entry.visitCount, entry.blockedCount ?? 0);
  }

  removeHistory(id: string): void {
    this.database.prepare('DELETE FROM history WHERE id = ?').run(id);
    this.scrub();
  }

  /**
   * Adds to what a page has refused.
   *
   * Counted as it happens rather than when a visit is recorded: a visit is
   * recorded when the title arrives, which is early, before most trackers have
   * been refused.
   */
  addBlocked(url: string, delta: number): void {
    if (delta <= 0) {
      return;
    }
    this.database.prepare('UPDATE history SET blocked_count = blocked_count + ? WHERE url = ?').run(delta, url);
  }

  /** Every visit to one site, subdomains included. Returns how many went. */
  forgetSite(site: string): number {
    const { changes } = this.database.prepare('DELETE FROM history WHERE same_site(url, ?)').run(site);
    this.scrub();
    return Number(changes);
  }

  /** How many visits are recorded for one site, without removing them. */
  countForSite(site: string): number {
    return Number(
      this.database.prepare('SELECT count(*) AS total FROM history WHERE same_site(url, ?)').get(site)?.total ?? 0,
    );
  }

  /** Every request this browser has refused, across everything still in history. */
  totalBlocked(): number {
    return Number(
      this.database.prepare('SELECT coalesce(sum(blocked_count), 0) AS total FROM history').get()?.total ?? 0,
    );
  }

  /** Requests refused on pages last visited since then; a page visited again counts its earlier refusals too. */
  blockedSince(since: number): number {
    return Number(
      this.database
        .prepare('SELECT coalesce(sum(blocked_count), 0) AS total FROM history WHERE last_visited_at >= ?')
        .get(since)?.total ?? 0,
    );
  }

  clearHistory(range: ClearRange): void {
    if (range === 'all') {
      this.database.exec('DELETE FROM history');
    } else {
      this.database
        .prepare('DELETE FROM history WHERE last_visited_at >= ?')
        .run(Date.now() - CLEAR_WINDOWS_MS[range]);
    }
    this.scrub();
  }

  topSites(faviconFor: (url: string) => string | null, limit = 8): TopSite[] {
    const byHost = new Map<string, TopSite>();
    for (const entry of this.allHistory()) {
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
        label: host.replace(/^www\./, ''),
        isShortcut: false,
      });
    }
    return [...byHost.values()].sort((aSite, bSite) => bSite.visitCount - aSite.visitCount).slice(0, limit);
  }

  /** Every write is already on disk; kept so the store's callers flush every part the same way. */
  flush(): void {}

  prune(): void {
    this.visitsSincePrune = 0;
    this.database.prepare('DELETE FROM history WHERE last_visited_at < ?').run(this.keptSince());
    this.database
      .prepare(
        'DELETE FROM history WHERE rowid NOT IN (SELECT rowid FROM history ORDER BY last_visited_at DESC LIMIT ?)',
      )
      .run(MAX_HISTORY_ENTRIES);
  }

  /**
   * Something was forgotten, so its traces go too, not only the row: the search
   * index is merged, which drops the deleted entries rather than marking them,
   * and the old copies in the write-ahead log are truncated away.
   */
  private scrub(): void {
    this.database.exec("INSERT INTO history_search (history_search) VALUES ('optimize')");
    this.database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }

  private importFromJson(directory: string): void {
    const insert = this.database.prepare(`INSERT OR IGNORE INTO history (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`);
    importLegacyFile(this.database, directory, LEGACY_FILE, reviveHistory, (entries) =>
      entries.forEach((entry) =>
        insert.run(entry.id, entry.url, entry.title, entry.lastVisitedAt, entry.visitCount, entry.blockedCount ?? 0),
      ),
    );
  }
}

function matching(query: string): { where: string; parameters: SQLInputValue[] } {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return { where: '', parameters: [] };
  }
  if (needle.length < MIN_INDEXED_QUERY) {
    const pattern = `%${needle.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
    return {
      where: "WHERE lower(url) LIKE ? ESCAPE '\\' OR lower(title) LIKE ? ESCAPE '\\'",
      parameters: [pattern, pattern],
    };
  }
  // A quoted phrase, with its own quotes doubled, so what was typed is matched as text and never read as query syntax.
  const phrase = `"${needle.replace(/"/g, '""')}"`;
  return {
    where: 'WHERE rowid IN (SELECT rowid FROM history_search WHERE history_search MATCH ?)',
    parameters: [phrase],
  };
}

function toEntry(row: Record<string, unknown>): HistoryEntry {
  return {
    id: String(row.id),
    url: String(row.url),
    title: String(row.title),
    lastVisitedAt: Number(row.last_visited_at),
    visitCount: Number(row.visit_count),
    blockedCount: Number(row.blocked_count),
  };
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
        blockedCount: Math.max(0, asNumber(item.blockedCount, 0)),
      },
    ];
  });
}
