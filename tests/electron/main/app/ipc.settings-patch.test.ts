import { describe, expect, it, vi } from 'vitest';
import type { Settings } from '../../../../electron/shared/types';

vi.mock('electron', () => ({
  ipcMain: { handle: () => {}, removeHandler: () => {} },
  app: { getPath: () => '/tmp' },
}));

const { asSettingsPatch, SETTINGS_NOT_PATCHABLE } = await import('../../../../electron/main/app/ipc');
const { DEFAULT_SETTINGS } = await import('../../../../electron/main/data/store');

/**
 * A setting the renderer can display but not change is worse than a missing
 * one: the control moves, nothing happens, and it looks like it worked.
 * Exactly that shipped four times - density, the update-check toggle, the zoom
 * reset and the tracker allowlist all silently did nothing.
 */
describe('every setting can actually be changed', () => {
  const changed: Settings = {
    ...DEFAULT_SETTINGS,
    searchEngine: 'custom-wikipedia1',
    customSearchEngines: [
      {
        id: 'custom-wikipedia1',
        name: 'Wikipedia',
        keyword: 'w',
        searchTemplate: 'https://en.wikipedia.org/w/index.php?search=%s',
      },
    ],
    theme: 'moss',
    density: 'compact',
    headerLayout: 'one-line',
    hiddenFromBookmarksBar: ['bookmark-1'],
    accentColour: 'teal',
    interfaceTextSize: 'large',
    toolbarItems: ['home', 'split'],
    wallpaperDim: 40,
    wallpaperBlur: true,
    httpsFirst: false,
    appearance: 'dark',
    blockTrackers: false,
    restoreTabsOnLaunch: false,
    startupUrl: 'https://example.com/',
    homeUrl: 'https://example.org/',
    historyRetentionDays: 365,
    readerStyle: { size: 'large', typeface: 'sans', width: 'wide' },
    startPageWidgets: ['search', 'clock'],
    checkForUpdates: false,
    updateChannel: 'betas',
    updateExtensions: false,
    offerToSavePasswords: false,
    neverSavePasswordsOn: ['example.com'],
    permissionDecisions: { 'https://example.com|media': 'allow' },
    permissionDefaults: { notifications: 'block', geolocation: 'ask' },
    zoomLevels: { 'https://example.com': 1.5 },
    blockerAllowlist: ['example.com'],
    defaultZoomFactor: 1.25,
    spellcheck: false,
    spellcheckLanguages: ['en-GB', 'fr'],
    webRtcPolicy: 'proxiedOnly',
    blockThirdPartyCookies: false,
    cleanLinks: false,
    hideCookieBanners: false,
    askWhereToSave: true,
    sleepTabsAfterMinutes: 15,
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
    expect(asSettingsPatch({ blockTrackers: 'yes', defaultZoomFactor: '1.5' })).toEqual({});
    expect(asSettingsPatch({ density: 'enormous' })).toEqual({});
  });

  it('filters the contents of collections rather than trusting them', () => {
    expect(
      asSettingsPatch({
        permissionDecisions: {
          'https://a.test|notifications': 'maybe',
          'https://b.test|notifications': 'allow',
          'c|d': 'allow',
          'https://c.test|invented': 'allow',
          'https://d.test/path|media': 'deny',
          'javascript:alert(1)|media': 'allow',
        },
      }),
    ).toEqual({ permissionDecisions: { 'https://b.test|notifications': 'allow' } });
    expect(
      asSettingsPatch({
        permissionDefaults: { notifications: 'block', media: 'allow', fullscreen: 'block', bogus: 'ask' },
      }),
    ).toEqual({ permissionDefaults: { notifications: 'block' } });
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
 * corrected it - a setting that fixes itself overnight and nobody can explain.
 */
describe('what the settings patch refuses', () => {
  // An unknown policy stored would reach Chromium as nothing it recognises.
  it.each([
    ['takes a WebRTC policy that exists', { webRtcPolicy: 'proxiedOnly' }, 'webRtcPolicy', 'proxiedOnly'],
    ['drops a WebRTC policy that does not exist', { webRtcPolicy: 'leakEverything' }, 'webRtcPolicy', undefined],
    ['takes a theme that exists', { theme: 'ember' }, 'theme', 'ember'],
    ['drops a theme that does not, rather than storing it', { theme: 'neon' }, 'theme', undefined],
    ['drops an empty theme', { theme: '' }, 'theme', undefined],
    ['takes a search engine it knows', { searchEngine: 'duckduckgo' }, 'searchEngine', 'duckduckgo'],
    ['drops a search engine it does not', { searchEngine: 'https://evil.example/?q=' }, 'searchEngine', undefined],
  ])('%s', (_name, patch, key, expected) => {
    expect(asSettingsPatch(patch)[key as keyof Settings]).toBe(expected);
  });

  /*
   * Zoom was stored exactly as given and applied unclamped, so a level of 1000
   * could be written down and read back later as that site's zoom - legible
   * only as a page that will not display. An ordinary zoom is left as chosen.
   */
  it.each([
    ['clamps a zoom level of 1000 down on the way in', 1000, 5],
    ['clamps a zoom level of 0.001 up on the way in', 0.001, 0.25],
    ['leaves a sensible zoom alone', 1.5, 1.5],
  ])('%s', (_name, input, expected) => {
    const patch = asSettingsPatch({ zoomLevels: { 'https://a.example': input } });
    expect(patch.zoomLevels?.['https://a.example']).toBe(expected);
  });

  /*
   * The default zoom sat beside the per-site levels doing something different:
   * checked for being a number and then stored as given. IPC uses structured
   * clone rather than JSON, so NaN really can arrive from the renderer, and
   * clamping carried it through - Math.min and Math.max propagate NaN whichever
   * way round they are written. It reached a tab and the interface had a zoom
   * of NaN per cent to show.
   */
  it('refuses a default zoom that is not a number', () => {
    expect(asSettingsPatch({ defaultZoomFactor: Number.NaN }).defaultZoomFactor).toBeUndefined();
    expect(asSettingsPatch({ defaultZoomFactor: Number.POSITIVE_INFINITY }).defaultZoomFactor).toBeUndefined();
  });

  it.each([
    [1000, 5],
    [0.001, 0.25],
    [1.25, 1.25],
  ])('clamps a default zoom of %d to %d, the same way as the per-site ones', (input, expected) => {
    expect(asSettingsPatch({ defaultZoomFactor: input }).defaultZoomFactor).toBe(expected);
  });
});

// A renderer that went wrong, or was made to, should not be able to fill the database through a setting.
describe('how much a settings patch may carry', () => {
  it('keeps the hue on the colour wheel', () => {
    expect(asSettingsPatch({ ambientHue: 725 })).toEqual({ ambientHue: 5 });
    expect(asSettingsPatch({ ambientHue: -30 })).toEqual({ ambientHue: 330 });
  });

  it('refuses sites longer than a hostname can be, and caps the list', () => {
    const many = Array.from({ length: 10_050 }, (_unused, index) => `site${index}.test`);
    expect(asSettingsPatch({ blockerAllowlist: [`${'a'.repeat(300)}.test`, 'ok.test'] })).toEqual({
      blockerAllowlist: ['ok.test'],
    });
    expect(asSettingsPatch({ blockerAllowlist: many }).blockerAllowlist).toHaveLength(10_000);
  });
});
