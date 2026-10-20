import { describe, expect, it } from 'vitest';

import {
  ChromeApi,
  type ChromeTab,
  type ExtensionBrowsing,
  type ExtensionGrant,
} from '../../../../electron/main/extensions/chrome-api';

const tab = (id: number, windowId: number, url: string, over: Partial<ChromeTab> = {}): ChromeTab => ({
  id,
  windowId,
  index: 0,
  url,
  title: `Title ${id}`,
  active: false,
  highlighted: false,
  pinned: false,
  audible: false,
  discarded: false,
  status: 'complete',
  mutedInfo: { muted: false },
  incognito: false,
  groupId: -1,
  ...over,
});
const window = (id: number, focused: boolean) => ({
  id,
  focused,
  type: 'normal' as const,
  state: 'normal' as const,
  incognito: false as const,
  alwaysOnTop: false as const,
  left: 0,
  top: 0,
  width: 800,
  height: 600,
});

function browsing() {
  const created: [string, unknown][] = [];
  const updated: [number, unknown][] = [];
  const fake: ExtensionBrowsing = {
    windows: () => [
      {
        window: window(1, true),
        tabs: [tab(10, 1, 'https://mail.example.com/', { active: true }), tab(11, 1, 'https://news.example.org/')],
      },
      { window: window(2, false), tabs: [tab(20, 2, 'https://bank.example.net/', { active: true })] },
    ],
    lastFocusedWindowId: () => 1,
    createTab: (url, options) => {
      created.push([url, options]);
      return 11;
    },
    updateTab: (id, change) => updated.push([id, change]),
    removeTab: () => {},
    reloadTab: () => {},
    goBack: () => {},
    goForward: () => {},
    duplicateTab: () => {},
    discardTab: () => {},
    zoomOf: () => 1.25,
    setZoom: () => {},
    focusWindow: () => {},
    openWindow: () => {},
  };
  const surfaces = {
    action: () => null,
    contextMenus: () => null,
    notify: () => null,
    listen: () => {},
    openOptions: () => {},
    idleState: () => 'active' as const,
  };
  return { api: new ChromeApi(fake, surfaces), created, updated };
}

const grant = (permissions: string[] = [], hostPermissions: string[] = []): ExtensionGrant => ({
  id: 'a'.repeat(32),
  permissions,
  hostPermissions,
  optionsPage: null,
});
const call = (method: string, args: unknown[], given = grant()) =>
  browsing().api.call({ grant: given, tabId: null }, method, args);

describe('tabs, as an extension sees them', () => {
  it('finds the tab in front of the current window', () => {
    const found = call('tabs.query', [{ active: true, currentWindow: true }], grant(['tabs'])) as ChromeTab[];
    expect(found.map((found) => found.id)).toEqual([10]);
  });

  // Without leave to read tabs or the site, an extension learns a tab exists and nothing of where it is.
  it('leaves out the address and title an extension may not see', () => {
    const [first] = call('tabs.query', [{ active: true, currentWindow: true }]) as ChromeTab[];
    expect(first).not.toHaveProperty('url');
    expect(first).not.toHaveProperty('title');
    expect(first?.id).toBe(10);
  });

  it('shows the address of a site it may read, and only that one', () => {
    const found = call('tabs.query', [{}], grant([], ['https://*.example.com/*'])) as ChromeTab[];
    expect(found.filter((found) => found.url).map((found) => found.url)).toEqual(['https://mail.example.com/']);
  });

  it('cannot find tabs by an address it may not see', () => {
    expect(call('tabs.query', [{ url: 'https://bank.example.net/*' }])).toEqual([]);
    expect((call('tabs.query', [{ url: 'https://bank.example.net/*' }], grant(['tabs'])) as ChromeTab[]).length).toBe(
      1,
    );
  });

  it('opens its own pages by their path', () => {
    const fake = browsing();
    fake.api.call({ grant: grant(), tabId: null }, 'tabs.create', [{ url: 'options.html' }]);
    expect(fake.created[0]?.[0]).toBe(`chrome-extension://${'a'.repeat(32)}/options.html`);
  });

  it('changes the active tab when no tab is named', () => {
    const fake = browsing();
    fake.api.call({ grant: grant(), tabId: null }, 'tabs.update', [{ muted: true }]);
    expect(fake.updated).toEqual([[10, { muted: true }]]);
  });
});

describe('windows and permissions', () => {
  it('lists every window, with tabs only when asked', () => {
    const windows = call('windows.getAll', [{ populate: true }], grant(['tabs'])) as { tabs?: ChromeTab[] }[];
    expect(windows.map((entry) => entry.tabs?.length)).toEqual([2, 1]);
    expect((call('windows.getAll', [{}]) as { tabs?: unknown }[])[0]).not.toHaveProperty('tabs');
  });

  it('answers what was granted when it was added, and nothing more', () => {
    const given = grant(['storage'], ['https://a.example/*']);
    expect(call('permissions.contains', [{ permissions: ['storage'] }], given)).toBe(true);
    expect(call('permissions.contains', [{ permissions: ['tabs'] }], given)).toBe(false);
    expect(call('permissions.request', [{ origins: ['https://b.example/*'] }], given)).toBe(false);
  });

  it('ignores a call it does not know', () => {
    expect(call('debugger.attach', [{}])).toBeNull();
  });
});
