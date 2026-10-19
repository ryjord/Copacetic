'use client';

// Libs
import { useCallback, useEffect, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { Favicon } from '@/components/ui/Favicon/Favicon';
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { Menu } from '@/components/ui/Menu/Menu';
import { SearchField } from '@/components/ui/TextField/TextField';
import { SkeletonRows } from '@/components/ui/Skeleton/Skeleton';
import { SurfaceShell } from '@/components/shell/SurfaceShell/SurfaceShell';
import { ClearBrowsingDialog } from '@/components/views/clearing/ClearBrowsingDialog';

// Icons
import { History, X } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask, getBridge, send } from '@/lib/bridge/bridge';
import { CLEAR_RANGES } from '@/lib/text/clearing';
import { iconFor, useFavicons } from '@/lib/favicons';
import { formatDateHeading, formatTimeOfDay } from '@/lib/text/format';
import { t } from '@shared/i18n/translate';

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

  // An undo puts an entry back from outside this view, which has to ask again to show it.
  useEffect(() => getBridge()?.on.dataChanged((kind) => kind === 'history' && void refresh(query)), [query, refresh]);

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

  const summary =
    entries?.length === total
      ? t('views.history.pages', { total: total.toLocaleString() })
      : t('views.history.showing', { shown: entries?.length ?? 0, total });

  return (
    <SurfaceShell
      title={t('views.history.title')}
      actions={
        <>
          <SearchField value={query} onChange={setQuery} label={t('views.history.search')} className="w-64" />
          <Menu
            trigger={<Button size="sm">{t('views.history.clearMenu')}</Button>}
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
            title={query ? t('views.history.noMatches') : t('views.history.empty')}
            hint={query ? t('views.history.noMatchesHint') : t('views.history.emptyHint')}
          />
        ) : (
          <>
            {groupByDay(entries).map(([heading, items]) => (
              <section key={heading}>
                {/* Sticky without a z-index: a positioned heading already paints over the unpositioned rows. */}
                <h2 className="sticky top-0 bg-base px-1 pb-2 pt-5 text-body font-semibold text-ink-dim">
                  {heading}
                </h2>
                <ul className="rounded-md bg-inset p-1">
                  {items.map((entry) => (
                    <li
                      key={entry.id}
                      className="group flex h-[52px] items-center gap-3 rounded-field pl-3 pr-2 hover:bg-hover"
                      // Forgetting a whole site lives on its own menu, where someone is already looking at one.
                      onContextMenu={(event) => {
                        event.preventDefault();
                        send((api) => api.history.openContextMenu(entry.url));
                      }}
                    >
                      <span className="w-16 shrink-0 whitespace-nowrap text-body-sm text-ink-faint tabular-nums">
                        {formatTimeOfDay(entry.lastVisitedAt)}
                      </span>
                      <Favicon dataUrl={iconFor(icons, entry.url)} seed={entry.url} size={20} />
                      <button
                        type="button"
                        onClick={() => open(entry.url)}
                        title={entry.url}
                        className="flex min-w-0 flex-1 flex-col text-left"
                      >
                        <span className="truncate text-reading font-medium text-ink">{entry.title || entry.url}</span>
                        <span className="truncate text-body-sm text-ink-faint">{hostFor(entry.url)}</span>
                      </button>
                      <IconButton
                        label={t('views.history.remove', { name: entry.title || hostFor(entry.url) })}
                        size="sm"
                        className="opacity-40 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
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
                {totalBlocked > 0
                  ? t('views.history.withBlocked', { summary, blocked: totalBlocked.toLocaleString() })
                  : summary}
              </p>
              {entries.length < total && (
                <Button size="sm" onClick={loadMore} disabled={isLoadingMore}>
                  {isLoadingMore ? t('views.history.loading') : t('views.history.showMore')}
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {clearing && (
        <ClearBrowsingDialog
          key={clearing}
          range={clearing}
          open
          onOpenChange={(open) => !open && setClearing(null)}
          onConfirm={(choice) => {
            setClearing(null);
            void ask((api) => api.history.clear(clearing, choice), undefined).then(() => refresh(query));
          }}
        />
      )}
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
