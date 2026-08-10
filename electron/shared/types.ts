/**
 * Domain types shared by the main process, the preload bridge and the renderer.
 *
 * Everything here must stay structured-clone safe: it crosses the IPC boundary
 * verbatim. No class instances, no functions, no `undefined` in arrays.
 */

export type TabId = string;
export type DownloadId = string;

/**
 * How much Copacetic can honestly say about the connection behind a tab.
 *
 * `unknown` is deliberate and load-bearing: the chrome renders it as "not yet
 * verified" rather than guessing. A browser that overstates connection safety
 * is worse than one that admits it does not know.
 */
export type SecurityLevel = 'secure' | 'insecure' | 'internal' | 'unknown';

/**
 * What Chromium validated, reported rather than re-derived.
 *
 * Copacetic does no chain analysis of its own — it says what Chromium
 * accepted, which is the honest scope of what a browser interface can claim.
 */
export interface CertificateSummary {
  /** Who issued it, e.g. `Let's Encrypt`. */
  issuer: string;
  /** Who it was issued to. */
  subject: string;
  /** Milliseconds since the epoch. */
  validFrom: number;
  validTo: number;
  fingerprint: string;
  /**
   * False when the chain ends at a root installed on this machine rather than
   * one shipped with the system. That is what TLS interception looks like — a
   * corporate proxy, antivirus, or a debugging tool reading the connection —
   * and it is invisible in every mainstream browser's padlock.
   */
  isIssuedByKnownRoot: boolean;
}

/**
 * One host a page has contacted, and what happened to those requests.
 *
 * The blocked count on the badge says what was stopped. This says what was
 * allowed through as well, which is the half no mainstream browser shows
 * without opening developer tools.
 */
export interface ConnectionEntry {
  host: string;
  requests: number;
  blocked: number;
  /** True when the host is on the bundled tracker list. */
  isTracker: boolean;
}

export interface SecurityState {
  level: SecurityLevel;
  /** Scheme without the trailing colon, e.g. `https`. */
  scheme: string;
  host: string;
  /** One plain sentence shown in the connection popover. */
  detail: string;
  /** Present only for an https page whose certificate Chromium accepted. */
  certificate: CertificateSummary | null;
}

export interface PageError {
  code: number;
  /** Chromium's symbolic name, e.g. `ERR_NAME_NOT_RESOLVED`. */
  name: string;
  description: string;
  url: string;
}

export interface TabState {
  id: TabId;
  url: string;
  /** What the omnibox shows: the pending navigation target, or the live URL. */
  displayUrl: string;
  title: string;
  faviconDataUrl: string | null;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isAudible: boolean;
  isMuted: boolean;
  security: SecurityState;
  error: PageError | null;
  /** Requests the content blocker stopped on this page load. */
  blockedCount: number;
  /** Wall-clock milliseconds for the last completed load, if measured. */
  loadMs: number | null;
  zoomFactor: number;
  /** True for a tab parked on the start page, which has no backing view. */
  isStartPage: boolean;
  isBookmarked: boolean;
}

export type DownloadStatus = 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted';

export interface DownloadState {
  id: DownloadId;
  filename: string;
  savePath: string;
  url: string;
  receivedBytes: number;
  totalBytes: number;
  /** Bytes per second over the last sample window, or null before the first sample. */
  bytesPerSecond: number | null;
  status: DownloadStatus;
  startedAt: number;
  completedAt: number | null;
  /** False once the file has been moved or deleted outside Copacetic. */
  fileExists: boolean;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  lastVisitedAt: number;
  visitCount: number;
}

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  createdAt: number;
}

export interface TopSite {
  url: string;
  host: string;
  title: string;
  visitCount: number;
  faviconDataUrl: string | null;
}

export type SuggestionKind = 'url' | 'search' | 'history' | 'bookmark';

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  /** What navigating to this suggestion resolves to. */
  target: string;
  /** Primary line. */
  title: string;
  /** Secondary line, usually the URL. */
  subtitle: string;
  faviconDataUrl: string | null;
}

export interface FindState {
  isOpen: boolean;
  query: string;
  activeMatch: number;
  totalMatches: number;
  matchCase: boolean;
}

export type PermissionKind =
  | 'geolocation'
  | 'notifications'
  | 'media'
  | 'clipboard-read'
  | 'display-capture'
  | 'midi'
  | 'pointerLock'
  | 'fullscreen'
  | 'openExternal';

export type PermissionDecision = 'allow' | 'deny';

/** What each permission means, in the words a person would use. */
export const PERMISSION_LABELS: Record<PermissionKind, string> = {
  geolocation: 'Know your location',
  notifications: 'Send you notifications',
  media: 'Use your camera and microphone',
  'clipboard-read': 'Read your clipboard',
  'display-capture': 'Record your screen',
  midi: 'Use your MIDI devices',
  pointerLock: 'Lock your pointer',
  fullscreen: 'Go fullscreen',
  openExternal: 'Open another application',
};

export interface PermissionPrompt {
  id: string;
  tabId: TabId;
  origin: string;
  kind: PermissionKind;
  /** Plain-language description of what the site is asking for. */
  description: string;
}

export type SearchEngineId = 'duckduckgo' | 'google' | 'brave' | 'startpage' | 'bing';

export interface SearchEngine {
  id: SearchEngineId;
  name: string;
  /** `%s` is replaced with the URI-encoded query. */
  searchTemplate: string;
  suggestHost: string | null;
}

export type ThemeId = 'deep' | 'slate' | 'ember' | 'moss';

export type ClearRange = 'hour' | 'day' | 'week' | 'all';

export interface Settings {
  searchEngine: SearchEngineId;
  theme: ThemeId;
  /** Rewrite `http://` navigations to `https://` and fall back only on failure. */
  httpsFirst: boolean;
  blockTrackers: boolean;
  restoreTabsOnLaunch: boolean;
  showStartPageClock: boolean;
  showTopSites: boolean;
  /**
   * Ask GitHub whether a newer release exists, on launch and on a long timer.
   * The request carries nothing about the user — it reads a version number —
   * but it is still the only routine network call the browser makes on its own
   * behalf, so it is a setting rather than an assumption.
   */
  checkForUpdates: boolean;
  /** Per-origin permission decisions the user has already made. */
  permissionDecisions: Record<string, PermissionDecision>;
  sidebarWidth: number;
  defaultZoomFactor: number;
}

/**
 * The single snapshot the main process pushes to the chrome renderer.
 * Large collections (history, bookmarks) are fetched on demand instead.
 */
export interface BrowserState {
  tabs: TabState[];
  tabOrder: TabId[];
  activeTabId: TabId | null;
  downloads: DownloadState[];
  find: FindState;
  permissionPrompts: PermissionPrompt[];
  settings: Settings;
  hasClosedTabs: boolean;
  update: UpdateState;
}

/**
 * Where an update comes from on this build.
 *
 * - `automatic` — the app downloads and installs it itself.
 * - `system` — the OS package manager does it, from Copacetic's apt
 *   repository, which the `.deb` registers when it installs.
 * - `manual` — nothing can install it, so the user has to download it.
 * - `unsupported` — a development build, with nothing to update.
 */
export type UpdateDelivery = 'automatic' | 'system' | 'manual' | 'unsupported';

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'current' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string };

export interface UpdateState {
  status: UpdateStatus;
  delivery: UpdateDelivery;
  /** Why this build cannot install updates itself, when it cannot. */
  manualReason: string | null;
  lastCheckedAt: number | null;
  /** Where to send someone who has to install it by hand. */
  releasesUrl: string;
}

export interface AppInfo {
  version: string;
  electronVersion: string;
  chromeVersion: string;
  platform: NodeJS.Platform;
  isDevelopment: boolean;
  /** How many domains the bundled tracker list covers. */
  blockerRuleCount: number;
}

export interface ContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
