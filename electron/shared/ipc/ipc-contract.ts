import type { CopaceticApi } from './api';

/**
 * Every call the chrome can make, and the channel it travels on.
 *
 * The API interface, the channel names, the preload and the handlers used to
 * be four lists kept in step by hand, and nothing noticed when they drifted: a
 * handler could return a different shape than the interface promised, read an
 * argument the preload never sent, or be missing altogether. This map is the
 * one list. Its keys are checked against every method of CopaceticApi, the
 * preload is built from it, each handler is typed by it, and a test checks
 * that every entry has a handler.
 */

type Namespace = Exclude<keyof CopaceticApi, 'on'>;

/** `tabs.create`, `vault.reveal` and so on: one name per method the chrome can call. */
export type ApiMethod = { [Name in Namespace]: `${Name}.${Extract<keyof CopaceticApi[Name], string>}` }[Namespace];

type MethodAt<Method extends ApiMethod> = Method extends `${infer Name}.${infer Member}`
  ? Name extends Namespace
    ? Member extends keyof CopaceticApi[Name]
      ? CopaceticApi[Name][Member]
      : never
    : never
  : never;

export type ApiArgs<Method extends ApiMethod> =
  MethodAt<Method> extends (...args: infer Args) => unknown ? Args : never;

export type ApiResult<Method extends ApiMethod> =
  MethodAt<Method> extends (...args: never[]) => Promise<infer Result> ? Result : never;

export const CHANNELS = {
  'tabs.create': 'tab:create',
  'tabs.createHush': 'tab:create-hush',
  'tabs.close': 'tab:close',
  'tabs.activate': 'tab:activate',
  'tabs.move': 'tab:move',
  'tabs.navigate': 'tab:navigate',
  'tabs.goBack': 'tab:go-back',
  'tabs.goForward': 'tab:go-forward',
  'tabs.reload': 'tab:reload',
  'tabs.stop': 'tab:stop',
  'tabs.setMuted': 'tab:set-muted',
  'tabs.duplicate': 'tab:duplicate',
  'tabs.setPinned': 'tab:set-pinned',
  'tabs.splitWith': 'tab:split-with',
  'tabs.leaveSplit': 'tab:leave-split',
  'tabs.setSplitRatio': 'tab:set-split-ratio',
  'tabs.sleep': 'tab:sleep',
  'tabs.continueOverHttp': 'tab:continue-over-http',
  'tabs.acceptCertificate': 'tab:accept-certificate',
  'tabs.reopenClosed': 'tab:reopen-closed',
  'tabs.print': 'tab:print',
  'tabs.savePage': 'tab:save-page',
  'tabs.saveScreenshot': 'tab:save-screenshot',
  'tabs.readerDocument': 'tab:reader-document',
  'tabs.readerImages': 'tab:reader-images',
  'tabs.memoryUse': 'tab:memory-use',
  'tabs.viewSource': 'tab:view-source',
  'tabs.toggleDevTools': 'tab:toggle-devtools',
  'tabs.setZoom': 'tab:set-zoom',
  'tabs.openContextMenu': 'tab:open-context-menu',
  'tabs.openNewTabMenu': 'tab:open-new-tab-menu',
  'startPage.saveShortcut': 'start-page:save-shortcut',
  'startPage.removeTile': 'start-page:remove-tile',
  'startPage.chooseIcon': 'start-page:choose-icon',
  'startPage.hiddenSiteCount': 'start-page:hidden-site-count',
  'startPage.showHiddenSites': 'start-page:show-hidden-sites',
  'translation.translate': 'translation:translate',
  'translation.installedBytes': 'translation:installed-bytes',
  'translation.removeModels': 'translation:remove-models',
  'sessions.save': 'sessions:save',
  'sessions.open': 'sessions:open',
  'sessions.rename': 'sessions:rename',
  'sessions.remove': 'sessions:remove',

  'chrome.setContentInsets': 'chrome:set-content-insets',
  'chrome.setOverlayVisible': 'chrome:set-overlay-visible',
  'chrome.setOverlaySize': 'chrome:set-overlay-size',
  'chrome.focusOverlay': 'chrome:focus-overlay',
  'chrome.toggleSiteInfo': 'chrome:toggle-site-info',
  'chrome.closeSiteInfo': 'chrome:close-site-info',
  'chrome.closeBookmarkSheet': 'chrome:close-bookmark-sheet',
  'chrome.showPage': 'chrome:show-page',
  'chrome.getState': 'chrome:get-state',
  'chrome.pendingSurface': 'surface:pending',
  'chrome.openMainMenu': 'chrome:open-main-menu',

  'omnibox.suggest': 'omnibox:suggest',
  'omnibox.showSuggestions': 'omnibox:show-suggestions',
  'omnibox.choose': 'omnibox:choose',

  'history.list': 'history:list',
  'history.remove': 'history:remove',
  'history.removeMany': 'history:remove-many',
  'history.traces': 'history:traces',
  'history.forgetSite': 'history:forget-site',
  'history.totalBlocked': 'history:total-blocked',
  'history.blockedThisWeek': 'history:blocked-this-week',
  'history.openContextMenu': 'history:open-context-menu',
  'history.clear': 'history:clear',
  'history.topSites': 'history:top-sites',

  'favicons.forUrls': 'favicons:for-urls',

  'filters.update': 'filters:update',

  'notices.answer': 'notice:answer',
  'notices.pending': 'notice:pending',

  'bookmarks.list': 'bookmarks:list',
  'bookmarks.toggle': 'bookmarks:toggle',
  'bookmarks.remove': 'bookmarks:remove',
  'bookmarks.removeMany': 'bookmarks:remove-many',
  'bookmarks.add': 'bookmarks:add',
  'bookmarks.update': 'bookmarks:update',
  'bookmarks.openInActiveTab': 'bookmarks:open',
  'bookmarks.openContextMenu': 'bookmarks:open-context-menu',
  'bookmarks.file': 'bookmarks:file',
  'bookmarks.openMenu': 'bookmarks:open-menu',
  'bookmarks.openOverflowMenu': 'bookmarks:open-overflow-menu',

  'bookmarkFolders.list': 'bookmark-folders:list',
  'bookmarkFolders.create': 'bookmark-folders:create',
  'bookmarkFolders.update': 'bookmark-folders:update',
  'bookmarkFolders.move': 'bookmark-folders:move',
  'bookmarkFolders.remove': 'bookmark-folders:delete',
  'bookmarkFolders.openAsGroup': 'bookmark-folders:open-as-group',
  'bookmarkFolders.openContextMenu': 'bookmark-folders:open-context-menu',
  'bookmarkFolders.openMenu': 'bookmark-folders:open-menu',

  'downloads.pause': 'downloads:pause',
  'downloads.resume': 'downloads:resume',
  'downloads.cancel': 'downloads:cancel',
  'downloads.openFile': 'downloads:open-file',
  'downloads.revealFile': 'downloads:reveal-file',
  'downloads.remove': 'downloads:remove',
  'downloads.removeMany': 'downloads:remove-many',
  'downloads.openFolder': 'downloads:open-folder',
  'downloads.clearCompleted': 'downloads:clear-completed',
  'downloads.retry': 'downloads:retry',
  'downloads.keep': 'downloads:keep',
  'downloads.discard': 'downloads:discard',
  'downloads.chooseFolder': 'downloads:choose-folder',

  'find.open': 'find:open',
  'find.start': 'find:start',
  'find.next': 'find:next',
  'find.previous': 'find:previous',
  'find.stop': 'find:stop',
  'find.setMatchCase': 'find:set-match-case',

  'settings.get': 'settings:get',
  'settings.update': 'settings:update',
  'settings.resetSite': 'settings:reset-site',

  'permissions.respond': 'permissions:respond',
  'permissions.forget': 'permissions:forget',

  'window.openNew': 'window:open-new',

  'app.getInfo': 'app:get-info',
  'app.openExternal': 'app:open-external',
  'app.revealDiagnostics': 'app:reveal-diagnostics',
  'app.openChromiumLicences': 'app:open-chromium-licences',
  'app.defaultBrowserStatus': 'app:default-browser-status',
  'app.spellcheckChoices': 'app:spellcheck-choices',
  'app.makeDefaultBrowser': 'app:make-default-browser',

  'vault.list': 'vault:list',
  'vault.add': 'vault:add',
  'vault.update': 'vault:update',
  'vault.remove': 'vault:remove',
  'vault.reveal': 'vault:reveal',
  'vault.copy': 'vault:copy',
  'vault.exportAll': 'vault:export',
  'vault.importFile': 'vault:import',
  'vault.generate': 'vault:generate',
  'vault.lockState': 'vault:lock-state',
  'vault.unlock': 'vault:unlock',
  'vault.lock': 'vault:lock',
  'vault.facts': 'vault:facts',
  'vault.countForTab': 'vault:count-for-tab',
  'vault.fillForTab': 'vault:fill-for-tab',
  'vault.answerSaveOffer': 'vault:answer-save-offer',

  'profiles.create': 'profile:create',
  'profiles.update': 'profile:update',
  'profiles.remove': 'profile:remove',
  'profiles.openWindow': 'profile:open-window',
  'profiles.openMenu': 'profile:open-menu',
  'profiles.choosePicture': 'profile:choose-picture',
  'profiles.removePicture': 'profile:remove-picture',
  'profiles.picture': 'profile:picture',
  'groups.create': 'group:create',
  'groups.update': 'group:update',
  'groups.remove': 'group:remove',
  'groups.setForTab': 'group:set-for-tab',
  'groups.openContextMenu': 'group:open-context-menu',

  'wallpaper.get': 'wallpaper:get',
  'wallpaper.preview': 'wallpaper:preview',
  'wallpaper.choose': 'wallpaper:choose',
  'wallpaper.staged': 'wallpaper:staged',
  'wallpaper.keep': 'wallpaper:keep',
  'wallpaper.remove': 'wallpaper:remove',
  'wallpaper.discard': 'wallpaper:discard',
  'wallpaper.clear': 'wallpaper:clear',

  'data.export': 'data:export',
  'data.importHistory': 'data:import-history',
  'data.importBookmarks': 'data:import-bookmarks',
  'data.importSources': 'data:import-sources',
  'data.importFromBrowser': 'data:import-from-browser',
  'data.previewFromBrowser': 'data:preview-from-browser',
  'data.kept': 'data:kept',
  'data.clearKept': 'data:clear-kept',

  'auth.respond': 'auth:respond',
  'auth.cancel': 'auth:cancel',

  'connections.list': 'connections:list',
  'connections.exportReport': 'connections:export-report',

  'shortcuts.setRecording': 'shortcuts:set-recording',
  'extensions.list': 'extensions:list',
  'extensions.addFromWebStore': 'extensions:add-from-web-store',
  'extensions.addFromFolder': 'extensions:add-from-folder',
  'extensions.setEnabled': 'extensions:set-enabled',
  'extensions.setPinned': 'extensions:set-pinned',
  'extensions.remove': 'extensions:remove',
  'extensions.press': 'extensions:press',
  'extensions.openOptions': 'extensions:open-options',
  'extensions.openMenu': 'extensions:open-menu',
  'updates.check': 'updates:check',
  'updates.install': 'updates:install',
  'updates.openReleases': 'updates:open-releases',
  'updates.downloadInstaller': 'updates:download-installer',
} as const satisfies Record<ApiMethod, string>;

export type InvokeChannel = (typeof CHANNELS)[ApiMethod];
