'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { TopSite } from '../../../electron/shared/types';
import { SEARCH_ENGINES } from '../../../electron/shared/url';
import { Favicon } from '@/components/ui/Favicon';
import { ask, send } from '@/lib/bridge';
import { formatClockTime } from '@/lib/format';
import { useBrowserStore } from '@/store/useBrowserStore';

/**
 * What a new tab actually offers is a way to get somewhere. The clock is calm
 * furniture; the row of places you genuinely go, ranked from real visit counts,
 * is the part that does the work.
 */
export function StartPage({ tabId }: { tabId: string }) {
  const settings = useBrowserStore((state) => state.settings);
  const [query, setQuery] = useState('');
  const [topSites, setTopSites] = useState<TopSite[]>([]);
  const minute = useMinuteTick();

  useEffect(() => {
    if (!settings.showTopSites) return;
    let cancelled = false;
    void ask((api) => api.history.topSites(8), []).then((sites) => {
      if (!cancelled) setTopSites(sites);
    });
    return () => {
      cancelled = true;
    };
  }, [settings.showTopSites]);

  const engineName = SEARCH_ENGINES[settings.searchEngine]?.name ?? 'the web';

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    send((api) => api.tabs.navigate(tabId, query));
  };

  return (
    <div className="ambient-field flex h-full w-full flex-col items-center justify-center overflow-y-auto px-8">
      <div className="flex w-full max-w-xl flex-col items-center">
        {settings.showStartPageClock && (
          <div className="mb-8 flex flex-col items-center">
            {/* Blank until mounted: a statically exported page cannot know what
                time it will be opened, and guessing would make the first paint
                disagree with the second. */}
            <span className="font-mono text-[56px] font-light leading-none tracking-tight text-ink tabular-nums">
              {minute === null ? ' ' : formatClockTime(new Date())}
            </span>
            <span className="label mt-3 tracking-[0.42em] text-ink-faint">Copacetic</span>
          </div>
        )}

        <form onSubmit={submit} className="w-full">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${engineName}, or type an address`}
            aria-label="Search or enter address"
            spellCheck={false}
            autoComplete="off"
            className="h-11 w-full rounded-full border border-line bg-raised/70 px-5 text-center font-mono text-[13px] text-ink outline-none backdrop-blur-xl transition-colors placeholder:font-sans placeholder:text-ink-faint focus:border-line-strong focus:bg-raised"
          />
        </form>

        {settings.showTopSites && (
          <div className="mt-10 w-full">
            {topSites.length > 0 ? (
              <ul className="grid grid-cols-4 gap-2">
                {topSites.map((site) => (
                  <li key={site.host}>
                    <button
                      type="button"
                      onClick={() => send((api) => api.tabs.navigate(tabId, site.url))}
                      className="flex w-full flex-col items-center gap-2 rounded-panel border border-transparent px-2 py-3 transition-colors hover:border-line hover:bg-raised/60"
                    >
                      <Favicon dataUrl={site.faviconDataUrl} seed={site.host} size={22} />
                      <span className="w-full truncate text-center text-[11.5px] text-ink-dim">{site.host}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-[12px] text-ink-faint">
                Your most-visited sites will collect here. Where do you want to go?
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The wall clock is external state, so React should subscribe to it rather than
 * hold a copy. The snapshot is the current minute: it only changes when the
 * displayed time does, so the page re-renders once a minute rather than
 * 60 times for the same string.
 *
 * The server snapshot is null, which renders a blank — a statically exported
 * page cannot know what time it will be opened.
 */
function useMinuteTick(): number | null {
  return useSyncExternalStore(
    (onChange) => {
      const timer = setInterval(onChange, 15_000);
      return () => clearInterval(timer);
    },
    () => Math.floor(Date.now() / 60_000),
    () => null,
  );
}
