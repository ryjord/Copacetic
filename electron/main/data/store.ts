import type {
  Bookmark,
  StartPageWidgetId,
  ClearRange,
  HistoryEntry,
  PermissionDecision,
  Settings,
  Suggestion,
  TopSite,
} from '../../shared/types';
import { SEARCH_ENGINES, buildSearchUrl, hostOf, originOf, resolveOmniboxInput } from '../../shared/url';
import type { RememberedCertificate } from '../../shared/certificate-changes';
import { DEFAULT_RESOLVER_ID, resolverFor } from '../../shared/dns';
import { PersistedFile, asBoolean, asNumber, asString, isRecord, newId } from './persistence';
import { BookmarksStore } from './bookmarks-store';
import { CertificatesStore } from './certificates-store';
import { FaviconsStore } from './favicons-store';
import { SessionStore, type SessionSnapshot } from './session-store';

export type { SessionSnapshot };

const MAX_HISTORY_ENTRIES = 10_000;
const MAX_HISTORY_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/** One page of history, shared so the caller and the default cannot drift apart. */
export const HISTORY_PAGE_SIZE = 300;

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

export interface HistoryPage {
  entries: HistoryEntry[];
  /** Every entry matching the query, not just the ones in this page. */
  total: number;
}

export class BrowserStore {
  private readonly settingsFile: PersistedFile<Settings>;
  private readonly historyFile: PersistedFile<HistoryEntry[]>;
  private readonly bookmarks = new BookmarksStore();
  private readonly favicons = new FaviconsStore();
  private readonly session = new SessionStore();
  private readonly certificatesStore = new CertificatesStore();
  /** Parsed host and lowercased forms per history entry, keyed by entry id. */
  private readonly scoreFieldCache = new Map<string, ScoreFields>();

  constructor() {
    this.settingsFile = new PersistedFile<Settings>('settings.json', () => ({ ...DEFAULT_SETTINGS }), reviveSettings);
    this.historyFile = new PersistedFile<HistoryEntry[]>('history.json', () => [], reviveHistory);

    this.pruneHistory();
  }

  flushAll(): void {
    this.settingsFile.flush();
    this.historyFile.flush();
    this.bookmarks.flush();
    this.favicons.flush();
    this.session.flush();
    this.certificatesStore.flush();
  }

  // ------------------------------------------------------------ certificates

  rememberedCertificateFor(origin: string): RememberedCertificate | null {
    return this.certificatesStore.for(origin);
  }

  rememberCertificate(origin: string, next: RememberedCertificate): void {
    this.certificatesStore.remember(origin, next);
  }

  forgetRememberedCertificates(): void {
    this.certificatesStore.forgetAll();
  }

  // ---------------------------------------------------------------- settings

  getSettings(): Settings {
    return this.settingsFile.get();
  }

  updateSettings(patch: Partial<Settings>): Settings {
    return this.settingsFile.update((current) => normaliseSettings({ ...current, ...patch }));
  }

  setPermissionDecision(origin: string, kind: string, decision: PermissionDecision): void {
    this.settingsFile.update((current) => ({
      ...current,
      permissionDecisions: { ...current.permissionDecisions, [`${origin}|${kind}`]: decision },
    }));
  }

  getZoomForOrigin(origin: string): number | null {
    return this.settingsFile.get().zoomLevels[origin] ?? null;
  }

  // A level equal to the default is forgotten rather than stored: the list in Settings should be the sites you actually changed, not every site visited.
  setZoomForOrigin(origin: string, zoomFactor: number): void {
    if (!origin) {
      return;
    }
    this.settingsFile.update((current) => {
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
    this.settingsFile.update((current) => {
      const levels = { ...current.zoomLevels };
      delete levels[origin];
      return { ...current, zoomLevels: levels };
    });
  }

  getPermissionDecision(origin: string, kind: string): PermissionDecision | null {
    return this.settingsFile.get().permissionDecisions[`${origin}|${kind}`] ?? null;
  }

  // ----------------------------------------------------------------- history

  recordVisit(url: string, title: string): void {
    this.historyFile.update((entries) => {
      const now = Date.now();
      const index = entries.findIndex((entry) => entry.url === url);
      if (index === -1) {
        return [{ id: newId(), url, title, lastVisitedAt: now, visitCount: 1 }, ...entries].slice(
          0,
          MAX_HISTORY_ENTRIES,
        );
      }

      const existing = entries[index]!;
      // Reloading or bouncing within the same page should refresh the title but
      // not inflate the visit count, which drives top sites and ranking.
      const isRepeatVisit = now - existing.lastVisitedAt > 30_000;
      const updated: HistoryEntry = {
        ...existing,
        title: title || existing.title,
        lastVisitedAt: now,
        visitCount: existing.visitCount + (isRepeatVisit ? 1 : 0),
      };
      const rest = entries.slice(0, index).concat(entries.slice(index + 1));
      return [updated, ...rest];
    });
  }

  // A page of history, and how many entries there are in total.
  listHistory(query = '', limit = HISTORY_PAGE_SIZE, offset = 0): HistoryPage {
    const matches = this.matchingHistory(query);
    return { entries: matches.slice(offset, offset + limit), total: matches.length };
  }

  private matchingHistory(query: string): HistoryEntry[] {
    const entries = this.historyFile.get();
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return entries;
    }
    return entries.filter(
      (entry) => entry.url.toLowerCase().includes(needle) || entry.title.toLowerCase().includes(needle),
    );
  }

  /** Everything matching, for the export, which must never be a partial one. */
  allHistory(): HistoryEntry[] {
    return this.historyFile.get();
  }

  removeHistory(id: string): void {
    this.historyFile.update((entries) => entries.filter((entry) => entry.id !== id));
  }

  clearHistory(range: ClearRange): void {
    if (range === 'all') {
      this.historyFile.set([]);
      return;
    }
    const windows: Record<Exclude<ClearRange, 'all'>, number> = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
    };
    const cutoff = Date.now() - windows[range];
    this.historyFile.update((entries) => entries.filter((entry) => entry.lastVisitedAt < cutoff));
  }

  private pruneHistory(): void {
    const cutoff = Date.now() - MAX_HISTORY_AGE_MS;
    this.historyFile.update((entries) =>
      entries.filter((entry) => entry.lastVisitedAt >= cutoff).slice(0, MAX_HISTORY_ENTRIES),
    );
  }

  topSites(limit = 8): TopSite[] {
    const byHost = new Map<string, TopSite>();
    for (const entry of this.historyFile.get()) {
      const host = hostOf(entry.url);
      if (!host) {
        continue;
      }
      const existing = byHost.get(host);
      if (existing) {
        existing.visitCount += entry.visitCount;
        continue;
      }
      byHost.set(host, {
        url: `${originOf(entry.url)}/`,
        host: host.replace(/^www\./, ''),
        title: entry.title || host,
        visitCount: entry.visitCount,
        faviconDataUrl: this.getFavicon(entry.url),
      });
    }
    return [...byHost.values()].sort((a, b) => b.visitCount - a.visitCount).slice(0, limit);
  }

  // --------------------------------------------------------------- bookmarks

  listBookmarks(): Bookmark[] {
    return this.bookmarks.list();
  }

  isBookmarked(url: string): boolean {
    return this.bookmarks.has(url);
  }

  toggleBookmark(url: string, title: string): boolean {
    return this.bookmarks.toggle(url, title);
  }

  addBookmarks(entries: readonly { url: string; title: string; addedAt: number | null }[]): {
    added: number;
    alreadyHad: number;
  } {
    return this.bookmarks.addMany(entries);
  }

  removeBookmark(id: string): void {
    this.bookmarks.remove(id);
  }

  // ---------------------------------------------------------------- favicons

  getFavicon(url: string): string | null {
    return this.favicons.get(url);
  }

  setFavicon(url: string, dataUrl: string): void {
    this.favicons.set(url, dataUrl);
  }

  // ----------------------------------------------------------------- session

  saveSession(snapshot: SessionSnapshot): void {
    this.session.save(snapshot);
  }

  getSession(): SessionSnapshot {
    return this.session.get();
  }

  // --------------------------------------------------------------- omnibox

  // Rank local history and bookmarks against what the user has typed so far.
  suggest(rawQuery: string, limit = 8): Suggestion[] {
    const query = rawQuery.trim();
    if (!query) {
      return [];
    }

    const settings = this.getSettings();
    const needle = query.toLowerCase();
    const now = Date.now();
    const bookmarkedUrls = new Set(this.bookmarks.list().map((bookmark) => bookmark.url));

    const entries = this.historyFile.get();
    // Entries that fell out of history should not keep their parsed forms alive.
    if (this.scoreFieldCache.size > entries.length * 2) {
      this.scoreFieldCache.clear();
    }

    const scored = entries
      .map((entry) => ({
        entry,
        score: scoreEntry(entry, needle, now, bookmarkedUrls.has(entry.url), this.scoreFieldCache),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit - 1)
      .map<Suggestion>(({ entry }) => ({
        id: entry.id,
        kind: bookmarkedUrls.has(entry.url) ? 'bookmark' : 'history',
        target: entry.url,
        title: entry.title || hostOf(entry.url),
        subtitle: entry.url,
        faviconDataUrl: this.getFavicon(entry.url),
      }));

    const resolution = resolveOmniboxInput(query, settings.searchEngine, { httpsFirst: settings.httpsFirst });
    const head: Suggestion[] = [];

    if (resolution?.type === 'url') {
      head.push({
        id: 'resolve:url',
        kind: 'url',
        target: resolution.target,
        title: hostOf(resolution.target) || resolution.target,
        subtitle: resolution.target,
        faviconDataUrl: this.getFavicon(resolution.target),
      });
    }

    head.push({
      id: 'resolve:search',
      kind: 'search',
      target: buildSearchUrl(query, settings.searchEngine),
      title: query,
      subtitle: `Search with ${SEARCH_ENGINES[settings.searchEngine]?.name ?? 'your search engine'}`,
      faviconDataUrl: null,
    });

    const seen = new Set<string>();
    return [...head, ...scored].filter((suggestion) => {
      if (seen.has(suggestion.target)) {
        return false;
      }
      seen.add(suggestion.target);
      return true;
    });
  }
}

// The lowercased forms scoring compares against, parsed once per entry.
interface ScoreFields {
  sourceUrl: string;
  sourceTitle: string;
  host: string;
  title: string;
  url: string;
}

function scoreFieldsFor(entry: HistoryEntry, cache: Map<string, ScoreFields>): ScoreFields {
  const cached = cache.get(entry.id);
  // Cheap identity check rather than manual invalidation: a title that changes
  // on a revisit re-derives itself the next time it is scored.
  if (cached && cached.sourceUrl === entry.url && cached.sourceTitle === entry.title) {
    return cached;
  }

  const fields: ScoreFields = {
    sourceUrl: entry.url,
    sourceTitle: entry.title,
    host: hostOf(entry.url)
      .replace(/^www\./, '')
      .toLowerCase(),
    title: entry.title.toLowerCase(),
    url: entry.url.toLowerCase(),
  };
  cache.set(entry.id, fields);
  return fields;
}

function scoreEntry(
  entry: HistoryEntry,
  needle: string,
  now: number,
  isBookmark: boolean,
  cache: Map<string, ScoreFields>,
): number {
  const { host, title, url } = scoreFieldsFor(entry, cache);

  let match = 0;
  if (host.startsWith(needle)) {
    match = 100;
  } else if (title.startsWith(needle)) {
    match = 70;
  } else if (host.includes(needle)) {
    match = 55;
  } else if (title.includes(needle)) {
    match = 35;
  } else if (url.includes(needle)) {
    match = 20;
  }
  if (match === 0) {
    return 0;
  }

  const ageMs = now - entry.lastVisitedAt;
  const day = 24 * 60 * 60 * 1000;
  const recency = ageMs < day ? 1 : ageMs < 7 * day ? 0.75 : ageMs < 30 * day ? 0.5 : 0.3;
  const frequency = 1 + Math.log2(1 + entry.visitCount);

  return match * recency * frequency * (isBookmark ? 1.4 : 1);
}

// ------------------------------------------------------------------- revivers
//
// Every persisted file is treated as untrusted input. It lives in a directory
// the user can edit, and a malformed field must degrade to a default rather
// than crash the browser at launch.

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

// Bounds every numeric setting, wherever it came from.
const WIDGET_IDS: readonly StartPageWidgetId[] = ['clock', 'search', 'topSites', 'bookmarks'];

// The widget list, or one derived from the booleans it replaced.
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

/** Untrusted on-disk input, so every level is bounded like a live one. */
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

export function normaliseSettings(settings: Settings): Settings {
  return {
    ...settings,
    sidebarWidth: clamp(settings.sidebarWidth, 240, 560),
    defaultZoomFactor: clamp(settings.defaultZoomFactor, 0.25, 5),
  };
}

function reviveHistory(raw: unknown): HistoryEntry[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  return raw.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const url = asString(item.url);
    if (!url) {
      return [];
    }
    return [
      {
        id: asString(item.id) || newId(),
        url,
        title: asString(item.title),
        lastVisitedAt: asNumber(item.lastVisitedAt, Date.now()),
        visitCount: Math.max(1, asNumber(item.visitCount, 1)),
      },
    ];
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
