'use client';

// React
import { useCallback, useEffect, useState } from 'react';

// Icons
import { Bookmark as BookmarkIcon, FolderOpen, X } from 'lucide-react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { Favicon } from '@/components/ui/Favicon/Favicon';
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { SearchField } from '@/components/ui/TextField/TextField';
import { DRAG_BOOKMARK, FolderTree, type FolderSelection } from '@/components/views/bookmarks/FolderTree';
import { SurfaceShell } from '@/components/shell/SurfaceShell/SurfaceShell';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask, getBridge, send } from '@/lib/bridge';
import { iconFor, useFavicons } from '@/lib/favicons';

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

  // Filing a bookmark or recolouring a folder changes no tab, so the tab
  // snapshot above says nothing about it: without this the tree is only ever
  // as fresh as the last unrelated thing that happened to a tab.
  useEffect(() => {
    const api = getBridge();
    return api?.on.bookmarksChanged(reload);
  }, [reload]);

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
  const icons = useFavicons(visible.map((bookmark) => bookmark.url));

  const selected = selection.kind === 'folder' ? folders.find((folder) => folder.id === selection.id) : undefined;
  const counted = selected ? countIn(bookmarks, folders, selected.id) : null;

  return (
    <SurfaceShell
      title="Bookmarks"
      scrolls={false}
      actions={<SearchField value={query} onChange={setQuery} label="Search bookmarks" className="w-64" />}
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
            <div className="flex h-12 flex-none items-center gap-3 border-b border-line px-5">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: colourOf(selected.colour) }} />
              <span className="truncate text-body font-medium text-ink">
                {pathOf(folders, selected.id)
                  .map((entry) => entry.name)
                  .join(' / ')}
              </span>
              {/* A tree makes every count ambiguous, so both numbers are said. */}
              <span className="shrink-0 text-body-sm text-ink-faint tabular-nums">
                {counted.here === counted.withDescendants
                  ? `${counted.here} saved`
                  : `${counted.here} here, ${counted.withDescendants} including folders inside`}
              </span>
              <div className="flex-1" />
              {counted.withDescendants > 0 && (
                // Names the number it is about to open: 31 tabs is not what someone expecting 18 wants.
                <Button
                  size="sm"
                  onClick={() => {
                    send((api) => api.bookmarkFolders.openAsGroup(selected.id));
                    setSurface('none');
                  }}
                >
                  <FolderOpen size={14} />
                  Open {counted.withDescendants} as a tab group
                </Button>
              )}
            </div>
          )}

          <div className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <EmptyState
                icon={BookmarkIcon}
                title={searching ? 'Nothing matches' : 'No bookmarks here'}
                hint={
                  searching
                    ? 'Search covers every folder. Try another word.'
                    : selection.kind === 'folder'
                      ? 'Drag a bookmark onto this folder to file it here.'
                      : 'Press the star in the address bar to save a page.'
                }
              />
            ) : (
              <>
                <ul className="p-2">
                  {visible.map((bookmark) => {
                    const folder = bookmark.folderId
                      ? folders.find((candidate) => candidate.id === bookmark.folderId)
                      : undefined;

                    return (
                      <li
                        key={bookmark.id}
                        draggable
                        onDragStart={(event) => event.dataTransfer.setData(DRAG_BOOKMARK, bookmark.id)}
                        // The menu lists every folder, so filing works without dragging too.
                        onContextMenu={(event) => {
                          event.preventDefault();
                          send((api) => api.bookmarks.openContextMenu(bookmark.id));
                        }}
                        className="group flex h-10 items-center gap-3 rounded-sm px-3 hover:bg-hover"
                      >
                        <Favicon dataUrl={iconFor(icons, bookmark.url)} seed={bookmark.url} size={16} />
                        <button
                          type="button"
                          title={bookmark.url}
                          onClick={() => {
                            if (!activeTabId) {
                              return;
                            }
                            send((api) => api.tabs.navigate(activeTabId, bookmark.url));
                            setSurface('none');
                          }}
                          className="min-w-0 flex-1 truncate text-left text-body text-ink"
                        >
                          {bookmark.title || bookmark.url}
                        </button>

                        {/* A search across folders says which folder each result is in. */}
                        {searching && (
                          <span className="flex shrink-0 items-center gap-1.5 text-body-sm text-ink-dim">
                            <span
                              className="size-1.5 rounded-full"
                              style={{ background: folder ? colourOf(folder.colour) : 'var(--color-line-strong)' }}
                            />
                            {folder?.name ?? 'Unfiled'}
                          </span>
                        )}

                        <span className="hidden max-w-[30%] shrink-0 truncate text-body-sm text-ink-dim sm:block">
                          {hostFor(bookmark.url)}
                        </span>
                        <IconButton
                          label={`Remove ${bookmark.title || 'bookmark'}`}
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={() => {
                            send((api) => api.bookmarks.remove(bookmark.id));
                            setBookmarks((current) => current.filter((item) => item.id !== bookmark.id));
                          }}
                        >
                          <X size={14} />
                        </IconButton>
                      </li>
                    );
                  })}
                </ul>

                <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-2">
                  <p className="text-body-sm text-ink-faint tabular-nums">
                    {visible.length === matching.length
                      ? `${matching.length} ${matching.length === 1 ? 'bookmark' : 'bookmarks'}`
                      : `Showing ${visible.length} of ${matching.length}`}
                  </p>
                  {visible.length < matching.length && (
                    <Button size="sm" onClick={() => setShown((current) => current + PAGE)}>
                      Show more
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </SurfaceShell>
  );
}

function hostFor(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
