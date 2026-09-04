import type { Bookmark } from '../../shared/types';
import type { SchemaPlan } from './schema';
import { PersistedFile, asNumber, asString, isRecord, newId } from './persistence';

/**
 * Version 2 files a bookmark in a folder. Version 1 was a flat list, so every
 * bookmark that predates folders belongs to none — which is exactly what the
 * interface calls Unfiled, rather than a state needing explaining.
 */
export const BOOKMARKS_PLAN: SchemaPlan = {
  current: 2,
  steps: [
    {
      to: 2,
      describe: 'bookmarks remember which folder they are filed in',
      up: (raw: unknown) => {
        if (!Array.isArray(raw)) {
          return raw;
        }
        // `folderId: null` unconditionally meant running this step twice
        // un-filed every bookmark from every folder while leaving the bookmarks
        // themselves in place, which reads as the tree silently collapsing.
        return raw.map((item) => (isRecord(item) && !('folderId' in item) ? { ...item, folderId: null } : item));
      },
    },
  ],
};

export class BookmarksStore {
  private readonly file = new PersistedFile<Bookmark[]>(
    'bookmarks.json',
    () => [],
    reviveBookmarks,
    400,
    BOOKMARKS_PLAN,
  );

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
      return [{ id: newId(), url, title: title || url, createdAt: Date.now(), folderId: null }, ...bookmarks];
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
          folderId: null,
        });
      }
      return [...fresh, ...bookmarks];
    });

    return { added, alreadyHad };
  }

  /**
   * Makes sure an address is bookmarked, and hands back the bookmark.
   *
   * Not `toggle`: asked twice about the same address, toggle removes what it
   * added. Anything meaning "make sure this is saved" that reaches for toggle
   * deletes the thing it was asked to keep. An address already saved keeps the
   * title, the date and the folder it already had — none of which this was
   * asked to change.
   */
  ensure(url: string, title: string): Bookmark {
    const existing = this.file.get().find((bookmark) => bookmark.url === url);
    if (existing) {
      return existing;
    }
    const bookmark: Bookmark = { id: newId(), url, title: title || url, createdAt: Date.now(), folderId: null };
    this.file.update((bookmarks) => [bookmark, ...bookmarks]);
    return bookmark;
  }

  /** Files one bookmark, or unfiles it. Whether the folder exists is decided by the caller. */
  moveTo(id: string, folderId: string | null): void {
    this.file.update((bookmarks) =>
      bookmarks.map((bookmark) => (bookmark.id === id ? { ...bookmark, folderId } : bookmark)),
    );
  }

  /** Replaces every bookmark, which is how deleting a folder promotes what was in it. */
  replaceAll(bookmarks: readonly Bookmark[]): void {
    this.file.update(() => [...bookmarks]);
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
        // A folder that no longer exists would hide the bookmark in a place
        // nothing can open, so the id is only kept if it is a string; whether
        // it names a real folder is checked where the folders are known.
        folderId: asString(item.folderId) || null,
      },
    ];
  });
}
