import { Menu, type MenuItemConstructorOptions } from 'electron';
import type { Browser } from '../app/browser';

/** Everything the toolbar no longer gives its own button, in the order people look for it. */
export function mainMenuItems(browser: Browser): MenuItemConstructorOptions[] {
  // The application menu already owns these shortcuts; this menu only shows them.
  const shortcut = (accelerator: string) => ({ accelerator, registerAccelerator: false });

  return [
    { label: 'New tab', ...shortcut('CmdOrCtrl+T'), click: () => browser.commands.newTab() },
    { label: 'New Hush tab', ...shortcut('CmdOrCtrl+Shift+N'), click: () => browser.commands.newHushTab() },
    {
      label: 'Reopen closed tab',
      ...shortcut('CmdOrCtrl+Shift+T'),
      enabled: browser.tabs.hasClosedTabs(),
      click: () => browser.commands.reopenClosedTab(),
    },
    { type: 'separator' },
    { label: 'Bookmarks', ...shortcut('CmdOrCtrl+Shift+B'), click: () => browser.openSurface('bookmarks') },
    { label: 'History', ...shortcut('CmdOrCtrl+Y'), click: () => browser.openSurface('history') },
    { label: 'Downloads', ...shortcut('CmdOrCtrl+Shift+J'), click: () => browser.openSurface('downloads') },
    { type: 'separator' },
    { label: 'Find on page…', ...shortcut('CmdOrCtrl+F'), click: () => browser.tabs.openFind() },
    { label: 'Print…', ...shortcut('CmdOrCtrl+P'), click: () => browser.commands.printActiveTab() },
    { type: 'separator' },
    { label: 'Command palette', ...shortcut('CmdOrCtrl+K'), click: () => browser.openSurface('palette') },
    { label: 'Settings…', ...shortcut('CmdOrCtrl+,'), click: () => browser.openSurface('settings') },
    // Windows and Linux have no menu bar in a frameless window, so this is the only way to quit by pointer.
    ...(process.platform === 'darwin'
      ? []
      : ([{ type: 'separator' }, { role: 'quit', label: 'Quit Copacetic' }] as MenuItemConstructorOptions[])),
  ];
}

export function showMainMenu(browser: Browser, x: number, y: number): void {
  Menu.buildFromTemplate(mainMenuItems(browser)).popup({ window: browser.window, x, y });
}
