import { describe, expect, it, vi } from 'vitest';

type Template = Record<string, unknown>[];

let captured: Template = [];

vi.mock('electron', () => ({
  app: { name: 'Copacetic' },
  shell: { openExternal: () => {} },
  Menu: {
    buildFromTemplate: (template: Template) => {
      captured = template;
      return { template };
    },
  },
}));

const { buildApplicationMenu } = await import('../../../../electron/main/menus/menu');

function everyItem(template: Template): Record<string, unknown>[] {
  return template.flatMap((item) => {
    const submenu = item.submenu as Template | undefined;
    return [item, ...(Array.isArray(submenu) ? everyItem(submenu) : [])];
  });
}

/** Stands in for any part of Browser a click might reach into; nothing here clicks. */
function stub(): unknown {
  return new Proxy(() => {}, {
    get: (_target, property) => (typeof property === 'string' ? stub() : undefined),
    apply: () => undefined,
  });
}

const profileWithWindow = (shortcuts: { overrides?: Record<string, string>; isRecording?: boolean } = {}) =>
  ({
    shortcutOverrides: () => shortcuts.overrides ?? {},
    isRecordingShortcut: () => shortcuts.isRecording ?? false,
    focused: () => stub(),
    focusedOrNew: async () => stub(),
    first: stub(),
    summaries: () => [{ id: 'default', name: 'Personal', colour: 'ocean', pictureVersion: null }],
    openWindow: async () => stub(),
  }) as unknown as Parameters<typeof buildApplicationMenu>[0];

describe('the application menu', () => {
  // Two items on one accelerator means one of them can never be reached by the
  // shortcut it advertises.
  it('binds no accelerator twice', () => {
    buildApplicationMenu(profileWithWindow());
    const accelerators = everyItem(captured)
      .map((item) => item.accelerator)
      .filter((accelerator): accelerator is string => typeof accelerator === 'string');
    const duplicates = accelerators.filter((value, index) => accelerators.indexOf(value) !== index);
    expect(duplicates).toEqual([]);
  });
});

/**
 * The menu is built differently on each platform and was only ever checked on
 * the one it happened to be built on.
 *
 * Settings lived in the application menu, which exists only on macOS, so on
 * Windows and Linux there was no way to open Settings from the menu bar at all.
 * The smoke test that presses the item failed on both for months and read as a
 * flaky test rather than as a missing feature, because "the item could not be
 * found" and "the item did not work" fail the same way.
 */
describe('what every platform can reach', () => {
  const menuOn = async (platform: string): Promise<Record<string, unknown>[]> => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    try {
      vi.resetModules();
      const { buildApplicationMenu: build } = await import('../../../../electron/main/menus/menu');
      build(profileWithWindow());
      return everyItem(captured);
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
    }
  };

  /*
   * Settings is exactly once, not twice: macOS puts it in the application menu
   * and the others put it in Edit, and neither should end up with two of them.
   */
  it.each(['darwin', 'win32', 'linux'])(
    'can open Settings once, quit and open a Hush tab on %s',
    async (platform) => {
      const built = await menuOn(platform);
      const labels = built.map((item) => item.label);
      expect(labels.filter((label) => label === 'Settings…')).toHaveLength(1);
      expect(built.some((item) => item.role === 'quit' || item.label === 'Quit')).toBe(true);
      expect(labels).toContain('New Hush tab');
    },
  );
});

describe('keys someone moved', () => {
  const acceleratorOf = (label: string, shortcuts: Parameters<typeof profileWithWindow>[0]) => {
    buildApplicationMenu(profileWithWindow(shortcuts));
    return everyItem(captured).find((item) => item.label === label)?.accelerator;
  };

  it('binds a shortcut where it was moved to, or nowhere when it was taken off', () => {
    expect(acceleratorOf('New tab', {})).toBe('CmdOrCtrl+T');
    expect(acceleratorOf('New tab', { overrides: { 'new-tab': 'Alt+CmdOrCtrl+T' } })).toBe('Alt+CmdOrCtrl+T');
    expect(acceleratorOf('New tab', { overrides: { 'new-tab': '' } })).toBeUndefined();
  });

  // Otherwise the key being recorded opens a tab instead of reaching the recorder.
  it('binds nothing while a key is being recorded', () => {
    expect(acceleratorOf('New tab', { isRecording: true })).toBeUndefined();
  });
});
