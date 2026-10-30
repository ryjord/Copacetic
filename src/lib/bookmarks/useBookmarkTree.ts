'use client';

// Libs
import { useEffect, useState } from 'react';

// Utils
import { ask, getBridge } from '@/lib/bridge/bridge';

// Types
import type { BookmarkFolder } from '@shared/data/bookmark-folders';
import type { Bookmark } from '@shared/types';

/** Every bookmark and folder, fetched again whenever either changes anywhere in Copacetic. */
export function useBookmarkTree(): { bookmarks: Bookmark[]; folders: BookmarkFolder[] } {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);

  useEffect(() => {
    const reload = () => {
      void ask((api) => api.bookmarks.list(), []).then(setBookmarks);
      void ask((api) => api.bookmarkFolders.list(), []).then(setFolders);
    };
    reload();
    return getBridge()?.on.bookmarksChanged(reload);
  }, []);

  return { bookmarks, folders };
}
