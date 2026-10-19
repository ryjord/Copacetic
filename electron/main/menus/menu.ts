import { Menu, type MenuItemConstructorOptions, app, shell } from 'electron';
import type { Browser } from '../app/browser';
import type { Profile } from '../app/profile';

const isMac = process.platform === 'darwin';

/** The application menu is not decoration. */
export function buildApplicationMenu(profile: Profile): Menu {
  const inWindow = windowActions(profile);
  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: () => inWindow((browser) => browser.openSurface('settings')),
        },
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
      { label: 'New window', accelerator: 'CmdOrCtrl+N', click: () => void profile.openWindow() },
      { label: 'New tab', accelerator: 'CmdOrCtrl+T', click: () => inWindow((browser) => browser.commands.newTab()) },
      {
        label: 'New Hush tab',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: () => inWindow((browser) => browser.commands.newHushTab()),
      },
      {
        label: 'Reopen closed tab',
        accelerator: 'CmdOrCtrl+Shift+T',
        click: () => inWindow((browser) => browser.commands.reopenClosedTab()),
      },
      { type: 'separator' },
      {
        label: 'Close tab',
        accelerator: 'CmdOrCtrl+W',
        click: () => inWindow((browser) => browser.commands.closeActiveTab()),
      },
      {
        label: 'Print…',
        accelerator: 'CmdOrCtrl+P',
        click: () => inWindow((browser) => browser.commands.printActiveTab()),
      },
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
      // Settings lives in the application menu on macOS, which does not exist
      // anywhere else - so on Windows and Linux there was no way to open it
      // from the menu bar at all. Edit is where both conventions put it.
      ...(isMac
        ? []
        : ([
            {
              label: 'Settings…',
              accelerator: 'CmdOrCtrl+,',
              click: () => inWindow((browser) => browser.openSurface('settings')),
            },
            { type: 'separator' },
          ] as MenuItemConstructorOptions[])),
      {
        label: 'Open address bar',
        accelerator: 'CmdOrCtrl+L',
        click: () => inWindow((browser) => browser.focusOmnibox()),
      },
      { label: 'Find on page…', accelerator: 'CmdOrCtrl+F', click: () => inWindow((browser) => browser.openFind()) },
      {
        label: 'Find next',
        accelerator: 'CmdOrCtrl+G',
        click: () => inWindow((browser) => browser.tabs.findNext(true)),
      },
      {
        label: 'Find previous',
        accelerator: 'CmdOrCtrl+Shift+G',
        click: () => inWindow((browser) => browser.tabs.findNext(false)),
      },
    ],
  });

  template.push({
    label: 'View',
    submenu: [
      {
        label: 'Reload',
        accelerator: 'CmdOrCtrl+R',
        click: () => inWindow((browser) => browser.commands.withActiveTab((id) => browser.tabs.reload(id))),
      },
      {
        label: 'Reload, ignoring cache',
        accelerator: 'CmdOrCtrl+Shift+R',
        click: () => inWindow((browser) => browser.commands.withActiveTab((id) => browser.tabs.reload(id, true))),
      },
      {
        label: 'Stop',
        accelerator: 'CmdOrCtrl+.',
        click: () => inWindow((browser) => browser.commands.withActiveTab((id) => browser.tabs.stop(id))),
      },
      { type: 'separator' },
      {
        label: 'Zoom in',
        accelerator: 'CmdOrCtrl+Plus',
        click: () => inWindow((browser) => browser.commands.adjustZoom('in')),
      },
      {
        label: 'Zoom out',
        accelerator: 'CmdOrCtrl+-',
        click: () => inWindow((browser) => browser.commands.adjustZoom('out')),
      },
      {
        label: 'Actual size',
        accelerator: 'CmdOrCtrl+0',
        click: () => inWindow((browser) => browser.commands.adjustZoom('reset')),
      },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      {
        label: 'Command palette',
        accelerator: 'CmdOrCtrl+K',
        click: () => inWindow((browser) => browser.openSurface('palette')),
      },
      {
        label: 'Developer tools',
        accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
        click: () => inWindow((browser) => browser.commands.toggleTabDevTools()),
      },
    ],
  });

  template.push({
    label: 'History',
    submenu: [
      {
        label: 'Back',
        accelerator: 'CmdOrCtrl+[',
        click: () => inWindow((browser) => browser.commands.withActiveTab((id) => browser.tabs.goBack(id))),
      },
      {
        label: 'Forward',
        accelerator: 'CmdOrCtrl+]',
        click: () => inWindow((browser) => browser.commands.withActiveTab((id) => browser.tabs.goForward(id))),
      },
      {
        label: 'Home',
        accelerator: 'CmdOrCtrl+Shift+H',
        click: () => inWindow((browser) => browser.commands.goHome()),
      },
      { type: 'separator' },
      {
        label: 'Show all history',
        accelerator: 'CmdOrCtrl+Y',
        click: () => inWindow((browser) => browser.openSurface('history')),
      },
      { label: 'Clear browsing data…', click: () => inWindow((browser) => browser.openSurface('settings')) },
    ],
  });

  template.push({
    label: 'Bookmarks',
    submenu: [
      {
        label: 'Bookmark this page',
        accelerator: 'CmdOrCtrl+D',
        click: () => inWindow((browser) => browser.commands.toggleBookmarkForActiveTab()),
      },
      {
        label: 'Show all bookmarks',
        accelerator: 'CmdOrCtrl+Shift+B',
        click: () => inWindow((browser) => browser.openSurface('bookmarks')),
      },
    ],
  });

  template.push({
    label: 'Tabs',
    submenu: [
      {
        label: 'Next tab',
        accelerator: 'Ctrl+Tab',
        click: () => inWindow((browser) => browser.commands.cycleTab(1)),
      },
      {
        label: 'Previous tab',
        accelerator: 'Ctrl+Shift+Tab',
        click: () => inWindow((browser) => browser.commands.cycleTab(-1)),
      },
      { type: 'separator' },
      ...tabSelectionItems(inWindow),
      { type: 'separator' },
      {
        label: 'Downloads',
        accelerator: 'CmdOrCtrl+Shift+J',
        click: () => inWindow((browser) => browser.openSurface('downloads')),
      },
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
      { label: 'Open downloads folder', click: () => inWindow((browser) => browser.openDownloadsFolder()) },
      ...(isMac ? [] : ([{ type: 'separator' }, { role: 'about' }] as MenuItemConstructorOptions[])),
    ],
  });

  return Menu.buildFromTemplate(template);
}

/** Cmd+1..8 select a tab by position; Cmd+9 always jumps to the last one. */
type InWindow = (act: (browser: Browser) => void) => void;

/**
 * Runs a menu item against the window in front.
 *
 * On macOS the menu bar is there with no window open at all, and an item that
 * needs one opens one first rather than doing nothing.
 */
function windowActions(profile: Profile): InWindow {
  return (act) => {
    const focused = profile.focused();
    if (focused) {
      act(focused);
      return;
    }
    void profile.openWindow().then(act);
  };
}

function tabSelectionItems(inWindow: InWindow): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];
  for (let position = 1; position <= 8; position += 1) {
    items.push({
      label: `Tab ${position}`,
      accelerator: `CmdOrCtrl+${position}`,
      click: () => inWindow((browser) => browser.commands.selectTabAt(position - 1)),
    });
  }
  items.push({
    label: 'Last tab',
    accelerator: 'CmdOrCtrl+9',
    click: () => inWindow((browser) => browser.commands.selectTabAt(-1)),
  });
  return items;
}

export function installApplicationMenu(profile: Profile): void {
  Menu.setApplicationMenu(buildApplicationMenu(profile));
}
