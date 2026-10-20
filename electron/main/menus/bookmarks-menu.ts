// Libs
import { Menu, type KeyboardEvent, type MenuItemConstructorOptions } from 'electron';

// Utils
import { childrenOf, type BookmarkFolder } from '../../shared/data/bookmark-folders';
import { t } from '../../shared/i18n/translate';

// Types
import type { Bookmark } from '../../shared/types';
import type { Browser } from '../app/browser';

const MAX_LABEL = 60;

function labelFor(bookmark: Bookmark): string {
  const title = bookmark.title.trim() || bookmark.url;
  return title.length > MAX_LABEL ? `${title.slice(0, MAX_LABEL - 1)}…` : title;
}

/** Cmd or Ctrl opens it in a background tab, as a middle-click would on a link. */
function open(browser: Browser, bookmark: Bookmark, event: KeyboardEvent): void {
  if (event.metaKey || event.ctrlKey) {
    browser.tabs.create(bookmark.url, { activate: false });
    return;
  }
  browser.commands.openInActiveTab(bookmark.url);
}

function itemsIn(
  browser: Browser,
  folderId: string | null,
  folders: readonly BookmarkFolder[],
  bookmarks: readonly Bookmark[],
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [
    ...childrenOf(folders, folderId).map((folder) => ({
      label: folder.name,
      submenu: itemsIn(browser, folder.id, folders, bookmarks),
    })),
    ...bookmarks
      .filter((bookmark) => bookmark.folderId === folderId)
      .map((bookmark) => ({
        label: labelFor(bookmark),
        click: (_item: unknown, _window: unknown, event: KeyboardEvent) => open(browser, bookmark, event),
      })),
  ];
  return items.length > 0 ? items : [{ label: t('main.menu.context.empty'), enabled: false }];
}

/** Every folder and bookmark, cascading, so a bookmark is two clicks away over any page. */
export function bookmarksMenuItems(browser: Browser): MenuItemConstructorOptions[] {
  const { tabs, activeTabId } = browser.tabs.snapshot();
  const active = tabs.find((tab) => tab.id === activeTabId);
  const folders = browser.store.listBookmarkFolders();
  const bookmarks = browser.store.listBookmarks();
  const hasAny = folders.length > 0 || bookmarks.length > 0;

  return [
    {
      label: active?.isBookmarked ? t('main.menu.context.removeBookmark') : t('main.menu.bookmarks.bookmarkThisPage'),
      enabled: active !== undefined && !active.isStartPage,
      click: () => browser.commands.toggleBookmarkForActiveTab(),
    },
    { type: 'separator' },
    ...(hasAny ? itemsIn(browser, null, folders, bookmarks) : []),
    ...(hasAny ? [{ type: 'separator' as const }] : []),
    { label: t('main.menu.bookmarks.showAll'), click: () => browser.openSurface('bookmarks') },
  ];
}

/** What the bookmarks bar had no room for, in the order the bar shows them: its folders, then its bookmarks. */
export function showBookmarkOverflowMenu(
  browser: Browser,
  folderIds: readonly string[],
  bookmarkIds: readonly string[],
  x: number,
  y: number,
): void {
  const folders = browser.store.listBookmarkFolders();
  const bookmarks = browser.store.listBookmarks();
  const items: MenuItemConstructorOptions[] = [
    ...folders
      .filter((folder) => folderIds.includes(folder.id))
      .map((folder) => ({ label: folder.name, submenu: itemsIn(browser, folder.id, folders, bookmarks) })),
    ...bookmarks
      .filter((bookmark) => bookmarkIds.includes(bookmark.id))
      .map((bookmark) => ({
        label: labelFor(bookmark),
        click: (_item: unknown, _window: unknown, event: KeyboardEvent) => open(browser, bookmark, event),
      })),
  ];
  if (items.length > 0) {
    Menu.buildFromTemplate(items).popup({ window: browser.window, x, y });
  }
}

export function showBookmarksMenu(browser: Browser, x: number, y: number): void {
  Menu.buildFromTemplate(bookmarksMenuItems(browser)).popup({ window: browser.window, x, y });
}
