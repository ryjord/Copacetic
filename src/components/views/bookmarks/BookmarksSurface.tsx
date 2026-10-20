'use client';

// Libs
import { useCallback, useEffect, useState } from 'react';

// Components
import { AddBookmarkForm } from '@/components/views/bookmarks/AddBookmarkForm';
import { Button } from '@/components/ui/Button/Button';
import { Checkbox } from '@/components/ui/Checkbox/Checkbox';
import { Menu } from '@/components/ui/Menu/Menu';
import { SegmentedControl } from '@/components/ui/SegmentedControl/SegmentedControl';
import { Select } from '@/components/ui/Select/Select';
import { SelectionBar } from '@/components/views/lists/SelectionBar';
import { BookmarkEditor } from '@/components/views/bookmarks/BookmarkEditor';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { Favicon } from '@/components/ui/Favicon/Favicon';
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { SearchField } from '@/components/ui/TextField/TextField';
import { DRAG_BOOKMARK, FolderTree, type FolderSelection } from '@/components/views/bookmarks/FolderTree';
import { SurfaceShell } from '@/components/shell/SurfaceShell/SurfaceShell';

// Icons
import { Bookmark as BookmarkIcon, Ellipsis, FolderOpen, Pencil, Plus, X } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask, getBridge, send } from '@/lib/bridge/bridge';
import { iconFor, useFavicons } from '@/lib/favicons';
import { t } from '@shared/i18n/translate';
import { useSelection } from '@/lib/state/useSelection';

// Types
import { type BookmarkFolder, countIn, pathOf } from '@shared/data/bookmark-folders';
import { colourOf } from '@shared/tabs/tab-groups';
import type { Bookmark } from '@shared/types';

/** Rows drawn at once. More than a screenful, far short of a freeze. */
const PAGE = 200;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type BookmarkSort = 'name' | 'added' | 'site';
type BookmarkFilter = 'all' | 'week' | 'duplicates';

const SORT_OPTIONS: readonly { id: BookmarkSort; label: string }[] = [
  { id: 'name', label: t('views.bookmarks.sort.name') },
  { id: 'added', label: t('views.bookmarks.sort.added') },
  { id: 'site', label: t('views.bookmarks.sort.site') },
];
const FILTER_OPTIONS: readonly { id: BookmarkFilter; label: string }[] = [
  { id: 'all', label: t('views.bookmarks.filters.all') },
  { id: 'week', label: t('views.bookmarks.filters.week') },
  { id: 'duplicates', label: t('views.bookmarks.filters.duplicates') },
];

const SORTERS: Record<BookmarkSort, (aBookmark: Bookmark, bBookmark: Bookmark) => number> = {
  name: (aBookmark, bBookmark) =>
    (aBookmark.title || aBookmark.url).localeCompare(bBookmark.title || bBookmark.url, undefined, {
      sensitivity: 'base',
    }),
  added: (aBookmark, bBookmark) => bBookmark.createdAt - aBookmark.createdAt,
  site: (aBookmark, bBookmark) => hostFor(aBookmark.url).localeCompare(hostFor(bBookmark.url)),
};

/** The same page saved more than once, ignoring the trailing slash and the fragment that only scroll it. */
function pageKey(url: string): string {
  return url.replace(/#.*$/, '').replace(/\/$/, '');
}

export function BookmarksSurface() {
  const activeTabId = useBrowserStore((state) => state.activeTabId);
  const setSurface = useBrowserStore((state) => state.setSurface);
  const tabs = useBrowserStore((state) => state.tabs);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [selection, setSelection] = useState<FolderSelection>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sort, setSort] = useState<BookmarkSort>('name');
  const [filter, setFilter] = useState<BookmarkFilter>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [transferMessage, setTransferMessage] = useState('');
  // Read once, so the filter does not need the clock on every render.
  const [openedAt] = useState(() => Date.now());

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

  const pageCounts = new Map<string, number>();
  bookmarks.forEach((bookmark) =>
    pageCounts.set(pageKey(bookmark.url), (pageCounts.get(pageKey(bookmark.url)) ?? 0) + 1),
  );
  const passesFilter = (bookmark: Bookmark) =>
    filter === 'week'
      ? openedAt - bookmark.createdAt < WEEK_MS
      : filter === 'duplicates'
        ? (pageCounts.get(pageKey(bookmark.url)) ?? 0) > 1
        : true;

  const matching = (
    searching
      ? bookmarks.filter((bookmark) => `${bookmark.title} ${bookmark.url}`.toLowerCase().includes(needle))
      : bookmarks.filter(inSelection)
  )
    .filter(passesFilter)
    // Duplicates side by side, whatever the chosen order, so each pair can be compared.
    .toSorted(
      filter === 'duplicates'
        ? (aBookmark, bBookmark) => pageKey(aBookmark.url).localeCompare(pageKey(bBookmark.url))
        : SORTERS[sort],
    );

  // The one list in the interface with no ceiling: history is paged and
  // downloads are capped, but bookmarks only ever grow.
  const visible = matching.slice(0, shown);
  const icons = useFavicons(visible.map((bookmark) => bookmark.url));
  const ticked = useSelection(visible.map((bookmark) => bookmark.id));

  const removeSelected = () => {
    const ids = ticked.selectedIds;
    send((api) => api.bookmarks.removeMany(ids));
    setBookmarks((current) => current.filter((item) => !ids.includes(item.id)));
    ticked.clear();
  };

  const openSelected = () => {
    const urls = visible.filter((bookmark) => ticked.isSelected(bookmark.id)).map((bookmark) => bookmark.url);
    // One after another, so the tabs open in the order they were listed.
    send((api) =>
      urls.reduce<Promise<unknown>>(
        (previous, url) => previous.then(() => api.tabs.create(url, false)),
        Promise.resolve(),
      ),
    );
    ticked.clear();
    setSurface('none');
  };

  const transfer = (action: Promise<string>) => {
    setTransferMessage('');
    void action.then((message) => {
      setTransferMessage(message);
      reload();
    });
  };

  const selected = selection.kind === 'folder' ? folders.find((folder) => folder.id === selection.id) : undefined;
  const counted = selected ? countIn(bookmarks, folders, selected.id) : null;

  return (
    <SurfaceShell
      title={t('views.bookmarks.title')}
      scrolls={false}
      actions={
        <>
          <SearchField value={query} onChange={setQuery} label={t('views.bookmarks.search')} className="w-64" />
          <Select label={t('views.bookmarks.sort.label')} options={SORT_OPTIONS} value={sort} onChange={setSort} />
          <Button size="sm" variant="primary" onClick={() => setIsAdding(true)}>
            <Plus size={14} />
            {t('views.bookmarks.add.action')}
          </Button>
          <Menu
            trigger={
              <IconButton label={t('views.bookmarks.transfer.label')}>
                <Ellipsis size={16} />
              </IconButton>
            }
            items={[
              {
                label: t('views.bookmarks.transfer.import'),
                onSelect: () => transfer(ask((api) => api.data.importBookmarks(), '')),
              },
              {
                label: t('views.bookmarks.transfer.export'),
                onSelect: () => transfer(ask((api) => api.data.export('bookmarks'), '')),
              },
            ]}
          />
        </>
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
                  ? t('views.bookmarks.savedCount', { count: counted.here })
                  : t('views.bookmarks.hereAndInside', { here: counted.here, total: counted.withDescendants })}
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
                  {t('views.bookmarks.openAsGroup', { count: counted.withDescendants })}
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-none flex-col gap-3 px-5 pt-4">
            <SegmentedControl
              label={t('views.bookmarks.filters.label')}
              options={FILTER_OPTIONS}
              value={filter}
              onChange={setFilter}
            />
            {transferMessage && (
              <p role="status" className="text-body-sm text-ink-dim">
                {transferMessage}
              </p>
            )}
            {isAdding && (
              <AddBookmarkForm
                folderId={selection.kind === 'folder' ? selection.id : null}
                onDone={(isSaved) => {
                  setIsAdding(false);
                  if (isSaved) {
                    reload();
                  }
                }}
              />
            )}
            {ticked.selectedIds.length > 0 && (
              <SelectionBar
                summary={t('views.bookmarks.selection.count', { count: ticked.selectedIds.length })}
                actions={[
                  { label: t('views.bookmarks.selection.openInTabs'), onSelect: openSelected },
                  { label: t('views.bookmarks.selection.remove'), onSelect: removeSelected, isDestructive: true },
                ]}
                clearLabel={t('views.bookmarks.selection.clear')}
                onClear={ticked.clear}
              />
            )}
          </div>

          <div className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <EmptyState
                icon={BookmarkIcon}
                title={searching ? t('views.bookmarks.noMatches') : t('views.bookmarks.empty')}
                hint={
                  searching
                    ? t('views.bookmarks.noMatchesHint')
                    : selection.kind === 'folder'
                      ? t('views.bookmarks.emptyFolderHint')
                      : t('views.bookmarks.emptyHint')
                }
              />
            ) : (
              <>
                <ul className="m-5 rounded-md bg-inset p-1">
                  {visible.map((bookmark) => {
                    const folder = bookmark.folderId
                      ? folders.find((candidate) => candidate.id === bookmark.folderId)
                      : undefined;

                    if (bookmark.id === editingId) {
                      return (
                        <li key={bookmark.id}>
                          <BookmarkEditor
                            bookmark={bookmark}
                            onDone={(isSaved) => {
                              setEditingId(null);
                              if (isSaved) {
                                reload();
                              }
                            }}
                          />
                        </li>
                      );
                    }

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
                        className="group flex h-[52px] items-center gap-3 rounded-field pl-3 pr-2 hover:bg-hover"
                      >
                        <Checkbox
                          checked={ticked.isSelected(bookmark.id)}
                          onChange={(isChecked) => ticked.toggle(bookmark.id, isChecked)}
                          label={t('views.bookmarks.select', {
                            name: bookmark.title || t('views.bookmarks.fallbackName'),
                          })}
                          isLabelHidden
                        />
                        <Favicon dataUrl={iconFor(icons, bookmark.url)} seed={bookmark.url} size={20} />
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
                          // A middle-click opens it behind, as it would on a link.
                          onAuxClick={(event) => {
                            if (event.button === 1) {
                              event.preventDefault();
                              send((api) => api.tabs.create(bookmark.url, false));
                            }
                          }}
                          className="flex min-w-0 flex-1 flex-col text-left"
                        >
                          <span className="truncate text-reading font-medium text-ink">
                            {bookmark.title || bookmark.url}
                          </span>
                          <span className="truncate text-body-sm text-ink-faint">{hostFor(bookmark.url)}</span>
                        </button>

                        {/* A search across folders says which folder each result is in. */}
                        {searching && (
                          <span className="flex shrink-0 items-center gap-1.5 text-body-sm text-ink-dim">
                            <span
                              className="size-1.5 rounded-full"
                              style={{ background: folder ? colourOf(folder.colour) : 'var(--color-line-strong)' }}
                            />
                            {folder?.name ?? t('views.bookmarks.unfiled')}
                          </span>
                        )}

                        <IconButton
                          label={t('views.bookmarks.more', {
                            name: bookmark.title || t('views.bookmarks.fallbackName'),
                          })}
                          size="sm"
                          className="opacity-40 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={() => send((api) => api.bookmarks.openContextMenu(bookmark.id))}
                        >
                          <Ellipsis size={14} />
                        </IconButton>
                        <IconButton
                          label={t('views.bookmarks.edit', {
                            name: bookmark.title || t('views.bookmarks.fallbackName'),
                          })}
                          size="sm"
                          className="opacity-40 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={() => setEditingId(bookmark.id)}
                        >
                          <Pencil size={14} />
                        </IconButton>
                        <IconButton
                          label={t('views.bookmarks.remove', {
                            name: bookmark.title || t('views.bookmarks.fallbackName'),
                          })}
                          size="sm"
                          className="opacity-40 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
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
                      ? t('views.bookmarks.total', { count: matching.length })
                      : t('views.bookmarks.showing', { shown: visible.length, total: matching.length })}
                  </p>
                  {visible.length < matching.length && (
                    <Button size="sm" onClick={() => setShown((current) => current + PAGE)}>
                      {t('views.bookmarks.showMore')}
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
