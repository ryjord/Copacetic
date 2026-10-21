'use client';

// Libs
import { useCallback, useEffect, useRef, useState } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { Checkbox } from '@/components/ui/Checkbox/Checkbox';
import { SegmentedControl } from '@/components/ui/SegmentedControl/SegmentedControl';
import { Select } from '@/components/ui/Select/Select';
import { SelectionBar } from '@/components/views/lists/SelectionBar';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { Favicon } from '@/components/ui/Favicon/Favicon';
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { Menu } from '@/components/ui/Menu/Menu';
import { SearchField } from '@/components/ui/TextField/TextField';
import { SkeletonRows } from '@/components/ui/Skeleton/Skeleton';
import { PageShell } from '@/components/shell/PageShell/PageShell';
import { ClearBrowsingDialog } from '@/components/views/clearing/ClearBrowsingDialog';

// Icons
import { Ellipsis, History, X } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { ask, getBridge, send } from '@/lib/bridge/bridge';
import { CLEAR_RANGES } from '@/lib/text/clearing';
import { iconFor, useFavicons } from '@/lib/favicons';
import { formatDateHeading, formatTimeOfDay } from '@/lib/text/format';
import { t } from '@shared/i18n/translate';
import { useSelection } from '@/lib/state/useSelection';

// Types
import type { ClearRange, HistoryEntry, HistoryFilter, HistoryOrder, HistoryPage, HistoryRange } from '@shared/types';

const EMPTY_PAGE: HistoryPage = { entries: [], total: 0 };

const RANGE_OPTIONS: readonly { id: HistoryRange; label: string }[] = [
  { id: 'all', label: t('views.history.ranges.all') },
  { id: 'today', label: t('views.history.ranges.today') },
  { id: 'yesterday', label: t('views.history.ranges.yesterday') },
  { id: 'week', label: t('views.history.ranges.week') },
  { id: 'month', label: t('views.history.ranges.month') },
];
const ORDER_OPTIONS: readonly { id: HistoryOrder; label: string }[] = [
  { id: 'recent', label: t('views.history.order.recent') },
  { id: 'visits', label: t('views.history.order.visits') },
];

export function HistoryPage() {
  const activeTabId = useBrowserStore((state) => state.activeTabId);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalBlocked, setTotalBlocked] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [clearing, setClearing] = useState<ClearRange | null>(null);
  const [filter, setFilter] = useState<HistoryFilter>({ range: 'all', order: 'recent' });
  const [isGroupedBySite, setIsGroupedBySite] = useState(false);
  const icons = useFavicons(entries?.map((entry) => entry.url) ?? []);
  const selection = useSelection(entries?.map((entry) => entry.id) ?? []);

  // Bumped by every newer question, so an answer to an older one is dropped rather than shown over it.
  const generation = useRef(0);
  const shownCount = entries?.length ?? 0;

  /** Asks again, for at least as many rows as asked for, so a change does not snap the list back to its first page. */
  const refresh = useCallback(async (search: string, shown: HistoryFilter, rows: number) => {
    generation.current += 1;
    const request = generation.current;
    let page = await ask((api) => api.history.list(search, 0, shown), EMPTY_PAGE);
    let collected = page.entries;
    while (collected.length < rows && page.entries.length > 0 && collected.length < page.total) {
      const offset = collected.length;
      page = await ask((api) => api.history.list(search, offset, shown), EMPTY_PAGE);
      collected = [...collected, ...page.entries];
    }
    // Asked of the whole of history rather than summed from one screenful.
    const blocked = await ask((api) => api.history.totalBlocked(), 0);
    if (request !== generation.current) {
      return;
    }
    setEntries(collected);
    setTotal(page.total);
    setTotalBlocked(blocked);
  }, []);

  useEffect(() => {
    // A page still loading for the old search would land after the new one.
    generation.current += 1;
    const timer = setTimeout(() => void refresh(query, filter, 0), 120);
    return () => clearTimeout(timer);
  }, [query, filter, refresh]);

  // An undo puts an entry back from outside this view, which has to ask again to show it.
  useEffect(
    () => getBridge()?.on.dataChanged((kind) => kind === 'history' && void refresh(query, filter, shownCount)),
    [query, filter, refresh, shownCount],
  );

  // Paged, so a search can reach a match past the first screenful and the surface stays quick.
  const loadMore = () => {
    const request = generation.current;
    setIsLoadingMore(true);
    void ask((api) => api.history.list(query, shownCount, filter), EMPTY_PAGE)
      .then((page) => {
        if (request !== generation.current) {
          return;
        }
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
  };

  const remove = (id: string) => {
    send((api) => api.history.remove(id));
    setEntries((current) => current?.filter((item) => item.id !== id) ?? null);
    setTotal((count) => Math.max(0, count - 1));
  };

  const removeSelected = () => {
    const ids = selection.selectedIds;
    send((api) => api.history.removeMany(ids));
    setEntries((current) => current?.filter((item) => !ids.includes(item.id)) ?? null);
    setTotal((count) => Math.max(0, count - ids.length));
    selection.clear();
  };

  const openSelected = () => {
    const urls = (entries ?? []).filter((entry) => selection.isSelected(entry.id)).map((entry) => entry.url);
    // One after another, so the tabs open in the order they were listed.
    send((api) =>
      urls.reduce<Promise<unknown>>(
        (previous, url) => previous.then(() => api.tabs.create(url, false)),
        Promise.resolve(),
      ),
    );
    selection.clear();
  };

  const summary =
    entries?.length === total
      ? t('views.history.pages', { total: total.toLocaleString() })
      : t('views.history.showing', { shown: entries?.length ?? 0, total });

  return (
    <PageShell
      title={t('views.history.title')}
      actions={
        <>
          <SearchField value={query} onChange={setQuery} label={t('views.history.search')} className="w-64" />
          <Select
            label={t('views.history.order.label')}
            options={ORDER_OPTIONS}
            value={filter.order}
            onChange={(order) => setFilter({ ...filter, order })}
          />
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
        <div className="flex flex-wrap items-center gap-2 pt-4">
          <SegmentedControl
            label={t('views.history.ranges.label')}
            options={RANGE_OPTIONS}
            value={filter.range}
            onChange={(range) => setFilter({ ...filter, range })}
          />
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={isGroupedBySite}
            className={isGroupedBySite ? 'bg-accent-soft text-ink' : undefined}
            onClick={() => setIsGroupedBySite(!isGroupedBySite)}
          >
            {t('views.history.groupBySite')}
          </Button>
        </div>
        {selection.selectedIds.length > 0 && (
          <div className="pt-3">
            <SelectionBar
              summary={t('views.history.selection.count', { count: selection.selectedIds.length })}
              actions={[
                { label: t('views.history.selection.openInTabs'), onSelect: openSelected },
                { label: t('views.history.selection.remove'), onSelect: removeSelected, isDestructive: true },
              ]}
              clearLabel={t('views.history.selection.clear')}
              onClear={selection.clear}
            />
          </div>
        )}
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
            {sectionsOf(entries, isGroupedBySite, filter.order).map(([heading, items]) => (
              <section key={heading}>
                {/* Sticky without a z-index: a positioned heading already paints over the unpositioned rows. */}
                {heading ? (
                  <h2 className="sticky top-0 bg-base px-1 pb-2 pt-5 text-body font-semibold text-ink-dim">
                    {heading}
                  </h2>
                ) : (
                  <div className="pt-4" />
                )}
                <ul className="rounded-md bg-inset p-1">
                  {items.map((entry) => (
                    <li
                      key={entry.id}
                      className="group flex h-list-row items-center gap-3 rounded-field pl-3 pr-2 hover:bg-hover"
                      // Forgetting a whole site lives on its own menu, where someone is already looking at one.
                      onContextMenu={(event) => {
                        event.preventDefault();
                        send((api) => api.history.openContextMenu(entry.url));
                      }}
                    >
                      <Checkbox
                        checked={selection.isSelected(entry.id)}
                        onChange={(isChecked) => selection.toggle(entry.id, isChecked)}
                        label={t('views.history.select', { name: entry.title || hostFor(entry.url) })}
                        isLabelHidden
                      />
                      <span className="w-16 shrink-0 whitespace-nowrap text-body-sm text-ink-faint tabular-nums">
                        {filter.order === 'visits'
                          ? t('views.history.visits', { count: entry.visitCount })
                          : formatTimeOfDay(entry.lastVisitedAt)}
                      </span>
                      <Favicon dataUrl={iconFor(icons, entry.url)} seed={entry.url} size={20} />
                      <button
                        type="button"
                        onClick={() => open(entry.url)}
                        // A middle-click opens it behind, as it would on a link.
                        onAuxClick={(event) => {
                          if (event.button === 1) {
                            event.preventDefault();
                            send((api) => api.tabs.create(entry.url, false));
                          }
                        }}
                        title={entry.url}
                        className="flex min-w-0 flex-1 flex-col text-left"
                      >
                        <span className="truncate text-reading font-medium text-ink">{entry.title || entry.url}</span>
                        <span className="truncate text-body-sm text-ink-faint">{hostFor(entry.url)}</span>
                      </button>
                      <IconButton
                        label={t('views.history.more', { name: entry.title || hostFor(entry.url) })}
                        size="sm"
                        className="opacity-40 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => send((api) => api.history.openContextMenu(entry.url))}
                      >
                        <Ellipsis size={14} />
                      </IconButton>
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
            void ask((api) => api.history.clear(clearing, choice), undefined).then(() => refresh(query, filter, 0));
          }}
        />
      )}
    </PageShell>
  );
}

function hostFor(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Days for a list by time, sites when grouped, and one untitled run when ordered by visits, where days would interleave. */
function sectionsOf(
  entries: HistoryEntry[],
  isGroupedBySite: boolean,
  order: HistoryOrder,
): [string, HistoryEntry[]][] {
  if (isGroupedBySite) {
    return groupBySite(entries);
  }
  return order === 'visits' ? [['', entries]] : groupByDay(entries);
}

/** By site, the sites with most pages first, each keeping the list's own order within it. */
function groupBySite(entries: HistoryEntry[]): [string, HistoryEntry[]][] {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const host = hostFor(entry.url);
    groups.set(host, [...(groups.get(host) ?? []), entry]);
  }
  return [...groups.entries()].toSorted(([, aEntries], [, bEntries]) => bEntries.length - aEntries.length);
}

function groupByDay(entries: HistoryEntry[]): [string, HistoryEntry[]][] {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const heading = formatDateHeading(entry.lastVisitedAt);
    groups.set(heading, [...(groups.get(heading) ?? []), entry]);
  }
  return [...groups.entries()];
}
