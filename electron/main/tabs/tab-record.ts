import type { WebContentsView } from 'electron';
import type { PageError, TabId } from '../../shared/types';

/** Everything the main process knows about one tab. */
export interface TabRecord {
  id: TabId;
  view: WebContentsView;
  /** Nothing this tab does is written to disk — see HUSH_PARTITION. */
  isHush: boolean;
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
}
