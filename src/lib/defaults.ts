import type { Settings } from '../../electron/shared/types';

/** The shape the chrome renders before the first snapshot arrives from the main process, which owns the real values. */
export const DEFAULT_SETTINGS_SHAPE: Settings = {
  searchEngine: 'brave',
  theme: 'deep',
  dnsMode: 'system',
  dnsResolverId: 'quad9',
  density: 'comfortable',
  httpsFirst: true,
  blockTrackers: true,
  restoreTabsOnLaunch: true,
  startPageWidgets: ['clock', 'search', 'topSites'],
  checkForUpdates: true,
  permissionDecisions: {},
  zoomLevels: {},
  blockerAllowlist: [],
  hasWallpaper: false,
  sidebarWidth: 300,
  defaultZoomFactor: 1,
};
