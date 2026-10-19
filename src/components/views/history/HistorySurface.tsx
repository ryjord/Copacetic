'use client';

// Libs
import { useCallback, useEffect, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { Favicon } from '@/components/ui/Favicon/Favicon';
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { Menu } from '@/components/ui/Menu/Menu';
import { SearchField } from '@/components/ui/TextField/TextField';
import { SkeletonRows } from '@/components/ui/Skeleton/Skeleton';
import { SurfaceShell } from '@/components/shell/SurfaceShell/SurfaceShell';

// Icons
import { History, X } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask, send } from '@/lib/bridge';
import { CLEAR_RANGES, WHAT_CLEARING_REMOVES, clearTitle } from '@/lib/clearing';
import { iconFor, useFavicons } from '@/lib/favicons';
import { formatDateHeading, formatTimeOfDay } from '@/lib/format';

// Types
import type { ClearRange, HistoryEntry, HistoryPage } from '@shared/types';

const EMPTY_PAGE: HistoryPage = { entries: [], total: 0 };

export function HistorySurface() {
  const activeTabId = useBrowserStore((state) => state.activeTabId);
  const setSurface = useBrowserStore((state) => state.setSurface);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalBlocked, setTotalBlocked] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [clearing, setClearing] = useState<ClearRange | null>(null);
  const icons = useFavicons(entries?.map((entry) => entry.url) ?? []);

  const refresh = useCallback(async (search: string) => {
    const page = await ask((api) => api.history.list(search), EMPTY_PAGE);
    setEntries(page.entries);
    setTotal(page.total);
    // Asked of the whole of history rather than summed from one screenful.
    setTotalBlocked(await ask((api) => api.history.totalBlocked(), 0));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(query), 120);
    return () => clearTimeout(timer);
  }, [query, refresh]);

  // Paged, so a search can reach a match past the first screenful and the surface stays quick.
  const loadMore = () => {
    setIsLoadingMore(true);
    void ask((api) => api.history.list(query, entries?.length ?? 0), EMPTY_PAGE)
      .then((page) => {
        setEntries((current) => [...(current ?? []), ...page.entries]);
        setTotal(page.total);
      })
      .finally(() => setIsLoadingMore(false));
  };

  const open = (url: string) => {
    if (!activeTabId) {
      return;
    }
    send((api) => api.tabs.navigate(activeTabId, url));
    setSurface('none');
  };

  const remove = (id: string) => {
    send((api) => api.history.remove(id));
    setEntries((current) => current?.filter((item) => item.id !== id) ?? null);
    setTotal((count) => Math.max(0, count - 1));
  };

  return (
    <SurfaceShell
      title="History"
      actions={
        <>
          <SearchField value={query} onChange={setQuery} label="Search history" className="w-64" />
          <Menu
            trigger={<Button size="sm">Clear browsing data…</Button>}
            items={CLEAR_RANGES.map((range) => ({
              label: range.label,
              isDestructive: range.id === 'all',
              onSelect: () => setClearing(range.id),
            }))}
          />
        </>
      }
    >
      <div className="mx-auto w-full max-w-220 px-4 pb-8">
        {entries === null ? (
          <SkeletonRows count={10} className="pt-6" />
        ) : entries.length === 0 ? (
          <EmptyState
            icon={History}
            title={query ? 'Nothing matches' : 'No history yet'}
            hint={query ? 'Try another word, or part of an address.' : 'Pages you visit appear here for 90 days.'}
          />
        ) : (
          <>
            {groupByDay(entries).map(([heading, items]) => (
              <section key={heading}>
                {/* Sticky without a z-index: a positioned heading already paints over the unpositioned rows. */}
                <h2 className="label sticky top-0 bg-base px-3 pb-1.5 pt-5">{heading}</h2>
                <ul>
                  {items.map((entry) => (
                    <li
                      key={entry.id}
                      className="group flex h-9 items-center gap-3 rounded-sm px-3 hover:bg-hover"
                      // Forgetting a whole site lives on its own menu, where someone is already looking at one.
                      onContextMenu={(event) => {
                        event.preventDefault();
                        send((api) => api.history.openContextMenu(entry.url));
                      }}
                    >
                      <Favicon dataUrl={iconFor(icons, entry.url)} seed={entry.url} size={16} />
                      <button
                        type="button"
                        onClick={() => open(entry.url)}
                        title={entry.url}
                        className="min-w-0 flex-1 truncate text-left text-body text-ink"
                      >
                        {entry.title || entry.url}
                      </button>
                      <span className="hidden max-w-[30%] shrink-0 truncate text-body-sm text-ink-dim sm:block">
                        {hostFor(entry.url)}
                      </span>
                      <span className="w-12 shrink-0 text-right text-body-sm text-ink-faint tabular-nums">
                        {formatTimeOfDay(entry.lastVisitedAt)}
                      </span>
                      <IconButton
                        label={`Remove ${entry.title || hostFor(entry.url)} from history`}
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => remove(entry.id)}
                      >
                        <X size={14} />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <div className="flex flex-col items-center gap-3 pt-6">
              <p className="text-body-sm text-ink-faint tabular-nums">
                {entries.length === total
                  ? `${total.toLocaleString()} pages`
                  : `Showing ${entries.length} of ${total}`}
                {totalBlocked > 0 && ` · ${totalBlocked.toLocaleString()} requests blocked`}
              </p>
              {entries.length < total && (
                <Button size="sm" onClick={loadMore} disabled={isLoadingMore}>
                  {isLoadingMore ? 'Loading…' : 'Show more'}
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={clearing !== null}
        onOpenChange={(open) => !open && setClearing(null)}
        title={clearing ? clearTitle(clearing) : ''}
        confirmLabel="Clear"
        isDestructive
        onConfirm={() => {
          const range = clearing;
          setClearing(null);
          if (range) {
            void ask((api) => api.history.clear(range), undefined).then(() => refresh(query));
          }
        }}
      >
        {clearing && WHAT_CLEARING_REMOVES[clearing]} Open tabs stay open.
      </ConfirmDialog>
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

function groupByDay(entries: HistoryEntry[]): [string, HistoryEntry[]][] {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const heading = formatDateHeading(entry.lastVisitedAt);
    groups.set(heading, [...(groups.get(heading) ?? []), entry]);
  }
  return [...groups.entries()];
}
