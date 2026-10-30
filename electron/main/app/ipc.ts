// Libs
import { type IpcMainInvokeEvent, ipcMain } from 'electron';
import { randomBytes } from 'node:crypto';

// Utils
import { type ApiArgs, type ApiMethod, type ApiResult, CHANNELS } from '../../shared/ipc/ipc-contract';
import { PUSH } from '../../shared/ipc/channels';
import { resolverFor } from '../../shared/browsing/dns';
import { generatePassword, readRecipe } from '../../shared/passwords/password-generator';
import {
  clampZoom,
  HISTORY_RANGES,
  isAccentColour,
  isAppearanceId,
  isHistoryRetentionDays,
  isInterfaceTextSize,
  isSleepAfterMinutes,
  isThemeId,
  isPermissionDecisionKey,
  isWebRtcPolicy,
  readPermissionDefaults,
  readReaderStyle,
  readToolbarItems,
  readWallpaperDim,
} from '../../shared/types';
import { readSpellcheckLanguages } from '../../shared/chrome/spellcheck';
import { readClearChoice } from '../../shared/data/clearing';
import { openChromiumLicences } from '../system/chromium-licences';
import { conflictFor, readShortcutOverrides } from '../../shared/chrome/shortcuts';
import { hostOf, isPageNavigableUrl, resolveOmniboxInput } from '../../shared/browsing/url';
import {
  WITHOUT_KEYWORDS,
  isBuiltInEngine,
  isCustomEngineId,
  readCustomSearchEngines,
} from '../../shared/browsing/search-engines';
import { defaultBrowserStatus, makeDefaultBrowser } from '../system/default-browser';
import { GROUP_COLOURS, type GroupColourId } from '../../shared/tabs/tab-groups';
import { MAX_OPEN_RULES, isOpenTarget } from '../../shared/tabs/open-rules';
import { isInternalPage, isSection } from '../../shared/tabs/internal-pages';
import { routeFor } from '../../shared/translation/languages';
import { MAX_SHORTCUT_ICON_BYTES, isShortcutIcon } from '../../shared/data/start-tiles';
import { readChosenImage } from '../system/file-dialogs';
import { clearCopiedSecret, copySecret } from '../vault/vault-clipboard';
import { copyText } from '../system/clipboard';
import { t } from '../../shared/i18n/translate';
import { webStoreIdFrom } from '../../shared/extensions/extensions';
import { describeKept, isKeptKind, siteOf as siteOfAddress, type KeptKind } from '../../shared/data/forgetting';
import { withSiteRestored, withoutSite } from '../../shared/data/site-settings';
import {
  showBookmarkContextMenu,
  showFillMenu,
  showSiteContextMenu,
  showBookmarkFolderContextMenu,
  showBookmarkFolderMenu,
  showGroupContextMenu,
  showNewTabMenu,
  showTabContextMenu,
} from '../menus/context-menu';
import { showMainMenu } from '../menus/main-menu';
import { showProfileMenu } from '../menus/profile-menu';
import { showExtensionsMenu } from '../menus/extensions-menu';
import { showBookmarkOverflowMenu, showBookmarksMenu } from '../menus/bookmarks-menu';
import { toSuggestionView } from '../../shared/browsing/suggestion-view';
import { HISTORY_PAGE_SIZE } from '../data/store';

// Types
import type {
  ClearRange,
  DownloadState,
  HistoryFilter,
  PermissionDecision,
  PermissionKind,
  Settings,
} from '../../shared/types';
import type { Browser } from './browser';
import type { PopupAnchor } from '../extensions/action-popup';
import type { Profiles } from './profiles';

/**
 * The arguments a method declares, each one unknown: they come from a renderer
 * and are narrowed before use, but a handler cannot read one that is not sent.
 */
type Untrusted<Args extends unknown[]> = { [Index in keyof Args]: unknown };

/** Every handler is registered through `handle`, which drops any message that did not come from one of the browser's own top-level frames, the chrome window or the overlay. */
export function registerIpcHandlers(profiles: Profiles): void {
  const handle = <Method extends ApiMethod>(
    method: Method,
    handler: (
      browser: Browser,
      event: IpcMainInvokeEvent,
      ...args: Untrusted<ApiArgs<Method>>
    ) => ApiResult<Method> | Promise<ApiResult<Method>>,
  ) => {
    const channel = CHANNELS[method];
    ipcMain.handle(channel, (event, ...args) => {
      // Answered by the window that asked: its chrome or one of its overlays, and nothing else.
      const browser = profiles.browserFor(event.sender);
      if (!browser?.isOwnFrame(event.senderFrame)) {
        throw new Error(`Rejected ${channel} from an unexpected frame`);
      }
      // Every element is unknown either way; this only gives the list the method's length.
      return handler(browser, event, ...(args as Untrusted<ApiArgs<Method>>));
    });
  };

  // ------------------------------------------------------------------- tabs

  handle('tabs.create', (browser, _event, url, activate) =>
    browser.tabs.create(asString(url) || undefined, { activate: activate !== false }),
  );
  handle('tabs.createHush', (browser) => browser.commands.newHushTab());
  handle('tabs.close', (browser, _event, id) => browser.tabs.close(asString(id)));
  handle('tabs.activate', (browser, _event, id) => browser.tabs.activate(asString(id)));
  handle('tabs.move', (browser, _event, id, index) => browser.tabs.move(asString(id), asInteger(index)));
  handle('tabs.navigate', (browser, _event, id, input) => browser.tabs.navigate(asString(id), asString(input)));
  handle('tabs.goBack', (browser, _event, id) => browser.tabs.goBack(asString(id)));
  handle('tabs.goForward', (browser, _event, id) => browser.tabs.goForward(asString(id)));
  handle('tabs.reload', (browser, _event, id, bypassCache) =>
    browser.tabs.reload(asString(id), bypassCache === true),
  );
  handle('tabs.stop', (browser, _event, id) => browser.tabs.stop(asString(id)));
  handle('tabs.setMuted', (browser, _event, id, muted) => browser.tabs.setMuted(asString(id), muted === true));
  handle('tabs.duplicate', (browser, _event, id) => browser.tabs.duplicate(asString(id)));
  handle('tabs.setPinned', (browser, _event, id, isPinned) =>
    browser.tabs.setPinned(asString(id), isPinned === true),
  );
  handle('tabs.splitWith', (browser, _event, id) => browser.tabs.splitWith(id === null ? null : asString(id)));
  handle('tabs.leaveSplit', (browser) => browser.tabs.leaveSplit());
  handle('tabs.replaceSplitPane', (browser, _event, paneId, replacementId) =>
    browser.tabs.replaceSplitPane(asString(paneId), asString(replacementId)),
  );
  handle('tabs.setSplitRatio', (browser, _event, ratio) =>
    browser.tabs.setSplitRatio(typeof ratio === 'number' ? ratio : Number.NaN),
  );
  handle('tabs.sleep', (browser, _event, id) => browser.tabs.sleep(asString(id)));
  handle('startPage.saveShortcut', (browser, _event, previousUrl, shortcut) => {
    const input = isRecord(shortcut) ? shortcut : {};
    const address = typeof input.address === 'string' ? input.address.slice(0, MAX_SITE_LENGTH * 4) : '';
    const resolved = resolveOmniboxInput(address, WITHOUT_KEYWORDS);
    if (resolved?.type !== 'url' || !isPageNavigableUrl(resolved.target)) {
      return t('main.startPage.notAnAddress');
    }
    const title = typeof input.title === 'string' ? input.title : '';
    browser.store.saveStartShortcut(typeof previousUrl === 'string' ? previousUrl : null, {
      url: resolved.target,
      title: title.trim() || hostOf(resolved.target),
      icon: isShortcutIcon(input.icon) ? input.icon : null,
    });
    browser.profile.scheduleStatePush();
    return '';
  });
  handle('startPage.removeTile', (browser, _event, url) => {
    const undo = browser.store.removeStartTile(asString(url));
    browser.profile.broadcast(PUSH.dataChanged, 'startTiles');
    browser.offerUndo(t('main.undo.tile'), () => {
      undo();
      browser.profile.broadcast(PUSH.dataChanged, 'startTiles');
    });
  });
  handle('startPage.hiddenSiteCount', (browser) => browser.store.hiddenStartSites().length);
  handle('startPage.showHiddenSites', (browser) => {
    browser.store.showStartSites();
    browser.profile.broadcast(PUSH.dataChanged, 'startTiles');
  });
  handle('startPage.chooseIcon', async (browser) => {
    const chosen = await readChosenImage(browser.window, {
      title: t('main.startPage.chooseIcon'),
      maxBytes: MAX_SHORTCUT_ICON_BYTES,
      tooLarge: t('main.startPage.iconTooLarge'),
    });
    return { icon: chosen.value, problem: chosen.message };
  });
  handle('translation.translate', async (browser, _event, from, to, texts) => {
    const request = readTranslation(from, to, texts);
    if (!request) {
      return { error: t('main.translation.refused') };
    }
    try {
      return { texts: await browser.profile.translation.translate(request.from, request.to, request.texts) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : t('main.translation.failed') };
    }
  });
  handle('translation.installedBytes', (browser) => browser.profile.translation.models.installedBytes());
  handle('translation.removeModels', (browser) => browser.profile.translation.removeModels());
  handle('sessions.save', (browser) => browser.saveTabsAsSession());
  handle('sessions.open', (browser, _event, id) => browser.openNamedSession(asString(id)));
  handle('sessions.rename', (browser, _event, id, name) => browser.renameNamedSession(asString(id), asString(name)));
  handle('sessions.remove', (browser, _event, id) => browser.removeNamedSession(asString(id)));
  handle('tabs.continueOverHttp', (browser, _event, id) => browser.tabs.continueOverHttp(asString(id)));
  handle('tabs.acceptCertificate', (browser, _event, id) => browser.tabs.acceptCertificate(asString(id)));
  handle('tabs.reopenClosed', (browser) => browser.commands.reopenClosedTab());
  handle('tabs.print', (browser, _event, id) => browser.commands.print(asString(id)));
  handle('tabs.savePage', (browser, _event, id) => browser.commands.savePage(asString(id)));
  handle('tabs.saveScreenshot', (browser, _event, id) => browser.commands.saveScreenshot(asString(id)));
  handle('tabs.readerDocument', (browser, _event, id) => browser.tabs.readerDocument(asString(id)));
  handle('tabs.readerImages', (browser, _event, id, urls) => browser.tabs.readerImages(asString(id), pickUrls(urls)));
  handle('tabs.memoryUse', (browser) => browser.tabs.memoryUse());
  handle('tabs.viewSource', (browser, _event, id) => browser.commands.viewSource(asString(id)));
  handle('tabs.toggleDevTools', (browser, _event, id) => browser.tabs.toggleDevTools(asString(id)));
  handle('tabs.setZoom', (browser, _event, id, zoom) => browser.tabs.setZoom(asString(id), asNumber(zoom, 1)));
  handle('tabs.openContextMenu', (browser, _event, id) => showTabContextMenu(browser, asString(id)));
  handle('tabs.openNewTabMenu', (browser) => showNewTabMenu(browser));

  // ----------------------------------------------------------------- chrome

  handle('chrome.setContentInsets', (browser, _event, insets) => {
    if (!isRecord(insets)) {
      return;
    }
    browser.setContentInsets({
      top: asNumber(insets.top, 0),
      left: asNumber(insets.left, 0),
      right: asNumber(insets.right, 0),
      bottom: asNumber(insets.bottom, 0),
    });
  });
  handle('chrome.setOverlayVisible', (browser, _event, visible) => browser.tabs.setOverlayVisible(visible === true));
  handle('chrome.getState', (browser) => browser.getState());

  // ---------------------------------------------------------------- omnibox

  handle('omnibox.suggest', (browser, _event, query) => browser.store.suggest(asString(query)));
  handle('omnibox.showSuggestions', (browser, _event, view) => browser.showSuggestions(toSuggestionView(view)));
  handle('omnibox.choose', (browser, _event, target) => browser.chooseSuggestion(asString(target)));

  // ---------------------------------------------------------------- history

  handle('history.list', (browser, _event, query, offset, filter) =>
    browser.store.listHistory(
      asString(query),
      HISTORY_PAGE_SIZE,
      asBoundedInteger(offset, 0, 0, 1_000_000),
      asHistoryFilter(filter),
    ),
  );
  handle('history.removeMany', (browser, _event, ids) => {
    const wanted = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string').slice(0, 1000) : [];
    const entries = wanted.map((id) => browser.store.historyEntry(id)).filter((entry) => entry !== null);
    entries.forEach((entry) => browser.store.removeHistory(entry.id));
    browser.scheduleStatePush();
    if (entries.length > 0) {
      browser.offerUndo(t('main.undo.historyMany', { count: entries.length }), () => {
        entries.forEach((entry) => browser.store.restoreHistory(entry));
        browser.profile.broadcast(PUSH.dataChanged, 'history');
      });
    }
  });
  handle('history.remove', (browser, _event, id) => {
    const entry = browser.store.historyEntry(asString(id));
    browser.store.removeHistory(asString(id));
    browser.scheduleStatePush();
    if (entry) {
      browser.offerUndo(t('main.undo.history', { title: entry.title || hostOf(entry.url) }), () => {
        browser.store.restoreHistory(entry);
        browser.profile.broadcast(PUSH.dataChanged, 'history');
      });
    }
  });
  handle('history.clear', (browser, _event, range, choice) => {
    const clearRange = asClearRange(range);
    return browser.sites.clearBrowsing(clearRange, readClearChoice(choice, clearRange));
  });
  handle('history.topSites', (browser, _event, limit) => browser.store.topSites(asBoundedInteger(limit, 8, 1, 48)));

  // -------------------------------------------------------------- bookmarks

  handle('bookmarks.list', (browser) => browser.store.listBookmarks());
  handle('bookmarks.toggle', (browser, _event, url, title) => {
    browser.toggleBookmark(asString(url), asString(title));
    return browser.store.isBookmarked(asString(url));
  });
  handle('bookmarks.remove', (browser, _event, id) => browser.removeBookmarks([asString(id)]));
  handle('bookmarks.removeMany', (browser, _event, ids) =>
    browser.removeBookmarks(
      Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string').slice(0, 1000) : [],
    ),
  );
  handle('bookmarks.add', (browser, _event, title, address, folderId) => {
    const resolved = resolveOmniboxInput(asString(address).slice(0, 8192), WITHOUT_KEYWORDS);
    if (resolved?.type !== 'url' || !isPageNavigableUrl(resolved.target)) {
      return t('main.startPage.notAnAddress');
    }
    if (browser.store.isBookmarked(resolved.target)) {
      return t('main.bookmarks.alreadySaved');
    }
    browser.store.toggleBookmark(resolved.target, asString(title).trim().slice(0, 500) || hostOf(resolved.target));
    const added = browser.store.listBookmarks().find((bookmark) => bookmark.url === resolved.target);
    if (added && typeof folderId === 'string') {
      browser.store.fileBookmark(added.id, folderId);
    }
    browser.bookmarks.changed();
    browser.scheduleStatePush();
    return '';
  });
  handle('bookmarks.update', (browser, _event, id, changes) => {
    const result = browser.store.updateBookmark(asString(id), asBookmarkChanges(changes));
    if (result === 'saved') {
      browser.bookmarks.changed();
      browser.scheduleStatePush();
    }
    return result;
  });
  handle('bookmarks.openInActiveTab', (browser, _event, url) => browser.commands.openInActiveTab(asString(url)));
  handle('bookmarks.openContextMenu', (browser, _event, id) => showBookmarkContextMenu(browser, asString(id)));
  handle('bookmarks.openMenu', (browser, _event, x, y) =>
    showBookmarksMenu(browser, Math.round(asNumber(x, 0)), Math.round(asNumber(y, 0))),
  );
  handle('bookmarks.openOverflowMenu', (browser, _event, folderIds, bookmarkIds, x, y) =>
    showBookmarkOverflowMenu(
      browser,
      asIdList(folderIds),
      asIdList(bookmarkIds),
      Math.round(asNumber(x, 0)),
      Math.round(asNumber(y, 0)),
    ),
  );
  handle('history.traces', (browser, _event, address) => browser.sites.traces(asString(address)));
  handle('history.totalBlocked', (browser) => browser.store.totalBlocked());
  handle('history.blockedThisWeek', (browser) => browser.store.blockedThisWeek());
  handle('data.kept', (browser) => browser.sites.kept());
  handle('history.openContextMenu', (browser, _event, address) => showSiteContextMenu(browser, asString(address)));
  handle('data.clearKept', (browser, _event, kind) => {
    if (!isKeptKind(kind)) {
      return;
    }
    const count = browser.sites.kept()[kind];
    const restorer = keptRestorer(kind, browser.store.getSettings());
    browser.sites.clearKept(kind);
    if (restorer) {
      browser.offerUndo(t('main.undo.kept', { what: describeKept(kind, count) }), () =>
        browser.updateSettings(restorer(browser.store.getSettings())),
      );
    }
  });
  handle('history.forgetSite', (browser, _event, address) => browser.sites.forget(asString(address)));
  handle('notices.answer', (browser, _event, id, confirmed) =>
    browser.notices.answer(asString(id), confirmed === true),
  );
  handle('notices.pending', (browser) => browser.notices.pending());
  handle('chrome.pendingSurface', (browser) => browser.pendingSurface());
  handle('chrome.openMainMenu', (browser, _event, x, y) =>
    showMainMenu(browser, Math.round(asNumber(x, 0)), Math.round(asNumber(y, 0))),
  );
  handle('chrome.focusOverlay', (browser, event) => browser.focusOverlay(event.senderFrame));
  handle('chrome.toggleSiteInfo', (browser) => browser.toggleSiteInfo());
  handle('chrome.closeSiteInfo', (browser) => browser.closeSiteInfo());
  handle('chrome.closeBookmarkSheet', (browser) => browser.closeBookmarkSheet());
  handle('chrome.showPage', (browser, _event, page, section) => {
    if (isInternalPage(page)) {
      browser.showPage(page, isSection(section) ? section : null);
    }
  });
  handle('chrome.setOverlaySize', (browser, event, width, height) =>
    browser.setOverlaySize(event.senderFrame, asNumber(width, 0), asNumber(height, 0)),
  );
  handle('favicons.forUrls', (browser, _event, urls) => browser.store.faviconsFor(pickUrls(urls)));
  handle('filters.update', (browser) => browser.updateFilterLists());
  handle('bookmarks.file', (browser, _event, id, folderId) => {
    browser.store.fileBookmark(asString(id), asOptionalId(folderId));
    browser.bookmarks.changed();
    browser.scheduleStatePush();
  });

  handle('bookmarkFolders.list', (browser) => browser.store.listBookmarkFolders());
  handle('bookmarkFolders.create', (browser, _event, name, colour, parentId) =>
    browser.bookmarks.createFolder(asString(name), asGroupColour(colour), asOptionalId(parentId)),
  );
  handle('bookmarkFolders.update', (browser, _event, id, changes) =>
    browser.bookmarks.updateFolder(asString(id), asGroupChanges(changes)),
  );
  handle('bookmarkFolders.move', (browser, _event, id, parentId) =>
    browser.bookmarks.moveFolder(asString(id), asOptionalId(parentId)),
  );
  handle('bookmarkFolders.remove', (browser, _event, id) => browser.bookmarks.deleteFolder(asString(id)));
  handle('bookmarkFolders.openAsGroup', (browser, _event, id) => browser.groups.openFolder(asString(id)));
  handle('bookmarkFolders.openContextMenu', (browser, _event, id) =>
    showBookmarkFolderContextMenu(browser, asString(id)),
  );
  handle('bookmarkFolders.openMenu', (browser, _event, id, x, y) =>
    showBookmarkFolderMenu(browser, asString(id), Math.round(asNumber(x, 0)), Math.round(asNumber(y, 0))),
  );

  // -------------------------------------------------------------- downloads

  handle('downloads.pause', (browser, _event, id) => browser.downloads.pause(asString(id)));
  handle('downloads.resume', (browser, _event, id) => browser.downloads.resume(asString(id)));
  handle('downloads.cancel', (browser, _event, id) => browser.downloads.cancel(asString(id)));
  handle('downloads.openFile', (browser, _event, id) => browser.downloads.openFile(asString(id)));
  handle('downloads.revealFile', (browser, _event, id) => browser.downloads.revealFile(asString(id)));
  handle('downloads.remove', (browser, _event, id) => removeDownloads(browser, [asString(id)]));
  handle('downloads.removeMany', (browser, _event, ids) =>
    removeDownloads(
      browser,
      Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string').slice(0, 1000) : [],
    ),
  );
  handle('downloads.openFolder', (browser) => browser.openDownloadsFolder());
  handle('downloads.retry', (browser, _event, id) => browser.downloads.retry(asString(id)));
  handle('downloads.keep', (browser, _event, id) => browser.downloads.keep(asString(id)));
  handle('downloads.discard', (browser, _event, id) => browser.downloads.discard(asString(id)));
  handle('downloads.chooseFolder', (browser) => browser.chooseDownloadFolder());
  handle('downloads.clearCompleted', (browser) => {
    const finished = browser.downloads
      .list()
      .map((download) => browser.downloads.finishedEntry(download.id))
      .filter((entry) => entry !== null);
    browser.downloads.clearCompleted();
    offerDownloadsBack(browser, finished);
  });

  // ------------------------------------------------------------------- find

  handle('find.open', (browser) => browser.openFind());
  handle('find.start', (browser, _event, query) => browser.tabs.startFind(asString(query)));
  handle('find.next', (browser) => browser.tabs.findNext(true));
  handle('find.previous', (browser) => browser.tabs.findNext(false));
  handle('find.stop', (browser) => browser.stopFind());
  handle('find.setMatchCase', (browser, _event, matchCase) => browser.tabs.setFindMatchCase(matchCase === true));

  // --------------------------------------------------------------- settings

  handle('settings.get', (browser) => browser.profile.settings());
  handle('settings.update', (browser, _event, patch) => browser.updateSettings(asSettingsPatch(patch)));
  handle('settings.resetSite', (browser, _event, site) => {
    const name = asString(site);
    const before = browser.store.getSettings();
    browser.updateSettings(withoutSite(before, name));
    browser.offerUndo(t('main.undo.site', { site: name }), () =>
      browser.updateSettings(withSiteRestored(browser.store.getSettings(), before, name)),
    );
  });

  // ------------------------------------------------------------ permissions

  handle('permissions.respond', (browser, _event, id, decision, remember) =>
    browser.respondToPermission(
      asString(id),
      decision === 'allow' ? 'allow' : ('deny' as PermissionDecision),
      remember === true,
    ),
  );

  handle('permissions.forget', (browser, _event, origin, kind) =>
    browser.forgetPermission(asString(origin), asString(kind) as PermissionKind),
  );

  // ----------------------------------------------------------------- window

  handle('window.openNew', (browser) => browser.openNewWindow());

  // -------------------------------------------------------------------- app

  handle('app.getInfo', (browser) => browser.getAppInfo());
  handle('app.openExternal', (browser, _event, url) => browser.openExternal(asString(url)));
  handle('app.revealDiagnostics', (browser) => browser.revealDiagnostics());
  handle('app.openChromiumLicences', () => openChromiumLicences());
  handle('app.defaultBrowserStatus', (_browser) => defaultBrowserStatus());
  handle('app.makeDefaultBrowser', (_browser) => makeDefaultBrowser());
  handle('app.spellcheckChoices', (browser) => browser.profile.sessions.spellcheckChoices());

  // ------------------------------------------------------------------ vault

  // Every field is read back off the payload as a string: the renderer is the
  // one place a malformed shape can come from, and a password is not a thing to
  // pass through on trust.
  handle('vault.list', (browser) => browser.vault.state());
  handle('vault.add', (browser, _event, input) =>
    browser.vault.add({
      origin: asString(isRecord(input) ? input.origin : ''),
      username: asString(isRecord(input) ? input.username : ''),
      password: asString(isRecord(input) ? input.password : ''),
    }),
  );
  handle('vault.update', (browser, _event, id, changes) => {
    const patch = isRecord(changes) ? changes : {};
    const result = browser.vault.update(asString(id), pickStrings(patch, ['origin', 'username', 'password']));
    return result?.error ?? '';
  });
  handle('vault.remove', (browser, _event, id) => browser.vault.remove(asString(id)));
  handle('vault.reveal', (browser, _event, id) => browser.vault.reveal(asString(id)));
  handle('vault.copy', async (browser, _event, id, field) => {
    if (field === 'password') {
      const secret = browser.vault.reveal(asString(id));
      if (secret === null) {
        return false;
      }
      await copySecret(secret);
      return true;
    }
    const entry = browser.vault.state().entries.find((candidate) => candidate.id === asString(id));
    if (!entry?.isReadable) {
      return false;
    }
    return copyText(entry.username);
  });
  handle('vault.exportAll', (browser) => browser.transfer.exportPasswords());
  handle('vault.importFile', (browser) => browser.transfer.importPasswords());
  handle('vault.lockState', (browser) => browser.vaultSession.lockInfo());
  handle('vault.unlock', (browser) => browser.vaultSession.unlock());
  handle('vault.lock', async (browser) => {
    browser.vaultSession.lock();
    await clearCopiedSecret();
  });
  handle('vault.facts', (browser) => browser.vaultSession.facts());
  handle('vault.countForTab', (browser, _event, id) => browser.passwords.offerFor(asString(id)).entries.length);
  handle('vault.fillForTab', (browser, _event, id, x, y) =>
    showFillMenu(browser, asString(id), Math.round(asNumber(x, 0)), Math.round(asNumber(y, 0))),
  );
  handle('vault.answerSaveOffer', (browser, _event, id, answer) => {
    if (answer === 'save' || answer === 'never' || answer === 'dismiss') {
      browser.passwordSave.answer(asString(id), answer);
    }
  });
  handle('vault.generate', (_browser, _event, recipe) =>
    generatePassword(readRecipe(recipe), (count) => new Uint8Array(randomBytes(count))),
  );

  // -------------------------------------------------------------- wallpaper

  handle('wallpaper.get', (browser) => browser.wallpaper.read());
  handle('wallpaper.preview', (browser) => browser.wallpaper.readPreview());
  // Each changes what the start page shows in every window of the profile, so each of them is told afterwards.
  const thenPush = <Result>(browser: Browser, result: Result): Result => {
    browser.profile.scheduleStatePush();
    return result;
  };
  handle('wallpaper.choose', async (browser) => thenPush(browser, await browser.wallpaper.choose(browser.window)));
  handle('wallpaper.clear', (browser) => thenPush(browser, browser.wallpaper.clear()));
  handle('wallpaper.staged', (browser) => browser.wallpaper.stagedImage());
  handle('wallpaper.keep', (browser) => thenPush(browser, browser.wallpaper.commitStagedChanges()));
  handle('wallpaper.remove', (browser) => thenPush(browser, browser.wallpaper.stageRemoval()));

  // ---------------------------------------------------------------- profiles

  handle('profiles.create', (_browser, _event, name, colour) =>
    profiles.create(asString(name), asGroupColour(colour)),
  );
  handle('profiles.update', (_browser, _event, id, changes) => {
    const { name, colour } = asGroupChanges(changes);
    profiles.update(asString(id), { name, colour });
  });
  // Never the profile of the window asking: removing it would close the window mid-answer.
  handle('profiles.remove', (browser, _event, id) =>
    asString(id) === browser.profile.id ? false : profiles.remove(asString(id)),
  );
  handle('profiles.openWindow', async (browser, _event, id) => browser.profile.openWindowIn(asString(id)));
  handle('profiles.openMenu', (browser, _event, x, y) =>
    showProfileMenu(browser, Math.round(asNumber(x, 0)), Math.round(asNumber(y, 0))),
  );
  handle('profiles.choosePicture', (browser, _event, id) => profiles.choosePicture(browser.window, asString(id)));
  handle('profiles.removePicture', (_browser, _event, id) => profiles.removePicture(asString(id)));
  handle('profiles.picture', (_browser, _event, id) => profiles.picture(asString(id)));

  // ------------------------------------------------------------------ groups

  handle('groups.create', (browser, _event, tabId, name, colour, ownSession) =>
    browser.groups.create(asString(tabId), asString(name), asGroupColour(colour), ownSession === true),
  );
  handle('groups.update', (browser, _event, id, changes) =>
    browser.groups.update(asString(id), asGroupChanges(changes)),
  );
  handle('groups.remove', (browser, _event, id) => browser.groups.remove(asString(id)));
  handle('groups.openContextMenu', (browser, _event, id) => showGroupContextMenu(browser, asString(id)));
  handle('groups.setForTab', (browser, _event, tabId, groupId) =>
    browser.groups.setForTab(asString(tabId), typeof groupId === 'string' && groupId ? groupId : null),
  );
  handle('wallpaper.discard', (browser) => thenPush(browser, browser.wallpaper.discardStaged()));

  // ------------------------------------------------------------------- data

  handle('data.export', (browser, _event, kind) =>
    browser.transfer.exportData(asString(kind) === 'history' ? 'history' : 'bookmarks'),
  );
  handle('data.importBookmarks', (browser) => browser.transfer.importBookmarks());
  handle('data.importHistory', (browser) => browser.transfer.importHistory());
  handle('data.importSources', (browser) => browser.transfer.importSources());
  handle('data.previewFromBrowser', (browser, _event, sourceId) =>
    browser.transfer.previewFromBrowser(asString(sourceId)),
  );
  handle('data.importFromBrowser', (browser, _event, sourceId) =>
    browser.transfer.importFromBrowser(asString(sourceId)),
  );

  // ------------------------------------------------------------------- auth

  handle('auth.respond', (browser, _event, id, username, password) =>
    browser.respondToAuth(asString(id), asString(username), asString(password)),
  );
  handle('auth.cancel', (browser, _event, id) => browser.cancelAuth(asString(id)));

  // ------------------------------------------------------------ connections

  handle('connections.list', (browser, _event, id) => browser.connectionsFor(asString(id)));
  handle('connections.exportReport', (browser, _event, id) => browser.exportPageReport(asString(id)));

  // ---------------------------------------------------------------- updates

  handle('shortcuts.setRecording', (_browser, _event, isRecording) =>
    profiles.setRecordingShortcut(isRecording === true),
  );
  // ------------------------------------------------------------ extensions

  handle('extensions.list', (browser) => browser.profile.extensions.summaries(browser.activeChromeTabId()));
  handle('extensions.addFromWebStore', (browser, _event, input) => {
    const id = webStoreIdFrom(asString(input).slice(0, 2048));
    return id ? browser.profile.extensions.addFromWebStore(id) : t('main.extensions.install.notAStoreAddress');
  });
  handle('extensions.addFromFolder', (browser) => browser.profile.extensions.addFromFolder());
  handle('extensions.setEnabled', (browser, _event, id, isEnabled) =>
    browser.profile.extensions.setEnabled(asString(id), isEnabled === true),
  );
  handle('extensions.setPinned', (browser, _event, id, isPinned) =>
    browser.profile.extensions.setPinned(asString(id), isPinned === true),
  );
  handle('extensions.remove', (browser, _event, id) => browser.profile.extensions.remove(asString(id)));
  handle('extensions.press', (browser, _event, id, left, right, bottom) =>
    browser.profile.extensions.press(
      asString(id),
      browser.window,
      browser.activeChromeTabId(),
      asAnchor(left, right, bottom),
    ),
  );
  handle('extensions.openOptions', (browser, _event, id) => browser.profile.extensions.openOptions(asString(id)));
  handle('extensions.openMenu', (browser, _event, left, right, bottom) =>
    showExtensionsMenu(browser, asAnchor(left, right, bottom)),
  );

  handle('updates.check', (browser) => browser.updates.check());
  handle('updates.install', (browser) => browser.updates.install());
  handle('updates.openReleases', (browser) => browser.updates.openReleasesPage());
  handle('updates.downloadInstaller', (browser) => browser.updates.downloadInstaller());
}

export function removeIpcHandlers(): void {
  for (const channel of Object.values(CHANNELS)) {
    ipcMain.removeHandler(channel);
  }
}

// ---------------------------------------------------------------- coercion
//
// Arguments arrive from a renderer. They are shaped like the API says they are
// right up until they are not, so every one is narrowed before use.

// Far past any address, search or password a person types; a payload this size is refused, not trimmed.
const MAX_STRING_LENGTH = 32_768;
// A list in a settings patch is something a person built by hand, not a dump of everything they ever did.
const MAX_LIST_LENGTH = 10_000;
// The longest a hostname can be.
const MAX_SITE_LENGTH = 253;

function asString(value: unknown): string {
  return typeof value === 'string' && value.length <= MAX_STRING_LENGTH ? value : '';
}

function asBoundedInteger(value: unknown, fallback: number, lowest: number, highest: number): number {
  return Math.min(highest, Math.max(lowest, asInteger(value, fallback)));
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Where a toolbar button's edges are in the window, which an extension's popup opens under. */
function asAnchor(left: unknown, right: unknown, bottom: unknown): PopupAnchor {
  return {
    left: Math.round(asNumber(left)),
    right: Math.round(asNumber(right)),
    bottom: Math.round(asNumber(bottom)),
  };
}

function asInteger(value: unknown, fallback = 0): number {
  return Math.trunc(asNumber(value, fallback));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Keeps only the listed keys, and only where the value actually arrived as a string. */
function pickStrings<K extends string>(
  source: Record<string, unknown>,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const picked: Partial<Record<K, string>> = {};
  for (const key of keys) {
    if (typeof source[key] === 'string') {
      picked[key] = source[key] as string;
    }
  }
  return picked;
}

/** An id that may be absent. An empty string is not an id, and neither is anything that is not a string. */
function asOptionalId(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function asGroupColour(value: unknown): GroupColourId {
  const known = GROUP_COLOURS.find((colour) => colour.id === value);
  return known?.id ?? GROUP_COLOURS[0].id;
}

/** A typed address is read as the address bar reads it; one that reads as a search is sent on to be refused. */
export function asBookmarkChanges(value: unknown): { title?: string; url?: string } {
  if (!isRecord(value)) {
    return {};
  }
  const changes: { title?: string; url?: string } = {};
  if (typeof value.title === 'string') {
    changes.title = value.title.slice(0, 500);
  }
  if (typeof value.url === 'string') {
    const resolved = resolveOmniboxInput(value.url.slice(0, 8192), WITHOUT_KEYWORDS);
    changes.url = resolved?.type === 'url' ? resolved.target : '';
  }
  return changes;
}

function asGroupChanges(value: unknown): { name?: string; colour?: GroupColourId; collapsed?: boolean } {
  if (!isRecord(value)) {
    return {};
  }
  const changes: { name?: string; colour?: GroupColourId; collapsed?: boolean } = {};
  if (typeof value.name === 'string') {
    changes.name = value.name.slice(0, 60);
  }
  if (GROUP_COLOURS.some((colour) => colour.id === value.colour)) {
    changes.colour = value.colour as GroupColourId;
  }
  if (typeof value.collapsed === 'boolean') {
    changes.collapsed = value.collapsed;
  }
  return changes;
}

function asClearRange(value: unknown): ClearRange {
  return value === 'hour' || value === 'day' || value === 'week' || value === 'all' ? value : 'hour';
}

/** Everything the renderer is allowed to change, checked one field at a time. */
/**
 * How to put back what clearing one kind removed, under whatever was set since. Null for the kinds that do
 * not live in settings, which the renderer confirms before clearing instead.
 */
function keptRestorer(kind: KeptKind, before: Settings): ((now: Settings) => Partial<Settings>) | null {
  switch (kind) {
    case 'zoom':
      return (now) => ({ zoomLevels: { ...before.zoomLevels, ...now.zoomLevels } });
    case 'permissions':
      return (now) => ({ permissionDecisions: { ...before.permissionDecisions, ...now.permissionDecisions } });
    case 'blockingOff':
      return (now) => ({ blockerAllowlist: [...new Set([...now.blockerAllowlist, ...before.blockerAllowlist])] });
    case 'certificates':
    case 'downloads':
      return null;
  }
}

function asSiteList(sites: readonly unknown[]): string[] {
  return sites
    .filter((site): site is string => typeof site === 'string' && site.length > 0 && site.length <= MAX_SITE_LENGTH)
    .slice(0, MAX_LIST_LENGTH);
}

function asIdList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(0, 1000) : [];
}

function asHistoryFilter(value: unknown): HistoryFilter {
  const filter = isRecord(value) ? value : {};
  const range = HISTORY_RANGES.find((candidate) => candidate === filter.range) ?? 'all';
  return { range, order: filter.order === 'visits' ? 'visits' : 'recent' };
}

/** Off the list, never off the disk: the files stay where they were saved. */
function removeDownloads(browser: Browser, ids: readonly string[]): void {
  const entries = ids.map((id) => browser.downloads.finishedEntry(id)).filter((entry) => entry !== null);
  ids.forEach((id) => browser.downloads.remove(id));
  offerDownloadsBack(browser, entries);
}

function offerDownloadsBack(browser: Browser, entries: readonly DownloadState[]): void {
  const first = entries[0];
  if (!first) {
    return;
  }
  const message =
    entries.length === 1
      ? t('main.undo.download', { name: first.filename })
      : t('main.undo.downloadMany', { count: entries.length });
  // Each goes back to the top of the list, so the oldest is put back first to land them in their old order.
  browser.offerUndo(message, () => entries.toReversed().forEach((entry) => browser.downloads.restore(entry)));
}

/** An address typed in Settings, read as the address bar reads it; anything that is not a page is the start page. */
function pageAddressFrom(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const resolved = resolveOmniboxInput(value.slice(0, 8192), WITHOUT_KEYWORDS);
  return resolved?.type === 'url' && isPageNavigableUrl(resolved.target) ? resolved.target : null;
}

export function asSettingsPatch(value: unknown): Partial<Settings> {
  if (!isRecord(value)) {
    return {};
  }
  const patch: Partial<Settings> = {};

  // Checked rather than cast. A cast satisfies the compiler and stores whatever
  // arrived, so an unknown engine or theme was kept in memory and applied until
  // the next start, when the store's own reviver quietly corrected it - a
  // setting that fixes itself overnight and nobody can explain.
  // A custom id is kept whether or not that engine exists yet: the list may arrive in the same patch, and a missing one searches with the fallback.
  if (isBuiltInEngine(value.searchEngine) || isCustomEngineId(value.searchEngine)) {
    patch.searchEngine = value.searchEngine;
  }
  const customSearchEngines = readCustomSearchEngines(value.customSearchEngines);
  if (customSearchEngines) {
    patch.customSearchEngines = customSearchEngines;
  }
  if (typeof value.appearance === 'string' && isAppearanceId(value.appearance)) {
    patch.appearance = value.appearance;
  }
  if (typeof value.spellcheck === 'boolean') {
    patch.spellcheck = value.spellcheck;
  }
  if (Array.isArray(value.spellcheckLanguages)) {
    patch.spellcheckLanguages = readSpellcheckLanguages(value.spellcheckLanguages);
  }
  if (typeof value.blockThirdPartyCookies === 'boolean') {
    patch.blockThirdPartyCookies = value.blockThirdPartyCookies;
  }
  if (typeof value.askWhereToSave === 'boolean') {
    patch.askWhereToSave = value.askWhereToSave;
  }
  if (isRecord(value.shortcutOverrides)) {
    const overrides = readShortcutOverrides(value.shortcutOverrides);
    // Two shortcuts on one key leave one of them unreachable, so a colliding entry is dropped.
    patch.shortcutOverrides = Object.fromEntries(
      Object.entries(overrides).filter(
        ([id, accelerator]) => accelerator === '' || conflictFor(id, accelerator, overrides) === null,
      ),
    );
  }
  if (isSleepAfterMinutes(value.sleepTabsAfterMinutes)) {
    patch.sleepTabsAfterMinutes = value.sleepTabsAfterMinutes;
  }
  // Only ever put back to the system folder from here: a folder is chosen in the main process's own dialog, and a
  // path from the renderer could send every download somewhere that runs what lands in it.
  if (value.downloadDirectory === null) {
    patch.downloadDirectory = null;
  }
  if (typeof value.webRtcPolicy === 'string' && isWebRtcPolicy(value.webRtcPolicy)) {
    patch.webRtcPolicy = value.webRtcPolicy;
  }
  if (typeof value.theme === 'string' && isThemeId(value.theme)) {
    patch.theme = value.theme;
  }
  // Stored the moment it is chosen; Chromium only reads it at the next start,
  // which the interface says rather than pretending the change is immediate.
  if (value.dnsMode === 'system' || value.dnsMode === 'encrypted') {
    patch.dnsMode = value.dnsMode;
  }
  if (typeof value.dnsResolverId === 'string' && resolverFor(value.dnsResolverId)) {
    patch.dnsResolverId = value.dnsResolverId;
  }
  if (value.density === 'comfortable' || value.density === 'compact') {
    patch.density = value.density;
  }
  if (value.headerLayout === 'standard' || value.headerLayout === 'one-line') {
    patch.headerLayout = value.headerLayout;
  }
  if (isAccentColour(value.accentColour)) {
    patch.accentColour = value.accentColour;
  }
  if (isInterfaceTextSize(value.interfaceTextSize)) {
    patch.interfaceTextSize = value.interfaceTextSize;
  }
  const toolbarItems = readToolbarItems(value.toolbarItems);
  if (toolbarItems) {
    patch.toolbarItems = toolbarItems;
  }
  const wallpaperDim = readWallpaperDim(value.wallpaperDim);
  if (wallpaperDim !== null) {
    patch.wallpaperDim = wallpaperDim;
  }
  if (typeof value.wallpaperBlur === 'boolean') {
    patch.wallpaperBlur = value.wallpaperBlur;
  }
  if (typeof value.checkForUpdates === 'boolean') {
    patch.checkForUpdates = value.checkForUpdates;
  }
  if (typeof value.updateExtensions === 'boolean') {
    patch.updateExtensions = value.updateExtensions;
  }
  if (value.updateChannel === 'releases' || value.updateChannel === 'betas') {
    patch.updateChannel = value.updateChannel;
  }
  if (typeof value.httpsFirst === 'boolean') {
    patch.httpsFirst = value.httpsFirst;
  }
  if (typeof value.cleanLinks === 'boolean') {
    patch.cleanLinks = value.cleanLinks;
  }
  if (typeof value.hideCookieBanners === 'boolean') {
    patch.hideCookieBanners = value.hideCookieBanners;
  }
  if (typeof value.blockTrackers === 'boolean') {
    patch.blockTrackers = value.blockTrackers;
  }
  if (typeof value.restoreTabsOnLaunch === 'boolean') {
    patch.restoreTabsOnLaunch = value.restoreTabsOnLaunch;
  }
  if (value.startupUrl === null || typeof value.startupUrl === 'string') {
    patch.startupUrl = pageAddressFrom(value.startupUrl);
  }
  if (value.homeUrl === null || typeof value.homeUrl === 'string') {
    patch.homeUrl = pageAddressFrom(value.homeUrl);
  }
  const readerStyle = readReaderStyle(value.readerStyle);
  if (readerStyle) {
    patch.readerStyle = readerStyle;
  }
  if (isHistoryRetentionDays(value.historyRetentionDays)) {
    patch.historyRetentionDays = value.historyRetentionDays;
  }
  if (typeof value.hushNoticeDismissed === 'boolean') {
    patch.hushNoticeDismissed = value.hushNoticeDismissed;
  }
  if (typeof value.showBookmarksBar === 'boolean') {
    patch.showBookmarksBar = value.showBookmarksBar;
  }
  if (Array.isArray(value.hiddenFromBookmarksBar)) {
    patch.hiddenFromBookmarksBar = asIdList(value.hiddenFromBookmarksBar);
  }
  if (typeof value.ambientHue === 'number' && Number.isFinite(value.ambientHue)) {
    // Degrees round the colour wheel, so any turn is kept as the same point on the circle.
    patch.ambientHue = ((Math.round(value.ambientHue) % 360) + 360) % 360;
  }
  if (Array.isArray(value.startPageWidgets)) {
    const allowed = ['clock', 'search', 'topSites', 'bookmarks'];
    const seen = new Set<string>();
    for (const id of value.startPageWidgets) {
      if (typeof id === 'string' && allowed.includes(id)) {
        seen.add(id);
      }
    }
    patch.startPageWidgets = [...seen] as Settings['startPageWidgets'];
  }
  // Checked and clamped like the per-site levels below it, which it was not:
  // the two sat beside each other doing different things, and this one let a
  // value through that no control can produce.
  if (typeof value.defaultZoomFactor === 'number' && Number.isFinite(value.defaultZoomFactor)) {
    patch.defaultZoomFactor = clampZoom(value.defaultZoomFactor);
  }

  if (isRecord(value.permissionDefaults)) {
    patch.permissionDefaults = readPermissionDefaults(value.permissionDefaults);
  }

  if (isRecord(value.permissionDecisions)) {
    const decisions: Settings['permissionDecisions'] = {};
    for (const [key, decision] of Object.entries(value.permissionDecisions).slice(0, MAX_LIST_LENGTH)) {
      if ((decision === 'allow' || decision === 'deny') && isPermissionDecisionKey(key)) {
        decisions[key] = decision;
      }
    }
    patch.permissionDecisions = decisions;
  }

  if (isRecord(value.zoomLevels)) {
    const levels: Settings['zoomLevels'] = {};
    for (const [origin, level] of Object.entries(value.zoomLevels).slice(0, MAX_LIST_LENGTH)) {
      if (typeof level === 'number' && Number.isFinite(level)) {
        // Clamped on the way in as well as when applied. Stored unclamped, a
        // level of 1000 was written down and read back as that site's zoom.
        levels[origin] = clampZoom(level);
      }
    }
    patch.zoomLevels = levels;
  }

  if (isRecord(value.openRules)) {
    const rules: Settings['openRules'] = {};
    for (const [site, target] of Object.entries(value.openRules).slice(0, MAX_OPEN_RULES)) {
      if (site.length > 0 && site.length <= MAX_SITE_LENGTH && siteOfAddress(site) === site && isOpenTarget(target)) {
        rules[site] = target;
      }
    }
    patch.openRules = rules;
  }

  if (typeof value.offerToSavePasswords === 'boolean') {
    patch.offerToSavePasswords = value.offerToSavePasswords;
  }
  if (Array.isArray(value.neverSavePasswordsOn)) {
    patch.neverSavePasswordsOn = asSiteList(value.neverSavePasswordsOn);
  }
  if (Array.isArray(value.blockerAllowlist)) {
    patch.blockerAllowlist = asSiteList(value.blockerAllowlist);
  }

  return patch;
}

/** Refused on purpose, so the coverage test has something to check against. */
export const SETTINGS_NOT_PATCHABLE: readonly string[] = ['hasWallpaper', 'downloadDirectory'];

const MAX_TRANSLATED_TEXTS = 2_000;
const MAX_TRANSLATED_CHARACTERS = 400_000;

/** Two languages the engine knows and a bounded list of text, or nothing at all. */
function readTranslation(
  from: unknown,
  to: unknown,
  texts: unknown,
): { from: string; to: string; texts: string[] } | null {
  if (
    typeof from !== 'string' ||
    typeof to !== 'string' ||
    routeFor(from, to).length === 0 ||
    !Array.isArray(texts)
  ) {
    return null;
  }
  const strings = texts.filter((text): text is string => typeof text === 'string').slice(0, MAX_TRANSLATED_TEXTS);
  const total = strings.reduce((sum, text) => sum + text.length, 0);
  return strings.length === texts.length && total <= MAX_TRANSLATED_CHARACTERS ? { from, to, texts: strings } : null;
}

/** At most a few hundred addresses, each a string: a list on screen, not a dump of history. */
function pickUrls(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length < 2048).slice(0, 500);
}
