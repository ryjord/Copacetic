// Libs
import { type ContextMenuParams, Menu, type MenuItemConstructorOptions, clipboard, dialog, shell } from 'electron';

// Utils
import { cleanUrl } from '../../shared/browsing/link-cleaning';
import { t } from '../../shared/i18n/translate';
import { addToDictionaryLabel, searchSelectionLabel } from '../../shared/chrome/chrome-text';
import { isPageNavigableUrl } from '../../shared/browsing/url';
import { GROUP_COLOURS, claimOf, describeClaim } from '../../shared/tabs/tab-groups';
import { isInSplit } from '../../shared/tabs/split-view';
import { groupIdOf, groupTarget, openRuleFor } from '../../shared/tabs/open-rules';
import { countIn, pathOf } from '../../shared/data/bookmark-folders';
import { countTraces, describeTraces, siteOf } from '../../shared/data/forgetting';

// Types
import type { TabId } from '../../shared/types';
import type { OpenTarget } from '../../shared/tabs/open-rules';
import type { Browser } from '../app/browser';

/** Where this tab's site always opens: offered for a page, never for Hush, which already keeps nothing. */
function openRuleItems(browser: Browser, tabId: TabId): MenuItemConstructorOptions[] {
  const url = browser.tabs.urlFor(tabId);
  const site = url && isPageNavigableUrl(url) ? siteOf(url) : '';
  if (!url || !site || browser.tabs.isHush(tabId)) {
    return [];
  }
  const settings = browser.store.getSettings();
  const setRule = (target: OpenTarget | null) => {
    const others = Object.fromEntries(Object.entries(settings.openRules).filter(([key]) => key !== site));
    browser.profile.updateSettings({ openRules: target ? { ...others, [site]: target } : others });
  };
  const existing = openRuleFor(settings.openRules, url);
  if (existing) {
    const groupId = groupIdOf(existing);
    const place = groupId ? (browser.store.groupFor(groupId)?.name ?? '') : t('main.menu.context.hushPlace');
    return [{ label: t('main.menu.context.stopAlwaysOpening', { site, place }), click: () => setRule(null) }];
  }
  const group = browser.store.groupFor(browser.tabs.groupIdFor(tabId));
  return [
    { label: t('main.menu.context.alwaysInHush', { site }), click: () => setRule('hush') },
    ...(group
      ? [
          {
            label: t('main.menu.context.alwaysInGroup', { site, group: group.name }),
            click: () => setRule(groupTarget(group.id)),
          },
        ]
      : []),
  ];
}

function splitItem(browser: Browser, tabId: TabId): MenuItemConstructorOptions {
  if (isInSplit(browser.tabs.getSplit(), tabId)) {
    return { label: t('main.menu.context.leaveSplit'), click: () => browser.tabs.leaveSplit() };
  }
  if (tabId === browser.tabs.getActiveTabId()) {
    return { label: t('main.menu.context.splitWithNewTab'), click: () => browser.tabs.splitWith(null) };
  }
  return { label: t('main.menu.context.showBesideCurrent'), click: () => browser.tabs.splitWith(tabId) };
}

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
      label: t('main.menu.context.openLinkInNewTab'),
      click: () =>
        browser.tabs.create(linkUrl, {
          activate: true,
          openerWebContentsId: browser.tabs.webContentsIdFor(tabId),
        }),
    });
    push({
      label: t('main.menu.context.openLinkInBackgroundTab'),
      click: () =>
        browser.tabs.create(linkUrl, {
          activate: false,
          openerWebContentsId: browser.tabs.webContentsIdFor(tabId),
        }),
    });
    // From a Hush tab every link already opens in Hush, so the choice is only offered elsewhere.
    if (!browser.tabs.isHush(tabId)) {
      push({
        label: t('main.menu.context.openLinkInHushTab'),
        click: () =>
          browser.tabs.create(linkUrl, {
            activate: true,
            hush: true,
            openerWebContentsId: browser.tabs.webContentsIdFor(tabId),
          }),
      });
    }
    // The address someone shares is the clean one, when they asked for links to be cleaned.
    const shareable = browser.profile.settings().cleanLinks ? (cleanUrl(linkUrl) ?? linkUrl) : linkUrl;
    push({ label: t('main.menu.context.copyLinkAddress'), click: () => clipboard.writeText(shareable) });
    push({ label: t('main.menu.context.downloadLinkedFile'), click: () => browser.commands.downloadUrl(linkUrl) });
    separate();
  }

  if (imageUrl) {
    push({
      label: t('main.menu.context.openImageInNewTab'),
      click: () =>
        browser.tabs.create(imageUrl, {
          activate: true,
          openerWebContentsId: browser.tabs.webContentsIdFor(tabId),
        }),
    });
    push({
      label: t('main.menu.context.copyImage'),
      click: () => browser.tabs.copyImageAt(tabId, params.x, params.y),
    });
    push({ label: t('main.menu.context.copyImageAddress'), click: () => clipboard.writeText(imageUrl) });
    push({ label: t('main.menu.context.saveImage'), click: () => browser.commands.downloadUrl(imageUrl) });
    separate();
  }

  // Offered where a password box actually is, and only for this page's own site.
  if (params.isEditable) {
    const offer = browser.passwords.offerFor(tabId);
    if (offer.entries.length > 0) {
      push({
        label: t('main.menu.context.fillPassword'),
        submenu: offer.entries.map((entry) => ({
          label: entry.username || t('main.menu.context.savedPassword'),
          click: () => {
            void browser.passwords.fill(tabId, entry.id);
          },
        })),
      });
      separate();
    }
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
        push({ label: t('main.menu.context.noSpellingSuggestions'), enabled: false });
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
      click: () =>
        browser.tabs.create(browser.commands.searchUrlFor(selection), {
          activate: true,
          openerWebContentsId: browser.tabs.webContentsIdFor(tabId),
        }),
    });
    separate();
  }

  if (!linkUrl && !imageUrl && !hasSelection && !params.isEditable) {
    push({
      label: t('main.menu.history.back'),
      enabled: browser.tabs.canGoBack(tabId),
      click: () => browser.tabs.goBack(tabId),
    });
    push({
      label: t('main.menu.history.forward'),
      enabled: browser.tabs.canGoForward(tabId),
      click: () => browser.tabs.goForward(tabId),
    });
    push({ label: t('main.menu.view.reload'), click: () => browser.tabs.reload(tabId) });
    separate();
    push({
      label: t('main.menu.context.copyPageAddress'),
      click: () => clipboard.writeText(browser.tabs.urlFor(tabId) ?? ''),
    });
    push({
      label: t('main.menu.bookmarks.bookmarkThisPage'),
      click: () => browser.toggleBookmarkForActiveTab(),
    });
    push({ label: t('main.menu.file.savePageAs'), click: () => browser.commands.savePage(tabId) });
    push({ label: t('main.menu.file.screenshot'), click: () => browser.commands.saveScreenshot(tabId) });
    push({ label: t('main.menu.file.print'), click: () => browser.commands.print(tabId) });
    push({ label: t('main.menu.view.viewPageSource'), click: () => browser.commands.viewSource(tabId) });
    separate();
  }

  // What extensions added, above Inspect as Chrome puts them; a Hush tab runs none.
  const contentsId = browser.tabs.webContentsIdFor(tabId);
  const fromExtensions =
    contentsId === undefined || browser.tabs.isHush(tabId)
      ? []
      : browser.profile.extensions.menuItemsFor({
          pageUrl: params.pageURL,
          linkUrl,
          srcUrl: imageUrl,
          selectionText: params.selectionText,
          isEditable: params.isEditable,
          mediaType: params.mediaType,
          tabId: contentsId,
        });
  if (fromExtensions.length > 0) {
    separate();
    fromExtensions.forEach((item) => push(item));
    separate();
  }

  push({
    label: t('main.menu.context.inspectElement'),
    click: () => browser.tabs.inspectAt(tabId, params.x, params.y),
  });

  Menu.buildFromTemplate(items).popup({ window: browser.window });
}

/** The menu shown when someone right-clicks a tab in the strip. */
export function showTabContextMenu(browser: Browser, tabId: TabId): void {
  const url = browser.tabs.urlFor(tabId);
  const isBookmarked = url ? browser.store.isBookmarked(url) : false;

  const items: MenuItemConstructorOptions[] = [
    {
      label: t('main.menu.context.newTabToTheRight'),
      click: () =>
        browser.tabs.create(undefined, {
          activate: true,
          index: browser.tabs.snapshot().tabOrder.indexOf(tabId) + 1,
        }),
    },
    { label: t('main.menu.file.newHushTab'), click: () => browser.commands.newHushTab() },
    {
      label: t('main.menu.file.reopenClosedTab'),
      enabled: browser.tabs.hasClosedTabs(),
      click: () => browser.commands.reopenClosedTab(),
    },
    { label: t('main.menu.context.duplicateTab'), enabled: url !== null, click: () => browser.tabs.duplicate(tabId) },
    {
      label: t('main.menu.context.moveToNewWindow'),
      enabled: url !== null,
      click: () => browser.moveTabToNewWindow(tabId),
    },
    {
      label: browser.tabs.isPinned(tabId) ? t('main.menu.context.unpinTab') : t('main.menu.context.pinTab'),
      click: () => browser.tabs.setPinned(tabId, !browser.tabs.isPinned(tabId)),
    },
    {
      label: t('main.menu.context.putTabToSleep'),
      enabled: browser.tabs.canSleep(tabId),
      click: () => browser.tabs.sleep(tabId),
    },
    { label: t('main.menu.view.reload'), click: () => browser.tabs.reload(tabId) },
    splitItem(browser, tabId),
    ...openRuleItems(browser, tabId),
    { type: 'separator' },
    groupSubmenu(browser, tabId),
    { type: 'separator' },
    {
      label: isBookmarked ? t('main.menu.context.removeBookmark') : t('main.menu.bookmarks.bookmarkThisPage'),
      enabled: url !== null,
      click: () => {
        if (url) {
          browser.store.toggleBookmark(url, browser.tabs.titleFor(tabId));
          browser.scheduleStatePush();
        }
      },
    },
    { label: t('main.menu.context.copyAddress'), enabled: url !== null, click: () => clipboard.writeText(url ?? '') },
    {
      label: t('main.menu.context.openInDefaultBrowser'),
      enabled: url !== null && (url.startsWith('http://') || url.startsWith('https://')),
      click: () => {
        if (url) {
          void shell.openExternal(url);
        }
      },
    },
    { type: 'separator' },
    { label: t('main.menu.file.closeTab'), click: () => browser.tabs.close(tabId) },
    { label: t('main.menu.context.closeOtherTabs'), click: () => browser.tabs.closeOthers(tabId) },
    { label: t('main.menu.context.closeTabsToTheRight'), click: () => browser.tabs.closeToTheRight(tabId) },
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
    { label: t('main.menu.file.newTab'), click: () => browser.commands.newTab() },
    { label: t('main.menu.file.newHushTab'), click: () => browser.commands.newHushTab() },
    { type: 'separator' },
    {
      label: t('main.menu.file.reopenClosedTab'),
      enabled: browser.tabs.hasClosedTabs(),
      click: () => browser.commands.reopenClosedTab(),
    },
    recentlyClosedSubmenu(browser),
    { type: 'separator' },
    { label: t('main.menu.tabs.saveSession'), click: () => browser.saveTabsAsSession() },
    namedSessionsSubmenu(browser),
  ];

  Menu.buildFromTemplate(items).popup({ window: browser.window });
}

const MAX_CLOSED_LABEL = 60;

/** Every tab and group that can come back, newest first; a group is one item and reopens as the group. */
export function recentlyClosedSubmenu(browser: Browser): MenuItemConstructorOptions {
  const entries = browser.tabs.closedEntries();
  const shorten = (text: string) =>
    text.length > MAX_CLOSED_LABEL ? `${text.slice(0, MAX_CLOSED_LABEL - 1)}…` : text;
  return {
    label: t('main.menu.recentlyClosed.title'),
    enabled: entries.length > 0,
    submenu:
      entries.length === 0
        ? [{ label: t('main.menu.recentlyClosed.none'), enabled: false }]
        : entries.map((entry, position) => ({
            label:
              entry.kind === 'group'
                ? t('main.menu.recentlyClosed.group', { name: entry.group.name, count: entry.tabs.length })
                : shorten(entry.tab.title || entry.tab.url),
            click: () => browser.tabs.reopenClosedAt(position),
          })),
  };
}

export function namedSessionsSubmenu(browser: Browser): MenuItemConstructorOptions {
  const sessions = browser.store.listNamedSessions();
  return {
    label: t('main.sessions.savedSessions'),
    enabled: sessions.length > 0,
    submenu:
      sessions.length === 0
        ? [{ label: t('main.sessions.none'), enabled: false }]
        : sessions.map((session) => ({
            label: session.name,
            sublabel: t('main.sessions.tabCount', { count: session.tabCount }),
            submenu: [
              { label: t('main.sessions.open'), click: () => browser.openNamedSession(session.id) },
              { type: 'separator' },
              { label: t('main.sessions.remove'), click: () => browser.removeNamedSession(session.id) },
            ],
          })),
  };
}

/**
 * Where a group is made and joined.
 *
 * A group that keeps its own browsing is offered as a separate choice rather
 * than a checkbox on the first one, because it cannot be changed afterwards:
 * it decides which session the tabs load in, and turning it on later would
 * silently sign someone out of pages already open.
 */
function groupSubmenu(browser: Browser, tabId: TabId): MenuItemConstructorOptions {
  const groups = browser.store.listGroups();
  const current = browser.tabs.groupIdFor(tabId);
  const isHush = browser.tabs.isHush(tabId);

  const existing: MenuItemConstructorOptions[] = groups.map((group) => ({
    label: group.name,
    type: 'checkbox',
    checked: group.id === current,
    click: () => browser.groups.setForTab(tabId, group.id === current ? null : group.id),
  }));

  return {
    label: t('main.menu.context.group'),
    submenu: [
      {
        label: t('main.menu.context.newGroup'),
        click: () => browser.groups.create(tabId, t('main.menu.context.group'), GROUP_COLOURS[0].id, false),
      },
      {
        label: t('main.menu.context.newGroupKeepingBrowsing'),
        // A Hush tab would not use it: its session must never be written down,
        // so the group's separation could not reach it anyway.
        enabled: !isHush,
        click: () => browser.groups.create(tabId, t('main.menu.context.group'), GROUP_COLOURS[0].id, true),
      },
      ...(existing.length > 0 ? [{ type: 'separator' as const }, ...existing] : []),
      ...(current
        ? [
            { type: 'separator' as const },
            { label: t('main.menu.context.removeFromGroup'), click: () => browser.groups.setForTab(tabId, null) },
          ]
        : []),
    ],
  };
}

/**
 * A group's own menu.
 *
 * Right-clicking a group is the first thing anyone tries, and until this
 * existed it did nothing at all: renaming lived behind a left-click on the
 * label and ungrouping behind that, so a group could be made and then not
 * got rid of.
 */
export function showGroupContextMenu(browser: Browser, groupId: string): void {
  const group = browser.store.groupFor(groupId);
  if (!group) {
    return;
  }

  // What the group can honestly promise about its browsing. It was on the
  // panel, and the panel is gone; it is not a detail worth losing, because it
  // is the only place a mixed group admits what it is.
  const claim = claimOf(group, browser.tabs.groupHoldsHush(groupId));

  const items: MenuItemConstructorOptions[] = [
    { label: describeClaim(claim), enabled: false },
    { type: 'separator' },
    { label: t('main.menu.context.renameNamed', { name: group.name }), click: () => browser.groups.rename(groupId) },
    {
      label: t('main.menu.context.colour'),
      submenu: GROUP_COLOURS.map((colour) => ({
        label: colour.id.charAt(0).toUpperCase() + colour.id.slice(1),
        type: 'radio' as const,
        checked: colour.id === group.colour,
        click: () => browser.groups.update(groupId, { colour: colour.id }),
      })),
    },
    { type: 'separator' },
    {
      label: group.collapsed ? t('main.menu.context.expand') : t('main.menu.context.collapse'),
      click: () => browser.groups.update(groupId, { collapsed: !group.collapsed }),
    },
    {
      // The other half of the round trip: a folder is a group at rest, so a
      // group can be put to rest. A Hush tab is never saved, and the result
      // says how many were left out rather than leaving it to be noticed.
      label: t('main.menu.context.saveAsBookmarkFolder'),
      click: () => browser.groups.saveAsFolder(groupId),
    },
    { type: 'separator' },
    // Said plainly, because "delete" beside a row of tabs reads as deleting them.
    { label: t('main.menu.context.ungroupTabs'), click: () => browser.groups.remove(groupId) },
    {
      label: t('main.menu.context.closeTheseTabs'),
      click: () => void closeGroupAfterAsking(browser, groupId, group.ownSession),
    },
  ];

  Menu.buildFromTemplate(items).popup({ window: browser.window });
}

/**
 * The key in the address bar: one saved password fills at once, several are
 * chosen from a menu. The page is never told a password exists until one is
 * put into it, and nothing here watches what is typed.
 */
export async function showFillMenu(browser: Browser, tabId: TabId, x: number, y: number): Promise<void> {
  const offer = browser.passwords.offerFor(tabId);
  const only = offer.entries.length === 1 ? offer.entries[0] : undefined;
  if (only) {
    await browser.passwords.fill(tabId, only.id);
    return;
  }
  if (offer.entries.length === 0) {
    return;
  }
  Menu.buildFromTemplate(
    offer.entries.map((entry) => ({
      label: entry.username || t('main.menu.context.savedPassword'),
      click: () => void browser.passwords.fill(tabId, entry.id),
    })),
  ).popup({ window: browser.window, x, y });
}

/** A group with its own session loses its sign-ins when it closes, which reopening cannot bring back, so it asks. */
async function closeGroupAfterAsking(browser: Browser, groupId: string, hasOwnSession: boolean): Promise<void> {
  if (hasOwnSession) {
    const { response } = await dialog.showMessageBox(browser.window, {
      type: 'warning',
      message: t('main.groups.closeOwnSession.message'),
      detail: t('main.groups.closeOwnSession.detail'),
      buttons: [t('main.groups.closeOwnSession.confirm'), t('main.groups.closeOwnSession.cancel')],
      defaultId: 1,
      cancelId: 1,
    });
    if (response !== 0) {
      return;
    }
  }
  browser.groups.close(groupId);
}

/**
 * A bookmark folder's menu, which is the group's menu with the same words.
 *
 * Renaming is not here for the same reason it is not on a group's: a native
 * menu cannot hold a text field, so it asks the surface to make the label
 * editable instead. Deleting says what it keeps, because a folder full of
 * bookmarks is exactly the thing someone is afraid of losing.
 */
export function showBookmarkFolderContextMenu(browser: Browser, folderId: string): void {
  const folders = browser.store.listBookmarkFolders();
  const folder = browser.store.folderFor(folderId);
  if (!folder) {
    return;
  }

  const counted = countIn(browser.store.listBookmarks(), folders, folderId);
  const children = folders.filter((candidate) => candidate.parentId === folderId).length;

  const items: MenuItemConstructorOptions[] = [
    {
      label:
        counted.here === counted.withDescendants
          ? t('main.menu.context.folderBookmarkCount', { count: counted.here })
          : t('main.menu.context.folderCountWithFolders', { here: counted.here, total: counted.withDescendants }),
      enabled: false,
    },
    { type: 'separator' },
    {
      label: t('main.menu.context.renameNamed', { name: folder.name }),
      click: () => browser.bookmarks.renameFolder(folderId),
    },
    {
      label: t('main.menu.context.colour'),
      submenu: GROUP_COLOURS.map((colour) => ({
        label: colour.id.charAt(0).toUpperCase() + colour.id.slice(1),
        type: 'radio' as const,
        checked: colour.id === folder.colour,
        click: () => browser.bookmarks.updateFolder(folderId, { colour: colour.id }),
      })),
    },
    { type: 'separator' },
    {
      // Names the number it is about to act on: a tree makes every count
      // ambiguous, and 31 tabs is not what someone expecting 18 wants.
      label: t('main.menu.context.openAllCountAsTabGroup', { count: counted.withDescendants }),
      enabled: counted.withDescendants > 0,
      click: () => browser.groups.openFolder(folderId),
    },
    { type: 'separator' },
    {
      label: t('main.menu.context.deleteFolder'),
      click: () => browser.bookmarks.deleteFolder(folderId),
    },
    {
      label:
        children > 0
          ? t('main.menu.context.deleteFolderKeepsWithFolders', { bookmarks: counted.here, folders: children })
          : t('main.menu.context.deleteFolderKeeps', { bookmarks: counted.here }),
      enabled: false,
    },
  ];

  Menu.buildFromTemplate(items).popup({ window: browser.window });
}

/**
 * One saved bookmark's menu.
 *
 * Filing was reachable only by dragging, which is no use without a mouse and
 * no use at all to anyone using the keyboard. The tab menu already lists every
 * group so a tab can join one without a drag; this is the same thing for
 * folders, and it is where filing stops being a mouse trick.
 */
export function showBookmarkContextMenu(browser: Browser, bookmarkId: string): void {
  const bookmark = browser.store.listBookmarks().find((candidate) => candidate.id === bookmarkId);
  if (!bookmark) {
    return;
  }

  const folders = browser.store.listBookmarkFolders();
  const withPath = folders.map((folder) => ({
    folder,
    // The whole path, because two folders in different places may share a name
    // and a flat list of them would be a choice between identical labels.
    label: pathOf(folders, folder.id)
      .map((entry) => entry.name)
      .join(' / '),
  }));

  const items: MenuItemConstructorOptions[] = [
    { label: bookmark.title || bookmark.url, enabled: false },
    { type: 'separator' },
    { label: t('main.menu.context.open'), click: () => browser.commands.openInActiveTab(bookmark.url) },
    { label: t('main.menu.context.openInNewTab'), click: () => browser.commands.openInNewTab(bookmark.url) },
    {
      label: t('main.menu.context.openInNewWindow'),
      click: () => void browser.profile.openWindow({ url: bookmark.url }),
    },
    { label: t('main.menu.context.copyAddress'), click: () => clipboard.writeText(bookmark.url) },
    { type: 'separator' },
    {
      label: t('main.menu.context.moveToFolder'),
      submenu: [
        {
          label: t('main.menu.context.unfiled'),
          type: 'radio' as const,
          checked: bookmark.folderId === null,
          click: () => browser.bookmarks.file(bookmarkId, null),
        },
        ...(withPath.length > 0 ? [{ type: 'separator' as const }] : []),
        ...withPath.map(({ folder, label }) => ({
          label,
          type: 'radio' as const,
          checked: folder.id === bookmark.folderId,
          click: () => browser.bookmarks.file(bookmarkId, folder.id),
        })),
      ],
    },
    { type: 'separator' },
    { label: t('main.menu.context.removeBookmark'), click: () => browser.removeBookmarks([bookmarkId]) },
  ];

  Menu.buildFromTemplate(items).popup({ window: browser.window });
}

/**
 * One site, and the option to be rid of it everywhere.
 *
 * Clearing by time is an afternoon; what someone usually means is a site. The
 * item says what it is about to remove, counted rather than described, because
 * something that vanished quietly is indistinguishable from something that did
 * not work.
 */
export function showSiteContextMenu(browser: Browser, address: string): void {
  const site = siteOf(address);
  if (!site) {
    return;
  }
  const traces = browser.store.tracesOf(address);

  const items: MenuItemConstructorOptions[] = [
    { label: site, enabled: false },
    { type: 'separator' },
    { label: t('main.menu.context.open'), click: () => browser.commands.openInActiveTab(address) },
    { label: t('main.menu.context.openInNewTab'), click: () => browser.commands.openInNewTab(address) },
    {
      label: t('main.menu.context.openInNewWindow'),
      click: () => void browser.profile.openWindow({ url: address }),
    },
    { label: t('main.menu.context.copyAddress'), click: () => clipboard.writeText(address) },
    { type: 'separator' },
    {
      label: t('main.menu.context.forgetSite', { site }),
      enabled: countTraces(traces) > 0,
      click: () => browser.sites.forget(address),
    },
    { label: describeTraces(traces), enabled: false },
  ];

  Menu.buildFromTemplate(items).popup({ window: browser.window });
}

/**
 * A bookmark folder's contents, opened from the bar under the toolbar.
 *
 * Native, and not a matter of taste: a WebContentsView paints above the
 * chrome's HTML, so a dropdown drawn in the renderer would open underneath the
 * page and look like nothing happened. Nested folders become submenus, which a
 * native menu does properly and a hand-built one rarely does.
 */
export function showBookmarkFolderMenu(browser: Browser, folderId: string, x: number, y: number): void {
  const folders = browser.store.listBookmarkFolders();
  const bookmarks = browser.store.listBookmarks();

  const build = (parentId: string, seen: ReadonlySet<string>): MenuItemConstructorOptions[] => {
    const here = bookmarks
      .filter((bookmark) => bookmark.folderId === parentId)
      .map((bookmark) => ({
        label: bookmark.title || bookmark.url,
        click: () => browser.commands.openInActiveTab(bookmark.url),
      }));

    const inside = folders
      .filter((folder) => folder.parentId === parentId && !seen.has(folder.id))
      .map((folder) => ({
        label: folder.name,
        submenu: build(folder.id, new Set([...seen, folder.id])),
      }));

    const items = [...inside, ...here];
    // An empty submenu on macOS is a dead arrow with nothing behind it, which
    // reads as a fault rather than as an empty folder.
    return items.length > 0 ? items : [{ label: t('main.menu.context.empty'), enabled: false }];
  };

  if (!browser.store.folderFor(folderId)) {
    return;
  }

  const items: MenuItemConstructorOptions[] = [
    ...build(folderId, new Set([folderId])),
    { type: 'separator' },
    {
      label: t('main.menu.context.openAllAsTabGroup'),
      click: () => browser.groups.openFolder(folderId),
    },
  ];

  Menu.buildFromTemplate(items).popup({ window: browser.window, x, y });
}
