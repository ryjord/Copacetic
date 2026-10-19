// The Netscape bookmark format: what Chrome, Firefox, Safari and Edge all
// export, and what Copacetic already writes. Parsed rather than rendered - this
// is a file from somewhere else and none of it is trusted.

import { sanitiseChromeText } from './chrome-text';

export interface ImportedBookmark {
  url: string;
  title: string;
  /** Seconds since the epoch, as the format stores them; null when absent. */
  addedAt: number | null;
  /** The folders it was in, outermost first; empty for one at the top. */
  folders: string[];
}

export interface ImportedBookmarks {
  bookmarks: ImportedBookmark[];
  /** Anchors that were not usable, so a short count is explained rather than silent. */
  skipped: number;
}

export const MAX_IMPORTED_TITLE = 200;
export const MAX_IMPORTED_FOLDER_NAME = 80;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, name: string) => {
    const known = ENTITIES[name.toLowerCase()];
    if (known !== undefined) {
      return known;
    }
    if (name.startsWith('#x') || name.startsWith('#X')) {
      const code = Number.parseInt(name.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (name.startsWith('#')) {
      const code = Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return whole;
  });
}

/** Attributes appear in any order and any casing depending on who wrote the file. */
function attribute(tag: string, name: string): string {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  return match?.[1] ?? '';
}

/**
 * Only http and https survive. An exported file can contain `javascript:`
 * bookmarklets and `file:` paths, and importing those would put something
 * dangerous one click away in a list that looks like everything else.
 */
export function isImportable(url: string): boolean {
  try {
    const scheme = new URL(url).protocol;
    return scheme === 'http:' || scheme === 'https:';
  } catch {
    return false;
  }
}

// The tags that matter in the format: a folder's heading, the list that holds its contents, and a bookmark.
const TOKENS = /<h3\b[^>]*>([\s\S]*?)<\/h3>|<dl\b[^>]*>|<\/dl>|<a\b[^>]*>[\s\S]*?<\/a>/gi;

function textOf(markup: string, limit: number): string {
  // Tags inside a title are markup from a file we did not write.
  return sanitiseChromeText(decodeEntities(markup.replace(/<[^>]*>/g, '')), limit);
}

/** Every bookmark in the file, each with the folders it sat in: a heading names the list that follows it. */
export function bookmarksFromHtml(html: string): ImportedBookmarks {
  const bookmarks: ImportedBookmark[] = [];
  const seen = new Set<string>();
  // One entry per open list; null for a list with no heading, such as the file's outermost.
  const open: (string | null)[] = [];
  let heading: string | null = null;
  let skipped = 0;

  for (const match of html.matchAll(TOKENS)) {
    const token = match[0];
    const lower = token.slice(0, 4).toLowerCase();
    if (lower.startsWith('<h3')) {
      heading = textOf(match[1] ?? '', MAX_IMPORTED_FOLDER_NAME) || 'Folder';
      continue;
    }
    if (lower.startsWith('<dl')) {
      open.push(heading);
      heading = null;
      continue;
    }
    if (lower.startsWith('</dl')) {
      open.pop();
      continue;
    }

    const openingTag = /<a\b[^>]*>/i.exec(token)?.[0] ?? '';
    const url = decodeEntities(attribute(openingTag, 'href')).trim();
    if (!isImportable(url)) {
      skipped += 1;
      continue;
    }
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);

    const title = textOf(token.replace(/<a\b[^>]*>/i, '').replace(/<\/a>/i, ''), MAX_IMPORTED_TITLE);
    const added = Number.parseInt(attribute(openingTag, 'add_date'), 10);
    bookmarks.push({
      url,
      title: title || url,
      addedAt: Number.isFinite(added) && added > 0 ? added : null,
      folders: open.filter((name): name is string => name !== null),
    });
  }

  return { bookmarks, skipped };
}
