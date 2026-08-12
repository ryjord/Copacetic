import { type ContextMenuParams, Menu, type MenuItemConstructorOptions, clipboard, shell } from 'electron';
import type { TabId } from '../shared/types';
import { addToDictionaryLabel, searchSelectionLabel } from '../shared/chrome-text';
import { isPageNavigableUrl } from '../shared/url';
import type { Browser } from './browser';

/** The menu shown when someone right-clicks inside a page. */
export function showPageContextMenu(browser: Browser, tabId: TabId, params: ContextMenuParams): void {
  const items: MenuItemConstructorOptions[] = [];
  const push = (item: MenuItemConstructorOptions) => items.push(item);
  const separate = () => {
    if (items.length > 0 && items[items.length - 1]?.type !== 'separator') {
      push({ type: 'separator' });
    }
  };

  // Both of these are strings the page controls, so they get the same strict
  // treatment as anything else page code hands us. `srcURL` in particular is
  // routinely a `data:` URL, which must never become a tab of its own.
  const linkUrl = params.linkURL && isPageNavigableUrl(params.linkURL) ? params.linkURL : '';
  const imageUrl =
    params.mediaType === 'image' && params.srcURL && isPageNavigableUrl(params.srcURL) ? params.srcURL : '';
  const hasSelection = params.selectionText.trim().length > 0;

  if (linkUrl) {
    push({
      label: 'Open link in new tab',
      click: () =>
        browser.tabs.create(linkUrl, {
          activate: true,
          openerWebContentsId: browser.tabs.webContentsIdFor(tabId),
        }),
    });
    push({
      label: 'Open link in background tab',
      click: () => browser.tabs.create(linkUrl, { activate: false }),
    });
    push({ label: 'Copy link address', click: () => clipboard.writeText(linkUrl) });
    push({ label: 'Download linked file', click: () => browser.downloadUrl(linkUrl) });
    separate();
  }

  if (imageUrl) {
    push({ label: 'Open image in new tab', click: () => browser.tabs.create(imageUrl, { activate: true }) });
    push({ label: 'Copy image', click: () => browser.tabs.copyImageAt(tabId, params.x, params.y) });
    push({ label: 'Copy image address', click: () => clipboard.writeText(imageUrl) });
    push({ label: 'Save image', click: () => browser.downloadUrl(imageUrl) });
    separate();
  }

  if (params.isEditable) {
    push({ role: 'undo' });
    push({ role: 'redo' });
    push({ type: 'separator' });
    push({ role: 'cut' });
    push({ role: 'copy' });
    push({ role: 'paste' });
    push({ role: 'pasteAndMatchStyle' });
    push({ role: 'selectAll' });
    separate();

    for (const suggestion of params.dictionarySuggestions.slice(0, 5)) {
      push({ label: suggestion, click: () => browser.tabs.replaceMisspelling(tabId, suggestion) });
    }
    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length === 0) {
        push({ label: 'No spelling suggestions', enabled: false });
      }
      push({
        label: addToDictionaryLabel(params.misspelledWord),
        click: () => browser.tabs.addToDictionary(tabId, params.misspelledWord),
      });
      separate();
    }
  } else if (hasSelection) {
    const selection = params.selectionText.trim();
    push({ role: 'copy' });
    push({
      label: searchSelectionLabel(selection),
      click: () => browser.tabs.create(browser.searchUrlFor(selection), { activate: true }),
    });
    separate();
  }

  if (!linkUrl && !imageUrl && !hasSelection && !params.isEditable) {
    push({ label: 'Back', enabled: browser.tabs.canGoBack(tabId), click: () => browser.tabs.goBack(tabId) });
    push({ label: 'Forward', enabled: browser.tabs.canGoForward(tabId), click: () => browser.tabs.goForward(tabId) });
    push({ label: 'Reload', click: () => browser.tabs.reload(tabId) });
    separate();
    push({ label: 'Copy page address', click: () => clipboard.writeText(browser.tabs.urlFor(tabId) ?? '') });
    push({ label: 'Bookmark this page', click: () => browser.toggleBookmarkForActiveTab() });
    separate();
  }

  push({ label: 'Inspect element', click: () => browser.tabs.inspectAt(tabId, params.x, params.y) });

  Menu.buildFromTemplate(items).popup({ window: browser.window });
}

/** The menu shown when someone right-clicks a tab in the strip. */
export function showTabContextMenu(browser: Browser, tabId: TabId): void {
  const url = browser.tabs.urlFor(tabId);
  const isBookmarked = url ? browser.store.isBookmarked(url) : false;

  const items: MenuItemConstructorOptions[] = [
    { label: 'New tab to the right', click: () => browser.tabs.create(undefined, { activate: true }) },
    { label: 'New Hush tab', click: () => browser.newHushTab() },
    {
      label: 'Reopen closed tab',
      enabled: browser.tabs.hasClosedTabs(),
      click: () => browser.reopenClosedTab(),
    },
    { label: 'Duplicate tab', enabled: url !== null, click: () => browser.tabs.duplicate(tabId) },
    { label: 'Reload', click: () => browser.tabs.reload(tabId) },
    { type: 'separator' },
    {
      label: isBookmarked ? 'Remove bookmark' : 'Bookmark this page',
      enabled: url !== null,
      click: () => {
        if (url) {
          browser.store.toggleBookmark(url, browser.tabs.titleFor(tabId));
          browser.scheduleStatePush();
        }
      },
    },
    { label: 'Copy address', enabled: url !== null, click: () => clipboard.writeText(url ?? '') },
    {
      label: 'Open in default browser',
      enabled: url !== null && (url.startsWith('http://') || url.startsWith('https://')),
      click: () => {
        if (url) {
          void shell.openExternal(url);
        }
      },
    },
    { type: 'separator' },
    { label: 'Close tab', click: () => browser.tabs.close(tabId) },
    { label: 'Close other tabs', click: () => browser.tabs.closeOthers(tabId) },
    { label: 'Close tabs to the right', click: () => browser.tabs.closeToTheRight(tabId) },
  ];

  Menu.buildFromTemplate(items).popup({ window: browser.window });
}

/**
 * Behind the caret beside the new-tab button. A native menu rather than markup:
 * a WebContentsView paints above the chrome's HTML, so a dropdown over the page
 * area would be drawn underneath the page.
 */
export function showNewTabMenu(browser: Browser): void {
  const items: MenuItemConstructorOptions[] = [
    { label: 'New tab', click: () => browser.newTab() },
    { label: 'New Hush tab', click: () => browser.newHushTab() },
    { type: 'separator' },
    {
      label: 'Reopen closed tab',
      enabled: browser.tabs.hasClosedTabs(),
      click: () => browser.reopenClosedTab(),
    },
  ];

  Menu.buildFromTemplate(items).popup({ window: browser.window });
}
