// Utils
import { t } from './i18n/translate';

// Types
import type { ShortcutOverrides } from './chrome/shortcuts';
import type { ProfileSummary } from './data/profiles';
import type { DnsMode } from './browsing/dns';
import type { TabGroup } from './tabs/tab-groups';

/** Domain types shared by the main process, the preload bridge and the renderer. */

export type TabId = string;
export type DownloadId = string;

/** How much Copacetic can honestly say about the connection behind a tab. */
export type SecurityLevel = 'secure' | 'insecure' | 'internal' | 'unknown';

/** What this platform will let Copacetic do about becoming the default browser. */
export type DefaultBrowserStatus = 'default' | 'can-ask' | 'settings-only' | 'unavailable';

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
  /**
   * The filter rule that caught this, when a rule did rather than a hostname.
   * Which of the two stopped something is how a false positive is told apart
   * from a site that is simply broken.
   */
  rule?: string | null;
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
  /** The HTTP address this page was upgraded from, offered only when the HTTPS version failed. */
  plainUrl?: string | null;
  /** The certificate was refused for a reason a person may choose to continue past. */
  canAcceptCertificate?: boolean;
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
  /** Kept at the start of the strip as an icon, and brought back pinned. */
  isPinned: boolean;
  /** Its page closed to free memory; it comes back where it was when chosen. */
  isAsleep: boolean;
  /** The group this tab is in, if any. */
  groupId: string | null;
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
  /**
   * Started from a Hush tab, so nothing about it is written down.
   *
   * The file is on disk - it was asked for - but the record of where it came
   * from is browsing, and a Hush tab keeps none. It is listed while Copacetic
   * is open and gone when it closes.
   */
  isHush?: boolean;
  /** A file that runs code when opened, paused until the person says to keep it. Never written down: after a restart it is simply interrupted. */
  isHeld?: boolean;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  lastVisitedAt: number;
  visitCount: number;
  /**
   * Requests refused on this page, added up across every visit.
   *
   * Requests, not adverts: one advert is usually several requests and most of
   * these are trackers, so the number that is easy to inflate is the one to be
   * careful with. Absent on entries written before this was counted, which is
   * why it is optional rather than zero - nothing was measured then, and zero
   * would be a claim.
   */
  blockedCount?: number;
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
  /** The folder it is filed in, or null for the ones nobody has filed. */
  folderId: string | null;
}

/** Another browser's profile on this computer that bookmarks and history can be brought in from. */
export interface ImportSource {
  id: string;
  label: string;
}

/** What came of editing a bookmark, so the form can say why it was not saved. */
export type BookmarkEditResult = 'saved' | 'not-an-address' | 'already-saved' | 'missing';

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

/** A stored decision is keyed `origin|kind`: a web origin exactly as the browser writes it, and a kind it knows. */
export function isPermissionDecisionKey(key: string): boolean {
  const separator = key.lastIndexOf('|');
  const origin = key.slice(0, separator);
  const kind = key.slice(separator + 1);
  if (separator <= 0 || !Object.hasOwn(PERMISSION_LABELS, kind)) {
    return false;
  }
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.origin === origin;
  } catch {
    return false;
  }
}

/** The kinds a site has to ask about, in the order settings lists them. */
export const ASKABLE_PERMISSIONS = [
  'notifications',
  'geolocation',
  'media',
  'clipboard-read',
  'midi',
  'openExternal',
] as const satisfies readonly PermissionKind[];
export type AskablePermission = (typeof ASKABLE_PERMISSIONS)[number];

// No 'allow': a blanket yes would hand every page the camera or your location without a word.
export type PermissionDefault = 'ask' | 'block';

/** What a site nobody has decided about gets, by kind; a kind left out is asked about. */
export type PermissionDefaults = Partial<Record<AskablePermission, PermissionDefault>>;

export function isAskablePermission(kind: string): kind is AskablePermission {
  return ASKABLE_PERMISSIONS.some((askable) => askable === kind);
}

/** Only known kinds and known answers survive, from the renderer or from disk. */
export function readPermissionDefaults(value: unknown): PermissionDefaults {
  if (typeof value !== 'object' || value === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      ([kind, answer]) => isAskablePermission(kind) && (answer === 'ask' || answer === 'block'),
    ),
  );
}

/** A person's answer to a prompt, and whether they asked for it to be kept. */
export interface PermissionAnswer {
  decision: PermissionDecision;
  remember: boolean;
}

/** What each permission means, in the words a person would use. */
export const PERMISSION_LABELS: Record<PermissionKind, string> = {
  geolocation: t('main.permissions.labels.geolocation'),
  notifications: t('main.permissions.labels.notifications'),
  media: t('main.permissions.labels.media'),
  'clipboard-read': t('main.permissions.labels.clipboardRead'),
  'display-capture': t('main.permissions.labels.displayCapture'),
  midi: t('main.permissions.labels.midi'),
  pointerLock: t('main.permissions.labels.pointerLock'),
  fullscreen: t('main.permissions.labels.fullscreen'),
  openExternal: t('main.permissions.labels.openExternal'),
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

/**
 * The themes, as a list rather than only a type, because two places have to
 * check a string against them at runtime and a union cannot be checked. The
 * type is derived from the list so the two cannot disagree.
 */
export const THEME_IDS = ['deep', 'slate', 'ember', 'moss'] as const;

/** Light or dark for the whole interface; `system` follows the operating system. */
export const APPEARANCES = ['system', 'light', 'dark'] as const;

export type AppearanceId = (typeof APPEARANCES)[number];

export function isAppearanceId(value: string): value is AppearanceId {
  return (APPEARANCES as readonly string[]).includes(value);
}

/**
 * What WebRTC may reveal of this machine's addresses. A page can learn the
 * local network address through it without asking, so the public one alone
 * is the default; the others are for a call that will not connect.
 */
export const WEB_RTC_POLICIES = ['publicOnly', 'default', 'proxiedOnly'] as const;

export type WebRtcPolicy = (typeof WEB_RTC_POLICIES)[number];

export function isWebRtcPolicy(value: string): value is WebRtcPolicy {
  return (WEB_RTC_POLICIES as readonly string[]).includes(value);
}

/** How long a tab may be left alone before it sleeps, in minutes; zero is never. Only these, so a setting cannot put tabs to sleep in seconds. */
export const SLEEP_AFTER_MINUTES = [0, 15, 30, 60, 120] as const;

export type SleepAfterMinutes = (typeof SLEEP_AFTER_MINUTES)[number];

export function isSleepAfterMinutes(value: unknown): value is SleepAfterMinutes {
  return (SLEEP_AFTER_MINUTES as readonly unknown[]).includes(value);
}

export type ThemeId = (typeof THEME_IDS)[number];

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value);
}

/**
 * What a page may be zoomed to.
 *
 * Applied when a tab zooms, and now also when a level is stored: a level
 * arriving through the settings patch was kept exactly as given, so a value of
 * 0.001 or 1000 could be written down and read back later as the zoom for a
 * site - legible only as a page that will not display.
 */
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 5;

/**
 * `Math.min` and `Math.max` carry NaN straight through whichever way round they
 * are written, so clamping a NaN produced a NaN - and IPC uses structured
 * clone, not JSON, so a NaN really can arrive from the renderer. It reached a
 * tab's zoom and the interface then had a zoom of NaN per cent to display.
 *
 * Anything that is not a number is not a zoom, and the answer is the default
 * rather than the nearest bound: there is no nearest bound to a NaN.
 */
export function clampZoom(factor: number): number {
  if (!Number.isFinite(factor)) {
    return 1;
  }
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, factor));
}

/** How much room the chrome takes. Only sizing - never colour. */
export type DensityId = 'comfortable' | 'compact';

/** The pieces the start page can be built from, in the order they appear. */
export type StartPageWidgetId = 'clock' | 'search' | 'topSites' | 'bookmarks';

export const START_PAGE_WIDGETS: readonly { id: StartPageWidgetId; label: string; description: string }[] = [
  {
    id: 'clock',
    label: t('main.startPage.widgets.clock.label'),
    description: t('main.startPage.widgets.clock.description'),
  },
  {
    id: 'search',
    label: t('main.startPage.widgets.search.label'),
    description: t('main.startPage.widgets.search.description'),
  },
  {
    id: 'topSites',
    label: t('main.startPage.widgets.topSites.label'),
    description: t('main.startPage.widgets.topSites.description'),
  },
  {
    id: 'bookmarks',
    label: t('main.startPage.widgets.bookmarks.label'),
    description: t('main.startPage.widgets.bookmarks.description'),
  },
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
  /** What holds the key, such as the macOS Keychain or GNOME Keyring; empty without one. */
  keychainName: string;
  /** Why there is no keychain, when there is not one. */
  keychainProblem: string;
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
  /** Entries that exist and cannot be read - never folded into an empty list. */
  unreadableCount: number;
}

export type ClearRange = 'hour' | 'day' | 'week' | 'all';

export type ExportKind = 'bookmarks' | 'history';

export interface Settings {
  searchEngine: SearchEngineId;
  appearance: AppearanceId;
  /** The start page's colour, and nothing else's. */
  theme: ThemeId;
  density: DensityId;
  /** Rewrite `http://` navigations to `https://` and fall back only on failure. */
  httpsFirst: boolean;
  blockTrackers: boolean;
  restoreTabsOnLaunch: boolean;
  // Which pieces the start page shows, in order.
  startPageWidgets: StartPageWidgetId[];
  /** Set once someone has read what Hush does and does not do. */
  hushNoticeDismissed: boolean;
  /** Degrees the start page's atmosphere is turned from the theme's own hue. Nothing else in the interface moves. */
  ambientHue: number;
  // Ask GitHub whether a newer release exists, on launch and on a long timer.
  checkForUpdates: boolean;
  /** Per-origin permission decisions the user has already made. */
  permissionDecisions: Record<string, PermissionDecision>;
  /** What a site without a decision gets, by kind. */
  permissionDefaults: PermissionDefaults;
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
  defaultZoomFactor: number;
  /** Underlines misspelt words in what is typed into pages. */
  spellcheck: boolean;
  /** Chosen dictionaries, outside macOS; empty means the system's language. */
  spellcheckLanguages: string[];
  webRtcPolicy: WebRtcPolicy;
  /** Cookies sent to or set by a site other than the page's; a site's tracker exception lets them through. */
  blockThirdPartyCookies: boolean;
  /** Tracking parameters are taken off an address before the page is asked for. */
  cleanLinks: boolean;
  /** Cookie consent banners are hidden by a stylesheet; nothing is answered on the person's behalf. */
  hideCookieBanners: boolean;
  /** Where files go; null for the system's own Downloads folder. Chosen in a dialog, never typed. */
  downloadDirectory: string | null;
  /** Each download asks where to save it rather than going to the folder above. */
  askWhereToSave: boolean;
  sleepTabsAfterMinutes: SleepAfterMinutes;
  /** A row of the top-level bookmarks under the toolbar. Off until asked for. */
  showBookmarksBar: boolean;
  /** Shortcuts moved to other keys, by id; the menu is one for the whole app, so this is too. */
  shortcutOverrides: ShortcutOverrides;
}

/** The single snapshot the main process pushes to the chrome renderer. */
export interface BrowserState {
  tabs: TabState[];
  /** The groups themselves. Which tabs are in them is carried on each tab. */
  groups: TabGroup[];
  tabOrder: TabId[];
  activeTabId: TabId | null;
  downloads: DownloadState[];
  find: FindState;
  permissionPrompts: PermissionPrompt[];
  authPrompts: AuthPrompt[];
  settings: Settings;
  hasClosedTabs: boolean;
  update: UpdateState;
  /** The site information card, open for one tab, or null. */
  siteInfo: SiteInfoState | null;
  /** The profile this window belongs to. */
  profile: ProfileSummary;
  /** Every profile, to switch between and to manage. */
  profiles: ProfileSummary[];
}

export interface SiteInfoState {
  tabId: TabId;
  /** When it opened, so how long a certificate has left is measured once rather than on every render. */
  openedAt: number;
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
  /** How many domains the curated tracker list covers, whatever else is loaded. */
  blockerRuleCount: number;
  /** The filter lists built into this release, so a pane can name them and their date. */
  filterLists: FilterList[];
}

/**
 * A filter list as it shipped.
 *
 * The date is the list's own, not the day the app was built: what matters is how
 * old the rules are, and a release cut a month after a list was fetched is a
 * month behind whatever it says here.
 */
export interface FilterList {
  name: string;
  url: string;
  describe: string;
  rules: number;
  lastModified: string | null;
}

export interface ContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
