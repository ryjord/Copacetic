import { Menu, type MenuItemConstructorOptions, shell } from 'electron';
import type { Browser } from '../app/browser';
import { profileMenuItems } from './profile-menu';
import { acceleratorFor, readShortcutOverrides } from '../../shared/shortcuts';

const PROJECT_URL = 'https://github.com/ryjord/Copacetic';

/** Everything the toolbar no longer gives its own button, in the order people look for it. */
export function mainMenuItems(browser: Browser): MenuItemConstructorOptions[] {
  // The application menu already owns these shortcuts; this menu only shows them.
  const overrides = readShortcutOverrides(browser.profile.settings().shortcutOverrides);
  const shortcut = (id: string) => ({ accelerator: acceleratorFor(id, overrides), registerAccelerator: false });

  return [
    { label: 'New window', ...shortcut('new-window'), click: () => browser.openNewWindow() },
    { label: 'New tab', ...shortcut('new-tab'), click: () => browser.commands.newTab() },
    { label: 'New Hush tab', ...shortcut('new-hush-tab'), click: () => browser.commands.newHushTab() },
    { label: 'Profiles', submenu: profileMenuItems(browser) },
    {
      label: 'Reopen closed tab',
      ...shortcut('reopen'),
      enabled: browser.tabs.hasClosedTabs(),
      click: () => browser.commands.reopenClosedTab(),
    },
    { type: 'separator' },
    { label: 'Bookmarks', ...shortcut('bookmarks'), click: () => browser.openSurface('bookmarks') },
    { label: 'History', ...shortcut('history'), click: () => browser.openSurface('history') },
    { label: 'Downloads', ...shortcut('downloads'), click: () => browser.openSurface('downloads') },
    { type: 'separator' },
    { label: 'Find on page…', ...shortcut('find'), click: () => browser.openFind() },
    { label: 'Save page as…', ...shortcut('save-page'), click: () => browser.commands.saveActiveTab() },
    { label: 'Print…', ...shortcut('print'), click: () => browser.commands.printActiveTab() },
    { type: 'separator' },
    { label: 'Command palette', ...shortcut('palette'), click: () => browser.openSurface('palette') },
    { label: 'Settings…', ...shortcut('settings'), click: () => browser.openSurface('settings') },
    // Windows and Linux show no menu bar, so this is the only menu a pointer can reach there.
    {
      label: 'More tools',
      submenu: [
        {
          label: 'Developer tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          registerAccelerator: false,
          click: () => browser.commands.toggleTabDevTools(),
        },
        {
          label: 'View page source',
          ...shortcut('view-source'),
          click: () => browser.commands.viewSourceOfActiveTab(),
        },
        { label: 'Open downloads folder', click: () => browser.openDownloadsFolder() },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Copacetic on GitHub', click: () => void shell.openExternal(PROJECT_URL) },
        { label: 'Report a problem', click: () => void shell.openExternal(`${PROJECT_URL}/issues/new`) },
      ],
    },
    // Windows and Linux have no menu bar in a frameless window, so this is the only way to quit by pointer.
    ...(process.platform === 'darwin'
      ? []
      : ([{ type: 'separator' }, { role: 'quit', label: 'Quit Copacetic' }] as MenuItemConstructorOptions[])),
  ];
}

export function showMainMenu(browser: Browser, x: number, y: number): void {
  Menu.buildFromTemplate(mainMenuItems(browser)).popup({ window: browser.window, x, y });
}
