import { Menu, type MenuItemConstructorOptions, app, shell } from 'electron';
import type { Browser } from '../app/browser';
import type { Profiles } from '../app/profiles';
import { acceleratorFor, readShortcutOverrides } from '../../shared/shortcuts';

const isMac = process.platform === 'darwin';

/** The application menu is not decoration. */
export function buildApplicationMenu(profiles: Profiles): Menu {
  const inWindow = windowActions(profiles);
  const overrides = readShortcutOverrides(profiles.shortcutOverrides());
  // Compared with true: a menu built while a key is being recorded binds none, so the key reaches the recorder.
  const isRecording = profiles.isRecordingShortcut() === true;
  const key = (id: string) => (isRecording ? undefined : acceleratorFor(id, overrides));
  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: key('settings'),
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
      // In the profile of the window in front, as a new tab is.
      {
        label: 'New window',
        accelerator: key('new-window'),
        click: () => void (profiles.focused()?.profile ?? profiles.first).openWindow(),
      },
      {
        label: 'New window in profile',
        submenu: [
          ...profiles.summaries().map((summary): MenuItemConstructorOptions => ({
            label: summary.name,
            click: () => void profiles.openWindow(summary.id),
          })),
          { type: 'separator' },
          { label: 'Manage profiles…', click: () => inWindow((browser) => browser.openSurface('settings')) },
        ],
      },
      {
        label: 'New tab',
        accelerator: key('new-tab'),
        click: () => inWindow((browser) => browser.commands.newTab()),
      },
      {
        label: 'New Hush tab',
        accelerator: key('new-hush-tab'),
        click: () => inWindow((browser) => browser.commands.newHushTab()),
      },
      {
        label: 'Reopen closed tab',
        accelerator: key('reopen'),
        click: () => inWindow((browser) => browser.commands.reopenClosedTab()),
      },
      { type: 'separator' },
      {
        label: 'Close tab',
        accelerator: key('close-tab'),
        click: () => inWindow((browser) => browser.commands.closeActiveTab()),
      },
      {
        label: 'Save page as…',
        accelerator: key('save-page'),
        click: () => inWindow((browser) => browser.commands.saveActiveTab()),
      },
      {
        label: 'Print…',
        accelerator: key('print'),
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
              accelerator: key('settings'),
              click: () => inWindow((browser) => browser.openSurface('settings')),
            },
            { type: 'separator' },
          ] as MenuItemConstructorOptions[])),
      {
        label: 'Open address bar',
        accelerator: key('address'),
        click: () => inWindow((browser) => browser.focusOmnibox()),
      },
      { label: 'Find on page…', accelerator: key('find'), click: () => inWindow((browser) => browser.openFind()) },
      {
        label: 'Find next',
        accelerator: key('find-next'),
        click: () => inWindow((browser) => browser.tabs.findNext(true)),
      },
      {
        label: 'Find previous',
        accelerator: key('find-previous'),
        click: () => inWindow((browser) => browser.tabs.findNext(false)),
      },
    ],
  });

  template.push({
    label: 'View',
    submenu: [
      {
        label: 'Reload',
        accelerator: key('reload'),
        click: () => inWindow((browser) => browser.commands.withActiveTab((id) => browser.tabs.reload(id))),
      },
      {
        label: 'Reload, ignoring cache',
        accelerator: key('reload-hard'),
        click: () => inWindow((browser) => browser.commands.withActiveTab((id) => browser.tabs.reload(id, true))),
      },
      {
        label: 'Stop',
        accelerator: key('stop'),
        click: () => inWindow((browser) => browser.commands.withActiveTab((id) => browser.tabs.stop(id))),
      },
      { type: 'separator' },
      {
        label: 'Zoom in',
        accelerator: key('zoom-in'),
        click: () => inWindow((browser) => browser.commands.adjustZoom('in')),
      },
      {
        label: 'Zoom out',
        accelerator: key('zoom-out'),
        click: () => inWindow((browser) => browser.commands.adjustZoom('out')),
      },
      {
        label: 'Actual size',
        accelerator: key('zoom-reset'),
        click: () => inWindow((browser) => browser.commands.adjustZoom('reset')),
      },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      {
        label: 'Command palette',
        accelerator: key('palette'),
        click: () => inWindow((browser) => browser.openSurface('palette')),
      },
      {
        label: 'View page source',
        accelerator: key('view-source'),
        click: () => inWindow((browser) => browser.commands.viewSourceOfActiveTab()),
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
        accelerator: key('back'),
        click: () => inWindow((browser) => browser.commands.withActiveTab((id) => browser.tabs.goBack(id))),
      },
      {
        label: 'Forward',
        accelerator: key('forward'),
        click: () => inWindow((browser) => browser.commands.withActiveTab((id) => browser.tabs.goForward(id))),
      },
      {
        label: 'Home',
        accelerator: key('home'),
        click: () => inWindow((browser) => browser.commands.goHome()),
      },
      { type: 'separator' },
      {
        label: 'Show all history',
        accelerator: key('history'),
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
        accelerator: key('bookmark'),
        click: () => inWindow((browser) => browser.commands.toggleBookmarkForActiveTab()),
      },
      {
        label: 'Show all bookmarks',
        accelerator: key('bookmarks'),
        click: () => inWindow((browser) => browser.openSurface('bookmarks')),
      },
    ],
  });

  template.push({
    label: 'Tabs',
    submenu: [
      {
        label: 'Next tab',
        accelerator: key('next-tab'),
        click: () => inWindow((browser) => browser.commands.cycleTab(1)),
      },
      {
        label: 'Previous tab',
        accelerator: key('previous-tab'),
        click: () => inWindow((browser) => browser.commands.cycleTab(-1)),
      },
      {
        label: 'Search open tabs',
        accelerator: key('tab-search'),
        click: () => inWindow((browser) => browser.openSurface('tab-search')),
      },
      { type: 'separator' },
      ...tabSelectionItems(inWindow, key),
      { type: 'separator' },
      {
        label: 'Downloads',
        accelerator: key('downloads'),
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
function windowActions(profiles: Profiles): InWindow {
  return (act) => {
    void profiles.focusedOrNew().then(act);
  };
}

function tabSelectionItems(
  inWindow: InWindow,
  key: (id: string) => string | undefined,
): MenuItemConstructorOptions[] {
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
    accelerator: key('last-tab'),
    click: () => inWindow((browser) => browser.commands.selectTabAt(-1)),
  });
  return items;
}

export function installApplicationMenu(profiles: Profiles): void {
  Menu.setApplicationMenu(buildApplicationMenu(profiles));
}
