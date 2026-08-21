'use client';

import { EyeOff } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Bookmark, TopSite } from '@shared/types';
import { SEARCH_ENGINES } from '@shared/url';
import { Favicon } from '@/components/ui/media/Favicon';
import { ask, send } from '@/lib/bridge';
import { formatClockTime } from '@/lib/format';
import { useBrowserStore } from '@/store/useBrowserStore';

/** What a new tab actually offers is a way to get somewhere. */
export function StartPage({ tabId, isHush = false }: { tabId: string; isHush?: boolean }) {
  const settings = useBrowserStore((state) => state.settings);
  const [query, setQuery] = useState('');
  const [topSites, setTopSites] = useState<TopSite[]>([]);
  const [fetched, setFetched] = useState<string | null>(null);
  const minute = useMinuteTick();

  useEffect(() => {
    if (!settings.startPageWidgets.includes('topSites')) {
      return;
    }
    let cancelled = false;
    void ask((api) => api.history.topSites(8), []).then((sites) => {
      if (!cancelled) {
        setTopSites(sites);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [settings.startPageWidgets]);

  // Fetched rather than pushed: the image is measured in megabytes and has no
  // business travelling with every state update.
  useEffect(() => {
    if (!settings.hasWallpaper) {
      return;
    }
    let cancelled = false;
    void ask((api) => api.wallpaper.get(), null).then((image) => {
      if (!cancelled) {
        setFetched(image);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [settings.hasWallpaper]);

  // Derived rather than cleared in the effect: removing the wallpaper takes it
  // off screen immediately, with no second render pass to arrange it.
  const wallpaper = settings.hasWallpaper ? fetched : null;

  const engineName = SEARCH_ENGINES[settings.searchEngine]?.name ?? 'the web';

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) {
      return;
    }
    send((api) => api.tabs.navigate(tabId, query));
  };

  return (
    <div className="ambient-field relative flex h-full w-full flex-col items-center justify-center overflow-y-auto px-8">
      {wallpaper && (
        <>
          {/*
            next/image exists to optimise and lazily fetch images over a
            network. This is a data URL already in memory, in a statically
            exported page with no image loader, so the rule has nothing to
            offer here.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wallpaper} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
          {/*
            A scrim, because the clock and the search field have to stay
            legible over a photograph nobody vetted. Dark rather than blurred:
            it costs nothing to composite and does not fight the image.
          */}
          <div className="absolute inset-0 bg-base/70" aria-hidden />
        </>
      )}

      <div className="relative flex w-full max-w-xl flex-col items-center gap-8">
        {isHush && <HushNotice />}

        {settings.startPageWidgets.map((widget) => (
          <div key={widget} className="w-full">
            {widget === 'clock' && (
              <div className="flex flex-col items-center">
                {/* Blank until mounted: a statically exported page cannot know what
                time it will be opened, and guessing would make the first paint
                disagree with the second. */}
                <span className="font-mono text-[56px] font-light leading-none tracking-tight text-ink tabular-nums">
                  {minute === null ? ' ' : formatClockTime(new Date())}
                </span>
                <span className="label mt-3 tracking-[0.42em] text-ink-faint">Copacetic</span>
              </div>
            )}

            {widget === 'search' && (
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
            )}

            {widget === 'topSites' && (
              <div className="w-full">
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

            {widget === 'bookmarks' && <BookmarkStrip tabId={tabId} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// The wall clock is external state, so React should subscribe to it rather than hold a copy.
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

/** The most recent things you saved, as somewhere to start from. */
function BookmarkStrip({ tabId }: { tabId: string }) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() => {
    let cancelled = false;
    void ask((api) => api.bookmarks.list(), []).then((all) => {
      if (!cancelled) {
        setBookmarks(all.slice(0, 8));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (bookmarks.length === 0) {
    return (
      <p className="text-center text-[12px] text-ink-faint">
        Anything you bookmark with Cmd/Ctrl+D will wait for you here.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap justify-center gap-1.5">
      {bookmarks.map((bookmark) => (
        <li key={bookmark.id}>
          <button
            type="button"
            onClick={() => send((api) => api.tabs.navigate(tabId, bookmark.url))}
            title={bookmark.url}
            className="flex max-w-[180px] items-center gap-2 rounded-full border border-line bg-raised/60 px-3 py-1.5 text-[11.5px] text-ink-dim transition-colors hover:border-line-strong hover:text-ink"
          >
            <Favicon dataUrl={null} seed={bookmark.url} size={13} />
            <span className="truncate">{bookmark.title || bookmark.url}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// What a Hush tab actually is, said in full.
function HushNotice() {
  return (
    <section className="w-full rounded-panel border border-line bg-raised/60 px-4 py-3 backdrop-blur-xl">
      <h2 className="flex items-center gap-2 text-[13px] font-medium text-ink">
        <EyeOff size={13} className="text-active" aria-hidden />
        This is a Hush tab
      </h2>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">
        Your machine forgets it. No history, no cookies, no cache and no favicons are kept, and nothing from this tab
        is written to disk at all — not even the list of tabs to reopen.
      </p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-faint">
        It does not make you anonymous. The sites you visit, your network, your employer and your internet provider
        see exactly what they would see in any other tab.
      </p>
    </section>
  );
}
