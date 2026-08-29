'use client';

// React
import { useCallback, useEffect, useState } from 'react';

// Icons
import { FolderOpen, Trash2 } from 'lucide-react';

// Components
import { Favicon } from '@/components/ui/media/Favicon';
import { IconButton } from '@/components/ui/controls/IconButton';
import { DRAG_BOOKMARK, FolderTree, type FolderSelection } from '@/views/BookmarksSurface/FolderTree';
import { EmptyState, SurfaceShell } from '@/views/SurfaceShell/SurfaceShell';

// Utils
import { ask, send } from '@/lib/bridge';
import { formatRelativeTime } from '@/lib/format';
import { useBrowserStore } from '@/store/useBrowserStore';

// Types
import { type BookmarkFolder, countIn, pathOf } from '@shared/bookmark-folders';
import { colourOf } from '@shared/tab-groups';
import type { Bookmark } from '@shared/types';

/** Rows drawn at once. More than a screenful, far short of a freeze. */
const PAGE = 200;

export function BookmarksSurface() {
  const activeTabId = useBrowserStore((state) => state.activeTabId);
  const setSurface = useBrowserStore((state) => state.setSurface);
  const tabs = useBrowserStore((state) => state.tabs);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [selection, setSelection] = useState<FolderSelection>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);

  // Bookmarks also change from the toolbar star and the tab menu, so re-read
  // whenever the tab snapshot reports a different bookmarked set.
  const bookmarkSignature = tabs.map((tab) => `${tab.id}:${tab.isBookmarked}`).join('|');

  const reload = useCallback(() => {
    void ask((api) => api.bookmarks.list(), []).then(setBookmarks);
    void ask((api) => api.bookmarkFolders.list(), []).then(setFolders);
  }, []);

  useEffect(() => {
    reload();
  }, [reload, bookmarkSignature]);

  const searching = query.trim().length > 0;
  const needle = query.trim().toLowerCase();

  // Searching crosses every folder, because a search confined to the folder
  // someone happens to have selected would answer a question nobody asked.
  const inSelection = (bookmark: Bookmark) => {
    if (selection.kind === 'all') {
      return true;
    }
    if (selection.kind === 'unfiled') {
      return bookmark.folderId === null;
    }
    return bookmark.folderId === selection.id;
  };

  const matching = searching
    ? bookmarks.filter((bookmark) => `${bookmark.title} ${bookmark.url}`.toLowerCase().includes(needle))
    : bookmarks.filter(inSelection);

  // The one list in the interface with no ceiling: history is paged and
  // downloads are capped, but bookmarks only ever grow.
  const visible = matching.slice(0, shown);

  const selected = selection.kind === 'folder' ? folders.find((folder) => folder.id === selection.id) : undefined;
  const counted = selected ? countIn(bookmarks, folders, selected.id) : null;

  return (
    <SurfaceShell
      title="Bookmarks"
      subtitle="Saved on this machine. Nothing is synced anywhere."
      actions={
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search every folder"
          aria-label="Search bookmarks"
          className="h-7 w-52 rounded-md border border-line bg-sunken px-2.5 text-[12px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
        />
      }
    >
      <div className="flex min-h-0 flex-1">
        <FolderTree
          folders={folders}
          bookmarks={bookmarks}
          selection={selection}
          onSelect={(next) => {
            setSelection(next);
            setShown(PAGE);
          }}
          onChanged={reload}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {selected && counted && !searching && (
            <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line px-5">
              <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: colourOf(selected.colour) }} />
              <span className="truncate text-[13.5px] text-ink">
                {pathOf(folders, selected.id)
                  .map((entry) => entry.name)
                  .join(' / ')}
              </span>
              {/* A tree makes every count ambiguous, so both numbers are said. */}
              <span className="shrink-0 font-mono text-[11px] text-ink-faint">
                {counted.here === counted.withDescendants
                  ? `${counted.here} saved`
                  : `${counted.here} here · ${counted.withDescendants} with folders inside`}
              </span>
              <div className="flex-1" />
              {counted.withDescendants > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    send((api) => api.bookmarkFolders.openAsGroup(selected.id));
                    setSurface('none');
                  }}
                  // Names the number it is about to act on: 31 tabs is not what
                  // someone expecting 18 wants.
                  className="flex h-7 shrink-0 items-center gap-1.5 rounded-field border border-line px-2.5 text-[11.5px] text-ink-dim transition-colors hover:bg-raised hover:text-ink"
                >
                  <FolderOpen size={12} />
                  Open all {counted.withDescendants} as a tab group
                </button>
              )}
            </div>
          )}

          {visible.length === 0 ? (
            <EmptyState
              title={searching ? 'Nothing matches that' : 'Nothing filed here'}
              hint={
                searching
                  ? 'Try a different word.'
                  : selection.kind === 'folder'
                    ? 'Drag a bookmark onto this folder to file it here.'
                    : 'Press Cmd+D on a page to save it here.'
              }
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ul className="divide-y divide-line">
                {visible.map((bookmark) => {
                  const folder = bookmark.folderId
                    ? folders.find((candidate) => candidate.id === bookmark.folderId)
                    : undefined;

                  return (
                    <li
                      key={bookmark.id}
                      draggable
                      onDragStart={(event) => event.dataTransfer.setData(DRAG_BOOKMARK, bookmark.id)}
                      className="group flex items-center gap-3 px-5 py-2.5 hover:bg-raised"
                    >
                      <Favicon dataUrl={null} seed={bookmark.url} size={16} />
                      <button
                        type="button"
                        onClick={() => {
                          if (!activeTabId) {
                            return;
                          }
                          send((api) => api.tabs.navigate(activeTabId, bookmark.url));
                          setSurface('none');
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-[12.5px] text-ink">{bookmark.title}</span>
                        <span className="block truncate font-mono text-[11px] text-ink-faint">{bookmark.url}</span>
                      </button>

                      {/* A search that crossed folders and then hid which one a
                          result came from would be a lie about where it is. */}
                      {searching && (
                        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-ink-faint">
                          <span
                            className="size-1.5 rounded-[2px]"
                            style={{ background: folder ? colourOf(folder.colour) : 'var(--color-line-strong)' }}
                          />
                          {folder?.name ?? 'Unfiled'}
                        </span>
                      )}

                      <span className="shrink-0 text-[11px] text-ink-faint">
                        {formatRelativeTime(bookmark.createdAt)}
                      </span>
                      <IconButton
                        label="Remove bookmark"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => {
                          send((api) => api.bookmarks.remove(bookmark.id));
                          setBookmarks((current) => current.filter((item) => item.id !== bookmark.id));
                        }}
                      >
                        <Trash2 size={13} />
                      </IconButton>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-col items-center gap-2 px-6 py-4">
                <p className="text-[11.5px] text-ink-faint">
                  {visible.length === matching.length
                    ? `${matching.length} ${matching.length === 1 ? 'bookmark' : 'bookmarks'}`
                    : `Showing ${visible.length} of ${matching.length}`}
                </p>
                {visible.length < matching.length && (
                  <button
                    type="button"
                    onClick={() => setShown((current) => current + PAGE)}
                    className="rounded-field border border-line px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:bg-raised hover:text-ink"
                  >
                    Show more
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </SurfaceShell>
  );
}
