import { MAX_IMPORTED_TITLE, isImportable } from '../../shared/bookmark-import';
import { sanitiseChromeText } from '../../shared/chrome-text';
import { isRecord } from '../data/persistence';
import type { ImportedVisit } from './chromium-history';

/**
 * The history file Copacetic exports, read back. It is a file from anywhere by
 * the time it comes back, so each entry is checked as if a stranger wrote it.
 */
export function visitsFromHistoryFile(text: string): { visits: ImportedVisit[]; skipped: number } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.entries)) {
    return null;
  }
  const visits = parsed.entries
    .filter(isRecord)
    .map((entry) => ({
      url: typeof entry.url === 'string' ? entry.url.trim() : '',
      title: sanitiseChromeText(typeof entry.title === 'string' ? entry.title : '', MAX_IMPORTED_TITLE),
      lastVisitedAt: typeof entry.lastVisitedAt === 'string' ? Date.parse(entry.lastVisitedAt) : Number.NaN,
      visitCount: typeof entry.visitCount === 'number' && entry.visitCount >= 1 ? Math.floor(entry.visitCount) : 1,
    }))
    .filter((visit) => isImportable(visit.url) && Number.isFinite(visit.lastVisitedAt));
  return { visits, skipped: parsed.entries.length - visits.length };
}
