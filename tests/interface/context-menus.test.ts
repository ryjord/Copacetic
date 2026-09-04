import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

type Template = Record<string, unknown>[];

let captured: Template = [];

vi.mock('electron', () => ({
  clipboard: { writeText: () => {} },
  shell: { openExternal: () => {} },
  Menu: {
    buildFromTemplate: (template: Template) => {
      captured = template;
      return { popup: () => {} };
    },
  },
}));

const { showBookmarkFolderContextMenu, showGroupContextMenu, showNewTabMenu, showTabContextMenu } =
  await import('../../electron/main/menus/context-menu');

const called: string[] = [];

function fakeBrowser({ hasClosedTabs = true, url = 'https://example.com' } = {}) {
  const record = (name: string) => () => {
    called.push(name);
  };
  return {
    newTab: record('newTab'),
    newHushTab: record('newHushTab'),
    reopenClosedTab: record('reopenClosedTab'),
    scheduleStatePush: record('scheduleStatePush'),
    store: { isBookmarked: () => false, toggleBookmark: record('toggleBookmark'), listGroups: () => [] },
    createGroup: record('createGroup'),
    setTabGroup: record('setTabGroup'),
    tabs: {
      urlFor: () => url,
      groupIdFor: () => null,
      isHush: () => false,
      titleFor: () => 'Example',
      hasClosedTabs: () => hasClosedTabs,
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
 * reach for — which left the browser's most distinctive feature undiscoverable
 * to anyone using a mouse.
 */
describe('opening a Hush tab without a keyboard', () => {
  it('is offered when a tab is right-clicked', () => {
    expect(labelsOf(tabMenu())).toContain('New Hush tab');
  });

  it('is offered behind the caret beside the new-tab button', () => {
    expect(labelsOf(newTabMenu())).toContain('New Hush tab');
  });

  it.each([
    ['the tab menu', tabMenu],
    ['the new-tab menu', newTabMenu],
  ])('actually opens one from %s', (_name, build) => {
    called.length = 0;
    (itemNamed(build(), 'New Hush tab')?.click as () => void)();
    expect(called).toContain('newHushTab');
  });
});

describe('reopening a closed tab without a keyboard', () => {
  it.each([
    ['the tab menu', tabMenu],
    ['the new-tab menu', newTabMenu],
  ])('is offered in %s', (_name, build) => {
    expect(labelsOf(build())).toContain('Reopen closed tab');
  });

  // A menu item that does nothing teaches someone the menu is unreliable.
  it.each([
    ['the tab menu', tabMenu],
    ['the new-tab menu', newTabMenu],
  ])('is disabled in %s when nothing has been closed', (_name, build) => {
    expect(itemNamed(build({ hasClosedTabs: false }), 'Reopen closed tab')?.enabled).toBe(false);
  });

  it('is enabled when something has been closed', () => {
    expect(itemNamed(newTabMenu({ hasClosedTabs: true }), 'Reopen closed tab')?.enabled).toBe(true);
  });
});

describe('every item in both menus', () => {
  it('has a label or is a separator', () => {
    for (const items of [tabMenu(), newTabMenu()]) {
      for (const item of items) {
        expect(typeof item.label === 'string' || item.type === 'separator').toBe(true);
      }
    }
  });

  // Read from the source rather than by calling: a renamed Browser method
  // leaves a menu item that looks fine and throws when someone picks it.
  it('reaches for methods that exist', () => {
    const menuSource = readFileSync('electron/main/menus/context-menu.ts', 'utf8');
    const sources = {
      'tabs.': readFileSync('electron/main/tabs/tabs.ts', 'utf8'),
      'store.': readFileSync('electron/main/data/store.ts', 'utf8'),
      '': readFileSync('electron/main/app/browser.ts', 'utf8'),
    };

    const paths = [
      ...new Set([...menuSource.matchAll(/browser\.((?:tabs\.|store\.)?[a-zA-Z]+)\(/g)].map((m) => m[1] ?? '')),
    ];
    expect(paths.length).toBeGreaterThan(8);

    const missing = paths.filter((path) => {
      const method = path.split('.').pop() ?? '';
      const prefix = path.includes('.') ? `${path.split('.')[0] ?? ''}.` : '';
      const source = sources[prefix as keyof typeof sources] ?? sources[''];
      return !new RegExp(`\\b(async )?${method}\\s*[(<]`).test(source);
    });
    expect(missing).toEqual([]);
  });
});

/**
 * A group's menu is where colour, deletion and the conversion to a folder live —
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
      updateGroup: (id: string, changes: Record<string, unknown>) =>
        called.push(`updateGroup:${JSON.stringify(changes)}`),
      removeGroup: () => called.push('removeGroup'),
      closeGroup: () => called.push('closeGroup'),
      renameGroup: () => called.push('renameGroup'),
      saveGroupAsFolder: () => called.push('saveGroupAsFolder'),
      window: {},
    } as never;
    showGroupContextMenu(browser, 'g1');
    return captured;
  }

  it('offers everything a group can be told to do', () => {
    const labels = labelsOf(groupBrowser()).map(String);
    expect(labels).toContain('Rename “Work”');
    expect(labels).toContain('Colour');
    expect(labels).toContain('Collapse');
    expect(labels).toContain('Save as a bookmark folder');
    expect(labels).toContain('Ungroup these tabs');
    expect(labels).toContain('Close these tabs');
  });

  // The claim is the only place a mixed group admits what it is, and it was
  // moved here when the panel that used to carry it was deleted.
  it('says what the group can promise, and cannot be clicked', () => {
    const first = groupBrowser()[0];
    expect(String(first?.label)).toContain('cookies');
    expect(first?.enabled).toBe(false);
  });

  it('says something different when the group holds a Hush tab', () => {
    const shared = String(groupBrowser({ holdsHush: false })[0]?.label);
    const mixed = String(groupBrowser({ holdsHush: true })[0]?.label);
    expect(mixed).not.toBe(shared);
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
        window: {},
      } as never,
      'f1',
    );
    return captured;
  }

  it('gives one number when there is only one to give', () => {
    expect(String(folderMenu({ here: 2 })[0]?.label)).toBe('2 bookmarks');
  });

  // A tree makes every count ambiguous, so neither number is left to be guessed.
  it('gives both numbers when they differ', () => {
    const label = String(folderMenu({ here: 2, inside: 3, children: 1 })[0]?.label);
    expect(label).toContain('2 here');
    expect(label).toContain('5 with folders inside');
  });

  it('says what deleting keeps, before it is pressed', () => {
    const labels = labelsOf(folderMenu({ here: 2, children: 1 })).map(String);
    expect(labels).toContain('Delete this folder');
    expect(labels.some((label) => label.includes('2 bookmarks and 1 folders move up'))).toBe(true);
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
