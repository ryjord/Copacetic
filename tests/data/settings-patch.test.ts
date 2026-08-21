import { describe, expect, it, vi } from 'vitest';
import type { Settings } from '../../electron/shared/types';

vi.mock('electron', () => ({
  ipcMain: { handle: () => {}, removeHandler: () => {} },
  app: { getPath: () => '/tmp' },
}));

const { asSettingsPatch, SETTINGS_NOT_PATCHABLE } = await import('../../electron/main/app/ipc');
const { DEFAULT_SETTINGS } = await import('../../electron/main/data/store');

/**
 * A setting the renderer can display but not change is worse than a missing
 * one: the control moves, nothing happens, and it looks like it worked.
 * Exactly that shipped four times — density, the update-check toggle, the zoom
 * reset and the tracker allowlist all silently did nothing.
 */
describe('every setting can actually be changed', () => {
  const changed: Settings = {
    ...DEFAULT_SETTINGS,
    searchEngine: 'brave',
    theme: 'moss',
    density: 'compact',
    httpsFirst: false,
    blockTrackers: false,
    restoreTabsOnLaunch: false,
    startPageWidgets: ['search', 'clock'],
    checkForUpdates: false,
    permissionDecisions: { 'https://example.com|camera': 'allow' },
    zoomLevels: { 'https://example.com': 1.5 },
    blockerAllowlist: ['example.com'],
    sidebarWidth: 400,
    defaultZoomFactor: 1.25,
  };

  it.each(Object.keys(DEFAULT_SETTINGS).filter((key) => !SETTINGS_NOT_PATCHABLE.includes(key)))(
    '%s survives the trip from the renderer',
    (key) => {
      const patch = asSettingsPatch({ [key]: changed[key as keyof Settings] });
      expect(Object.keys(patch)).toContain(key);
      expect(patch[key as keyof Settings]).toEqual(changed[key as keyof Settings]);
    },
  );

  // Derived from whether the file exists; accepting it would let the interface
  // claim a wallpaper that is not there.
  it.each(SETTINGS_NOT_PATCHABLE)('%s is refused on purpose', (key) => {
    expect(Object.keys(asSettingsPatch({ [key]: true }))).not.toContain(key);
  });
});

describe('but only settings, and only sane ones', () => {
  it('ignores keys that are not settings at all', () => {
    expect(asSettingsPatch({ nonsense: 1, __proto__: { polluted: true } })).toEqual({});
  });

  it('ignores a value of the wrong type', () => {
    expect(asSettingsPatch({ blockTrackers: 'yes', sidebarWidth: '400' })).toEqual({});
    expect(asSettingsPatch({ density: 'enormous' })).toEqual({});
  });

  it('filters the contents of collections rather than trusting them', () => {
    expect(asSettingsPatch({ permissionDecisions: { 'a|b': 'maybe', 'c|d': 'allow' } })).toEqual({
      permissionDecisions: { 'c|d': 'allow' },
    });
    expect(asSettingsPatch({ zoomLevels: { a: 'big', b: 2 } })).toEqual({ zoomLevels: { b: 2 } });
    expect(asSettingsPatch({ blockerAllowlist: ['ok.com', 42, '', null] })).toEqual({ blockerAllowlist: ['ok.com'] });
  });

  it('ignores something that is not an object', () => {
    expect(asSettingsPatch(null)).toEqual({});
    expect(asSettingsPatch('compact')).toEqual({});
  });
});
