import { describe, expect, it, vi } from 'vitest';

type Template = Record<string, unknown>[];

let captured: Template = [];

vi.mock('electron', () => ({
  clipboard: { writeText: async () => {} },
  shell: { openExternal: () => {} },
  Menu: {
    buildFromTemplate: (template: Template) => {
      captured = template;
      return { popup: () => {} };
    },
  },
}));

const {
  showBookmarkFolderContextMenu,
  showGroupContextMenu,
  showNewTabMenu,
  showPageContextMenu,
  showTabContextMenu,
} = await import('../../../../electron/main/menus/context-menu');

const called: string[] = [];

function fakeBrowser({ hasClosedTabs = true, url = 'https://example.com', canSleep = true } = {}) {
  const record = (name: string) => () => {
    called.push(name);
  };
  return {
    commands: {
      newTab: record('newTab'),
      newHushTab: record('newHushTab'),
      reopenClosedTab: record('reopenClosedTab'),
    },
    toggleBookmarkForActiveTab: record('toggleBookmark'),
    scheduleStatePush: record('scheduleStatePush'),
    store: {
      listNamedSessions: () => [],
      getSettings: () => ({ openRules: {} }),
      groupFor: () => null,
      isBookmarked: () => false,
      toggleBookmark: record('toggleBookmark'),
      listGroups: () => [],
    },
    groups: { create: record('createGroup'), setForTab: record('setTabGroup') },
    tabs: {
      urlFor: () => url,
      groupIdFor: () => null,
      isHush: () => false,
      isPinned: () => false,
      setPinned: record('tabs.setPinned'),
      canSleep: () => canSleep,
      getSplit: () => null,
      getActiveTabId: () => null,
      sleep: record('tabs.sleep'),
      titleFor: () => 'Example',
      hasClosedTabs: () => hasClosedTabs,
      closedEntries: () => [],
      reopenClosedAt: () => {},
      create: record('tabs.create'),
      duplicate: record('tabs.duplicate'),
      reload: record('tabs.reload'),
      close: record('tabs.close'),
      closeOthers: record('tabs.closeOthers'),
      closeToTheRight: record('tabs.closeToTheRight'),
    },
  } as never;
}

function tabMenu(options?: Parameters<typeof fakeBrowser>[0]) {
  captured = [];
  showTabContextMenu(fakeBrowser(options), 'tab-1');
  return captured;
}

function newTabMenu(options?: Parameters<typeof fakeBrowser>[0]) {
  captured = [];
  showNewTabMenu(fakeBrowser(options));
  return captured;
}

const labelsOf = (items: Template) => items.map((item) => item.label).filter(Boolean);
const itemNamed = (items: Template, label: string) => items.find((item) => item.label === label);

/**
 * A Hush tab was reachable by keyboard shortcut or the macOS menu bar and
 * nothing else. Off macOS the window is frameless, so there is no menu bar to
 * reach for - which left the browser's most distinctive feature undiscoverable
 * to anyone using a mouse.
 */
describe('opening a Hush tab without a keyboard', () => {
  it.each([
    ['when a tab is right-clicked', tabMenu],
    ['behind the caret beside the new-tab button', newTabMenu],
  ])('is offered, and actually opens one, %s', (_name, build) => {
    called.length = 0;
    const items = build();
    expect(labelsOf(items)).toContain('New Hush tab');
    (itemNamed(items, 'New Hush tab')?.click as () => void)();
    expect(called).toContain('newHushTab');
  });
});

describe('reopening a closed tab without a keyboard', () => {
  // A menu item that does nothing teaches someone the menu is unreliable.
  it.each([
    ['is enabled in the tab menu when something has been closed', tabMenu, true],
    ['is disabled in the tab menu when nothing has been closed', tabMenu, false],
    ['is enabled in the new-tab menu when something has been closed', newTabMenu, true],
    ['is disabled in the new-tab menu when nothing has been closed', newTabMenu, false],
  ])('%s', (_name, build, hasClosedTabs) => {
    const items = build({ hasClosedTabs });
    expect(labelsOf(items)).toContain('Reopen closed tab');
    expect(itemNamed(items, 'Reopen closed tab')?.enabled).toBe(hasClosedTabs);
  });
});

// Sleeping the tab in front would blank the page the person is looking at.
describe('putting a tab to sleep from its menu', () => {
  it('sleeps that tab', () => {
    called.length = 0;
    (itemNamed(tabMenu(), 'Put tab to sleep')?.click as () => void)();
    expect(called).toContain('tabs.sleep');
  });

  it('is disabled for a tab that cannot sleep', () => {
    expect(itemNamed(tabMenu({ canSleep: false }), 'Put tab to sleep')?.enabled).toBe(false);
  });
});

/**
 * A group's menu is where colour, deletion and the conversion to a folder live -
 * nothing about them is reachable any other way, and the diff that added them
 * asserted only that building the menu did not throw. A rename wired to the
 * delete, or Ungroup wired to Close, would have looked exactly the same.
 */
describe("a group's menu", () => {
  const group = { id: 'g1', name: 'Work', colour: 'violet', ownSession: false, collapsed: false };

  function groupBrowser({ holdsHush = false, ownSession = false } = {}) {
    captured = [];
    const browser = {
      ...(fakeBrowser() as unknown as Record<string, unknown>),
      store: {
        groupFor: () => ({ ...group, ownSession }),
        listBookmarks: () => [],
        listBookmarkFolders: () => [],
        updateBookmarkFolder: () => {},
      },
      tabs: { tabsInGroup: () => [], groupHoldsHush: () => holdsHush },
      groups: {
        update: (id: string, changes: Record<string, unknown>) =>
          called.push(`updateGroup:${JSON.stringify(changes)}`),
        remove: () => called.push('removeGroup'),
        close: () => called.push('closeGroup'),
        rename: () => called.push('renameGroup'),
        saveAsFolder: () => called.push('saveGroupAsFolder'),
      },
      window: {},
    } as never;
    showGroupContextMenu(browser, 'g1');
    return captured;
  }

  // The claim is the only place a mixed group admits what it is, and it was
  // moved here when the panel that used to carry it was deleted.
  it('says what the group can promise, cannot be clicked, and says something different when it holds a Hush tab', () => {
    const shared = groupBrowser({ holdsHush: false })[0];
    const mixed = groupBrowser({ holdsHush: true })[0];
    expect(String(shared?.label)).toContain('cookies');
    expect(shared?.enabled).toBe(false);
    expect(String(mixed?.label)).not.toBe(String(shared?.label));
  });

  it('wires each item to the thing it names', () => {
    called.length = 0;
    const items = groupBrowser();
    (itemNamed(items, 'Rename “Work”') as { click: () => void }).click();
    (itemNamed(items, 'Ungroup these tabs') as { click: () => void }).click();
    (itemNamed(items, 'Close these tabs') as { click: () => void }).click();
    (itemNamed(items, 'Save as a bookmark folder') as { click: () => void }).click();
    expect(called).toEqual(['renameGroup', 'removeGroup', 'closeGroup', 'saveGroupAsFolder']);
  });

  it('offers every colour, with the current one marked', () => {
    const colour = itemNamed(groupBrowser(), 'Colour') as { submenu: Template };
    expect(colour.submenu).toHaveLength(6);
    const checked = colour.submenu.filter((entry) => entry.checked);
    expect(checked).toHaveLength(1);
    expect(String(checked[0]?.label)).toBe('Violet');
  });

  it('does nothing at all for a group that is not there', () => {
    captured = [];
    showGroupContextMenu({ store: { groupFor: () => null } } as never, 'gone');
    expect(captured).toEqual([]);
  });
});

/**
 * Deleting a folder is the item most likely to be feared, so the menu says what
 * it keeps before it is pressed rather than afterwards.
 */
describe("a bookmark folder's menu", () => {
  const folder = { id: 'f1', name: 'Work', colour: 'violet', parentId: null, collapsed: false };
  const hiddenFromBar: string[] = [];
  const updateSettings = vi.fn();

  function folderMenu({ here = 2, inside = 0, children = 0 } = {}) {
    captured = [];
    const folders = [
      folder,
      ...Array.from({ length: children }, (_, index) => ({ ...folder, id: `c${index}`, parentId: 'f1' })),
    ];
    const bookmarks = [
      ...Array.from({ length: here }, (_, index) => ({
        id: `b${index}`,
        url: 'u',
        title: 't',
        createdAt: 0,
        folderId: 'f1',
      })),
      ...Array.from({ length: inside }, (_, index) => ({
        id: `d${index}`,
        url: 'u',
        title: 't',
        createdAt: 0,
        folderId: 'c0',
      })),
    ];
    showBookmarkFolderContextMenu(
      {
        store: {
          listBookmarkFolders: () => folders,
          listBookmarks: () => bookmarks,
          folderFor: (id: string) => folders.find((entry) => entry.id === id) ?? null,
        },
        profile: { settings: () => ({ hiddenFromBookmarksBar: hiddenFromBar }) },
        updateSettings,
        window: {},
      } as never,
      'f1',
    );
    return captured;
  }

  // On the bar it is one click to leave off, and Appearance lists it to put back.
  it('offers to leave a top-level folder off the bookmarks bar, and does', () => {
    const hide = folderMenu().find((item) => item.label === 'Hide from the bookmarks bar');
    (hide?.click as () => void)();
    expect(updateSettings).toHaveBeenCalledWith({ hiddenFromBookmarksBar: ['f1'] });
  });

  it('does not offer it again for one already left off', () => {
    hiddenFromBar.push('f1');
    const labels = labelsOf(folderMenu()).map(String);
    hiddenFromBar.length = 0;
    expect(labels).not.toContain('Hide from the bookmarks bar');
  });

  // A tree makes every count ambiguous, so neither number is left to be guessed.
  it.each([
    ['gives one number when there is only one to give', { here: 2 }, /^2 bookmarks$/],
    ['gives the number here when the counts differ', { here: 2, inside: 3, children: 1 }, /2 here/],
    [
      'gives the number with folders inside when the counts differ',
      { here: 2, inside: 3, children: 1 },
      /5 with folders inside/,
    ],
    ['offers to delete the folder', { here: 2, children: 1 }, /^Delete this folder$/],
    ['says what deleting keeps, before it is pressed', { here: 2, children: 1 }, /2 bookmarks and 1 folders move up/],
  ])('%s', (_name, options, pattern) => {
    const labels = labelsOf(folderMenu(options)).map(String);
    expect(labels.some((label) => pattern.test(label))).toBe(true);
  });

  it('will not offer to open an empty folder as a group', () => {
    const open = labelsOf(folderMenu({ here: 0 }))
      .map(String)
      .find((label) => label.startsWith('Open all'));
    expect(open).toBe('Open all 0 as a tab group');
    const item = folderMenu({ here: 0 }).find((entry) => String(entry.label).startsWith('Open all'));
    expect(item?.enabled).toBe(false);
  });
});

describe('a link right-clicked in a page', () => {
  function linkMenu(isHush: boolean) {
    const created: unknown[] = [];
    const browser = {
      profile: { settings: () => ({ cleanLinks: false }), extensions: { menuItemsFor: () => [] } },
      commands: { downloadUrl: () => {} },
      tabs: { isHush: () => isHush, webContentsIdFor: () => 7, create: (...args: unknown[]) => created.push(args) },
    } as never;
    captured = [];
    showPageContextMenu(browser, 'tab-1', {
      linkURL: 'https://example.com/elsewhere',
      srcURL: '',
      mediaType: 'none',
      selectionText: '',
      isEditable: false,
      x: 0,
      y: 0,
    } as never);
    return { items: captured, created };
  }

  it('opens in a Hush tab, from the page it was found on', () => {
    const { items, created } = linkMenu(false);
    (itemNamed(items, 'Open link in Hush tab')?.click as () => void)();
    expect(created).toEqual([
      ['https://example.com/elsewhere', { activate: true, hush: true, openerWebContentsId: 7 }],
    ]);
  });

  // Every link out of a Hush tab is Hush already.
  it('is not offered in a Hush tab', () => {
    expect(labelsOf(linkMenu(true).items)).not.toContain('Open link in Hush tab');
  });
});
