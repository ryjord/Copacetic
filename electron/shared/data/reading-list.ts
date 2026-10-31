/** A page saved to read later, as the list shows it; the article itself is asked for when it is opened. */
export interface ReadingItem {
  id: string;
  url: string;
  title: string;
  siteName: string | null;
  minutes: number;
  savedAt: number;
  isRead: boolean;
}
