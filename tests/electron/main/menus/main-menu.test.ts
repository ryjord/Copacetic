import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  Menu: { buildFromTemplate: () => ({ popup: () => {} }) },
  shell: { openExternal: async () => {} },
}));

const { mainMenuItems } = await import('../../../../electron/main/menus/main-menu');

const opened: string[] = [];

function fakeBrowser({ hasClosedTabs = true } = {}) {
  return {
    commands: {
      newTab: () => {},
      newHushTab: () => {},
      reopenClosedTab: () => {},
      printActiveTab: () => {},
      toggleTabDevTools: () => opened.push('devtools'),
      viewSourceOfActiveTab: () => opened.push('view source'),
      saveActiveTab: () => {},
    },
    openDownloadsFolder: () => opened.push('downloads folder'),
    tabs: { hasClosedTabs: () => hasClosedTabs },
    openFind: () => {},
    openSurface: (surface: string) => opened.push(surface),
    profile: {
      id: 'default',
      settings: () => ({ shortcutOverrides: { find: 'Alt+CmdOrCtrl+F' } }),
      allProfiles: () => [{ id: 'default', name: 'Personal', colour: 'ocean' }],
      openWindowIn: async () => {},
    },
  } as never;
}

function labels(options?: Parameters<typeof fakeBrowser>[0]) {
  return mainMenuItems(fakeBrowser(options))
    .filter((item) => item.type !== 'separator')
    .map((item) => item.label);
}

describe('the main menu', () => {
  // The toolbar lost these buttons on the promise that one menu holds them all.
  it('reaches every surface the toolbar no longer has a button for', () => {
    expect(labels()).toEqual(expect.arrayContaining(['Bookmarks', 'History', 'Downloads', 'Settings…']));
  });

  it('opens the surface it names', () => {
    opened.length = 0;
    const history = mainMenuItems(fakeBrowser()).find((item) => item.label === 'History');
    history?.click?.({} as never, undefined, {} as never);
    expect(opened).toEqual(['history']);
  });

  // Registering them again would make every shortcut fire twice.
  it('shows the shortcuts without registering them a second time', () => {
    const withShortcuts = mainMenuItems(fakeBrowser()).filter((item) => item.accelerator);
    expect(withShortcuts.length).toBeGreaterThan(0);
    expect(withShortcuts.every((item) => item.registerAccelerator === false)).toBe(true);
  });

  it('offers to reopen a tab only when one was closed', () => {
    const reopen = (hasClosedTabs: boolean) =>
      mainMenuItems(fakeBrowser({ hasClosedTabs })).find((item) => item.label === 'Reopen closed tab');
    expect(reopen(true)?.enabled).toBe(true);
    expect(reopen(false)?.enabled).toBe(false);
  });

  it('shows a shortcut where it was moved to', () => {
    expect(mainMenuItems(fakeBrowser()).find((item) => item.label === 'Find on page…')?.accelerator).toBe(
      'Alt+CmdOrCtrl+F',
    );
  });

  // On Windows and Linux there is no menu bar, so these were reachable only by shortcut, or not at all.
  it('reaches DevTools, the downloads folder and help from the one menu every platform shows', () => {
    opened.length = 0;
    const items = mainMenuItems(fakeBrowser());
    const submenu = (label: string) =>
      (items.find((item) => item.label === label)?.submenu ?? []) as { label?: string; click?: () => void }[];
    submenu('More tools').forEach((item) => item.click?.());
    expect(opened).toEqual(['devtools', 'view source', 'downloads folder']);
    expect(submenu('Help').map((item) => item.label)).toEqual(['Copacetic on GitHub', 'Report a problem']);
  });
});
