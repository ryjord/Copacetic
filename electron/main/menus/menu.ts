import { Menu, type MenuItemConstructorOptions, app, shell } from 'electron';
import type { Browser } from '../app/browser';
import type { Profiles } from '../app/profiles';
import { acceleratorFor, readShortcutOverrides } from '../../shared/shortcuts';
import { t } from '../../shared/i18n/translate';

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
          label: t('main.menu.app.settings'),
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
    label: t('main.menu.file.title'),
    submenu: [
      // In the profile of the window in front, as a new tab is.
      {
        label: t('main.menu.file.newWindow'),
        accelerator: key('new-window'),
        click: () => void (profiles.focused()?.profile ?? profiles.first).openWindow(),
      },
      {
        label: t('main.menu.file.newWindowInProfile'),
        submenu: [
          ...profiles.summaries().map((summary): MenuItemConstructorOptions => ({
            label: summary.name,
            click: () => void profiles.openWindow(summary.id),
          })),
          { type: 'separator' },
          {
            label: t('main.menu.profiles.manage'),
            click: () => inWindow((browser) => browser.openSurface('settings')),
          },
        ],
      },
      {
        label: t('main.menu.file.newTab'),
        accelerator: key('new-tab'),
        click: () => inWindow((browser) => browser.commands.newTab()),
      },
      {
        label: t('main.menu.file.newHushTab'),
        accelerator: key('new-hush-tab'),
        click: () => inWindow((browser) => browser.commands.newHushTab()),
      },
      {
        label: t('main.menu.file.reopenClosedTab'),
        accelerator: key('reopen'),
        click: () => inWindow((browser) => browser.commands.reopenClosedTab()),
      },
      { type: 'separator' },
      {
        label: t('main.menu.file.closeTab'),
        accelerator: key('close-tab'),
        click: () => inWindow((browser) => browser.commands.closeActiveTab()),
      },
      {
        label: t('main.menu.file.savePageAs'),
        accelerator: key('save-page'),
        click: () => inWindow((browser) => browser.commands.saveActiveTab()),
      },
      {
        label: t('main.menu.file.print'),
        accelerator: key('print'),
        click: () => inWindow((browser) => browser.commands.printActiveTab()),
      },
      ...(isMac ? [] : ([{ type: 'separator' }, { role: 'quit' }] as MenuItemConstructorOptions[])),
    ],
  });

  template.push({
    label: t('main.menu.edit.title'),
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
              label: t('main.menu.app.settings'),
              accelerator: key('settings'),
              click: () => inWindow((browser) => browser.openSurface('settings')),
            },
            { type: 'separator' },
          ] as MenuItemConstructorOptions[])),
      {
        label: t('main.menu.edit.openAddressBar'),
        accelerator: key('address'),
        click: () => inWindow((browser) => browser.focusOmnibox()),
      },
      {
        label: t('main.menu.edit.findOnPage'),
        accelerator: key('find'),
        click: () => inWindow((browser) => browser.openFind()),
      },
      {
        label: t('main.menu.edit.findNext'),
        accelerator: key('find-next'),
        click: () => inWindow((browser) => browser.tabs.findNext(true)),
      },
      {
        label: t('main.menu.edit.findPrevious'),
        accelerator: key('find-previous'),
        click: () => inWindow((browser) => browser.tabs.findNext(false)),
      },
    ],
  });

  template.push({
    label: t('main.menu.view.title'),
    submenu: [
      {
        label: t('main.menu.view.reload'),
        accelerator: key('reload'),
        click: () => inWindow((browser) => browser.commands.withActiveTab((id) => browser.tabs.reload(id))),
      },
      {
        label: t('main.menu.view.reloadIgnoringCache'),
        accelerator: key('reload-hard'),
        click: () => inWindow((browser) => browser.commands.withActiveTab((id) => browser.tabs.reload(id, true))),
      },
      {
        label: t('main.menu.view.stop'),
        accelerator: key('stop'),
        click: () => inWindow((browser) => browser.commands.withActiveTab((id) => browser.tabs.stop(id))),
      },
      { type: 'separator' },
      {
        label: t('main.menu.view.zoomIn'),
        accelerator: key('zoom-in'),
        click: () => inWindow((browser) => browser.commands.adjustZoom('in')),
      },
      {
        label: t('main.menu.view.zoomOut'),
        accelerator: key('zoom-out'),
        click: () => inWindow((browser) => browser.commands.adjustZoom('out')),
      },
      {
        label: t('main.menu.view.actualSize'),
        accelerator: key('zoom-reset'),
        click: () => inWindow((browser) => browser.commands.adjustZoom('reset')),
      },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      {
        label: t('main.menu.view.commandPalette'),
        accelerator: key('palette'),
        click: () => inWindow((browser) => browser.openSurface('palette')),
      },
      {
        label: t('main.menu.view.viewPageSource'),
        accelerator: key('view-source'),
        click: () => inWindow((browser) => browser.commands.viewSourceOfActiveTab()),
      },
      {
        label: t('main.menu.view.developerTools'),
        accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
        click: () => inWindow((browser) => browser.commands.toggleTabDevTools()),
      },
    ],
  });

  template.push({
    label: t('main.menu.history.title'),
    submenu: [
      {
        label: t('main.menu.history.back'),
        accelerator: key('back'),
        click: () => inWindow((browser) => browser.commands.withActiveTab((id) => browser.tabs.goBack(id))),
      },
      {
        label: t('main.menu.history.forward'),
        accelerator: key('forward'),
        click: () => inWindow((browser) => browser.commands.withActiveTab((id) => browser.tabs.goForward(id))),
      },
      {
        label: t('main.menu.history.home'),
        accelerator: key('home'),
        click: () => inWindow((browser) => browser.commands.goHome()),
      },
      { type: 'separator' },
      {
        label: t('main.menu.history.showAll'),
        accelerator: key('history'),
        click: () => inWindow((browser) => browser.openSurface('history')),
      },
      {
        label: t('main.menu.history.clearBrowsingData'),
        click: () => inWindow((browser) => browser.openSurface('settings')),
      },
    ],
  });

  template.push({
    label: t('main.menu.bookmarks.title'),
    submenu: [
      {
        label: t('main.menu.bookmarks.bookmarkThisPage'),
        accelerator: key('bookmark'),
        click: () => inWindow((browser) => browser.commands.toggleBookmarkForActiveTab()),
      },
      {
        label: t('main.menu.bookmarks.showAll'),
        accelerator: key('bookmarks'),
        click: () => inWindow((browser) => browser.openSurface('bookmarks')),
      },
    ],
  });

  template.push({
    label: t('main.menu.tabs.title'),
    submenu: [
      {
        label: t('main.menu.tabs.next'),
        accelerator: key('next-tab'),
        click: () => inWindow((browser) => browser.commands.cycleTab(1)),
      },
      {
        label: t('main.menu.tabs.previous'),
        accelerator: key('previous-tab'),
        click: () => inWindow((browser) => browser.commands.cycleTab(-1)),
      },
      {
        label: t('main.menu.tabs.searchOpen'),
        accelerator: key('tab-search'),
        click: () => inWindow((browser) => browser.openSurface('tab-search')),
      },
      { type: 'separator' },
      ...tabSelectionItems(inWindow, key),
      { type: 'separator' },
      {
        label: t('main.menu.tabs.downloads'),
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
        label: t('main.menu.help.github'),
        click: () => void shell.openExternal('https://github.com/ryjord/Copacetic'),
      },
      {
        label: t('main.menu.help.openDownloadsFolder'),
        click: () => inWindow((browser) => browser.openDownloadsFolder()),
      },
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
      label: t('main.menu.tabs.numbered', { position }),
      accelerator: `CmdOrCtrl+${position}`,
      click: () => inWindow((browser) => browser.commands.selectTabAt(position - 1)),
    });
  }
  items.push({
    label: t('main.menu.tabs.last'),
    accelerator: key('last-tab'),
    click: () => inWindow((browser) => browser.commands.selectTabAt(-1)),
  });
  return items;
}

export function installApplicationMenu(profiles: Profiles): void {
  Menu.setApplicationMenu(buildApplicationMenu(profiles));
}
