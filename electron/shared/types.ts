import type { DnsMode } from './dns';

/** Domain types shared by the main process, the preload bridge and the renderer. */

export type TabId = string;
export type DownloadId = string;

/** How much Copacetic can honestly say about the connection behind a tab. */
export type SecurityLevel = 'secure' | 'insecure' | 'internal' | 'unknown';

/** What Chromium validated, reported rather than re-derived. */
export interface CertificateSummary {
  /** Who issued it, e.g. `Let's Encrypt`. */
  issuer: string;
  /** Who it was issued to. */
  subject: string;
  /** Milliseconds since the epoch. */
  validFrom: number;
  validTo: number;
  fingerprint: string;
  // False when the chain ends at a root installed on this machine rather than one shipped with the system.
  isIssuedByKnownRoot: boolean;
}

/** One host a page has contacted, and what happened to those requests. */
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
  /** Set when this site's certificate has changed in a way worth mentioning. */
  certificateChange: string;
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
  /** A Hush tab: nothing it does is written to this machine. */
  isHush: boolean;
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
  /** Every URL it passed through: where you clicked is often not where it came from. */
  urlChain: string[];
  /** SHA-256 of what actually arrived, so it can be checked against a published one. */
  sha256: string | null;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  lastVisitedAt: number;
  visitCount: number;
}

export interface HistoryPage {
  entries: HistoryEntry[];
  /** Every entry matching the query, not only those in this page. */
  total: number;
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

/** An HTTP authentication challenge waiting on the user. */
export interface AuthPrompt {
  id: string;
  /** Null for a proxy challenge, which belongs to no particular tab. */
  tabId: TabId | null;
  isProxy: boolean;
  /** Host, with the port when it is not the default for the scheme. */
  host: string;
  /** The server's own words, sanitised. Shown quoted and attributed. */
  realm: string;
  /** `basic`, `digest`, `ntlm`, `negotiate`. */
  scheme: string;
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

/** How much room the chrome takes. Only sizing — never colour. */
export type DensityId = 'comfortable' | 'compact';

/** The pieces the start page can be built from, in the order they appear. */
export type StartPageWidgetId = 'clock' | 'search' | 'topSites' | 'bookmarks';

export const START_PAGE_WIDGETS: readonly { id: StartPageWidgetId; label: string; description: string }[] = [
  { id: 'clock', label: 'Clock', description: 'The time, and not much else.' },
  { id: 'search', label: 'Search', description: 'A box that searches or takes an address.' },
  { id: 'topSites', label: 'Most visited', description: 'Ranked from how often you actually go there.' },
  { id: 'bookmarks', label: 'Bookmarks', description: 'The most recent things you saved.' },
];

export type VaultAvailability = 'ready' | 'unavailable' | 'unreadable';

export interface VaultEntry {
  id: string;
  /** The origin these credentials belong to, e.g. `https://example.com`. */
  origin: string;
  username: string;
  createdAt: number;
  updatedAt: number;
  /** False when this entry exists but its secret cannot be decrypted on this machine. */
  isReadable: boolean;
}

export interface VaultLock {
  isUnlocked: boolean;
  /** `touch-id`, or `none` where the platform gives Electron nothing to ask with. */
  method: 'touch-id' | 'none';
  /** What locking is worth on this machine, in the words shown to the user. */
  detail: string;
}

export interface VaultFacts {
  /** The real path on this machine, so it can be gone and looked at. */
  filePath: string;
  /** False when there is no keychain, in which case nothing can be saved at all. */
  hasKeychain: boolean;
  /** True only where Copacetic can ask the operating system who you are. */
  canAskWhoYouAre: boolean;
  /** Unsigned builds are why an update can cost the keychain entry on macOS. */
  isSigned: boolean;
  entryCount: number;
}

export interface VaultInput {
  origin: string;
  username: string;
  password: string;
}

/** Passwords are deliberately absent: they are fetched one at a time, on request. */
export interface VaultState {
  availability: VaultAvailability;
  /** What is wrong, in the words shown to the user. Empty when nothing is. */
  detail: string;
  entries: VaultEntry[];
  /** Entries that exist and cannot be read — never folded into an empty list. */
  unreadableCount: number;
}

export type ClearRange = 'hour' | 'day' | 'week' | 'all';

export type ExportKind = 'bookmarks' | 'history';

export interface Settings {
  searchEngine: SearchEngineId;
  theme: ThemeId;
  density: DensityId;
  /** Rewrite `http://` navigations to `https://` and fall back only on failure. */
  httpsFirst: boolean;
  blockTrackers: boolean;
  restoreTabsOnLaunch: boolean;
  // Which pieces the start page shows, in order.
  startPageWidgets: StartPageWidgetId[];
  // Ask GitHub whether a newer release exists, on launch and on a long timer.
  checkForUpdates: boolean;
  /** Per-origin permission decisions the user has already made. */
  permissionDecisions: Record<string, PermissionDecision>;
  // Per-origin zoom, remembered because a site that needs zooming needs it every time.
  zoomLevels: Record<string, number>;
  // Sites where tracker blocking is switched off, by registrable domain.
  blockerAllowlist: string[];
  // Encrypted DNS is off until chosen: switching who resolves your names without
  // saying so is the move it exists to protect against.
  dnsMode: DnsMode;
  dnsResolverId: string;
  // Whether a start-page wallpaper is set.
  hasWallpaper: boolean;
  sidebarWidth: number;
  defaultZoomFactor: number;
}

/** The single snapshot the main process pushes to the chrome renderer. */
export interface BrowserState {
  tabs: TabState[];
  tabOrder: TabId[];
  activeTabId: TabId | null;
  downloads: DownloadState[];
  find: FindState;
  permissionPrompts: PermissionPrompt[];
  authPrompts: AuthPrompt[];
  settings: Settings;
  hasClosedTabs: boolean;
  update: UpdateState;
}

/** Where an update comes from on this build. */
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
