'use client';

// React
import { useCallback, useEffect, useState } from 'react';

// Icons
import { ChevronDown } from 'lucide-react';

// Components
import { Favicon } from '@/components/ui/media/Favicon';

// Utils
import { ask, getBridge, send } from '@/lib/bridge';

// Types
import type { BookmarkFolder } from '@shared/bookmark-folders';
import { colourOf } from '@shared/tab-groups';
import type { Bookmark } from '@shared/types';

/**
 * A row of the top-level saved things, under the toolbar.
 *
 * Only the top level is here. A bar that flattened the tree would put a
 * bookmark filed three folders deep beside one filed nowhere, and then the
 * folders would mean nothing — so a folder stays a folder, and opens as a menu.
 *
 * That menu is native, and not as a matter of taste: a WebContentsView paints
 * above the chrome's HTML, so a dropdown drawn here would open behind the page
 * and look like nothing happened at all.
 */
export function BookmarksBar() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);

  const reload = useCallback(() => {
    void ask((api) => api.bookmarks.list(), []).then(setBookmarks);
    void ask((api) => api.bookmarkFolders.list(), []).then(setFolders);
  }, []);

  useEffect(() => {
    reload();
    const api = getBridge();
    return api?.on.bookmarksChanged(reload);
  }, [reload]);

  const topFolders = folders.filter((folder) => folder.parentId === null);
  const loose = bookmarks.filter((bookmark) => bookmark.folderId === null);

  if (topFolders.length === 0 && loose.length === 0) {
    return null;
  }

  return (
    <div className="hide-scrollbar flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line px-2">
      {topFolders.map((folder) => (
        <button
          key={folder.id}
          type="button"
          onClick={(event) => {
            // Opened under the button, so the menu belongs to what was pressed.
            const box = event.currentTarget.getBoundingClientRect();
            send((api) => api.bookmarkFolders.openMenu(folder.id, Math.round(box.left), Math.round(box.bottom)));
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            send((api) => api.bookmarkFolders.openContextMenu(folder.id));
          }}
          className="flex h-6 shrink-0 items-center gap-1.5 rounded px-2 text-[11.5px] text-ink-dim transition-colors hover:bg-hover hover:text-ink"
        >
          <span className="size-2 shrink-0 rounded-[2px]" style={{ background: colourOf(folder.colour) }} />
          <span className="max-w-[16ch] truncate">{folder.name}</span>
          <ChevronDown size={10} className="shrink-0 opacity-60" />
        </button>
      ))}

      {topFolders.length > 0 && loose.length > 0 && <span className="mx-1 h-3.5 w-px shrink-0 bg-line" />}

      {loose.map((bookmark) => (
        <button
          key={bookmark.id}
          type="button"
          title={bookmark.url}
          onClick={() => send((api) => api.bookmarks.openInActiveTab(bookmark.url))}
          className="flex h-6 shrink-0 items-center gap-1.5 rounded px-2 text-[11.5px] text-ink-dim transition-colors hover:bg-hover hover:text-ink"
        >
          <Favicon dataUrl={null} seed={bookmark.url} size={12} />
          <span className="max-w-[18ch] truncate">{bookmark.title || bookmark.url}</span>
        </button>
      ))}
    </div>
  );
}
