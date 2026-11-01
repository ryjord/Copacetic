'use client';

// Components
import { Button } from '@/components/ui/Button/Button';
import { IconButton } from '@/components/ui/IconButton/IconButton';

// Icons
import { ArrowLeft, ArrowRight, RotateCw, X } from 'lucide-react';

// Utils
import { send } from '@/lib/bridge/bridge';
import { isMacPlatform } from '@/lib/platform';
import { t } from '@shared/i18n/translate';

// Types
import type { AppWindowState } from '@shared/data/installed-apps';
import type { TabState } from '@shared/types';

const ICON = { size: 16, strokeWidth: 1.75 } as const;

/** An app window's whole header: the site and the way back, with no tabs and no address to type in. */
export function AppHeader({ app, tab }: { app: AppWindowState; tab: TabState | null }) {
  const isBusy = tab?.isLoading ?? false;
  return (
    <header className="drag-region flex h-[var(--chrome-header-height)] shrink-0 items-center gap-1 pr-[calc(var(--window-controls-width)+0.5rem)] pl-2.5">
      {/* Room for the macOS traffic lights, which sit inside this strip. */}
      {isMacPlatform() && <div className="w-[74px] shrink-0 self-stretch" aria-hidden />}
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
        disabled={!tab}
        onClick={() => tab && send((api) => (isBusy ? api.tabs.stop(tab.id) : api.tabs.reload(tab.id)))}
      >
        {isBusy ? <X {...ICON} /> : <RotateCw {...ICON} />}
      </IconButton>
      <h1 className="mx-2 min-w-0 flex-1 truncate text-body font-medium text-ink">{tab?.title || app.name}</h1>
      <Button size="sm" variant="ghost" className="no-drag" onClick={() => send((api) => api.apps.openInBrowser())}>
        {t('shell.appHeader.openInBrowser')}
      </Button>
    </header>
  );
}
