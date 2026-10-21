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

/** What a tab of ours shows; keyed by tab, so two tabs of one page keep their own search and selection. */
export function InternalPage({ tab }: { tab: TabState }) {
  switch (tab.internalPage) {
    case 'start':
      return <StartPage key={tab.id} tabId={tab.id} isHush={tab.isHush} />;
    case 'settings':
      return <SettingsPage key={tab.id} tabId={tab.id} section={internalAddressOf(tab.url)?.section ?? null} />;
    case 'history':
      return <HistoryPage key={tab.id} tabId={tab.id} />;
    case 'bookmarks':
      return <BookmarksPage key={tab.id} tabId={tab.id} />;
    case 'downloads':
      return <DownloadsPage key={tab.id} />;
    case null:
      return null;
  }
}
