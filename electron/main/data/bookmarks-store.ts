import type { Bookmark } from '../../shared/types';
import { PersistedFile, asNumber, asString, isRecord, newId } from './persistence';

export class BookmarksStore {
  private readonly file = new PersistedFile<Bookmark[]>('bookmarks.json', () => [], reviveBookmarks);

  list(): Bookmark[] {
    return this.file.get();
  }

  has(url: string): boolean {
    return this.file.get().some((bookmark) => bookmark.url === url);
  }

  /** Adds or removes, and reports whether the URL is bookmarked afterwards. */
  toggle(url: string, title: string): boolean {
    let bookmarked = false;
    this.file.update((bookmarks) => {
      const index = bookmarks.findIndex((bookmark) => bookmark.url === url);
      if (index !== -1) {
        return bookmarks.filter((_, position) => position !== index);
      }
      bookmarked = true;
      return [{ id: newId(), url, title: title || url, createdAt: Date.now() }, ...bookmarks];
    });
    return bookmarked;
  }

  /**
   * Adds what is not already here and counts what was already saved, so a short
   * number after an import is explained rather than looking like a failure.
   */
  addMany(entries: readonly { url: string; title: string; addedAt: number | null }[]): {
    added: number;
    alreadyHad: number;
  } {
    let added = 0;
    let alreadyHad = 0;

    this.file.update((bookmarks) => {
      const known = new Set(bookmarks.map((bookmark) => bookmark.url));
      const fresh: Bookmark[] = [];
      for (const entry of entries) {
        if (known.has(entry.url)) {
          alreadyHad += 1;
          continue;
        }
        known.add(entry.url);
        added += 1;
        fresh.push({
          id: newId(),
          url: entry.url,
          title: entry.title || entry.url,
          // Seconds in the file, milliseconds here.
          createdAt: entry.addedAt ? entry.addedAt * 1000 : Date.now(),
        });
      }
      return [...fresh, ...bookmarks];
    });

    return { added, alreadyHad };
  }

  remove(id: string): void {
    this.file.update((bookmarks) => bookmarks.filter((bookmark) => bookmark.id !== id));
  }

  flush(): void {
    this.file.flush();
  }
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
      },
    ];
  });
}
