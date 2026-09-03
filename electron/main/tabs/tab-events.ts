import type { ContextMenuParams } from 'electron';
import type { TabId } from '../../shared/types';
import { fallbackTitleFor, hostOf, originOf, registrableDomainOf } from '../../shared/url';
import type { ContentBlocker } from '../security/blocker';
import type { BrowserStore } from '../data/store';
import { describeNetError, isAbortError } from '../system/net-errors';
import { log } from '../system/diagnostics';
import type { TabRecord } from './tab-record';

/**
 * What the page can tell us about itself. Everything here is reported by the
 * tab's own web contents, so it arrives whenever the page decides — long after
 * the navigation that caused it, and sometimes for a tab already closed.
 */
export interface TabEventDeps {
  store: BrowserStore;
  blocker: ContentBlocker;
  onChanged: () => void;
  applyVisibility: () => void;
  cacheFavicon: (tab: TabRecord, faviconUrl: string) => void;
  onFoundInPage: (activeMatch: number, matches: number) => void;
  onContextMenu: (tabId: TabId, params: ContextMenuParams) => void;
}

export function attachTabEvents(tab: TabRecord, deps: TabEventDeps): void {
  const contents = tab.view.webContents;
  const changed = () => deps.onChanged();

  contents.on('did-start-loading', () => {
    tab.isLoading = true;
    tab.loadStartedAt = Date.now();
    changed();
  });

  contents.on('did-stop-loading', () => {
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
    // Set before any subresource request is judged, so an exception applies
    // from the first request of the page rather than the second load.
    const site = hostOf(details.url);
    deps.blocker.setPageSite(contents.id, registrableDomainOf(site) ?? site);
  });

  const commitNavigation = (url: string, isInPage: boolean) => {
    if (url === 'about:blank') {
      return;
    }
    tab.url = url;
    tab.isStartPage = false;
    tab.error = null;
    if (!isInPage) {
      tab.title = fallbackTitleFor(url);
      tab.faviconDataUrl = deps.store.getFavicon(url);
    }
    // A stored level for this origin wins over whatever the tab was showing,
    // so following a link to a site you zoomed once arrives zoomed.
    if (!isInPage) {
      tab.zoomFactor = deps.store.getZoomForOrigin(originOf(url)) ?? deps.store.getSettings().defaultZoomFactor;
    }
    contents.setZoomFactor(tab.zoomFactor);
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
   * ours — a promise made early and not spent since. insertCSS needs no
   * preload and adds nothing a page can call.
   *
   * It reaches the top document only. Electron's insertCSS takes a webContents
   * and there is no equivalent on a frame, so collapsing space inside an iframe
   * would mean running a script in it — which is the promise above. Requests
   * made from inside frames are still refused, because webRequest sees every
   * frame; what is left uncollapsed is the space a blocked advert had inside
   * one, and Settings says so rather than pretending otherwise.
   */
  const hideWhatWasBlocked = (url: string) => {
    if (!url.startsWith('http')) {
      return;
    }
    const styles = deps.blocker.cosmeticStylesFor(url);
    if (styles) {
      void contents.insertCSS(styles).catch(() => {
        // A page that navigated away before this landed is not a failure.
      });
    }
  };

  contents.on('dom-ready', () => hideWhatWasBlocked(contents.getURL()));

  contents.on('did-navigate', (_event, url) => commitNavigation(url, false));
  contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (isMainFrame) {
      commitNavigation(url, true);
    }
  });

  contents.on('page-title-updated', (_event, title) => {
    tab.title = title;
    if (!tab.isStartPage && !tab.error && tab.url.startsWith('http')) {
      // The whole point of a Hush tab: no record of where it went.
      if (!tab.isHush) {
        deps.store.recordVisit(tab.url, title);
      }
    }
    changed();
  });

  contents.on('page-favicon-updated', (_event, favicons) => {
    const [faviconUrl] = favicons;
    // A cached favicon is a list of sites visited, stored by another name.
    if (faviconUrl && !tab.isHush) {
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
      description:
        details.reason === 'oom'
          ? 'This page ran out of memory. Reloading usually recovers it.'
          : 'The process rendering this page stopped unexpectedly.',
      url: tab.url,
    };
    deps.applyVisibility();
    changed();
  });

  contents.on('found-in-page', (_event, result) => {
    deps.onFoundInPage(result.activeMatchOrdinal ?? 0, result.matches ?? 0);
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
