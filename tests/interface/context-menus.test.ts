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

const { showNewTabMenu, showTabContextMenu } = await import('../../electron/main/menus/context-menu');

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
      ...new Set([...menuSource.matchAll(/browser\.((?:tabs\.|store\.)?[a-zA-Z]+)\(/g)].map((m) => m[1])),
    ];
    expect(paths.length).toBeGreaterThan(8);

    const missing = paths.filter((path) => {
      const method = path.split('.').pop() ?? '';
      const prefix = path.includes('.') ? `${path.split('.')[0]}.` : '';
      const source = sources[prefix as keyof typeof sources] ?? sources[''];
      return !new RegExp(`\\b(async )?${method}\\s*[(<]`).test(source);
    });
    expect(missing).toEqual([]);
  });
});
