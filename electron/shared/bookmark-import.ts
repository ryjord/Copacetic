// The Netscape bookmark format: what Chrome, Firefox, Safari and Edge all
// export, and what Copacetic already writes. Parsed rather than rendered — this
// is a file from somewhere else and none of it is trusted.

import { sanitiseChromeText } from './chrome-text';

export interface ImportedBookmark {
  url: string;
  title: string;
  /** Seconds since the epoch, as the format stores them; null when absent. */
  addedAt: number | null;
}

export interface ImportedBookmarks {
  bookmarks: ImportedBookmark[];
  /** Anchors that were not usable, so a short count is explained rather than silent. */
  skipped: number;
}

const MAX_TITLE = 200;

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
function isImportable(url: string): boolean {
  try {
    const scheme = new URL(url).protocol;
    return scheme === 'http:' || scheme === 'https:';
  } catch {
    return false;
  }
}

export function bookmarksFromHtml(html: string): ImportedBookmarks {
  const anchors = html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? [];
  const bookmarks: ImportedBookmark[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const anchor of anchors) {
    const openingTag = /<a\b[^>]*>/i.exec(anchor)?.[0] ?? '';
    const url = decodeEntities(attribute(openingTag, 'href')).trim();

    if (!isImportable(url)) {
      skipped += 1;
      continue;
    }
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);

    const inner = anchor.replace(/<a\b[^>]*>/i, '').replace(/<\/a>/i, '');
    // Tags inside a title are markup from a file we did not write.
    const title = sanitiseChromeText(decodeEntities(inner.replace(/<[^>]*>/g, '')), MAX_TITLE);
    const added = Number.parseInt(attribute(openingTag, 'add_date'), 10);

    bookmarks.push({
      url,
      title: title || url,
      addedAt: Number.isFinite(added) && added > 0 ? added : null,
    });
  }

  return { bookmarks, skipped };
}
