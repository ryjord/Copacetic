import type { Settings } from '../../electron/shared/types';

/**
 * The shape the chrome renders before the first snapshot arrives from the main
 * process, which owns the real values. Kept in one place so a new setting
 * cannot be added to the schema and forgotten here.
 */
export const DEFAULT_SETTINGS_SHAPE: Settings = {
  searchEngine: 'duckduckgo',
  theme: 'deep',
  httpsFirst: true,
  blockTrackers: true,
  restoreTabsOnLaunch: true,
  showStartPageClock: true,
  showTopSites: true,
  permissionDecisions: {},
  sidebarWidth: 300,
  defaultZoomFactor: 1,
};
