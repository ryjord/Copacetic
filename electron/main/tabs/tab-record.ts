import type { WebContentsView } from 'electron';
import type { PageError, TabId } from '../../shared/types';
import type { BrowsingRecord } from './browsing-record';

/** Everything the main process knows about one tab. */
export interface TabRecord {
  id: TabId;
  view: WebContentsView;
  /** Nothing this tab does is written to disk - see ProfilePartitions.hush. */
  isHush: boolean;
  /** Where what it leaves behind goes; for a Hush tab, nowhere. */
  record: BrowsingRecord;
  /** True while the tab shows Copacetic's own start page instead of a site. */
  isStartPage: boolean;
  url: string;
  title: string;
  faviconDataUrl: string | null;
  isLoading: boolean;
  error: PageError | null;
  loadStartedAt: number | null;
  loadMs: number | null;
  zoomFactor: number;
  isMuted: boolean;
  /** The favicon URL we last kicked off a fetch for, to avoid refetching. */
  pendingFaviconUrl: string | null;
  isPinned: boolean;
  /** Which group this tab belongs to. Never written to disk for a Hush tab. */
  groupId: string | null;
  /** The session it was born in, which a view can never change. */
  partition: string;
  /** Its page closed to free memory; the tab, its address and its history wait to be woken. */
  isAsleep: boolean;
  /** When it was last the tab in front, which is what sleeping is measured from. */
  lastActiveAt: number;
  /** The back and forward list it had when it went to sleep, restored when it wakes. */
  sleptHistory: { entries: Electron.NavigationEntry[]; index: number } | null;
}
