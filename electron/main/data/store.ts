import type {
  Bookmark,
  ClearRange,
  HistoryEntry,
  PermissionDecision,
  Settings,
  Suggestion,
  TopSite,
} from '../../shared/types';
import { SEARCH_ENGINES, buildSearchUrl, hostOf, resolveOmniboxInput } from '../../shared/url';
import type { RememberedCertificate } from '../../shared/certificate-changes';
import { BookmarksStore } from './bookmarks-store';
import { GroupsStore } from './groups-store';
import type { GroupColourId, TabGroup } from '../../shared/tab-groups';
import { HISTORY_PAGE_SIZE, HistoryStore, type HistoryPage } from './history-store';

export { HISTORY_PAGE_SIZE };
export type { HistoryPage };
import { DEFAULT_SETTINGS, SettingsStore, normaliseSettings } from './settings-store';

export { DEFAULT_SETTINGS, normaliseSettings };
import { CertificatesStore } from './certificates-store';
import { FaviconsStore } from './favicons-store';
import { SessionStore, type SessionSnapshot } from './session-store';

export type { SessionSnapshot };

export class BrowserStore {
  private readonly settings = new SettingsStore();
  private readonly history = new HistoryStore();
  private readonly bookmarks = new BookmarksStore();
  private readonly groups = new GroupsStore();
  private readonly favicons = new FaviconsStore();
  private readonly session = new SessionStore();
  private readonly certificatesStore = new CertificatesStore();
  /** Parsed host and lowercased forms per history entry, keyed by entry id. */
  private readonly scoreFieldCache = new Map<string, ScoreFields>();

  constructor() {}

  flushAll(): void {
    this.settings.flush();
    this.history.flush();
    this.bookmarks.flush();
    this.groups.flush();
    this.favicons.flush();
    this.session.flush();
    this.certificatesStore.flush();
  }

  // ----------------------------------------------------------------- groups

  listGroups(): TabGroup[] {
    return this.groups.list();
  }

  groupFor(id: string | null): TabGroup | null {
    return id ? this.groups.find(id) : null;
  }

  createGroup(name: string, colour: GroupColourId, ownSession: boolean): TabGroup {
    return this.groups.create(name, colour, ownSession);
  }

  updateGroup(id: string, changes: { name?: string; colour?: GroupColourId; collapsed?: boolean }): void {
    this.groups.update(id, changes);
  }

  removeGroup(id: string): void {
    this.groups.remove(id);
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
    return this.settings.getSettings();
  }

  updateSettings(patch: Partial<Settings>): Settings {
    return this.settings.updateSettings(patch);
  }

  setPermissionDecision(origin: string, kind: string, decision: PermissionDecision): void {
    this.settings.setPermissionDecision(origin, kind, decision);
  }

  getZoomForOrigin(origin: string): number | null {
    return this.settings.getZoomForOrigin(origin);
  }

  setZoomForOrigin(origin: string, zoomFactor: number): void {
    this.settings.setZoomForOrigin(origin, zoomFactor);
  }

  forgetZoomForOrigin(origin: string): void {
    this.settings.forgetZoomForOrigin(origin);
  }

  getPermissionDecision(origin: string, kind: string): PermissionDecision | null {
    return this.settings.getPermissionDecision(origin, kind);
  }

  // ----------------------------------------------------------------- history

  recordVisit(url: string, title: string): void {
    this.history.recordVisit(url, title);
  }

  listHistory(query = '', limit = HISTORY_PAGE_SIZE, offset = 0): HistoryPage {
    return this.history.listHistory(query, limit, offset);
  }

  /** Everything matching, for the export, which must never be a partial one. */
  allHistory(): HistoryEntry[] {
    return this.history.allHistory();
  }

  removeHistory(id: string): void {
    this.history.removeHistory(id);
  }

  clearHistory(range: ClearRange): void {
    this.history.clearHistory(range);
  }

  topSites(limit = 8): TopSite[] {
    return this.history.topSites((url) => this.favicons.get(url), limit);
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

    const entries = this.history.allHistory();
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
