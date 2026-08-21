import type { PermissionDecision, Settings, StartPageWidgetId } from '../../shared/types';
import { SEARCH_ENGINES } from '../../shared/url';
import { DEFAULT_RESOLVER_ID, resolverFor } from '../../shared/dns';
import { PersistedFile, asBoolean, asNumber, asString, isRecord } from './persistence';

export const DEFAULT_SETTINGS: Settings = {
  searchEngine: 'brave',
  dnsMode: 'system',
  dnsResolverId: DEFAULT_RESOLVER_ID,
  theme: 'deep',
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

/** Everything the user chose, bounded on the way in and on the way out. */
export class SettingsStore {
  private readonly file = new PersistedFile<Settings>(
    'settings.json',
    () => ({ ...DEFAULT_SETTINGS }),
    reviveSettings,
  );

  getSettings(): Settings {
    return this.file.get();
  }

  updateSettings(patch: Partial<Settings>): Settings {
    return this.file.update((current) => normaliseSettings({ ...current, ...patch }));
  }

  setPermissionDecision(origin: string, kind: string, decision: PermissionDecision): void {
    this.file.update((current) => ({
      ...current,
      permissionDecisions: { ...current.permissionDecisions, [`${origin}|${kind}`]: decision },
    }));
  }

  getZoomForOrigin(origin: string): number | null {
    return this.file.get().zoomLevels[origin] ?? null;
  }

  // A level equal to the default is forgotten rather than stored: the list in Settings should be the sites you actually changed, not every site visited.
  setZoomForOrigin(origin: string, zoomFactor: number): void {
    if (!origin) {
      return;
    }
    this.file.update((current) => {
      const levels = { ...current.zoomLevels };
      if (Math.abs(zoomFactor - current.defaultZoomFactor) < 0.001) {
        delete levels[origin];
      } else {
        levels[origin] = zoomFactor;
      }
      return { ...current, zoomLevels: levels };
    });
  }

  forgetZoomForOrigin(origin: string): void {
    this.file.update((current) => {
      const levels = { ...current.zoomLevels };
      delete levels[origin];
      return { ...current, zoomLevels: levels };
    });
  }

  getPermissionDecision(origin: string, kind: string): PermissionDecision | null {
    return this.file.get().permissionDecisions[`${origin}|${kind}`] ?? null;
  }

  flush(): void {
    this.file.flush();
  }
}

const WIDGET_IDS: readonly StartPageWidgetId[] = ['clock', 'search', 'topSites', 'bookmarks'];

function reviveSettings(raw: unknown): Settings | null {
  if (!isRecord(raw)) {
    return null;
  }
  const decisions: Record<string, PermissionDecision> = {};
  if (isRecord(raw.permissionDecisions)) {
    for (const [key, value] of Object.entries(raw.permissionDecisions)) {
      if (value === 'allow' || value === 'deny') {
        decisions[key] = value;
      }
    }
  }
  const engine = asString(raw.searchEngine, DEFAULT_SETTINGS.searchEngine);
  const theme = asString(raw.theme, DEFAULT_SETTINGS.theme);
  const density = asString(raw.density, DEFAULT_SETTINGS.density);

  return normaliseSettings({
    searchEngine: engine in SEARCH_ENGINES ? (engine as Settings['searchEngine']) : DEFAULT_SETTINGS.searchEngine,
    theme: (['deep', 'slate', 'ember', 'moss'] as const).includes(theme as Settings['theme'])
      ? (theme as Settings['theme'])
      : DEFAULT_SETTINGS.theme,
    density: density === 'compact' ? 'compact' : 'comfortable',
    // An unknown resolver falls back to the system rather than to one nobody chose.
    dnsMode: asString(raw.dnsMode) === 'encrypted' ? 'encrypted' : 'system',
    dnsResolverId: resolverFor(asString(raw.dnsResolverId)) ? asString(raw.dnsResolverId) : DEFAULT_RESOLVER_ID,
    httpsFirst: asBoolean(raw.httpsFirst, DEFAULT_SETTINGS.httpsFirst),
    blockTrackers: asBoolean(raw.blockTrackers, DEFAULT_SETTINGS.blockTrackers),
    restoreTabsOnLaunch: asBoolean(raw.restoreTabsOnLaunch, DEFAULT_SETTINGS.restoreTabsOnLaunch),
    startPageWidgets: reviveStartPageWidgets(raw),
    checkForUpdates: asBoolean(raw.checkForUpdates, DEFAULT_SETTINGS.checkForUpdates),
    permissionDecisions: decisions,
    zoomLevels: reviveZoomLevels(raw.zoomLevels),
    // Derived from whether the file exists, so it is never read from disk.
    hasWallpaper: false,
    blockerAllowlist: Array.isArray(raw.blockerAllowlist)
      ? raw.blockerAllowlist.filter((site): site is string => typeof site === 'string' && site.length > 0)
      : [],
    sidebarWidth: asNumber(raw.sidebarWidth, DEFAULT_SETTINGS.sidebarWidth),
    defaultZoomFactor: asNumber(raw.defaultZoomFactor, DEFAULT_SETTINGS.defaultZoomFactor),
  });
}

export function normaliseSettings(settings: Settings): Settings {
  return {
    ...settings,
    sidebarWidth: clamp(settings.sidebarWidth, 240, 560),
    defaultZoomFactor: clamp(settings.defaultZoomFactor, 0.25, 5),
  };
}

function reviveZoomLevels(raw: unknown): Record<string, number> {
  if (!isRecord(raw)) {
    return {};
  }
  const levels: Record<string, number> = {};
  for (const [origin, value] of Object.entries(raw)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    levels[origin] = clamp(value, 0.25, 5);
  }
  return levels;
}

function reviveStartPageWidgets(raw: Record<string, unknown>): StartPageWidgetId[] {
  if (Array.isArray(raw.startPageWidgets)) {
    const seen = new Set<StartPageWidgetId>();
    for (const id of raw.startPageWidgets) {
      if (typeof id === 'string' && WIDGET_IDS.includes(id as StartPageWidgetId)) {
        seen.add(id as StartPageWidgetId);
      }
    }
    return [...seen];
  }

  const migrated: StartPageWidgetId[] = [];
  if (asBoolean(raw.showStartPageClock, true)) {
    migrated.push('clock');
  }
  migrated.push('search');
  if (asBoolean(raw.showTopSites, true)) {
    migrated.push('topSites');
  }
  return migrated;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
