'use client';

import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ClearRange, HistoryEntry, HistoryPage } from '@shared/types';
import { Favicon } from '@/components/ui/media/Favicon';
import { IconButton } from '@/components/ui/controls/IconButton';
import { ask, send } from '@/lib/bridge';
import { formatDateHeading, formatRelativeTime } from '@/lib/format';
import { useBrowserStore } from '@/store/useBrowserStore';
import { EmptyState, SurfaceShell } from '@/views/SurfaceShell/SurfaceShell';

const EMPTY_PAGE: HistoryPage = { entries: [], total: 0 };

const CLEAR_OPTIONS: { value: ClearRange; label: string }[] = [
  { value: 'hour', label: 'Last hour' },
  { value: 'day', label: 'Last 24 hours' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'all', label: 'Everything' },
];

export function HistorySurface() {
  const activeTabId = useBrowserStore((state) => state.activeTabId);
  const setSurface = useBrowserStore((state) => state.setSurface);
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const refresh = useCallback(async (search: string) => {
    const page = await ask((api) => api.history.list(search), EMPTY_PAGE);
    setEntries(page.entries);
    setTotal(page.total);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(query), 120);
    return () => clearTimeout(timer);
  }, [query, refresh]);

  // Paging rather than one enormous list: the surface stays responsive, and
  // the count below says plainly how much is not on screen. Silently stopping
  // at a few hundred meant a search could never reach a match past the cap.
  const loadMore = () => {
    setLoadingMore(true);
    void ask((api) => api.history.list(query, entries.length), EMPTY_PAGE)
      .then((page) => {
        setEntries((current) => [...current, ...page.entries]);
        setTotal(page.total);
      })
      .finally(() => setLoadingMore(false));
  };

  const open = (url: string) => {
    if (!activeTabId) {
      return;
    }
    send((api) => api.tabs.navigate(activeTabId, url));
    setSurface('none');
  };

  const groups = groupByDay(entries);

  return (
    <SurfaceShell
      title="History"
      subtitle="Kept on this machine for 90 days, then dropped automatically."
      actions={
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search history"
            aria-label="Search history"
            className="h-7 w-52 rounded-md border border-line bg-sunken px-2.5 text-[12px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
          />
          <ClearMenu onClear={(range) => void handleClear(range, () => void refresh(query))} />
        </div>
      }
    >
      {entries.length === 0 ? (
        <EmptyState
          title={query ? 'Nothing matches that' : 'No history yet'}
          hint={query ? 'Try a different word.' : 'Pages you visit will be listed here.'}
        />
      ) : (
        <div className="pb-6">
          {groups.map(([heading, items]) => (
            <section key={heading}>
              <h2 className="label sticky top-0 z-10 bg-base/95 px-6 py-2 backdrop-blur">{heading}</h2>
              <ul>
                {items.map((entry) => (
                  <li key={entry.id} className="group flex items-center gap-3 px-6 py-1.5 hover:bg-raised">
                    <Favicon dataUrl={null} seed={entry.url} size={15} />
                    <button
                      type="button"
                      onClick={() => open(entry.url)}
                      className="min-w-0 flex-1 truncate text-left text-[12.5px] text-ink"
                      title={entry.url}
                    >
                      {entry.title || entry.url}
                    </button>
                    <span className="hidden max-w-[38%] truncate font-mono text-[11px] text-ink-faint md:block">
                      {entry.url}
                    </span>
                    <span className="w-24 shrink-0 text-right text-[11px] text-ink-faint">
                      {formatRelativeTime(entry.lastVisitedAt)}
                    </span>
                    <IconButton
                      label="Remove from history"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => {
                        send((api) => api.history.remove(entry.id));
                        setEntries((current) => current.filter((item) => item.id !== entry.id));
                      }}
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <div className="flex flex-col items-center gap-2 px-6 pt-4">
            <p className="text-[11.5px] text-ink-faint">
              {entries.length === total
                ? `${total} ${total === 1 ? 'entry' : 'entries'}`
                : `Showing ${entries.length} of ${total}`}
            </p>
            {entries.length < total && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-field border border-line px-3 py-1.5 text-[12.5px] text-ink-dim transition-colors hover:bg-raised hover:text-ink disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Show more'}
              </button>
            )}
          </div>
        </div>
      )}
    </SurfaceShell>
  );
}

async function handleClear(range: ClearRange, done: () => void) {
  const api = window.copacetic;
  if (!api) {
    return;
  }
  await api.history.clear(range);
  done();
}

function ClearMenu({ onClear }: { onClear: (range: ClearRange) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="rounded-md px-2.5 py-1 text-[12px] text-ink-dim transition-colors hover:bg-hover hover:text-ink"
      >
        Clear…
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} aria-hidden />
          <ul className="animate-rise absolute right-0 top-[calc(100%+6px)] z-50 w-44 overflow-hidden rounded-panel border border-line bg-raised py-1 shadow-[0_18px_40px_-12px_rgb(0_0_0/0.8)]">
            {CLEAR_OPTIONS.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onClear(option.value);
                  }}
                  className="w-full px-3 py-1.5 text-left text-[12.5px] text-ink transition-colors hover:bg-hover"
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function groupByDay(entries: HistoryEntry[]): [string, HistoryEntry[]][] {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const heading = formatDateHeading(entry.lastVisitedAt);
    const bucket = groups.get(heading);
    if (bucket) {
      bucket.push(entry);
    } else {
      groups.set(heading, [entry]);
    }
  }
  return [...groups.entries()];
}
