import type { RememberedCertificate } from '../../shared/browsing/certificate-changes';
import type { BrowserStore } from '../data/store';
import type { ClosedTab, ClosedTabs } from './closed-tabs';

/**
 * Everything a tab's browsing can leave behind, in one place.
 *
 * Chosen once, when the tab is made, by whether it is Hush. Before this each
 * write asked `isHush` for itself, and a write added later that forgot to ask
 * put a Hush tab's sites on disk with nothing to notice it. Now a call site
 * records unconditionally, and a Hush tab has a record that keeps nothing.
 */
export interface BrowsingRecord {
  recordVisit(url: string, title: string): void;
  addBlocked(url: string, count: number): void;
  keepFavicon(url: string, dataUrl: string): void;
  rememberCertificate(origin: string, certificate: RememberedCertificate): void;
  setZoomForOrigin(origin: string, zoomFactor: number): void;
  rememberClosedTab(tab: ClosedTab): void;
}

/** An ordinary tab's record: history, the icon cache, certificates seen, zoom by site, and tabs to reopen. */
export function storedRecord(store: BrowserStore, closedTabs: ClosedTabs): BrowsingRecord {
  return {
    recordVisit: (url, title) => store.recordVisit(url, title),
    addBlocked: (url, count) => store.addBlocked(url, count),
    keepFavicon: (url, dataUrl) => store.setFavicon(url, dataUrl),
    rememberCertificate: (origin, certificate) => store.rememberCertificate(origin, certificate),
    setZoomForOrigin: (origin, zoomFactor) => store.setZoomForOrigin(origin, zoomFactor),
    rememberClosedTab: (tab) => closedTabs.remember(tab),
  };
}

/**
 * A Hush tab's record, which keeps nothing.
 *
 * What the tab shows is unaffected: its icon, zoom and certificate check live
 * on the tab itself while it is open. Only what would outlast it is not kept.
 */
export const HUSH_RECORD: BrowsingRecord = {
  recordVisit: () => {},
  addBlocked: () => {},
  keepFavicon: () => {},
  rememberCertificate: () => {},
  setZoomForOrigin: () => {},
  rememberClosedTab: () => {},
};
