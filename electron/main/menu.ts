import { Menu, type MenuItemConstructorOptions, app, shell } from 'electron';
import type { Browser } from './browser';

const isMac = process.platform === 'darwin';

/** The application menu is not decoration. */
export function buildApplicationMenu(browser: Browser): Menu {
  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: () => browser.openSurface('settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  template.push({
    label: 'File',
    submenu: [
      { label: 'New tab', accelerator: 'CmdOrCtrl+T', click: () => browser.newTab() },
      { label: 'New Hush tab', accelerator: 'CmdOrCtrl+Shift+N', click: () => browser.newHushTab() },
      {
        label: 'Reopen closed tab',
        accelerator: 'CmdOrCtrl+Shift+T',
        click: () => browser.reopenClosedTab(),
      },
      { type: 'separator' },
      { label: 'Close tab', accelerator: 'CmdOrCtrl+W', click: () => browser.closeActiveTab() },
      { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => browser.printActiveTab() },
      ...(isMac ? [] : ([{ type: 'separator' }, { role: 'quit' }] as MenuItemConstructorOptions[])),
    ],
  });

  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac ? ([{ role: 'pasteAndMatchStyle' }] as MenuItemConstructorOptions[]) : []),
      { role: 'delete' },
      { role: 'selectAll' },
      { type: 'separator' },
      {
        label: 'Open address bar',
        accelerator: 'CmdOrCtrl+L',
        click: () => browser.focusOmnibox(),
      },
      { label: 'Find on page…', accelerator: 'CmdOrCtrl+F', click: () => browser.tabs.openFind() },
      { label: 'Find next', accelerator: 'CmdOrCtrl+G', click: () => browser.tabs.findNext(true) },
      { label: 'Find previous', accelerator: 'CmdOrCtrl+Shift+G', click: () => browser.tabs.findNext(false) },
    ],
  });

  template.push({
    label: 'View',
    submenu: [
      {
        label: 'Reload',
        accelerator: 'CmdOrCtrl+R',
        click: () => browser.withActiveTab((id) => browser.tabs.reload(id)),
      },
      {
        label: 'Reload, ignoring cache',
        accelerator: 'CmdOrCtrl+Shift+R',
        click: () => browser.withActiveTab((id) => browser.tabs.reload(id, true)),
      },
      {
        label: 'Stop',
        accelerator: 'CmdOrCtrl+.',
        click: () => browser.withActiveTab((id) => browser.tabs.stop(id)),
      },
      { type: 'separator' },
      { label: 'Zoom in', accelerator: 'CmdOrCtrl+Plus', click: () => browser.adjustZoom('in') },
      { label: 'Zoom out', accelerator: 'CmdOrCtrl+-', click: () => browser.adjustZoom('out') },
      { label: 'Actual size', accelerator: 'CmdOrCtrl+0', click: () => browser.adjustZoom('reset') },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      { label: 'Command palette', accelerator: 'CmdOrCtrl+K', click: () => browser.openSurface('palette') },
      {
        label: 'Developer tools',
        accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
        click: () => browser.toggleTabDevTools(),
      },
    ],
  });

  template.push({
    label: 'History',
    submenu: [
      {
        label: 'Back',
        accelerator: 'CmdOrCtrl+[',
        click: () => browser.withActiveTab((id) => browser.tabs.goBack(id)),
      },
      {
        label: 'Forward',
        accelerator: 'CmdOrCtrl+]',
        click: () => browser.withActiveTab((id) => browser.tabs.goForward(id)),
      },
      { label: 'Home', accelerator: 'CmdOrCtrl+Shift+H', click: () => browser.goHome() },
      { type: 'separator' },
      { label: 'Show all history', accelerator: 'CmdOrCtrl+Y', click: () => browser.openSurface('history') },
      { label: 'Clear browsing data…', click: () => browser.openSurface('settings') },
    ],
  });

  template.push({
    label: 'Bookmarks',
    submenu: [
      {
        label: 'Bookmark this page',
        accelerator: 'CmdOrCtrl+D',
        click: () => browser.toggleBookmarkForActiveTab(),
      },
      {
        label: 'Show all bookmarks',
        accelerator: 'CmdOrCtrl+Shift+B',
        click: () => browser.openSurface('bookmarks'),
      },
    ],
  });

  template.push({
    label: 'Tabs',
    submenu: [
      { label: 'Next tab', accelerator: 'Ctrl+Tab', click: () => browser.cycleTab(1) },
      { label: 'Previous tab', accelerator: 'Ctrl+Shift+Tab', click: () => browser.cycleTab(-1) },
      { type: 'separator' },
      ...tabSelectionItems(browser),
      { type: 'separator' },
      { label: 'Downloads', accelerator: 'CmdOrCtrl+Shift+J', click: () => browser.openSurface('downloads') },
      ...(isMac
        ? ([
            { type: 'separator' },
            { role: 'minimize' },
            { role: 'zoom' },
            { role: 'front' },
          ] as MenuItemConstructorOptions[])
        : ([{ role: 'minimize' }] as MenuItemConstructorOptions[])),
    ],
  });

  template.push({
    role: 'help',
    submenu: [
      {
        label: 'Copacetic on GitHub',
        click: () => void shell.openExternal('https://github.com/ryjord/Copacetic'),
      },
      { label: 'Open downloads folder', click: () => browser.openDownloadsFolder() },
      ...(isMac ? [] : ([{ type: 'separator' }, { role: 'about' }] as MenuItemConstructorOptions[])),
    ],
  });

  return Menu.buildFromTemplate(template);
}

/** Cmd+1..8 select a tab by position; Cmd+9 always jumps to the last one. */
function tabSelectionItems(browser: Browser): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];
  for (let position = 1; position <= 8; position += 1) {
    items.push({
      label: `Tab ${position}`,
      accelerator: `CmdOrCtrl+${position}`,
      click: () => browser.selectTabAt(position - 1),
    });
  }
  items.push({ label: 'Last tab', accelerator: 'CmdOrCtrl+9', click: () => browser.selectTabAt(-1) });
  return items;
}

export function installApplicationMenu(browser: Browser): void {
  Menu.setApplicationMenu(buildApplicationMenu(browser));
}
