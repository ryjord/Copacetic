import { isAppearanceId, isThemeId, isWebRtcPolicy } from '../../shared/types';
import type { PermissionDecision, Settings, StartPageWidgetId } from '../../shared/types';
import { SEARCH_ENGINES } from '../../shared/url';
import { DEFAULT_RESOLVER_ID, resolverFor } from '../../shared/dns';
import { PersistedFile, asBoolean, asNumber, asString, isRecord } from './persistence';
import type { SiteSettingsStore } from './site-settings-store';

export const DEFAULT_SETTINGS: Settings = {
  searchEngine: 'brave',
  dnsMode: 'system',
  dnsResolverId: DEFAULT_RESOLVER_ID,
  appearance: 'system',
  theme: 'deep',
  density: 'comfortable',
  httpsFirst: true,
  blockTrackers: true,
  restoreTabsOnLaunch: true,
  startPageWidgets: ['clock', 'search', 'topSites'],
  hushNoticeDismissed: false,
  showBookmarksBar: false,
  ambientHue: 0,
  checkForUpdates: true,
  permissionDecisions: {},
  zoomLevels: {},
  blockerAllowlist: [],
  hasWallpaper: false,
  defaultZoomFactor: 1,
  spellcheck: true,
  webRtcPolicy: 'publicOnly',
};

/** The per-site keys, which live in the database and are only ever empty in the JSON file. */
const SITE_KEYS = { permissionDecisions: {}, zoomLevels: {}, blockerAllowlist: [] } satisfies Partial<Settings>;

/**
 * Everything the user chose, bounded on the way in and on the way out.
 *
 * Kept in settings.json, which is read before anything else, except what is
 * about particular sites: that is in the database, so the file names no site.
 * Callers see one Settings object either way.
 */
export class SettingsStore {
  private readonly file = new PersistedFile<Settings>(
    'settings.json',
    () => ({ ...DEFAULT_SETTINGS }),
    reviveSettings,
  );

  constructor(private readonly site: SiteSettingsStore) {
    this.moveSiteSettingsOutOfFile();
  }

  getSettings(): Settings {
    return {
      ...this.file.get(),
      permissionDecisions: this.site.permissionDecisions(),
      zoomLevels: this.site.zoomLevels(),
      blockerAllowlist: this.site.trackerExceptions(),
    };
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const { permissionDecisions, zoomLevels, blockerAllowlist, ...rest } = patch;
    if (permissionDecisions) {
      this.site.replacePermissionDecisions(permissionDecisions);
    }
    if (zoomLevels) {
      this.site.replaceZoomLevels(zoomLevels);
    }
    if (blockerAllowlist) {
      this.site.replaceTrackerExceptions(blockerAllowlist);
    }
    this.file.update((current) => normaliseSettings({ ...current, ...rest, ...SITE_KEYS }));
    return this.getSettings();
  }

  setPermissionDecision(origin: string, kind: string, decision: PermissionDecision): void {
    this.site.setPermissionDecision(origin, kind, decision);
  }

  getPermissionDecision(origin: string, kind: string): PermissionDecision | null {
    return this.site.permissionDecision(origin, kind);
  }

  getZoomForOrigin(origin: string): number | null {
    return this.site.zoomFor(origin);
  }

  // A level equal to the default is forgotten rather than stored: the list in Settings should be the sites you actually changed, not every site visited.
  setZoomForOrigin(origin: string, zoomFactor: number): void {
    if (!origin) {
      return;
    }
    if (Math.abs(zoomFactor - this.file.get().defaultZoomFactor) < 0.001) {
      this.site.forgetZoom(origin);
    } else {
      this.site.setZoom(origin, zoomFactor);
    }
  }

  forgetZoomForOrigin(origin: string): void {
    this.site.forgetZoom(origin);
  }

  flush(): void {
    this.file.flush();
  }

  /**
   * Moves what an earlier version kept about particular sites into the database.
   *
   * Written to the tables first and cleared from the file after, so a crash in
   * between leaves both holding the same values, and the next start moves them
   * again without harm.
   */
  private moveSiteSettingsOutOfFile(): void {
    const stored = this.file.get();
    const hasSites =
      Object.keys(stored.permissionDecisions).length > 0 ||
      Object.keys(stored.zoomLevels).length > 0 ||
      stored.blockerAllowlist.length > 0;
    if (!hasSites) {
      return;
    }
    Object.entries(stored.permissionDecisions).forEach(([key, decision]) => {
      const separator = key.lastIndexOf('|');
      if (separator > 0) {
        this.site.setPermissionDecision(key.slice(0, separator), key.slice(separator + 1), decision);
      }
    });
    Object.entries(stored.zoomLevels).forEach(([origin, zoomFactor]) => this.site.setZoom(origin, zoomFactor));
    const exceptions = [...new Set([...this.site.trackerExceptions(), ...stored.blockerAllowlist])];
    this.site.replaceTrackerExceptions(exceptions);
    this.file.update((current) => ({ ...current, ...SITE_KEYS }));
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
  const appearance = asString(raw.appearance, DEFAULT_SETTINGS.appearance);
  const density = asString(raw.density, DEFAULT_SETTINGS.density);
  const webRtcPolicy = asString(raw.webRtcPolicy);

  return normaliseSettings({
    searchEngine: engine in SEARCH_ENGINES ? (engine as Settings['searchEngine']) : DEFAULT_SETTINGS.searchEngine,
    appearance: isAppearanceId(appearance) ? appearance : DEFAULT_SETTINGS.appearance,
    theme: isThemeId(theme) ? theme : DEFAULT_SETTINGS.theme,
    density: density === 'compact' ? 'compact' : 'comfortable',
    // An unknown resolver falls back to the system rather than to one nobody chose.
    dnsMode: asString(raw.dnsMode) === 'encrypted' ? 'encrypted' : 'system',
    dnsResolverId: resolverFor(asString(raw.dnsResolverId)) ? asString(raw.dnsResolverId) : DEFAULT_RESOLVER_ID,
    httpsFirst: asBoolean(raw.httpsFirst, DEFAULT_SETTINGS.httpsFirst),
    blockTrackers: asBoolean(raw.blockTrackers, DEFAULT_SETTINGS.blockTrackers),
    restoreTabsOnLaunch: asBoolean(raw.restoreTabsOnLaunch, DEFAULT_SETTINGS.restoreTabsOnLaunch),
    startPageWidgets: reviveStartPageWidgets(raw),
    hushNoticeDismissed: raw.hushNoticeDismissed === true,
    showBookmarksBar: raw.showBookmarksBar === true,
    ambientHue: clampHue(raw.ambientHue),
    checkForUpdates: asBoolean(raw.checkForUpdates, DEFAULT_SETTINGS.checkForUpdates),
    permissionDecisions: decisions,
    zoomLevels: reviveZoomLevels(raw.zoomLevels),
    // Derived from whether the file exists, so it is never read from disk.
    hasWallpaper: false,
    blockerAllowlist: Array.isArray(raw.blockerAllowlist)
      ? raw.blockerAllowlist.filter((site): site is string => typeof site === 'string' && site.length > 0)
      : [],
    defaultZoomFactor: asNumber(raw.defaultZoomFactor, DEFAULT_SETTINGS.defaultZoomFactor),
    spellcheck: asBoolean(raw.spellcheck, DEFAULT_SETTINGS.spellcheck),
    webRtcPolicy: isWebRtcPolicy(webRtcPolicy) ? webRtcPolicy : DEFAULT_SETTINGS.webRtcPolicy,
  });
}

export function normaliseSettings(settings: Settings): Settings {
  return {
    ...settings,
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

/** A turn of the colour wheel, wrapped rather than rejected: any number lands somewhere sensible. */
function clampHue(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return 0;
  }
  return ((Math.round(raw) % 360) + 360) % 360;
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
