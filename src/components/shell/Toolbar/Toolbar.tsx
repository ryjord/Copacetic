'use client';

// Components
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { ExtensionButtons } from '@/components/shell/Toolbar/ExtensionButtons';
import { Omnibox } from '@/components/shell/Omnibox/Omnibox';
import { ProfileAvatar } from '@/components/shell/ProfileAvatar/ProfileAvatar';

// Icons
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  Columns2,
  Download,
  House,
  Menu,
  RotateCw,
  X,
} from 'lucide-react';

// Store
import { selectActiveDownloadCount, selectDownloadProgress, useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { send } from '@/lib/bridge/bridge';
import { t } from '@shared/i18n/translate';

// Types
import { START_PAGE_URL } from '@shared/browsing/url';
import { shownSplit } from '@shared/tabs/split-view';
import type { TabState } from '@shared/types';

const ICON = { size: 16, strokeWidth: 1.75 } as const;

/** Where a native menu opened from a button should appear: under it, from its left edge. */
function belowButton(button: HTMLElement): { x: number; y: number } {
  const box = button.getBoundingClientRect();
  return { x: Math.round(box.left), y: Math.round(box.bottom + 4) };
}

export function Toolbar({ tab }: { tab: TabState | null }) {
  const isBusy = tab?.isLoading ?? false;
  const toolbarItems = useBrowserStore((state) => state.settings.toolbarItems);
  const homeUrl = useBrowserStore((state) => state.settings.homeUrl);
  const isSplit = useBrowserStore((state) => shownSplit(state.split, state.activeTabId) !== null);
  const setSurface = useBrowserStore((state) => state.setSurface);
  const isPage = tab !== null && tab.internalPage === null;

  return (
    <div className="flex h-[var(--chrome-toolbar-height)] shrink-0 items-center gap-1 border-b border-line bg-toolbar px-2.5">
      <IconButton
        label={t('shell.toolbar.back')}
        disabled={!tab?.canGoBack}
        onClick={() => tab && send((api) => api.tabs.goBack(tab.id))}
      >
        <ArrowLeft {...ICON} />
      </IconButton>
      <IconButton
        label={t('shell.toolbar.forward')}
        disabled={!tab?.canGoForward}
        onClick={() => tab && send((api) => api.tabs.goForward(tab.id))}
      >
        <ArrowRight {...ICON} />
      </IconButton>
      <IconButton
        label={isBusy ? t('shell.toolbar.stop') : t('shell.toolbar.reload')}
        disabled={!tab || tab.internalPage !== null}
        onClick={() => tab && send((api) => (isBusy ? api.tabs.stop(tab.id) : api.tabs.reload(tab.id)))}
      >
        {isBusy ? <X {...ICON} /> : <RotateCw {...ICON} />}
      </IconButton>
      {toolbarItems.includes('home') && (
        <IconButton
          label={t('shell.toolbar.home')}
          disabled={!tab || (tab.internalPage === 'start' && homeUrl === null)}
          onClick={() => tab && send((api) => api.tabs.navigate(tab.id, homeUrl ?? START_PAGE_URL))}
        >
          <House {...ICON} />
        </IconButton>
      )}
      {toolbarItems.includes('bookmarks') && (
        <IconButton
          label={t('shell.toolbar.bookmarks')}
          onClick={(event) => {
            const { x, y } = belowButton(event.currentTarget);
            send((api) => api.bookmarks.openMenu(x, y));
          }}
        >
          <Bookmark {...ICON} />
        </IconButton>
      )}
      {/* Centred and capped, as the design draws it: a field the width of a wide window is hard to read across. */}
      <div className="mx-1 flex min-w-0 flex-1 justify-center">
        <div className="flex w-full min-w-0 max-w-[760px]">
          <Omnibox tab={tab} />
        </div>
      </div>
      {toolbarItems.includes('reader') && (
        <IconButton label={t('shell.toolbar.reader')} disabled={!isPage} onClick={() => setSurface('reader')}>
          <BookOpen {...ICON} />
        </IconButton>
      )}
      {toolbarItems.includes('split') && (
        <IconButton
          label={isSplit ? t('shell.toolbar.leaveSplit') : t('shell.toolbar.split')}
          tone={isSplit ? 'active' : 'default'}
          disabled={!tab}
          onClick={() => send((api) => (isSplit ? api.tabs.leaveSplit() : api.tabs.splitWith(null)))}
        >
          <Columns2 {...ICON} />
        </IconButton>
      )}
      <ExtensionButtons />
      {toolbarItems.includes('profile') && <ProfileButton />}
      {toolbarItems.includes('downloads') && <DownloadsButton />}
      <IconButton
        label={t('shell.toolbar.menu')}
        onClick={(event) => {
          const { x, y } = belowButton(event.currentTarget);
          send((api) => api.chrome.openMainMenu(x, y));
        }}
      >
        <Menu {...ICON} />
      </IconButton>
    </div>
  );
}

/** Which profile this window is, as its picture or initials, opening the menu to switch or manage. */
function ProfileButton() {
  const profile = useBrowserStore((state) => state.profile);
  return (
    <button
      type="button"
      aria-label={t('shell.toolbar.profile', { name: profile.name })}
      title={t('shell.toolbar.switchProfile')}
      onClick={(event) => {
        const { x, y } = belowButton(event.currentTarget);
        send((api) => api.profiles.openMenu(x, y));
      }}
      className="no-drag grid size-7 shrink-0 place-items-center rounded-full hover:bg-hover"
    >
      <ProfileAvatar profile={profile} />
    </button>
  );
}

const RING_RADIUS = 11;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** The one page of ours with its own button, because it is the one with something to report while you browse. */
function DownloadsButton() {
  const isOpen = useBrowserStore((state) => state.activeTab?.internalPage === 'downloads');
  const activeCount = useBrowserStore(selectActiveDownloadCount);
  const progress = useBrowserStore(selectDownloadProgress);
  const label =
    activeCount > 0 ? t('shell.toolbar.downloadsActive', { count: activeCount }) : t('shell.toolbar.downloads');

  return (
    <IconButton
      label={label}
      tone={isOpen ? 'active' : 'default'}
      className="relative"
      onClick={() => send((api) => api.chrome.showPage('downloads'))}
    >
      <Download {...ICON} />
      {activeCount > 0 && (
        <svg viewBox="0 0 28 28" aria-hidden className="pointer-events-none absolute inset-0 size-full -rotate-90">
          <circle cx="14" cy="14" r={RING_RADIUS} fill="none" strokeWidth="1.5" className="stroke-line-strong" />
          {/* No known size, so it shows movement rather than a fraction it would have to make up. */}
          <circle
            cx="14"
            cy="14"
            r={RING_RADIUS}
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={RING_LENGTH * (1 - (progress ?? 0.25))}
            className={
              progress === null
                ? 'origin-center animate-spin stroke-ink'
                : 'stroke-ink transition-[stroke-dashoffset]'
            }
          />
        </svg>
      )}
    </IconButton>
  );
}
