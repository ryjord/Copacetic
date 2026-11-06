/**
 * Where Copacetic's own releases are published, and the shape of what is
 * published there. The app reads it to check for updates, and the release
 * workflow writes it, so both sides agree on one definition. Nothing here
 * imports anything: the workflow runs this file under plain Node.
 */

/** Copacetic's bucket, which serves the apt repository, the update feeds and the installers. */
export const DOWNLOADS_ORIGIN = 'https://pub-4eb7b3b013b1424caf0cfa2c570bcc61.r2.dev';

/** Where someone is sent to read about releases when no release page is known. */
export const RELEASES_PAGE = 'https://github.com/ryjord/Copacetic/releases';

export const RELEASES_INDEX = 'releases.json';

export type FeedChannel = 'stable' | 'beta';

/** Hosts a release's page may be on; anything else in the index is not followed. */
const PAGE_HOSTS = ['github.com', 'mrenigma.uk'];

// Enough history to show notes for every release someone might be updating across.
const MOST_IN_INDEX = 20;
// The newest two stable releases stay downloadable, so an IT team can hold one back while testing the next.
const STABLE_DOWNLOADS_KEPT = 2;

export interface ReleaseEntry {
  version: string;
  isPrerelease: boolean;
  /** ISO 8601, when the release was published. */
  publishedAt: string;
  /** The release's notes, as Markdown. */
  notes: string;
  pageUrl: string;
}

/** The folder an update feed is served from; electron-updater reads its latest*.yml there. */
export function feedUrl(origin: string, channel: FeedChannel): string {
  return `${origin}/feed/${channel}/`;
}

/** Where one release's installer is kept, at a path that names its version so it never changes. */
export function downloadUrl(origin: string, version: string, file: string): string {
  return `${origin}/download/${version}/${encodeURIComponent(file)}`;
}

/** Whether `url` is one of Copacetic's own downloads, which is all an update may fetch. */
export function isOwnDownload(origin: string, url: string): boolean {
  return url.startsWith(`${origin}/download/`);
}

function isPageUrl(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const { protocol, hostname } = new URL(value);
    return protocol === 'https:' && PAGE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function readEntry(value: unknown): ReleaseEntry | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const version: unknown = Reflect.get(value, 'version');
  const publishedAt: unknown = Reflect.get(value, 'publishedAt');
  const notes: unknown = Reflect.get(value, 'notes');
  const pageUrl: unknown = Reflect.get(value, 'pageUrl');
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    return null;
  }
  return {
    version,
    isPrerelease: Reflect.get(value, 'isPrerelease') === true,
    publishedAt: typeof publishedAt === 'string' ? publishedAt : '',
    notes: typeof notes === 'string' ? notes : '',
    pageUrl: isPageUrl(pageUrl) ? pageUrl : RELEASES_PAGE,
  };
}

/** The releases a published index lists, each checked; anything malformed is left out rather than trusted. */
export function readReleasesIndex(payload: unknown): ReleaseEntry[] {
  const releases: unknown = typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'releases') : null;
  return Array.isArray(releases)
    ? releases.map(readEntry).filter((entry): entry is ReleaseEntry => entry !== null)
    : [];
}

/** The index with `entry` added, replacing an earlier entry for the same version, newest published first. */
export function withRelease(index: readonly ReleaseEntry[], entry: ReleaseEntry): { releases: ReleaseEntry[] } {
  const releases = [entry, ...index.filter((existing) => existing.version !== entry.version)]
    .toSorted((aEntry, bEntry) => bEntry.publishedAt.localeCompare(aEntry.publishedAt))
    .slice(0, MOST_IN_INDEX);
  return { releases };
}

/** The versions whose installers stay on the bucket: the newest stable two, and a beta newer than both. */
export function downloadsToKeep(index: readonly ReleaseEntry[]): string[] {
  const newestFirst = index.toSorted((aEntry, bEntry) => bEntry.publishedAt.localeCompare(aEntry.publishedAt));
  const stable = newestFirst.filter((entry) => !entry.isPrerelease).slice(0, STABLE_DOWNLOADS_KEPT);
  const newestStableAt = stable[0]?.publishedAt ?? '';
  const beta = newestFirst.find((entry) => entry.isPrerelease && entry.publishedAt > newestStableAt);
  return [...(beta ? [beta] : []), ...stable].map((entry) => entry.version);
}

/**
 * An electron-builder update manifest with each file pointed at its versioned
 * download, so one feed folder can name installers kept under their own
 * version. Absolute addresses are left alone.
 */
export function pointFeedAtDownloads(manifest: string, origin: string, version: string): string {
  return manifest.replace(/^(\s*(?:-\s+url|url|path):\s*)(\S+)\s*$/gm, (line, key: string, file: string) =>
    /^https?:\/\//.test(file) ? line : `${key}${downloadUrl(origin, version, file)}`,
  );
}
