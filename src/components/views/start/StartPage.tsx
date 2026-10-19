'use client';

// Libs
import { useEffect, useState, useSyncExternalStore } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { Favicon } from '@/components/ui/Favicon/Favicon';

// Icons
import { EyeOff, Search } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { updateSettings } from '@/components/views/settings/shared/options';
import { ask, send } from '@/lib/bridge';
import { iconFor, useFavicons } from '@/lib/favicons';
import { formatClockTime } from '@/lib/format';
import { t } from '@shared/i18n/translate';

// Types
import type { Bookmark, TopSite } from '@shared/types';

/** What a new tab actually offers is a way to get somewhere. */
export function StartPage({ tabId, isHush = false }: { tabId: string; isHush?: boolean }) {
  const settings = useBrowserStore((state) => state.settings);
  const [query, setQuery] = useState('');
  const [topSites, setTopSites] = useState<TopSite[]>([]);
  const [fetched, setFetched] = useState<string | null>(null);
  const minute = useMinuteTick();

  useEffect(() => {
    if (!settings.startPageWidgets.includes('topSites') || isHush) {
      return;
    }
    let isCurrent = true;
    void ask((api) => api.history.topSites(8), []).then((sites) => {
      if (isCurrent) {
        setTopSites(sites);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [settings.startPageWidgets, isHush]);

  // Fetched rather than pushed: the image is measured in megabytes and has no business in every state update.
  useEffect(() => {
    if (!settings.hasWallpaper) {
      return;
    }
    let isCurrent = true;
    void ask((api) => api.wallpaper.get(), null).then((image) => {
      if (isCurrent) {
        setFetched(image);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [settings.hasWallpaper]);

  const wallpaper = settings.hasWallpaper ? fetched : null;

  // Hush withholds what reports where you have been, and always keeps the search field.
  const isShowingNotice = isHush && !settings.hushNoticeDismissed;
  const widgets = settings.startPageWidgets.filter((widget) => !isHush || widget === 'clock' || widget === 'search');
  const shownWidgets = isHush && !widgets.includes('search') ? [...widgets, 'search' as const] : widgets;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim()) {
      send((api) => api.tabs.navigate(tabId, query));
    }
  };

  return (
    <div
      data-hush={isHush}
      className="ambient-field relative flex h-full w-full flex-col items-center justify-center overflow-y-auto px-8"
    >
      {wallpaper && !isHush && (
        <>
          {/* A data URL already in memory, in a static export with no image loader: next/image has nothing to offer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wallpaper} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
          {/* So the clock and the search field stay legible over a photograph nobody vetted. */}
          <div className="absolute inset-0 bg-base/65" aria-hidden />
        </>
      )}

      <div className="relative flex w-full max-w-xl flex-col items-center gap-8">
        {isShowingNotice && <HushNotice />}

        {shownWidgets.map((widget) => (
          <div key={widget} className="flex w-full justify-center">
            {widget === 'clock' && (
              // Blank until mounted: a static page cannot know what time it will be opened.
              <time className="text-display font-light tracking-tight text-ink tabular-nums">
                {minute === null ? ' ' : formatClockTime(new Date())}
              </time>
            )}

            {widget === 'search' && (
              <form onSubmit={submit} className="relative w-full">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('views.start.search')}
                  aria-label={t('views.start.search')}
                  spellCheck={false}
                  autoComplete="off"
                  className="h-12 w-full rounded-full border border-line-strong bg-raised/80 pl-11 pr-5 text-title text-ink shadow-popover outline-none backdrop-blur-xl placeholder:text-ink-faint focus:border-ink-faint"
                />
                {/* After the input, so it paints over the field's backdrop rather than under it. */}
                <Search
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint"
                  aria-hidden
                />
              </form>
            )}

            {widget === 'topSites' && <TopSites sites={topSites} tabId={tabId} />}
            {widget === 'bookmarks' && <BookmarkStrip tabId={tabId} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// The wall clock is external state, so React subscribes to it rather than holding a copy.
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

function TopSites({ sites, tabId }: { sites: TopSite[]; tabId: string }) {
  if (sites.length === 0) {
    return <p className="text-body text-ink-dim">{t('views.start.topSitesEmpty')}</p>;
  }
  return (
    <ul className="grid w-full grid-cols-4 gap-2">
      {sites.map((site) => (
        <li key={site.host}>
          <button
            type="button"
            onClick={() => send((api) => api.tabs.navigate(tabId, site.url))}
            title={site.url}
            className="flex w-full flex-col items-center gap-2 rounded-md px-2 py-3 transition-colors hover:bg-raised/70"
          >
            <span className="grid size-11 place-items-center rounded-md bg-raised/80 shadow-sm">
              <Favicon dataUrl={site.faviconDataUrl} seed={site.host} size={22} />
            </span>
            <span className="w-full truncate text-center text-body-sm text-ink-dim">
              {site.host.replace(/^www\./, '')}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The most recent things you saved, as somewhere to start from. */
function BookmarkStrip({ tabId }: { tabId: string }) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const icons = useFavicons(bookmarks.map((bookmark) => bookmark.url));

  useEffect(() => {
    let isCurrent = true;
    void ask((api) => api.bookmarks.list(), []).then((all) => {
      if (isCurrent) {
        setBookmarks(all.slice(0, 8));
      }
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  if (bookmarks.length === 0) {
    return <p className="text-body text-ink-dim">{t('views.start.bookmarksEmpty')}</p>;
  }

  return (
    <ul className="flex flex-wrap justify-center gap-1.5">
      {bookmarks.map((bookmark) => (
        <li key={bookmark.id}>
          <button
            type="button"
            onClick={() => send((api) => api.tabs.navigate(tabId, bookmark.url))}
            title={bookmark.url}
            className="flex max-w-44 items-center gap-2 rounded-full bg-raised/70 px-3 py-1.5 text-body-sm text-ink-dim transition-colors hover:bg-raised hover:text-ink"
          >
            <Favicon dataUrl={iconFor(icons, bookmark.url)} seed={bookmark.url} size={14} />
            <span className="truncate">{bookmark.title || bookmark.url}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** What a Hush tab is, both halves of it, until it has been read once. */
function HushNotice() {
  return (
    <section
      aria-labelledby="hush-notice-title"
      className="flex w-full flex-col gap-3 rounded-lg border border-line bg-raised/85 p-5 shadow-popover backdrop-blur-xl"
    >
      <div className="flex items-center gap-2.5">
        <EyeOff size={18} className="shrink-0 text-hush" aria-hidden />
        <h2 id="hush-notice-title" className="text-title font-semibold text-ink">
          {t('views.start.hush.title')}
        </h2>
      </div>
      <p className="text-body text-ink-dim">{t('views.start.hush.keeps')}</p>
      {/* Only ever saying the first half would be a boast. */}
      <p className="text-body text-ink-dim">{t('views.start.hush.hides')}</p>
      <div className="flex justify-end">
        {/* A setting rather than something this tab remembers: a Hush tab keeps nothing, not even having been read. */}
        <Button size="sm" onClick={() => updateSettings({ hushNoticeDismissed: true })}>
          {t('views.start.hush.dismiss')}
        </Button>
      </div>
    </section>
  );
}
