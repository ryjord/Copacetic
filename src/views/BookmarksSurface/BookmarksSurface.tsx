'use client';

import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Bookmark } from '@shared/types';
import { Favicon } from '@/components/ui/media/Favicon';
import { IconButton } from '@/components/ui/controls/IconButton';
import { ask, send } from '@/lib/bridge';
import { formatRelativeTime } from '@/lib/format';
import { useBrowserStore } from '@/store/useBrowserStore';
import { EmptyState, SurfaceShell } from '@/views/SurfaceShell/SurfaceShell';

/** Rows drawn at once. More than a screenful, far short of a freeze. */
const PAGE = 200;

export function BookmarksSurface() {
  const activeTabId = useBrowserStore((state) => state.activeTabId);
  const setSurface = useBrowserStore((state) => state.setSurface);
  const tabs = useBrowserStore((state) => state.tabs);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);

  // Bookmarks also change from the toolbar star and the tab menu, so re-read
  // whenever the tab snapshot reports a different bookmarked set.
  const bookmarkSignature = tabs.map((tab) => `${tab.id}:${tab.isBookmarked}`).join('|');

  useEffect(() => {
    let cancelled = false;
    void ask((api) => api.bookmarks.list(), []).then((list) => {
      if (!cancelled) {
        setBookmarks(list);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bookmarkSignature]);

  const matching = query.trim()
    ? bookmarks.filter((bookmark) =>
        `${bookmark.title} ${bookmark.url}`.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : bookmarks;

  // The one list in the interface with no ceiling: history is paged and
  // downloads are capped, but bookmarks only ever grow. Rendering a few
  // hundred rows is fine; rendering ten thousand is a frozen surface.
  const visible = matching.slice(0, shown);

  return (
    <SurfaceShell
      title="Bookmarks"
      subtitle="Saved on this machine. Nothing is synced anywhere."
      actions={
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search bookmarks"
          aria-label="Search bookmarks"
          className="h-7 w-52 rounded-md border border-line bg-sunken px-2.5 text-[12px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
        />
      }
    >
      {visible.length === 0 ? (
        <EmptyState
          title={query ? 'Nothing matches that' : 'No bookmarks yet'}
          hint={query ? 'Try a different word.' : 'Press Cmd+D on a page to save it here.'}
        />
      ) : (
        <>
          <ul className="divide-y divide-line">
            {visible.map((bookmark) => (
              <li key={bookmark.id} className="group flex items-center gap-3 px-6 py-2.5 hover:bg-raised">
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
                <span className="shrink-0 text-[11px] text-ink-faint">{formatRelativeTime(bookmark.createdAt)}</span>
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
            ))}
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
        </>
      )}
    </SurfaceShell>
  );
}
