'use client';

// Components
import { BookmarksPage } from '@/components/views/bookmarks/BookmarksPage';
import { DownloadsPage } from '@/components/views/downloads/DownloadsPage';
import { HistoryPage } from '@/components/views/history/HistoryPage';
import { SettingsPage } from '@/components/views/settings/SettingsPage';
import { StartPage } from '@/components/views/start/StartPage';

// Utils
import { internalAddressOf } from '@shared/tabs/internal-pages';

// Types
import type { TabState } from '@shared/types';

/** What a tab shows when the page in it is one Copacetic draws rather than a site. */
export function InternalPage({ tab }: { tab: TabState }) {
  switch (tab.internalPage) {
    case 'start':
      return <StartPage tabId={tab.id} isHush={tab.isHush} />;
    case 'settings':
      return <SettingsPage tabId={tab.id} section={internalAddressOf(tab.url)?.section ?? null} />;
    case 'history':
      return <HistoryPage />;
    case 'bookmarks':
      return <BookmarksPage />;
    case 'downloads':
      return <DownloadsPage />;
    case null:
      return null;
  }
}
