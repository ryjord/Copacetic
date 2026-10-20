// Libs
import { DatabaseSync } from 'node:sqlite';

// Utils
import { MAX_IMPORTED_TITLE, isImportable } from '../../shared/data/bookmark-import';
import { sanitiseChromeText } from '../../shared/chrome/chrome-text';
import { WINDOWS_EPOCH_OFFSET_MS } from './chromium-time';
import { withCopyOf } from './copy-aside';

export interface ImportedVisit {
  url: string;
  title: string;
  lastVisitedAt: number;
  visitCount: number;
}

/**
 * The most recent pages in a Chromium profile's `History` database.
 *
 * Read from a copy, journal and all: the browser may be running and holding its own file.
 */
export function readChromiumHistory(
  file: string,
  options: { since: number; limit: number },
): Promise<ImportedVisit[]> {
  return withCopyOf(file, 'copacetic-import-', (copy) => {
    const database = new DatabaseSync(copy);
    try {
      // Converted in SQL: microseconds since 1601 are past what a JavaScript number holds exactly.
      const rows = database
        .prepare(
          `SELECT url, title, visit_count, last_visit_time / 1000 - ${WINDOWS_EPOCH_OFFSET_MS} AS visited_at
           FROM urls
           WHERE hidden = 0 AND last_visit_time >= (? + ${WINDOWS_EPOCH_OFFSET_MS}) * 1000
           ORDER BY last_visit_time DESC
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
    } finally {
      database.close();
    }
  });
}
