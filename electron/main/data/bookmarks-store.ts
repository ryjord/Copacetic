// Utils
import { isPageNavigableUrl } from '../../shared/url';
import { inTransaction } from './database';
import { importLegacyFile } from './legacy-import';
import { asNumber, asString, isRecord, newId } from './persistence';

// Types
import type { DatabaseSync } from 'node:sqlite';
import type { Bookmark, BookmarkEditResult } from '../../shared/types';

const LEGACY_FILE = 'bookmarks.json';
const COLUMNS = 'id, url, title, created_at, folder_id';

export class BookmarksStore {
  constructor(
    private readonly database: DatabaseSync,
    directory: string,
  ) {
    // A file from before folders has no folderId at all, which the reviver reads as Unfiled.
    importLegacyFile(database, directory, LEGACY_FILE, reviveBookmarks, (bookmarks) => this.write(bookmarks));
  }

  list(): Bookmark[] {
    return this.database.prepare(`SELECT ${COLUMNS} FROM bookmarks ORDER BY position`).all().map(toBookmark);
  }

  has(url: string): boolean {
    return this.database.prepare('SELECT 1 FROM bookmarks WHERE url = ?').get(url) !== undefined;
  }

  /** Adds or removes, and reports whether the URL is bookmarked afterwards. */
  toggle(url: string, title: string): boolean {
    if (this.has(url)) {
      this.database.prepare('DELETE FROM bookmarks WHERE url = ?').run(url);
      return false;
    }
    this.prepend({ id: newId(), url, title: title || url, createdAt: Date.now(), folderId: null });
    return true;
  }

  /**
   * Adds what is not already here and counts what was already saved, so a short
   * number after an import is explained rather than looking like a failure.
   */
  addMany(entries: readonly { url: string; title: string; addedAt: number | null; folderId?: string | null }[]): {
    added: number;
    alreadyHad: number;
  } {
    const known = new Set(this.list().map((bookmark) => bookmark.url));
    const fresh = entries.filter((entry) => {
      if (known.has(entry.url)) {
        return false;
      }
      known.add(entry.url);
      return true;
    });
    const bookmarks = fresh.map<Bookmark>((entry) => ({
      id: newId(),
      url: entry.url,
      title: entry.title || entry.url,
      // Seconds in the file, milliseconds here.
      createdAt: entry.addedAt ? entry.addedAt * 1000 : Date.now(),
      folderId: entry.folderId ?? null,
    }));
    inTransaction(this.database, () => [...bookmarks].reverse().forEach((bookmark) => this.prepend(bookmark)));
    return { added: bookmarks.length, alreadyHad: entries.length - bookmarks.length };
  }

  /**
   * Makes sure an address is bookmarked, and hands back the bookmark.
   *
   * Not `toggle`: asked twice about the same address, toggle removes what it
   * added. An address already saved keeps the title, the date and the folder it
   * already had, none of which this was asked to change.
   */
  ensure(url: string, title: string): Bookmark {
    const existing = this.database.prepare(`SELECT ${COLUMNS} FROM bookmarks WHERE url = ?`).get(url);
    if (existing) {
      return toBookmark(existing);
    }
    const bookmark: Bookmark = { id: newId(), url, title: title || url, createdAt: Date.now(), folderId: null };
    this.prepend(bookmark);
    return bookmark;
  }

  /** Files one bookmark, or unfiles it. Whether the folder exists is decided by the caller. */
  moveTo(id: string, folderId: string | null): void {
    this.database.prepare('UPDATE bookmarks SET folder_id = ? WHERE id = ?').run(folderId, id);
  }

  /** Replaces every bookmark, which is how deleting a folder promotes what was in it. */
  replaceAll(bookmarks: readonly Bookmark[]): void {
    inTransaction(this.database, () => this.write(bookmarks));
  }

  /** Retitles or readdresses one bookmark; an empty title falls back to the address, as a new one does. */
  update(id: string, changes: { title?: string; url?: string }): BookmarkEditResult {
    const row = this.database.prepare(`SELECT ${COLUMNS} FROM bookmarks WHERE id = ?`).get(id);
    if (!row) {
      return 'missing';
    }
    const current = toBookmark(row);
    const url = changes.url ?? current.url;
    if (!isPageNavigableUrl(url)) {
      return 'not-an-address';
    }
    const holder = this.database.prepare('SELECT id FROM bookmarks WHERE url = ?').get(url);
    if (holder && String(holder.id) !== id) {
      return 'already-saved';
    }
    const title = changes.title === undefined ? current.title : changes.title.trim() || url;
    this.database.prepare('UPDATE bookmarks SET title = ?, url = ? WHERE id = ?').run(title, url, id);
    return 'saved';
  }

  remove(id: string): void {
    this.database.prepare('DELETE FROM bookmarks WHERE id = ?').run(id);
  }

  /** Every write is already on disk; kept so the store's callers flush every part the same way. */
  flush(): void {}

  private prepend(bookmark: Bookmark): void {
    const first = this.database.prepare('SELECT coalesce(min(position), 0) AS position FROM bookmarks').get();
    this.database
      .prepare(`INSERT INTO bookmarks (position, ${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(
        Number(first?.position) - 1,
        bookmark.id,
        bookmark.url,
        bookmark.title,
        bookmark.createdAt,
        bookmark.folderId,
      );
  }

  private write(bookmarks: readonly Bookmark[]): void {
    this.database.exec('DELETE FROM bookmarks');
    const insert = this.database.prepare(
      `INSERT OR IGNORE INTO bookmarks (position, ${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    bookmarks.forEach((bookmark, position) =>
      insert.run(position, bookmark.id, bookmark.url, bookmark.title, bookmark.createdAt, bookmark.folderId),
    );
  }
}

function toBookmark(row: Record<string, unknown>): Bookmark {
  return {
    id: String(row.id),
    url: String(row.url),
    title: String(row.title),
    createdAt: Number(row.created_at),
    folderId: typeof row.folder_id === 'string' ? row.folder_id : null,
  };
}

export function reviveBookmarks(raw: unknown): Bookmark[] | null {
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
        title: asString(item.title) || url,
        createdAt: asNumber(item.createdAt, Date.now()),
        // Only kept if it is a string; whether it names a real folder is checked where the folders are known.
        folderId: asString(item.folderId) || null,
      },
    ];
  });
}
