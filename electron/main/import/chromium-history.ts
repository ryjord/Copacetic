import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MAX_IMPORTED_TITLE, isImportable } from '../../shared/bookmark-import';
import { sanitiseChromeText } from '../../shared/chrome-text';
import { WINDOWS_EPOCH_OFFSET_MS } from './chromium-time';

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
export function readChromiumHistory(file: string, options: { since: number; limit: number }): ImportedVisit[] {
  const scratch = mkdtempSync(path.join(tmpdir(), 'copacetic-import-'));
  try {
    const copy = path.join(scratch, 'History');
    copyFileSync(file, copy);
    ['-journal', '-wal']
      .filter((suffix) => existsSync(`${file}${suffix}`))
      .forEach((suffix) => copyFileSync(`${file}${suffix}`, `${copy}${suffix}`));
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
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
