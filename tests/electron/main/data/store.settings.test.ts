import { describe, expect, it, vi } from 'vitest';
import type { Settings } from '../../../../electron/shared/types';

// `store.ts` reaches electron through `persistence.ts` for the userData path.
// `normaliseSettings` is pure, so a minimal stub keeps the import graph happy.
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

const { DEFAULT_SETTINGS, normaliseSettings } = await import('../../../../electron/main/data/store');

// Spread from the defaults rather than written out: listing every field meant
// the fixture stopped being a Settings the moment one was added, which nothing
// noticed because the tests were never type-checked.
const BASE: Settings = {
  ...DEFAULT_SETTINGS,
  searchEngine: 'duckduckgo',
  appearance: 'system',
  theme: 'deep',
  httpsFirst: true,
  blockTrackers: true,
  restoreTabsOnLaunch: true,
  startPageWidgets: ['clock', 'search', 'topSites'],
  permissionDecisions: {},
  defaultZoomFactor: 1,
};

describe('normaliseSettings', () => {
  it('leaves values that are already in range alone', () => {
    expect(normaliseSettings(BASE)).toEqual(BASE);
  });

  // The bug this covers: clamping used to happen only when reading the file
  // from disk, so a value pushed over IPC was stored unbounded and survived
  // for the rest of the session.
  it.each([
    [{ defaultZoomFactor: 40 }, { defaultZoomFactor: 5 }],
    [{ defaultZoomFactor: 0 }, { defaultZoomFactor: 0.25 }],
    [{ defaultZoomFactor: -3 }, { defaultZoomFactor: 0.25 }],
  ])('bounds %o to %o', (patch, expected) => {
    expect(normaliseSettings({ ...BASE, ...patch })).toMatchObject(expected);
  });
});

// The first-run card is for a profile in its first run, not for everyone the update reaches.
describe('the welcome card on a profile from before it existed', () => {
  it('counts as seen when the settings file never mentioned it, and not seen for a new profile', async () => {
    const { reviveSettings } = await import('../../../../electron/main/data/settings-store');
    expect(reviveSettings({ searchEngine: 'brave' })?.welcomeDismissed).toBe(true);
    expect(reviveSettings({ searchEngine: 'brave', welcomeDismissed: false })?.welcomeDismissed).toBe(false);
    expect(DEFAULT_SETTINGS.welcomeDismissed).toBe(false);
  });
});
