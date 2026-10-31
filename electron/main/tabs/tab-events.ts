// Utils
import { MAX_PINCH_ZOOM, clampZoom } from '../../shared/types';
import { fallbackTitleFor, hostOf, originOf, siteOfHost } from '../../shared/browsing/url';
import { internalPageOf } from '../../shared/tabs/internal-pages';
import { canAcceptRefused } from '../security/certificate-exceptions';
import { describeNetError, isAbortError } from '../system/net-errors';
import { log } from '../system/diagnostics';
import { t } from '../../shared/i18n/translate';

// Types
import type { ContextMenuParams } from 'electron';
import type { TabId } from '../../shared/types';
import type { ContentBlocker } from '../security/blocker';
import type { HttpsFirst } from '../security/https-first';
import type { BrowserStore } from '../data/store';
import type { TabRecord } from './tab-record';

/** How a tab's page changed: a new document, a move within the same one, or a document finished loading. */
export type PageChange = 'committed' | 'in-page' | 'loaded';

/**
 * What the page can tell us about itself. Everything here is reported by the
 * tab's own web contents, so it arrives whenever the page decides - long after
 * the navigation that caused it, and sometimes for a tab already closed.
 */
export interface TabEventDeps {
  store: BrowserStore;
  blocker: ContentBlocker;
  httpsFirst: HttpsFirst;
  /** Forgets what has been written to history for a tab, when its page changes. */
  forgetBlockedCount: (webContentsId: number) => void;
  onChanged: () => void;
  applyVisibility: () => void;
  cacheFavicon: (tab: TabRecord, faviconUrl: string) => void;
  onFoundInPage: (activeMatch: number, matches: number, isFinal: boolean) => void;
  onContextMenu: (tabId: TabId, params: ContextMenuParams) => void;
  onPageChanged: (tabId: TabId, change: PageChange) => void;
}

export function attachTabEvents(tab: TabRecord, deps: TabEventDeps): void {
  const contents = tab.view.webContents;
  const changed = () => deps.onChanged();

  contents.on('did-start-loading', () => {
    tab.isLoading = true;
    tab.loadStartedAt = Date.now();
    changed();
  });

  // Each view is given an empty page before its first address; until a real page commits, that stopping is not the tab's.
  let hasArrived = false;
  contents.on('did-stop-loading', () => {
    if (!hasArrived && contents.getURL() === 'about:blank' && internalPageOf(tab.url) === null) {
      return;
    }
    tab.isLoading = false;
    if (tab.loadStartedAt !== null) {
      tab.loadMs = Date.now() - tab.loadStartedAt;
      tab.loadStartedAt = null;
    }
    changed();
  });

  contents.on('did-start-navigation', (details) => {
    if (!details.isMainFrame) {
      return;
    }
    deps.blocker.resetCount(contents.id);
    deps.forgetBlockedCount(contents.id);
    // Set before any subresource request is judged, so an exception applies
    // from the first request of the page rather than the second load.
    const site = hostOf(details.url);
    deps.blocker.setPageSite(contents.id, siteOfHost(site));
  });

  const commitNavigation = (url: string, isInPage: boolean) => {
    if (url === 'about:blank') {
      return;
    }
    hasArrived = true;
    tab.url = url;
    tab.error = null;
    if (!isInPage) {
      tab.title = fallbackTitleFor(url);
      tab.faviconDataUrl = deps.store.getFavicon(url);
      dropBlankEntries(contents.navigationHistory);
    }
    // A stored level for this origin wins over whatever the tab was showing,
    // so following a link to a site you zoomed once arrives zoomed.
    if (!isInPage) {
      // Clamped here too: this reads a stored value straight onto the tab
      // without going through setZoom, so it is the one path that could put a
      // level on screen that no control can produce.
      tab.zoomFactor = clampZoom(
        deps.store.getZoomForOrigin(originOf(url)) ?? deps.store.getSettings().defaultZoomFactor,
      );
    }
    contents.setZoomFactor(tab.zoomFactor);
    // Electron turns trackpad pinching off unless asked; asked again on each new page, which may be a fresh renderer.
    if (!isInPage) {
      void contents.setVisualZoomLevelLimits(1, MAX_PINCH_ZOOM).catch(() => {});
    }
    deps.applyVisibility();
    changed();
  };

  /**
   * Collapses what a blocked advert leaves behind.
   *
   * A refused request still leaves the frame the page laid out for it, so a
   * page with blocking on looks like a page full of holes. This is the
   * stylesheet that closes them.
   *
   * A stylesheet on purpose. Hiding elements is what other blockers use an
   * injected script for, and page content in this browser gets no script of
   * ours - a promise made early and not spent since. insertCSS needs no
   * preload and adds nothing a page can call.
   *
   * It reaches the top document only. Electron's insertCSS takes a webContents
   * and there is no equivalent on a frame, so collapsing space inside an iframe
   * would mean running a script in it - which is the promise above. Requests
   * made from inside frames are still refused, because webRequest sees every
   * frame; what is left uncollapsed is the space a blocked advert had inside
   * one, and Settings says so rather than pretending otherwise.
   */
  const hideWhatWasBlocked = (url: string) => {
    if (!url.startsWith('http')) {
      return;
    }
    const styles = deps.blocker.cosmeticStylesFor(url, contents.session, deps.store.getSettings().hideCookieBanners);
    if (styles) {
      void contents.insertCSS(styles).catch(() => {
        // A page that navigated away before this landed is not a failure.
      });
    }
  };

  contents.on('dom-ready', () => hideWhatWasBlocked(contents.getURL()));

  contents.on('did-navigate', (_event, url, responseCode) => {
    deps.httpsFirst.committed(contents.id, responseCode);
    commitNavigation(url, false);
    deps.onPageChanged(tab.id, 'committed');
  });
  contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (isMainFrame) {
      commitNavigation(url, true);
      deps.onPageChanged(tab.id, 'in-page');
    }
  });
  contents.on('did-finish-load', () => deps.onPageChanged(tab.id, 'loaded'));

  contents.on('page-title-updated', (_event, title) => {
    // The blank view behind one of our pages has a title of its own, which must not stick to the tab.
    if (internalPageOf(tab.url)) {
      return;
    }
    tab.title = title;
    if (!tab.error && tab.url.startsWith('http')) {
      tab.record.recordVisit(tab.url, title);
    }
    changed();
  });

  contents.on('page-favicon-updated', (_event, favicons) => {
    const [faviconUrl] = favicons;
    if (faviconUrl) {
      deps.cacheFavicon(tab, faviconUrl);
    }
  });

  contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || isAbortError(errorCode)) {
      return;
    }
    const info = describeNetError(errorCode, errorDescription);
    // Worth a record, and the reason the log scrubs addresses: which page
    // failed is the user's business, that one did is Copacetic's.
    log.warn('a page failed to load', { url: validatedURL || tab.url, code: errorCode, reason: info.name });
    tab.isLoading = false;
    tab.error = {
      code: errorCode,
      name: info.name,
      description: info.description,
      url: validatedURL || tab.url,
      plainUrl: deps.httpsFirst.fallbackFor(contents.id, validatedURL || tab.url),
      canAcceptCertificate:
        info.name.startsWith('ERR_CERT') && canAcceptRefused(contents.id, validatedURL || tab.url),
    };
    tab.url = validatedURL || tab.url;
    deps.applyVisibility();
    changed();
  });

  contents.on('render-process-gone', (_event, details) => {
    tab.isLoading = false;
    tab.error = {
      code: 0,
      name: `RENDERER_${details.reason.toUpperCase().replace(/-/g, '_')}`,
      description: details.reason === 'oom' ? t('main.tabs.crash.outOfMemory') : t('main.tabs.crash.stopped'),
      url: tab.url,
    };
    deps.applyVisibility();
    changed();
  });

  contents.on('found-in-page', (_event, result) => {
    deps.onFoundInPage(result.activeMatchOrdinal ?? 0, result.matches ?? 0, result.finalUpdate === true);
    changed();
  });

  contents.on('audio-state-changed', changed);
  contents.on('media-started-playing', changed);
  contents.on('media-paused', changed);

  // A WebContentsView paints above the chrome's HTML, so an in-page context
  // menu drawn in React would be hidden behind the page. Native menus are
  // both the only thing that can sit on top and the correct platform answer.
  contents.on('context-menu', (_event, params) => {
    deps.onContextMenu(tab.id, params);
  });
}

/** Marks a tab loading from the moment a page is asked for, ahead of Chromium's did-start-loading. */
export function markLoadRequested(tab: Pick<TabRecord, 'isLoading'>): void {
  tab.isLoading = true;
}

/** Settles a tab whose load ended without Chromium starting it, which sends no did-stop-loading. Says whether it changed. */
export function settleUnstartedLoad(
  tab: Pick<TabRecord, 'isLoading'>,
  contents: { isDestroyed(): boolean; isLoading(): boolean },
): boolean {
  if (!tab.isLoading || contents.isDestroyed() || contents.isLoading()) {
    return false;
  }
  tab.isLoading = false;
  return true;
}

/**
 * Takes out the blank pages one of our pages left in a view's history, so Back
 * and Forward step between sites and never land on a white page with an old address.
 */
export function dropBlankEntries(history: {
  getAllEntries(): { url: string }[];
  getActiveIndex(): number;
  removeEntryAtIndex(index: number): boolean;
}): void {
  const active = history.getActiveIndex();
  history
    .getAllEntries()
    .map((entry, index) => ({ url: entry.url, index }))
    .filter((entry) => entry.url === 'about:blank' && entry.index !== active)
    // From the end, so removing one leaves the positions of those before it alone.
    .reverse()
    .forEach((entry) => history.removeEntryAtIndex(entry.index));
}
