import { describe, expect, it } from 'vitest';
import {
  RELEASES_PAGE,
  type ReleaseEntry,
  downloadUrl,
  downloadsToKeep,
  feedUrl,
  isOwnDownload,
  pointFeedAtDownloads,
  readReleasesIndex,
  withRelease,
} from '../../../../electron/shared/distribution/releases';

const ORIGIN = 'https://downloads.example';

const release = (version: string, publishedAt: string, isPrerelease = version.includes('-')): ReleaseEntry => ({
  version,
  isPrerelease,
  publishedAt,
  notes: `Notes for ${version}`,
  pageUrl: `https://github.com/ryjord/Copacetic/releases/tag/v${version}`,
});

describe('where releases are served from', () => {
  it('names a feed by channel and an installer by its version, so a published address never changes', () => {
    expect(feedUrl(ORIGIN, 'beta')).toBe('https://downloads.example/feed/beta/');
    expect(downloadUrl(ORIGIN, '2.2.0', 'Copacetic Setup 2.2.0.exe')).toBe(
      'https://downloads.example/download/2.2.0/Copacetic%20Setup%202.2.0.exe',
    );
  });

  it('treats only its own download folder as somewhere an update may come from', () => {
    expect(isOwnDownload(ORIGIN, 'https://downloads.example/download/2.2.0/Copacetic.dmg')).toBe(true);
    expect(isOwnDownload(ORIGIN, 'https://downloads.example.evil.test/download/x.dmg')).toBe(false);
    expect(isOwnDownload(ORIGIN, 'https://downloads.example/feed/beta/latest.yml')).toBe(false);
  });
});

describe('the release index', () => {
  it('reads each release and leaves out anything malformed', () => {
    const index = readReleasesIndex({
      releases: [
        release('2.2.0', '2026-11-07T10:00:00Z'),
        { version: 'not a version', publishedAt: '2026-11-01T10:00:00Z' },
        'nonsense',
      ],
    });
    expect(index.map((entry) => entry.version)).toEqual(['2.2.0']);
    expect(readReleasesIndex(null)).toEqual([]);
    expect(readReleasesIndex({ releases: 'no' })).toEqual([]);
  });

  // The page is opened in the system browser, so the index cannot send someone anywhere it likes.
  it('follows a release page only on Copacetic’s own hosts', () => {
    const [onSite, elsewhere, plain] = readReleasesIndex({
      releases: [
        { ...release('2.2.0', '2026-11-07T10:00:00Z'), pageUrl: 'https://copacetic.mrenigma.uk/releases/2.2.0' },
        { ...release('2.1.0', '2026-10-23T10:00:00Z'), pageUrl: 'https://mrenigma.uk.evil.test/' },
        { ...release('2.0.0', '2026-10-01T10:00:00Z'), pageUrl: 'http://github.com/ryjord/Copacetic' },
      ],
    });
    expect(onSite?.pageUrl).toBe('https://copacetic.mrenigma.uk/releases/2.2.0');
    expect(elsewhere?.pageUrl).toBe(RELEASES_PAGE);
    expect(plain?.pageUrl).toBe(RELEASES_PAGE);
  });

  it('adds a release newest first, replacing an earlier entry for the same version', () => {
    const index = [release('2.2.0-beta.3', '2026-11-01T10:00:00Z'), release('2.1.0', '2026-10-23T10:00:00Z')];
    const republished = { ...release('2.2.0-beta.3', '2026-11-02T10:00:00Z'), notes: 'Fixed notes' };
    const { releases } = withRelease(
      withRelease(index, release('2.2.0', '2026-11-07T10:00:00Z')).releases,
      republished,
    );
    expect(releases.map((entry) => entry.version)).toEqual(['2.2.0', '2.2.0-beta.3', '2.1.0']);
    expect(releases[1]?.notes).toBe('Fixed notes');
  });

  it('keeps a bounded history', () => {
    const many = Array.from({ length: 30 }, (_unused, index) =>
      release(`1.${index}.0`, `2026-01-${String(index + 1).padStart(2, '0')}T10:00:00Z`),
    );
    const { releases } = many.reduce((index, entry) => withRelease(index.releases, entry), {
      releases: [] as ReleaseEntry[],
    });
    expect(releases).toHaveLength(20);
    expect(releases[0]?.version).toBe('1.29.0');
  });
});

describe('which installers stay on the bucket', () => {
  // The free tier is 10 GB and one release is over a gigabyte, so old installers have to go.
  it('keeps the two newest stable releases and a beta newer than them', () => {
    const index = [
      release('2.3.0-beta.1', '2026-12-01T10:00:00Z'),
      release('2.2.0', '2026-11-07T10:00:00Z'),
      release('2.2.0-beta.3', '2026-11-01T10:00:00Z'),
      release('2.1.0', '2026-10-23T10:00:00Z'),
      release('2.0.0', '2026-10-01T10:00:00Z'),
    ];
    expect(downloadsToKeep(index)).toEqual(['2.3.0-beta.1', '2.2.0', '2.1.0']);
  });

  it('drops a beta once a stable release has come out after it', () => {
    const index = [release('2.2.0', '2026-11-07T10:00:00Z'), release('2.2.0-beta.3', '2026-11-01T10:00:00Z')];
    expect(downloadsToKeep(index)).toEqual(['2.2.0']);
  });
});

describe('pointing a feed at the versioned installers', () => {
  const manifest = [
    'version: 2.2.0',
    'files:',
    '  - url: Copacetic-Setup-2.2.0.exe',
    '    sha512: abc==',
    '    size: 227784823',
    'path: Copacetic-Setup-2.2.0.exe',
    'sha512: abc==',
    "releaseDate: '2026-11-07T10:00:00.000Z'",
    '',
  ].join('\n');

  it('rewrites every file and path to its download, and leaves the hashes and date alone', () => {
    const pointed = pointFeedAtDownloads(manifest, ORIGIN, '2.2.0');
    expect(pointed).toContain('  - url: https://downloads.example/download/2.2.0/Copacetic-Setup-2.2.0.exe\n');
    expect(pointed).toContain('path: https://downloads.example/download/2.2.0/Copacetic-Setup-2.2.0.exe\n');
    expect(pointed).toContain('    sha512: abc==\n');
    expect(pointed).toContain("releaseDate: '2026-11-07T10:00:00.000Z'");
  });

  it('leaves an address that is already absolute as it is', () => {
    const absolute = 'path: https://elsewhere.example/Copacetic.exe\n';
    expect(pointFeedAtDownloads(absolute, ORIGIN, '2.2.0')).toBe(absolute);
  });
});
