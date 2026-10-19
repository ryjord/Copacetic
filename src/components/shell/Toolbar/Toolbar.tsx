'use client';

// Components
import { IconButton } from '@/components/ui/IconButton/IconButton';
import { Omnibox } from '@/components/shell/Omnibox/Omnibox';

// Icons
import { ArrowLeft, ArrowRight, Download, Menu, RotateCw, X } from 'lucide-react';

// Store
import { selectActiveDownloadCount, selectDownloadProgress, useBrowserStore } from '@/store/useBrowserStore';

// Utils
import { send } from '@/lib/bridge';
import { t } from '@shared/i18n/translate';

// Types
import { colourOf } from '@shared/tab-groups';
import type { TabState } from '@shared/types';

const ICON = { size: 16, strokeWidth: 1.75 } as const;

export function Toolbar({ tab }: { tab: TabState | null }) {
  const isBusy = tab?.isLoading ?? false;

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
        disabled={!tab || tab.isStartPage}
        onClick={() => tab && send((api) => (isBusy ? api.tabs.stop(tab.id) : api.tabs.reload(tab.id)))}
      >
        {isBusy ? <X {...ICON} /> : <RotateCw {...ICON} />}
      </IconButton>
      <div className="mx-1 flex min-w-0 flex-1">
        <Omnibox tab={tab} />
      </div>
      <ProfileChip />
      <DownloadsButton />
      <IconButton
        label={t('shell.toolbar.menu')}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          send((api) => api.chrome.openMainMenu(Math.round(box.left), Math.round(box.bottom + 4)));
        }}
      >
        <Menu {...ICON} />
      </IconButton>
    </div>
  );
}

/** Which profile this window is, shown once there is more than one to confuse it with. */
function ProfileChip() {
  const profile = useBrowserStore((state) => state.profile);
  const profileCount = useBrowserStore((state) => state.profiles.length);
  if (profileCount < 2) {
    return null;
  }
  return (
    <button
      type="button"
      aria-label={t('shell.toolbar.profile', { name: profile.name })}
      title={t('shell.toolbar.switchProfile')}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        send((api) => api.profiles.openMenu(Math.round(box.left), Math.round(box.bottom + 4)));
      }}
      className="no-drag flex h-7 max-w-36 shrink-0 items-center gap-1.5 rounded-sm px-2 text-body-sm text-ink-dim hover:bg-hover hover:text-ink"
    >
      <span className="size-2 shrink-0 rounded-full" style={{ background: colourOf(profile.colour) }} />
      <span className="truncate">{profile.name}</span>
    </button>
  );
}

const RING_RADIUS = 11;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** The one surface with its own button, because it is the one with something to report while you browse. */
function DownloadsButton() {
  const isOpen = useBrowserStore((state) => state.surface === 'downloads');
  const toggleSurface = useBrowserStore((state) => state.toggleSurface);
  const activeCount = useBrowserStore(selectActiveDownloadCount);
  const progress = useBrowserStore(selectDownloadProgress);
  const label =
    activeCount > 0 ? t('shell.toolbar.downloadsActive', { count: activeCount }) : t('shell.toolbar.downloads');

  return (
    <IconButton
      label={label}
      tone={isOpen ? 'active' : 'default'}
      className="relative"
      onClick={() => toggleSurface('downloads')}
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
