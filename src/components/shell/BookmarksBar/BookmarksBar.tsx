'use client';

// Libs
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Components
import { Favicon } from '@/components/ui/Favicon/Favicon';

// Icons
import { ChevronDown, ChevronsRight, Library } from 'lucide-react';

// Utils
import { ask, getBridge, send } from '@/lib/bridge/bridge';
import { iconFor, useFavicons } from '@/lib/favicons';
import { cn } from '@/lib/utils';
import { t } from '@shared/i18n/translate';

// Types
import type { BookmarkFolder } from '@shared/data/bookmark-folders';
import { colourOf } from '@shared/tabs/tab-groups';
import type { Bookmark } from '@shared/types';

const ITEM_CLASSES =
  'flex h-6 shrink-0 items-center gap-1.5 rounded-sm px-2 text-body-sm text-ink-dim transition-colors hover:bg-hover hover:text-ink';
const ICON_BUTTON_CLASSES =
  'grid size-6 shrink-0 place-items-center rounded-sm text-ink-dim transition-colors hover:bg-hover hover:text-ink';

/**
 * A row of the top-level saved things, under the toolbar.
 *
 * Only the top level is here. A bar that flattened the tree would put a
 * bookmark filed three folders deep beside one filed nowhere, and then the
 * folders would mean nothing - so a folder stays a folder, and opens as a menu.
 *
 * That menu is native, and not as a matter of taste: a WebContentsView paints
 * above the chrome's HTML, so a dropdown drawn here would open behind the page
 * and look like nothing happened at all. What does not fit goes in another,
 * behind », rather than past the edge where nothing can reach it.
 */
export function BookmarksBar() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const rowRef = useRef<HTMLDivElement>(null);
  // Every item is drawn, the hidden ones too, so each is measured where it would sit whatever fits.
  const [firstHidden, setFirstHidden] = useState<number | null>(null);

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
  const icons = useFavicons(loose.map((bookmark) => bookmark.url));
  const itemCount = topFolders.length + loose.length;
  // Which items, in which order: the same count can still be a different row.
  const itemIds = [...topFolders.map((folder) => folder.id), ...loose.map((bookmark) => bookmark.id)].join(' ');

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) {
      return;
    }
    const items = [...row.querySelectorAll<HTMLElement>('[data-bar-item]')];
    const measure = () => {
      const index = items.findIndex((item) => item.offsetLeft + item.offsetWidth > row.clientWidth);
      setFirstHidden(index === -1 ? null : index);
    };
    measure();
    // Each item too, so a renamed bookmark or a folder's new name is measured again.
    const resizes = new ResizeObserver(measure);
    [row, ...items].forEach((element) => resizes.observe(element));
    return () => resizes.disconnect();
  }, [itemIds]);

  if (itemCount === 0) {
    return null;
  }

  const isHidden = (position: number) => firstHidden !== null && position >= firstHidden;
  // Out of sight and out of reach, so Tab cannot land on a button nobody can see.
  const reachable = (position: number) => (isHidden(position) ? { 'aria-hidden': true, tabIndex: -1 } : {});
  const hiddenFolders = topFolders.filter((_folder, position) => isHidden(position));
  const hiddenBookmarks = loose.filter((_bookmark, position) => isHidden(topFolders.length + position));
  const hiddenCount = hiddenFolders.length + hiddenBookmarks.length;

  return (
    <div
      role="toolbar"
      aria-label={t('shell.bookmarksBar.label')}
      className="flex h-8 shrink-0 items-center gap-0.5 border-b border-line px-2"
    >
      <button
        type="button"
        title={t('shell.bookmarksBar.all')}
        aria-label={t('shell.bookmarksBar.all')}
        onClick={() => send((api) => api.chrome.showPage('bookmarks'))}
        className={ICON_BUTTON_CLASSES}
      >
        <Library size={14} strokeWidth={1.75} />
      </button>
      <span className="mx-1 h-3.5 w-px shrink-0 bg-line" />

      <div ref={rowRef} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
        {topFolders.map((folder, position) => (
          <button
            key={folder.id}
            data-bar-item
            {...reachable(position)}
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
            className={cn(ITEM_CLASSES, isHidden(position) && 'invisible')}
          >
            <span className="size-2 shrink-0 rounded-xs" style={{ background: colourOf(folder.colour) }} />
            <span className="max-w-[16ch] truncate">{folder.name}</span>
            <ChevronDown size={10} className="shrink-0 opacity-60" />
          </button>
        ))}

        {topFolders.length > 0 && loose.length > 0 && <span className="mx-1 h-3.5 w-px shrink-0 bg-line" />}

        {loose.map((bookmark, position) => (
          <button
            key={bookmark.id}
            data-bar-item
            {...reachable(topFolders.length + position)}
            type="button"
            title={bookmark.url}
            onClick={(event) => {
              // Cmd or Ctrl, as on a link: a tab behind this one, so the page in front stays.
              if (event.metaKey || event.ctrlKey) {
                send((api) => api.tabs.create(bookmark.url, false));
                return;
              }
              send((api) => api.bookmarks.openInActiveTab(bookmark.url));
            }}
            onAuxClick={(event) => {
              if (event.button === 1) {
                send((api) => api.tabs.create(bookmark.url, false));
              }
            }}
            className={cn(ITEM_CLASSES, isHidden(topFolders.length + position) && 'invisible')}
          >
            <Favicon dataUrl={iconFor(icons, bookmark.url)} seed={bookmark.url} size={12} />
            <span className="max-w-[18ch] truncate">{bookmark.title || bookmark.url}</span>
          </button>
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          type="button"
          title={t('shell.bookmarksBar.more', { count: hiddenCount })}
          aria-label={t('shell.bookmarksBar.more', { count: hiddenCount })}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            send((api) =>
              api.bookmarks.openOverflowMenu(
                hiddenFolders.map((folder) => folder.id),
                hiddenBookmarks.map((bookmark) => bookmark.id),
                Math.round(box.left),
                Math.round(box.bottom),
              ),
            );
          }}
          className={ICON_BUTTON_CLASSES}
        >
          <ChevronsRight size={14} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
