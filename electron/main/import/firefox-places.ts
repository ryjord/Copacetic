// Libs
import { DatabaseSync } from 'node:sqlite';

// Utils
import {
  type ImportedBookmark,
  type ImportedBookmarks,
  MAX_IMPORTED_FOLDER_NAME,
  MAX_IMPORTED_TITLE,
  isImportable,
} from '../../shared/bookmark-import';
import { sanitiseChromeText } from '../../shared/chrome-text';
import { t } from '../../shared/i18n/translate';
import { withCopyOf } from './copy-aside';

// Types
import type { ImportedVisit } from './chromium-history';

// Firefox's own root folders carry internal titles; these are the names its window shows. Tags are not bookmarks.
const ROOT_NAMES: Record<string, string> = {
  menu________: t('main.import.firefox.roots.menu'),
  toolbar_____: t('main.import.firefox.roots.toolbar'),
  unfiled_____: t('main.import.firefox.roots.unfiled'),
  mobile______: t('main.import.firefox.roots.mobile'),
};
const TAGS_ROOT = 'tags________';
const BOOKMARK = 1;
const FOLDER = 2;

/** Opens the copy, runs the query, and closes it again, whatever the query does. */
function inCopyOf<T>(file: string, query: (database: DatabaseSync) => T): Promise<T> {
  return withCopyOf(file, 'copacetic-firefox-import-', (copy) => {
    const database = new DatabaseSync(copy);
    try {
      return query(database);
    } finally {
      database.close();
    }
  });
}

interface PlacesRow {
  id: number;
  type: number;
  parent: number;
  title: string;
  guid: string;
  url: string | null;
  addedAt: number | null;
}

/** Bookmarks with the folders they sit in, from the roots Firefox shows; tags and separators are left out. */
export function bookmarksFromPlaces(rows: readonly PlacesRow[]): ImportedBookmarks {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const foldersOf = (row: PlacesRow): string[] | null => {
    const parent = byId.get(row.parent);
    if (!parent || parent.guid === 'root________') {
      return [];
    }
    if (parent.guid === TAGS_ROOT) {
      return null;
    }
    const above = foldersOf(parent);
    const name =
      ROOT_NAMES[parent.guid] ??
      (sanitiseChromeText(parent.title, MAX_IMPORTED_FOLDER_NAME) || t('main.import.bookmarks.unnamedFolder'));
    return above === null ? null : [...above, name];
  };

  const candidates = rows
    .filter((row) => row.type === BOOKMARK && row.url !== null)
    .map((row) => ({ row, folders: foldersOf(row) }))
    .filter((candidate): candidate is { row: PlacesRow; folders: string[] } => candidate.folders !== null);
  const importable = candidates.filter((candidate) => isImportable(candidate.row.url ?? ''));
  const seen = new Set<string>();
  const bookmarks = importable
    .filter((candidate) => {
      const url = candidate.row.url ?? '';
      if (seen.has(url)) {
        return false;
      }
      seen.add(url);
      return true;
    })
    .map<ImportedBookmark>(({ row, folders }) => ({
      url: row.url ?? '',
      title: sanitiseChromeText(row.title, MAX_IMPORTED_TITLE) || (row.url ?? ''),
      // Microseconds in Firefox, seconds in an import.
      addedAt: row.addedAt ? Math.floor(row.addedAt / 1_000_000) : null,
      folders,
    }));
  return { bookmarks, skipped: candidates.length - importable.length };
}

export function readFirefoxBookmarks(file: string): Promise<ImportedBookmarks> {
  return inCopyOf(file, (database) => {
    const rows = database
      .prepare(
        `SELECT b.id, b.type, b.parent, coalesce(b.title, '') AS title, b.guid, p.url, b.dateAdded AS added_at
         FROM moz_bookmarks b LEFT JOIN moz_places p ON p.id = b.fk
         WHERE b.type IN (${BOOKMARK}, ${FOLDER})
         ORDER BY b.parent, b.position`,
      )
      .all();
    return bookmarksFromPlaces(
      rows.map((row) => ({
        id: Number(row.id),
        type: Number(row.type),
        parent: Number(row.parent),
        title: String(row.title ?? ''),
        guid: String(row.guid ?? ''),
        url: typeof row.url === 'string' ? row.url.trim() : null,
        addedAt: typeof row.added_at === 'number' ? row.added_at : null,
      })),
    );
  });
}

/** The most recent pages Firefox remembers, in the shape the Chromium reader produces. */
export function readFirefoxHistory(
  file: string,
  options: { since: number; limit: number },
): Promise<ImportedVisit[]> {
  return inCopyOf(file, (database) => {
    // Microseconds since 1970, divided down in SQL to the milliseconds Copacetic keeps.
    const rows = database
      .prepare(
        `SELECT url, coalesce(title, '') AS title, visit_count, last_visit_date / 1000 AS visited_at
         FROM moz_places
         WHERE hidden = 0 AND last_visit_date >= ? * 1000
         ORDER BY last_visit_date DESC
         LIMIT ?`,
      )
      .all(options.since, options.limit);
    return rows
      .filter((row) => typeof row.url === 'string' && isImportable(row.url))
      .map((row) => ({
        url: String(row.url),
        title: sanitiseChromeText(String(row.title ?? ''), MAX_IMPORTED_TITLE),
        lastVisitedAt: Number(row.visited_at),
        visitCount: Math.max(1, Number(row.visit_count)),
      }));
  });
}
