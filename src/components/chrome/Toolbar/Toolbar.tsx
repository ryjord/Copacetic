'use client';

import { ArrowLeft, ArrowRight, BookMarked, Clock, Download, RotateCw, Settings, Star, X } from 'lucide-react';
import type { TabState } from '@shared/types';
import { IconButton } from '@/components/ui/controls/IconButton';
import { send } from '@/lib/bridge';
import { cn } from '@/lib/utils';
import { selectActiveDownloadCount, useBrowserStore } from '@/store/useBrowserStore';
import { Omnibox } from '@/components/chrome/Omnibox/Omnibox';

export function Toolbar({ tab }: { tab: TabState | null }) {
  const toggleSurface = useBrowserStore((state) => state.toggleSurface);
  const surface = useBrowserStore((state) => state.surface);
  const activeDownloads = useBrowserStore(selectActiveDownloadCount);

  const canInteract = tab !== null;
  const isBusy = tab?.isLoading ?? false;

  return (
    <div className="flex items-center gap-1.5 px-2.5 pb-2">
      <IconButton
        label="Back"
        disabled={!tab?.canGoBack}
        onClick={() => tab && send((api) => api.tabs.goBack(tab.id))}
      >
        <ArrowLeft size={15} />
      </IconButton>

      <IconButton
        label="Forward"
        disabled={!tab?.canGoForward}
        onClick={() => tab && send((api) => api.tabs.goForward(tab.id))}
      >
        <ArrowRight size={15} />
      </IconButton>

      <IconButton
        label={isBusy ? 'Stop loading' : 'Reload'}
        disabled={!canInteract || tab.isStartPage}
        onClick={() => {
          if (!tab) {
            return;
          }
          send((api) => (isBusy ? api.tabs.stop(tab.id) : api.tabs.reload(tab.id)));
        }}
      >
        {isBusy ? <X size={15} /> : <RotateCw size={14} />}
      </IconButton>

      <Omnibox tab={tab} />

      <IconButton
        label={tab?.isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
        disabled={!canInteract || tab.isStartPage}
        onClick={() => tab && send((api) => api.bookmarks.toggle(tab.url, tab.title))}
        className={cn(tab?.isBookmarked && 'text-caution hover:text-caution')}
      >
        <Star size={15} fill={tab?.isBookmarked ? 'currentColor' : 'none'} />
      </IconButton>

      <div className="relative">
        <IconButton
          label="Downloads"
          tone={surface === 'downloads' ? 'active' : 'default'}
          onClick={() => toggleSurface('downloads')}
        >
          <Download size={15} />
        </IconButton>
        {activeDownloads > 0 && (
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-active ring-2 ring-base"
          />
        )}
      </div>

      {/* The star saves this page; this opens what has been saved. Without it
          the whole surface was reachable only from the menu bar. */}
      <IconButton
        label="Bookmarks"
        tone={surface === 'bookmarks' ? 'active' : 'default'}
        onClick={() => toggleSurface('bookmarks')}
      >
        <BookMarked size={15} />
      </IconButton>

      <IconButton
        label="History"
        tone={surface === 'history' ? 'active' : 'default'}
        onClick={() => toggleSurface('history')}
      >
        <Clock size={15} />
      </IconButton>

      <IconButton
        label="Settings"
        tone={surface === 'settings' ? 'active' : 'default'}
        onClick={() => toggleSurface('settings')}
      >
        <Settings size={15} />
      </IconButton>
    </div>
  );
}
