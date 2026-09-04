import type {
  Bookmark,
  ClearRange,
  HistoryEntry,
  PermissionDecision,
  Settings,
  Suggestion,
  TopSite,
} from '../../shared/types';
import {
  type KeptAboutSites,
  type KeptKind,
  NOTHING,
  type SiteTraces,
  sameSite,
  siteOf,
} from '../../shared/forgetting';
import { SEARCH_ENGINES, buildSearchUrl, hostOf, resolveOmniboxInput } from '../../shared/url';
import type { RememberedCertificate } from '../../shared/certificate-changes';
import { BookmarksStore } from './bookmarks-store';
import { BookmarkFoldersStore } from './bookmark-folders-store';
import { afterDeleting, type BookmarkFolder } from '../../shared/bookmark-folders';
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
  private readonly bookmarkFolders = new BookmarkFoldersStore();
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
    this.bookmarkFolders.flush();
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

  /**
   * What is kept about one site, counted before anything is removed.
   *
   * Said before it happens and again afterwards: something that vanished
   * quietly is indistinguishable from something that did not work.
   */
  tracesOf(address: string): SiteTraces {
    const site = siteOf(address);
    if (!site) {
      return NOTHING;
    }
    const settings = this.settings.getSettings();
    const keysFor = (record: Record<string, unknown>) =>
      Object.keys(record).filter((key) => sameSite(key, site)).length;

    return {
      visits: this.history.countForSite(site),
      icons: this.favicons.origins().filter((origin) => sameSite(origin, site)).length,
      zoom: keysFor(settings.zoomLevels),
      permissions: keysFor(settings.permissionDecisions),
      blockingOff: settings.blockerAllowlist.filter((entry) => sameSite(entry, site)).length,
      certificates: this.certificatesStore.origins().filter((origin) => sameSite(origin, site)).length,
      // The store does not own the sessions, so it cannot see cookies. The
      // browser adds that count before either sentence is said.
      cookies: 0,
    };
  }

  /**
   * Removes everything this browser knows about one site.
   *
   * The axis people actually want. Clearing by time is an afternoon; what
   * someone usually means is a site — and every place it is known, not the one
   * place they happened to be looking at.
   */
  /**
   * The origins this browser has seen for a site, for clearing storage keyed by
   * origin rather than by site.
   *
   * Read before anything is deleted: after `forgetSite` there is nothing left
   * to name them with, and `clearData` matches origins exactly — clearing
   * `https://example.com` does not touch `https://app.example.com`.
   */
  originsForSite(address: string): string[] {
    const site = siteOf(address);
    if (!site) {
      return [];
    }
    const seen = [...this.favicons.origins(), ...this.certificatesStore.origins()];
    return [...new Set(seen.filter((origin) => sameSite(origin, site)))];
  }

  forgetSite(address: string): SiteTraces {
    const site = siteOf(address);
    if (!site) {
      return NOTHING;
    }
    const found = this.tracesOf(address);

    this.history.forgetSite(site);
    this.favicons.forgetSite(site);
    this.certificatesStore.forgetSite(site);

    const settings = this.settings.getSettings();
    const without = <T>(record: Record<string, T>) =>
      Object.fromEntries(Object.entries(record).filter(([key]) => !sameSite(key, site)));

    this.settings.updateSettings({
      zoomLevels: without(settings.zoomLevels),
      permissionDecisions: without(settings.permissionDecisions),
      blockerAllowlist: settings.blockerAllowlist.filter((entry) => !sameSite(entry, site)),
    });

    return found;
  }

  /**
   * What is kept about sites in general.
   *
   * Listed rather than left to be found: these survive a clear on purpose,
   * because someone set them on purpose, but they do name the sites and a list
   * nobody is shown is a list nobody can act on.
   */
  keptAboutSites(): KeptAboutSites {
    const settings = this.settings.getSettings();
    return {
      zoom: Object.keys(settings.zoomLevels).length,
      permissions: Object.keys(settings.permissionDecisions).length,
      blockingOff: settings.blockerAllowlist.length,
      certificates: this.certificatesStore.origins().length,
      // The store does not own the download manager; the browser fills this in.
      downloads: 0,
    };
  }

  /** Clears one of those kinds, and only that one. */
  clearKept(kind: KeptKind): void {
    if (kind === 'certificates') {
      this.certificatesStore.forgetAll();
      return;
    }
    const patch = {
      zoom: { zoomLevels: {} },
      permissions: { permissionDecisions: {} },
      blockingOff: { blockerAllowlist: [] },
    }[kind as 'zoom' | 'permissions' | 'blockingOff'] as Partial<Settings> | undefined;
    // Downloads are the browser's, not the store's, and are cleared there.
    if (patch) {
      this.settings.updateSettings(patch);
    }
  }

  /** Requests refused across everything still in history. */
  totalBlocked(): number {
    return this.history.totalBlocked();
  }

  /** Adds to what one page has refused, as it happens. */
  addBlocked(url: string, delta: number): void {
    this.history.addBlocked(url, delta);
  }

  clearHistory(range: ClearRange): void {
    this.history.clearHistory(range);
    // The icons go with it. Nobody chose to keep one, and a per-origin cache
    // left behind after clearing history is a readable list of where someone
    // has been — which is the thing they just asked to be rid of.
    this.favicons.forgetAll();
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

  /** Makes sure an address is saved without disturbing one that already is. */
  ensureBookmark(url: string, title: string): Bookmark {
    return this.bookmarks.ensure(url, title);
  }

  /** Files a bookmark, or unfiles it. A folder that is not there files it nowhere. */
  fileBookmark(id: string, folderId: string | null): void {
    const target = folderId && this.bookmarkFolders.find(folderId) ? folderId : null;
    this.bookmarks.moveTo(id, target);
  }

  // -------------------------------------------------------- bookmark folders

  listBookmarkFolders(): BookmarkFolder[] {
    return this.bookmarkFolders.list();
  }

  folderFor(id: string | null): BookmarkFolder | null {
    return id ? this.bookmarkFolders.find(id) : null;
  }

  createBookmarkFolder(name: string, colour: GroupColourId, parentId: string | null): BookmarkFolder {
    return this.bookmarkFolders.create(name, colour, parentId);
  }

  updateBookmarkFolder(id: string, changes: { name?: string; colour?: GroupColourId; collapsed?: boolean }): void {
    this.bookmarkFolders.update(id, changes);
  }

  moveBookmarkFolder(id: string, parentId: string | null): boolean {
    return this.bookmarkFolders.move(id, parentId);
  }

  /**
   * Deletes a folder and keeps everything that was in it.
   *
   * Its bookmarks and child folders move up to where it was. That is the
   * promise the tab strip already makes with "Ungroup these tabs — tabs stay
   * open", and the counts come back so the confirmation can say what moved
   * rather than leaving someone to find out.
   */
  deleteBookmarkFolder(id: string): { folders: number; bookmarks: number } {
    const outcome = afterDeleting(this.bookmarkFolders.list(), this.bookmarks.list(), id);
    this.bookmarkFolders.replace(outcome.folders);
    this.bookmarks.replaceAll(outcome.bookmarks);
    return outcome.moved;
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
