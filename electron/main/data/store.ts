// Libs
import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// Utils
import {
  type KeptAboutSites,
  type KeptKind,
  NOTHING,
  type SiteTraces,
  sameSite,
  siteOf,
} from '../../shared/data/forgetting';
import { hostOf, originOf, resolveOmniboxInput } from '../../shared/browsing/url';
import { buildSearchUrl, engineFor, keywordSearchFor } from '../../shared/browsing/search-engines';
import { BookmarksStore } from './bookmarks-store';
import { BookmarkFoldersStore } from './bookmark-folders-store';
import { NamedSessionsStore } from './named-sessions-store';
import { StartTilesStore } from './start-tiles-store';
import { withoutGroup } from '../../shared/tabs/open-rules';
import { afterDeleting, type BookmarkFolder } from '../../shared/data/bookmark-folders';
import { GroupsStore } from './groups-store';
import { GROUP_COLOURS, type GroupColourId, type TabGroup } from '../../shared/tabs/tab-groups';
import { openDatabase } from './database';
import { backUpBeforeMigrating, forgetLegacyCopies } from './legacy-import';
import { describeError, log } from '../system/diagnostics';
import { DownloadsTable } from './downloads-table';
import { SiteSettingsStore } from './site-settings-store';
import { HISTORY_PAGE_SIZE, HistoryStore, type HistoryPage } from './history-store';
import { historyKeptSince } from '../../shared/types';

// Types
import type {
  Bookmark,
  BookmarkEditResult,
  ClearRange,
  HistoryEntry,
  HistoryFilter,
  PermissionDecision,
  Settings,
  Suggestion,
  TopSite,
} from '../../shared/types';
import type { RememberedCertificate } from '../../shared/browsing/certificate-changes';
import type { ImportedBookmark } from '../../shared/data/bookmark-import';
import type { DatabaseSync } from 'node:sqlite';
import type { NamedSessionSummary, NamedSessionTab } from '../../shared/data/named-sessions';
import type { StartShortcut } from '../../shared/data/start-tiles';

export { HISTORY_PAGE_SIZE };
export type { HistoryPage };
import { DEFAULT_SETTINGS, SettingsStore, normaliseSettings } from './settings-store';

export { DEFAULT_SETTINGS, normaliseSettings };
import { CertificatesStore } from './certificates-store';
import { FaviconsStore } from './favicons-store';
import { type SavedSession, SessionStore, type SessionSnapshot } from './session-store';
import type { ImportedVisit } from '../import/chromium-history';
import { t } from '../../shared/i18n/translate';

export type { SavedSession, SessionSnapshot };

export class BrowserStore {
  private readonly database: DatabaseSync;
  private readonly settings: SettingsStore;
  private readonly history: HistoryStore;
  private readonly bookmarks: BookmarksStore;
  private readonly bookmarkFolders: BookmarkFoldersStore;
  private readonly groups: GroupsStore;
  private readonly favicons: FaviconsStore;
  /** Held here so it shares the database; the download manager owns what goes in it. */
  readonly downloadsTable: DownloadsTable;
  private readonly session: SessionStore;
  private readonly namedSessions: NamedSessionsStore;
  private readonly startTiles: StartTilesStore;
  private readonly certificatesStore: CertificatesStore;
  /** Parsed host and lowercased forms per history entry, keyed by entry id. */
  private readonly scoreFieldCache = new Map<string, ScoreFields>();

  /** Everything one profile keeps, in its folder. */
  constructor(directory = app.getPath('userData')) {
    // A profile made this run has no folder yet, and SQLite will not make one.
    mkdirSync(directory, { recursive: true });
    // Before the database exists, which is what marks a profile as not yet migrated.
    backUpBeforeMigrating(directory);
    this.directory = directory;
    this.database = openDatabase(path.join(directory, 'copacetic.db'), undefined, (aside) => {
      this.setAsideDatabase = aside;
    });
    this.settings = new SettingsStore(new SiteSettingsStore(this.database), directory);
    this.history = new HistoryStore(this.database, directory, () => this.historyKeptSince());
    this.bookmarks = new BookmarksStore(this.database, directory);
    this.bookmarkFolders = new BookmarkFoldersStore(this.database, directory);
    this.groups = new GroupsStore(directory);
    this.favicons = new FaviconsStore(this.database, directory);
    this.downloadsTable = new DownloadsTable(this.database, directory);
    this.session = new SessionStore(directory);
    this.namedSessions = new NamedSessionsStore(this.database);
    this.startTiles = new StartTilesStore(this.database);
    this.certificatesStore = new CertificatesStore(directory);
    forgetLegacyCopies(directory, { isClearingEverything: false, now: Date.now() });
  }

  /** Where a database that could not be opened was put, this launch; null when it opened. */
  setAsideDatabase: string | null = null;
  private readonly directory: string;

  /** Everything written, then the database closed; nothing can be read or written after this. */
  close(): void {
    this.flushAll();
    this.database.close();
  }

  flushAll(): void {
    // Each on its own: one store failing while the app quits must not cost the others their writes.
    const steps: (() => void)[] = [
      // Folds the write-ahead log into the database, so the file on its own is complete when the app goes.
      () => this.database.exec('PRAGMA wal_checkpoint(TRUNCATE)'),
      () => this.settings.flush(),
      () => this.history.flush(),
      () => this.bookmarks.flush(),
      () => this.bookmarkFolders.flush(),
      () => this.groups.flush(),
      () => this.favicons.flush(),
      () => this.session.flush(),
      () => this.certificatesStore.flush(),
    ];
    steps.forEach((step) => {
      try {
        step();
      } catch (error) {
        log.warn('a store could not be written while quitting', describeError(error));
      }
    });
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

  /** Its rules go with it, so a site never waits to open in a group that is not there. */
  removeGroup(id: string): void {
    this.groups.remove(id);
    this.settings.updateSettings({ openRules: withoutGroup(this.settings.getSettings().openRules, id) });
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

  /** The oldest visit history keeps, by the setting; imports are held to the same bound. */
  historyKeptSince(): number {
    return historyKeptSince(this.getSettings().historyRetentionDays, Date.now());
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const updated = this.settings.updateSettings(patch);
    // A shorter limit is a promise that the older visits are gone, so they go now.
    if (patch.historyRetentionDays !== undefined) {
      this.history.prune();
    }
    return updated;
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

  listHistory(query = '', limit = HISTORY_PAGE_SIZE, offset = 0, filter?: HistoryFilter): HistoryPage {
    return this.history.listHistory(query, limit, offset, filter);
  }

  /** Everything matching, for the export, which must never be a partial one. */
  allHistory(): HistoryEntry[] {
    return this.history.allHistory();
  }

  importHistory(visits: readonly ImportedVisit[]): { added: number; alreadyHad: number } {
    return this.history.importVisits(visits);
  }

  historyEntry(id: string): HistoryEntry | null {
    return this.history.find(id);
  }

  restoreHistory(entry: HistoryEntry): void {
    this.history.restore(entry);
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
      openRules: Object.keys(settings.openRules).filter((key) => sameSite(key, site)).length,
      startTiles: this.startTiles.countForSite(site),
      // The store owns neither the sessions nor the downloads list, so the
      // browser adds those counts before either sentence is said.
      cookies: 0,
      downloads: 0,
    };
  }

  /**
   * Removes everything this browser knows about one site.
   *
   * The axis people actually want. Clearing by time is an afternoon; what
   * someone usually means is a site - and every place it is known, not the one
   * place they happened to be looking at.
   */
  /**
   * The origins this browser has seen for a site, for clearing storage keyed by
   * origin rather than by site.
   *
   * Read before anything is deleted: after `forgetSite` there is nothing left
   * to name them with, and `clearData` matches origins exactly - clearing
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
    this.startTiles.forgetSite(site);
    this.certificatesStore.forgetSite(site);

    const settings = this.settings.getSettings();
    const without = <T>(record: Record<string, T>) =>
      Object.fromEntries(Object.entries(record).filter(([key]) => !sameSite(key, site)));

    this.settings.updateSettings({
      zoomLevels: without(settings.zoomLevels),
      permissionDecisions: without(settings.permissionDecisions),
      blockerAllowlist: settings.blockerAllowlist.filter((entry) => !sameSite(entry, site)),
      openRules: without(settings.openRules),
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
  blockedThisWeek(): number {
    return this.history.blockedSince(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  totalBlocked(): number {
    return this.history.totalBlocked();
  }

  /** Adds to what one page has refused, as it happens. */
  addBlocked(url: string, delta: number): void {
    this.history.addBlocked(url, delta);
  }

  clearHistory(range: ClearRange): void {
    this.history.clearHistory(range);
    if (range === 'all') {
      forgetLegacyCopies(this.directory, { isClearingEverything: true, now: Date.now() });
    }
    // The icons go with it. Nobody chose to keep one, and a per-origin cache
    // left behind after clearing history is a readable list of where someone
    // has been - which is the thing they just asked to be rid of.
    this.favicons.forgetAll();
  }

  /** The shortcuts someone made, then the sites visited most, less any they asked to stop seeing. */
  topSites(limit = 8): TopSite[] {
    const shortcuts = this.startTiles.shortcuts().map((shortcut): TopSite => ({
      url: shortcut.url,
      host: hostOf(shortcut.url).replace(/^www\./, ''),
      title: shortcut.title,
      visitCount: 0,
      faviconDataUrl: shortcut.icon ?? this.favicons.get(shortcut.url),
      label: shortcut.title,
      isShortcut: true,
    }));
    const hidden = this.startTiles.hiddenSites();
    const visited = this.history
      .topSites((url) => this.favicons.get(url), limit + hidden.length + shortcuts.length)
      .filter(
        (site) =>
          !hidden.some((entry) => sameSite(site.url, entry)) &&
          !shortcuts.some((shortcut) => hostOf(shortcut.url) === hostOf(site.url)),
      );
    return [...shortcuts, ...visited].slice(0, Math.max(limit, shortcuts.length));
  }

  saveStartShortcut(previousUrl: string | null, shortcut: StartShortcut): void {
    this.startTiles.saveShortcut(previousUrl, shortcut);
  }

  /** A shortcut is deleted; a site visited often is not shown again. Answers with how to undo it. */
  removeStartTile(url: string): () => void {
    const snapshot = this.startTiles.snapshot(url);
    if (snapshot) {
      this.startTiles.removeShortcut(url);
      return () => this.startTiles.restoreShortcut(snapshot);
    }
    const site = siteOf(url);
    if (site) {
      this.startTiles.hideSite(site);
      return () => this.startTiles.showSite(site);
    }
    return () => {};
  }

  hiddenStartSites(): string[] {
    return this.startTiles.hiddenSites();
  }

  showStartSites(): void {
    this.startTiles.hiddenSites().forEach((site) => this.startTiles.showSite(site));
  }

  // ---------------------------------------------------------- saved sessions

  listNamedSessions(): NamedSessionSummary[] {
    return this.namedSessions.list();
  }

  namedSessionTabs(id: string): NamedSessionTab[] {
    return this.namedSessions.tabsOf(id);
  }

  saveNamedSession(name: string, tabs: readonly NamedSessionTab[]): NamedSessionSummary {
    return this.namedSessions.save(name, Date.now(), tabs);
  }

  renameNamedSession(id: string, name: string): void {
    this.namedSessions.rename(id, name);
  }

  restoreNamedSession(summary: NamedSessionSummary, tabs: readonly NamedSessionTab[]): void {
    this.namedSessions.restore(summary, tabs);
  }

  removeNamedSession(id: string): void {
    this.namedSessions.remove(id);
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

  /**
   * Brings bookmarks in under one folder of their own, with their folders rebuilt inside it, so an import never
   * scatters itself through what was already here. An address already saved stays where it is, and a folder is
   * made only when something new goes in it.
   */
  importBookmarks(entries: readonly ImportedBookmark[], intoFolder: string): { added: number; alreadyHad: number } {
    const known = new Set(this.bookmarks.list().map((bookmark) => bookmark.url));
    const fresh = entries.filter((entry) => {
      if (known.has(entry.url)) {
        return false;
      }
      known.add(entry.url);
      return true;
    });

    const folderIds = new Map<string, string>();
    const folderFor = (folders: readonly string[]): string => {
      const key = JSON.stringify(folders);
      const existing = folderIds.get(key);
      if (existing) {
        return existing;
      }
      const parentId = folders.length === 0 ? null : folderFor(folders.slice(0, -1));
      const name = folders.at(-1) ?? intoFolder;
      const created = this.bookmarkFolders.create(name, GROUP_COLOURS[0].id, parentId).id;
      folderIds.set(key, created);
      return created;
    };

    const { added } = this.bookmarks.addMany(
      fresh.map((entry) => ({ ...entry, folderId: folderFor(entry.folders) })),
    );
    return { added, alreadyHad: entries.length - added };
  }

  bookmarkSnapshot(id: string): { bookmark: Bookmark; position: number } | null {
    return this.bookmarks.snapshot(id);
  }

  restoreBookmark(snapshot: { bookmark: Bookmark; position: number }): void {
    this.bookmarks.restore(snapshot);
  }

  removeBookmark(id: string): void {
    this.bookmarks.remove(id);
  }

  updateBookmark(id: string, changes: { title?: string; url?: string }): BookmarkEditResult {
    return this.bookmarks.update(id, changes);
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

  reorderBookmark(id: string, beforeId: string | null): boolean {
    return this.bookmarks.reorder(id, beforeId);
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

  reorderBookmarkFolder(id: string, beforeId: string | null): boolean {
    return this.bookmarkFolders.reorder(id, beforeId);
  }

  /**
   * Deletes a folder and keeps everything that was in it.
   *
   * Its bookmarks and child folders move up to where it was. That is the
   * promise the tab strip already makes with "Ungroup these tabs - tabs stay
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

  /** One icon per origin, for the ones that have been fetched. */
  faviconsFor(urls: readonly string[]): Record<string, string> {
    const icons: Record<string, string> = {};
    for (const url of urls) {
      const origin = originOf(url);
      if (origin && !(origin in icons)) {
        const icon = this.getFavicon(url);
        if (icon) {
          icons[origin] = icon;
        }
      }
    }
    return icons;
  }

  getFavicon(url: string): string | null {
    return this.favicons.get(url);
  }

  setFavicon(url: string, dataUrl: string): void {
    this.favicons.set(url, dataUrl);
  }

  // ----------------------------------------------------------------- session

  saveSession(session: SavedSession): void {
    this.session.save(session);
  }

  getSession(): SavedSession {
    return this.session.get();
  }

  // --------------------------------------------------------------- omnibox

  // Rank local history and bookmarks against what the user has typed so far.
  suggest(rawQuery: string, limit = 8): Suggestion[] {
    const query = rawQuery.trim();
    if (!query) {
      return [];
    }
    // Typing * first asks for bookmarks and nothing else, as a way to reach them without a panel.
    if (query.startsWith(BOOKMARKS_ONLY_PREFIX)) {
      return this.bookmarkSuggestions(query.slice(BOOKMARKS_ONLY_PREFIX.length).trim().toLowerCase(), limit);
    }

    const settings = this.getSettings();
    const needle = query.toLowerCase();
    const now = Date.now();
    const bookmarkedUrls = new Set(this.bookmarks.list().map((bookmark) => bookmark.url));

    // Only entries holding the query can score, so the search index picks them rather than every entry being read.
    const entries = this.history.searchHistory(query, MAX_CANDIDATES);
    // Entries that fell out of history should not keep their parsed forms alive.
    if (this.scoreFieldCache.size > MAX_SCORE_FIELDS) {
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

    const resolution = resolveOmniboxInput(query, settings, { httpsFirst: settings.httpsFirst });
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

    // A keyword names its own engine, and the search it starts is the first suggestion.
    const keyworded = keywordSearchFor(query, settings);
    head.push({
      id: 'resolve:search',
      kind: 'search',
      target: keyworded?.target ?? buildSearchUrl(query, settings),
      title: keyworded?.query ?? query,
      subtitle: t('main.search.searchWith', { engine: keyworded?.engineName ?? engineFor(settings).name }),
      faviconDataUrl: null,
    });

    // Bookmarks first, including ones never visited, which history alone would never offer.
    const ranked = [
      ...scored.filter((suggestion) => suggestion.kind === 'bookmark'),
      ...this.bookmarkSuggestions(needle, limit),
      ...scored.filter((suggestion) => suggestion.kind === 'history'),
    ];
    const seen = new Set<string>();
    return [...head, ...ranked]
      .filter((suggestion) => {
        if (seen.has(suggestion.target)) {
          return false;
        }
        seen.add(suggestion.target);
        return true;
      })
      .slice(0, limit + head.length - 1);
  }

  /** Bookmarks whose name or address holds the query, newest first; an empty query is every bookmark. */
  private bookmarkSuggestions(needle: string, limit: number): Suggestion[] {
    return this.bookmarks
      .list()
      .filter((bookmark) => !needle || `${bookmark.title} ${bookmark.url}`.toLowerCase().includes(needle))
      .sort((aBookmark, bBookmark) => bBookmark.createdAt - aBookmark.createdAt)
      .slice(0, limit)
      .map<Suggestion>((bookmark) => ({
        id: `bookmark:${bookmark.id}`,
        kind: 'bookmark',
        target: bookmark.url,
        title: bookmark.title || hostOf(bookmark.url),
        subtitle: bookmark.url,
        faviconDataUrl: this.getFavicon(bookmark.url),
      }));
  }
}

const BOOKMARKS_ONLY_PREFIX = '*';

// The most recent matches ranked; only a one or two letter query ever has more, and recency decides those anyway.
const MAX_CANDIDATES = 2_000;

// Twice what history holds at most, so the cache is cleared only once entries have come and gone.
const MAX_SCORE_FIELDS = 20_000;

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
