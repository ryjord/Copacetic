// Libs
import { Menu, type MenuItemConstructorOptions, shell } from 'electron';

// Utils
import { profileMenuItems } from './profile-menu';
import { namedSessionsSubmenu, recentlyClosedSubmenu } from './context-menu';
import { acceleratorFor, readShortcutOverrides } from '../../shared/chrome/shortcuts';
import { t } from '../../shared/i18n/translate';

// Types
import type { Browser } from '../app/browser';

const PROJECT_URL = 'https://github.com/ryjord/Copacetic';

/** Everything the toolbar no longer gives its own button, in the order people look for it. */
export function mainMenuItems(browser: Browser): MenuItemConstructorOptions[] {
  // The application menu already owns these shortcuts; this menu only shows them.
  const overrides = readShortcutOverrides(browser.profile.settings().shortcutOverrides);
  const shortcut = (id: string) => ({ accelerator: acceleratorFor(id, overrides), registerAccelerator: false });

  return [
    { label: t('main.menu.file.newWindow'), ...shortcut('new-window'), click: () => browser.openNewWindow() },
    { label: t('main.menu.file.newTab'), ...shortcut('new-tab'), click: () => browser.commands.newTab() },
    {
      label: t('main.menu.file.newHushTab'),
      ...shortcut('new-hush-tab'),
      click: () => browser.commands.newHushTab(),
    },
    { label: t('main.menu.mainMenu.profiles'), submenu: profileMenuItems(browser) },
    {
      label: t('main.menu.file.reopenClosedTab'),
      ...shortcut('reopen'),
      enabled: browser.tabs.hasClosedTabs(),
      click: () => browser.commands.reopenClosedTab(),
    },
    recentlyClosedSubmenu(browser),
    namedSessionsSubmenu(browser),
    { type: 'separator' },
    {
      label: t('main.menu.bookmarks.title'),
      ...shortcut('bookmarks'),
      click: () => browser.showPage('bookmarks'),
    },
    { label: t('main.menu.history.title'), ...shortcut('history'), click: () => browser.showPage('history') },
    { label: t('main.menu.tabs.downloads'), ...shortcut('downloads'), click: () => browser.showPage('downloads') },
    { label: t('main.menu.history.clearBrowsingData'), click: () => browser.openSettingsPane('data') },
    { type: 'separator' },
    // Windows and Linux have no menu bar, so the zoom, reader and split controls have to live here too.
    {
      label: t('main.menu.mainMenu.zoomLevel', { percent: Math.round(browser.commands.activeZoomFactor() * 100) }),
      enabled: false,
    },
    { label: t('main.menu.view.zoomIn'), ...shortcut('zoom-in'), click: () => browser.commands.adjustZoom('in') },
    { label: t('main.menu.view.zoomOut'), ...shortcut('zoom-out'), click: () => browser.commands.adjustZoom('out') },
    {
      label: t('main.menu.view.actualSize'),
      ...shortcut('zoom-reset'),
      click: () => browser.commands.adjustZoom('reset'),
    },
    { label: t('main.menu.view.readerView'), ...shortcut('reader-view'), click: () => browser.openSurface('reader') },
    { label: t('main.menu.tabs.splitView'), ...shortcut('split-view'), click: () => browser.tabs.toggleSplit() },
    { type: 'separator' },
    { label: t('main.menu.edit.findOnPage'), ...shortcut('find'), click: () => browser.openFind() },
    {
      label: t('main.menu.file.savePageAs'),
      ...shortcut('save-page'),
      click: () => browser.commands.saveActiveTab(),
    },
    {
      label: t('main.menu.file.screenshot'),
      ...shortcut('screenshot'),
      click: () => browser.commands.saveScreenshotOfActiveTab(),
    },
    { label: t('main.menu.file.print'), ...shortcut('print'), click: () => browser.commands.printActiveTab() },
    { type: 'separator' },
    {
      label: t('main.menu.view.commandPalette'),
      ...shortcut('palette'),
      click: () => browser.openSurface('palette'),
    },
    { label: t('main.menu.app.settings'), ...shortcut('settings'), click: () => browser.showPage('settings') },
    // Windows and Linux show no menu bar, so this is the only menu a pointer can reach there.
    {
      label: t('main.menu.mainMenu.moreTools'),
      submenu: [
        {
          label: t('main.menu.view.developerTools'),
          accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          registerAccelerator: false,
          click: () => browser.commands.toggleTabDevTools(),
        },
        {
          label: t('main.menu.view.viewPageSource'),
          ...shortcut('view-source'),
          click: () => browser.commands.viewSourceOfActiveTab(),
        },
        { label: t('main.menu.help.openDownloadsFolder'), click: () => browser.openDownloadsFolder() },
      ],
    },
    {
      label: t('main.menu.help.title'),
      submenu: [
        { label: t('main.menu.help.github'), click: () => void shell.openExternal(PROJECT_URL) },
        {
          label: t('main.menu.help.reportProblem'),
          click: () => void shell.openExternal(`${PROJECT_URL}/issues/new`),
        },
      ],
    },
    // Windows and Linux have no menu bar in a frameless window, so this is the only way to quit by pointer.
    ...(process.platform === 'darwin'
      ? []
      : ([
          { type: 'separator' },
          { role: 'quit', label: t('main.menu.mainMenu.quit') },
        ] as MenuItemConstructorOptions[])),
  ];
}

export function showMainMenu(browser: Browser, x: number, y: number): void {
  Menu.buildFromTemplate(mainMenuItems(browser)).popup({ window: browser.window, x, y });
}
