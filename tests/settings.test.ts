import { describe, expect, it, vi } from 'vitest';
import type { Settings } from '../electron/shared/types';

// `store.ts` reaches electron through `persistence.ts` for the userData path.
// `normaliseSettings` is pure, so a minimal stub keeps the import graph happy.
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));

const { normaliseSettings } = await import('../electron/main/store');

const BASE: Settings = {
  searchEngine: 'duckduckgo',
  theme: 'deep',
  httpsFirst: true,
  blockTrackers: true,
  restoreTabsOnLaunch: true,
  startPageWidgets: ['clock', 'search', 'topSites'],
  permissionDecisions: {},
  sidebarWidth: 320,
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
    [{ sidebarWidth: 10_000 }, { sidebarWidth: 560 }],
    [{ sidebarWidth: -5 }, { sidebarWidth: 240 }],
    [{ defaultZoomFactor: 40 }, { defaultZoomFactor: 5 }],
    [{ defaultZoomFactor: 0 }, { defaultZoomFactor: 0.25 }],
    [{ defaultZoomFactor: -3 }, { defaultZoomFactor: 0.25 }],
  ])('bounds %o to %o', (patch, expected) => {
    expect(normaliseSettings({ ...BASE, ...patch })).toMatchObject(expected);
  });

  it('does not disturb the settings it has no bounds for', () => {
    const result = normaliseSettings({
      ...BASE,
      sidebarWidth: 9_999,
      permissionDecisions: { 'https://example.com|camera': 'allow' },
    });
    expect(result.permissionDecisions).toEqual({ 'https://example.com|camera': 'allow' });
    expect(result.searchEngine).toBe('duckduckgo');
  });
});
