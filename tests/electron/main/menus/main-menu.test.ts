import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  Menu: { buildFromTemplate: () => ({ popup: () => {} }) },
}));

const { mainMenuItems } = await import('../../../../electron/main/menus/main-menu');

const opened: string[] = [];

function fakeBrowser({ hasClosedTabs = true } = {}) {
  return {
    commands: { newTab: () => {}, newHushTab: () => {}, reopenClosedTab: () => {}, printActiveTab: () => {} },
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
});
