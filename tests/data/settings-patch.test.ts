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

/**
 * A patch arrives from the renderer, and the renderer is where a bug lives.
 * Casting a string to a union satisfies the compiler and stores whatever came:
 * the value was then applied until the next start, when the store's own reviver
 * corrected it — a setting that fixes itself overnight and nobody can explain.
 */
describe('what the settings patch refuses', () => {
  it('takes a theme that exists', () => {
    expect(asSettingsPatch({ theme: 'ember' }).theme).toBe('ember');
  });

  it('drops one that does not, rather than storing it', () => {
    expect(asSettingsPatch({ theme: 'neon' }).theme).toBeUndefined();
    expect(asSettingsPatch({ theme: '' }).theme).toBeUndefined();
  });

  it('takes a search engine it knows', () => {
    expect(asSettingsPatch({ searchEngine: 'duckduckgo' }).searchEngine).toBe('duckduckgo');
  });

  it('drops one it does not', () => {
    expect(asSettingsPatch({ searchEngine: 'https://evil.example/?q=' }).searchEngine).toBeUndefined();
  });

  /*
   * Zoom was stored exactly as given and applied unclamped, so a level of 1000
   * could be written down and read back later as that site's zoom — legible
   * only as a page that will not display.
   */
  it('clamps a zoom level on the way in, not only when it is applied', () => {
    const patch = asSettingsPatch({ zoomLevels: { 'https://a.example': 1000, 'https://b.example': 0.001 } });
    expect(patch.zoomLevels?.['https://a.example']).toBe(5);
    expect(patch.zoomLevels?.['https://b.example']).toBe(0.25);
  });

  // The counterweight: an ordinary zoom is left exactly as it was chosen.
  it('leaves a sensible zoom alone', () => {
    expect(asSettingsPatch({ zoomLevels: { 'https://a.example': 1.5 } }).zoomLevels?.['https://a.example']).toBe(1.5);
  });

  /*
   * The default zoom sat beside the per-site levels doing something different:
   * checked for being a number and then stored as given. IPC uses structured
   * clone rather than JSON, so NaN really can arrive from the renderer, and
   * clamping carried it through — Math.min and Math.max propagate NaN whichever
   * way round they are written. It reached a tab and the interface had a zoom
   * of NaN per cent to show.
   */
  it('refuses a default zoom that is not a number', () => {
    expect(asSettingsPatch({ defaultZoomFactor: Number.NaN }).defaultZoomFactor).toBeUndefined();
    expect(asSettingsPatch({ defaultZoomFactor: Number.POSITIVE_INFINITY }).defaultZoomFactor).toBeUndefined();
  });

  it('clamps a default zoom the same way as the per-site ones', () => {
    expect(asSettingsPatch({ defaultZoomFactor: 1000 }).defaultZoomFactor).toBe(5);
    expect(asSettingsPatch({ defaultZoomFactor: 0.001 }).defaultZoomFactor).toBe(0.25);
    expect(asSettingsPatch({ defaultZoomFactor: 1.25 }).defaultZoomFactor).toBe(1.25);
  });
});
