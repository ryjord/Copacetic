'use client';

// Libs
import { useEffect, useState, useSyncExternalStore } from 'react';

// Components
import { Button } from '@/components/ui/Button/Button';
import { Favicon } from '@/components/ui/Favicon/Favicon';
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { Menu } from '@/components/ui/Menu/Menu';
import { ShortcutDialog } from '@/components/views/start/ShortcutDialog';

// Icons
import { Ellipsis, EyeOff, Plus, Search } from 'lucide-react';

// Store
import { useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { updateSettings } from '@/components/views/settings/shared/options';
import { ask, send } from '@/lib/bridge/bridge';
import { iconFor, useFavicons } from '@/lib/favicons';
import { formatClockTime, formatLongDate, timeOfDay } from '@/lib/text/format';
import { t } from '@shared/i18n/translate';
import { MAX_SHORTCUTS } from '@shared/data/start-tiles';

// Types
import type { Bookmark, TopSite } from '@shared/types';

/** What a new tab actually offers is a way to get somewhere. */
export function StartPage({ tabId, isHush = false }: { tabId: string; isHush?: boolean }) {
  const settings = useBrowserStore((state) => state.settings);
  const [query, setQuery] = useState('');
  const [topSites, setTopSites] = useState<TopSite[]>([]);
  const [tilesVersion, setTilesVersion] = useState(0);
  // Back from a panel is when clearing history, or forgetting a site, has just happened.
  const isUncovered = useBrowserStore((state) => state.surface === 'none');
  const [fetched, setFetched] = useState<string | null>(null);
  const minute = useMinuteTick();

  useEffect(() => {
    if (!settings.startPageWidgets.includes('topSites') || isHush || !isUncovered) {
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
  }, [settings.startPageWidgets, isHush, isUncovered, tilesVersion]);

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
    <div data-hush={isHush} className="ambient-field relative flex h-full w-full justify-center overflow-y-auto px-8">
      {wallpaper && !isHush && (
        <>
          {/* A data URL already in memory, in a static export with no image loader: next/image has nothing to offer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={wallpaper} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
          {/* So the clock and the search field stay legible over a photograph nobody vetted. */}
          <div className="absolute inset-0 bg-base/65" aria-hidden />
        </>
      )}

      <div className="relative flex w-full max-w-[880px] flex-col gap-9 pb-12 pt-[88px]">
        {isShowingNotice && <HushNotice />}

        {shownWidgets.map((widget) => (
          <div key={widget} className="flex w-full">
            {widget === 'clock' && <Greeting minute={minute} />}

            {widget === 'search' && (
              <form onSubmit={submit} className="relative w-full">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('views.start.search')}
                  aria-label={t('views.start.search')}
                  spellCheck={false}
                  autoComplete="off"
                  className="h-11 w-full rounded-md border border-line-strong bg-raised pl-11 pr-5 text-reading text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                />
                {/* After the input, so it paints over the field's backdrop rather than under it. */}
                <Search
                  size={18}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint"
                  aria-hidden
                />
              </form>
            )}

            {widget === 'topSites' && (
              <TopSites sites={topSites} tabId={tabId} onChanged={() => setTilesVersion((version) => version + 1)} />
            )}
            {widget === 'bookmarks' && <BookmarkStrip tabId={tabId} />}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The day and the time, and a greeting for it. Blank until mounted: a static page cannot know when it opens. */
function Greeting({ minute }: { minute: number | null }) {
  if (minute === null) {
    return <div className="h-[62px]" aria-hidden />;
  }
  const now = new Date(minute * 60_000);
  return (
    <header className="flex flex-col gap-1">
      <time className="text-reading font-medium text-ink-dim tabular-nums">
        {t('views.start.dateAndTime', { date: formatLongDate(now), time: formatClockTime(now) })}
      </time>
      <h1 className="text-display font-semibold tracking-tight text-ink">
        {t(`views.start.greeting.${timeOfDay(now)}`)}
      </h1>
    </header>
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

function TopSites({ sites, tabId, onChanged }: { sites: TopSite[]; tabId: string; onChanged: () => void }) {
  // Undefined when closed, null for a new shortcut, a tile when one is being changed.
  const [editing, setEditing] = useState<TopSite | null | undefined>(undefined);
  const canAdd = sites.filter((site) => site.isShortcut).length < MAX_SHORTCUTS;

  const remove = async (site: TopSite) => {
    await ask((api) => api.startPage.removeTile(site.url), undefined);
    onChanged();
  };

  return (
    <>
      {sites.length === 0 && <p className="text-body text-ink-dim">{t('views.start.topSitesEmpty')}</p>}
      <ul className="grid w-full grid-cols-6 gap-4">
        {sites.map((site) => (
          <li key={site.url} className="group relative">
            <button
              type="button"
              onClick={() => send((api) => api.tabs.navigate(tabId, site.url))}
              title={site.url}
              className="flex w-full flex-col items-center gap-2.5 rounded-md px-1.5 py-3.5 transition-colors hover:bg-inset"
            >
              <span className="grid size-16 place-items-center rounded-lg bg-inset shadow-[0_0_0_1px_var(--color-line)]">
                <Favicon dataUrl={site.faviconDataUrl} seed={site.host} size={28} />
              </span>
              <span className="w-full truncate text-center text-body-sm text-ink-dim">{site.label}</span>
            </button>
            {/* After the tile, so it paints over it by order alone. */}
            <div className="absolute right-0.5 top-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <Menu
                trigger={
                  <IconButton label={t('views.start.shortcut.menu', { name: site.label })} size="sm">
                    <Ellipsis size={14} strokeWidth={1.75} />
                  </IconButton>
                }
                items={[
                  { label: t('views.start.shortcut.edit'), onSelect: () => setEditing(site) },
                  {
                    label: site.isShortcut ? t('views.start.shortcut.delete') : t('views.start.shortcut.hide'),
                    onSelect: () => void remove(site),
                    isDestructive: true,
                  },
                ]}
              />
            </div>
          </li>
        ))}
        {canAdd && (
          <li>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="flex w-full flex-col items-center gap-2.5 rounded-md px-1.5 py-3.5 text-ink-faint transition-colors hover:bg-inset hover:text-ink-dim"
            >
              <span className="grid size-16 place-items-center rounded-lg border border-dashed border-line-strong">
                <Plus size={22} strokeWidth={1.5} />
              </span>
              <span className="w-full truncate text-center text-body-sm">{t('views.start.shortcut.add')}</span>
            </button>
          </li>
        )}
      </ul>
      {editing !== undefined && (
        <ShortcutDialog tile={editing} onClose={() => setEditing(undefined)} onSaved={onChanged} />
      )}
    </>
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
    <ul className="flex flex-wrap gap-1.5">
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
