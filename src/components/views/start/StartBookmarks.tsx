'use client';

// Libs
import { useState } from 'react';

// Components
import { Favicon } from '@/components/ui/Favicon/Favicon';

// Icons
import { ChevronRight, Folder } from 'lucide-react';

// Utils
import { useBookmarkTree } from '@/lib/bookmarks/useBookmarkTree';
import { send } from '@/lib/bridge/bridge';
import { iconFor, useFavicons } from '@/lib/favicons';
import { cn } from '@/lib/utils';
import { childrenOf, pathOf } from '@shared/data/bookmark-folders';
import { t } from '@shared/i18n/translate';

// Enough to start from at a glance; the rest is one click away rather than cut off.
const SHOWN_AT_ONCE = 16;

const CHIP_CLASSES =
  'flex max-w-44 items-center gap-2 rounded-full bg-raised/70 px-3 py-1.5 text-body-sm text-ink-dim transition-colors hover:bg-raised hover:text-ink';
const CRUMB_CLASSES = 'rounded-sm px-1 text-body-sm text-ink-dim transition-colors hover:text-ink';
const DROP_LINE_CLASSES = {
  before: 'before:absolute before:-left-1 before:inset-y-1 before:w-0.5 before:rounded-full before:bg-accent',
  after: 'after:absolute after:-right-1 after:inset-y-1 after:w-0.5 after:rounded-full after:bg-accent',
};

type ChipKind = 'folder' | 'bookmark';

/**
 * Your bookmarks filed as you filed them: a folder opens in place, with the way
 * back above it, so nothing saved is out of reach from the start page.
 */
export function StartBookmarks({ tabId }: { tabId: string }) {
  const { bookmarks, folders } = useBookmarkTree();
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [isShowingAll, setIsShowingAll] = useState(false);
  const [dragging, setDragging] = useState<{ kind: ChipKind; id: string } | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; isAfter: boolean } | null>(null);

  // A folder deleted while it was open falls back to the top rather than to an empty nowhere.
  const currentId = folders.some((folder) => folder.id === openFolderId) ? openFolderId : null;
  const path = currentId === null ? [] : pathOf(folders, currentId);
  const childFolders = childrenOf(folders, currentId);
  const childBookmarks = bookmarks.filter((bookmark) => bookmark.folderId === currentId);
  const total = childFolders.length + childBookmarks.length;
  const limit = isShowingAll ? total : SHOWN_AT_ONCE;
  const shownFolders = childFolders.slice(0, limit);
  const shownBookmarks = childBookmarks.slice(0, Math.max(0, limit - shownFolders.length));
  const icons = useFavicons(shownBookmarks.map((bookmark) => bookmark.url));

  const open = (folderId: string | null) => {
    setOpenFolderId(folderId);
    setIsShowingAll(false);
  };

  const endDrag = () => {
    setDragging(null);
    setDropAt(null);
  };

  // A chip moves among its own kind in this folder: before the one it is dropped on, or after it on its right half.
  const reorderable = (kind: ChipKind, id: string) => {
    const siblings = kind === 'folder' ? childFolders : childBookmarks;
    const canDrop = dragging !== null && dragging.kind === kind && dragging.id !== id;
    const isRightHalf = (event: React.DragEvent<HTMLElement>) => {
      const box = event.currentTarget.getBoundingClientRect();
      return event.clientX > box.left + box.width / 2;
    };
    return {
      draggable: true,
      onDragStart: () => setDragging({ kind, id }),
      onDragEnd: endDrag,
      onDragOver: (event: React.DragEvent<HTMLElement>) => {
        if (!canDrop) {
          return;
        }
        event.preventDefault();
        setDropAt({ id, isAfter: isRightHalf(event) });
      },
      onDrop: (event: React.DragEvent<HTMLElement>) => {
        if (!canDrop || !dragging) {
          return;
        }
        event.preventDefault();
        const index = siblings.findIndex((sibling) => sibling.id === id);
        const beforeId = isRightHalf(event) ? (siblings[index + 1]?.id ?? null) : id;
        const movingId = dragging.id;
        send((api) =>
          kind === 'folder'
            ? api.bookmarkFolders.reorder(movingId, beforeId)
            : api.bookmarks.reorder(movingId, beforeId),
        );
        endDrag();
      },
      className: cn(
        'relative',
        dropAt?.id === id && (dropAt.isAfter ? DROP_LINE_CLASSES.after : DROP_LINE_CLASSES.before),
      ),
    };
  };

  if (bookmarks.length === 0 && folders.length === 0) {
    return <p className="text-body text-ink-dim">{t('views.start.bookmarks.empty')}</p>;
  }

  return (
    <div className="flex w-full flex-col gap-2.5">
      {path.length > 0 && (
        <nav aria-label={t('views.start.bookmarks.path')} className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={() => open(null)} className={CRUMB_CLASSES}>
            {t('views.start.bookmarks.top')}
          </button>
          {path.map((folder, index) => (
            <span key={folder.id} className="flex items-center gap-1">
              <ChevronRight size={12} className="text-ink-faint" aria-hidden />
              {index === path.length - 1 ? (
                <span aria-current="location" className="px-1 text-body-sm text-ink">
                  {folder.name}
                </span>
              ) : (
                <button type="button" onClick={() => open(folder.id)} className={CRUMB_CLASSES}>
                  {folder.name}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}
      {total === 0 ? (
        <p className="text-body-sm text-ink-dim">{t('views.start.bookmarks.emptyFolder')}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {shownFolders.map((folder) => (
            <li key={folder.id} {...reorderable('folder', folder.id)}>
              <button type="button" onClick={() => open(folder.id)} className={CHIP_CLASSES}>
                <Folder size={14} className="shrink-0" aria-hidden />
                <span className="truncate">{folder.name}</span>
              </button>
            </li>
          ))}
          {shownBookmarks.map((bookmark) => (
            <li key={bookmark.id} {...reorderable('bookmark', bookmark.id)}>
              <button
                type="button"
                onClick={() => send((api) => api.tabs.navigate(tabId, bookmark.url))}
                title={bookmark.url}
                className={CHIP_CLASSES}
              >
                <Favicon dataUrl={iconFor(icons, bookmark.url)} seed={bookmark.url} size={14} />
                <span className="truncate">{bookmark.title || bookmark.url}</span>
              </button>
            </li>
          ))}
          {total > SHOWN_AT_ONCE && (
            <li>
              <button
                type="button"
                onClick={() => setIsShowingAll((isShowing) => !isShowing)}
                className={CHIP_CLASSES}
              >
                {isShowingAll
                  ? t('views.start.bookmarks.showFewer')
                  : t('views.start.bookmarks.showAll', { count: total })}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
