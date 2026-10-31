// Utils
import { PersistedFile, asNumber, asString, isRecord, newId } from './persistence';
import { type Article, readArticle } from '../../shared/reader/article';
import { isPageNavigableUrl } from '../../shared/browsing/url';

// Types
import type { ReadingItem } from '../../shared/data/reading-list';

interface SavedReading {
  id: string;
  url: string;
  article: Article;
  savedAt: number;
  isRead: boolean;
}

// Enough to read for months; past it the oldest read pages go first, since an article is the size of a page of text.
export const MOST_SAVED = 200;

function reviveReadingList(raw: unknown): SavedReading[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  return raw.filter(isRecord).flatMap((entry): SavedReading[] => {
    const article = readArticle(entry.article);
    const url = asString(entry.url);
    return article && isPageNavigableUrl(url)
      ? [
          {
            id: asString(entry.id) || newId(),
            url,
            article,
            savedAt: asNumber(entry.savedAt),
            isRead: entry.isRead === true,
          },
        ]
      : [];
  });
}

/** Pages saved to read later, kept whole as reader view drew them, so they can be read with no connection at all. */
export class ReadingList {
  private readonly file: PersistedFile<SavedReading[]>;

  constructor(
    directory: string,
    private readonly now: () => number = Date.now,
  ) {
    this.file = new PersistedFile<SavedReading[]>('reading-list.json', () => [], reviveReadingList, { directory });
  }

  /** Unread first, then newest first. */
  list(): ReadingItem[] {
    return this.file
      .get()
      .toSorted((aItem, bItem) => Number(aItem.isRead) - Number(bItem.isRead) || bItem.savedAt - aItem.savedAt)
      .map(({ id, url, article, savedAt, isRead }) => ({
        id,
        url,
        title: article.title,
        siteName: article.siteName,
        minutes: article.minutes,
        savedAt,
        isRead,
      }));
  }

  article(id: string): { url: string; article: Article } | null {
    const saved = this.file.get().find((item) => item.id === id);
    return saved ? { url: saved.url, article: saved.article } : null;
  }

  /** Saving a page already saved brings it back to the top, unread, with the article as it is now. */
  add(url: string, input: unknown): string | null {
    const article = readArticle(input);
    if (!article || !isPageNavigableUrl(url)) {
      return null;
    }
    const kept = this.file.get().filter((item) => item.url !== url);
    const id = this.file.get().find((item) => item.url === url)?.id ?? newId();
    const next = [...kept, { id, url, article, savedAt: this.now(), isRead: false }];
    const overflow = next.length - MOST_SAVED;
    const dropped = new Set(
      next
        .filter((item) => item.id !== id)
        .toSorted((aItem, bItem) => Number(bItem.isRead) - Number(aItem.isRead) || aItem.savedAt - bItem.savedAt)
        .slice(0, Math.max(0, overflow))
        .map((item) => item.id),
    );
    this.file.set(next.filter((item) => !dropped.has(item.id)));
    return id;
  }

  isSaved(url: string): boolean {
    return this.file.get().some((item) => item.url === url);
  }

  setRead(id: string, isRead: boolean): void {
    this.file.set(this.file.get().map((item) => (item.id === id ? { ...item, isRead } : item)));
  }

  remove(id: string): void {
    this.file.set(this.file.get().filter((item) => item.id !== id));
  }

  flush(): void {
    this.file.flush();
  }
}
