/**
 * Stages one release for Copacetic's bucket: its installers under a folder
 * named for its version, the update feeds pointed at them, and the release
 * index with this release added. The release workflow uploads what is staged,
 * then removes the version folders this leaves out of `keep.txt`.
 *
 * The installers live on the bucket rather than only on GitHub so updates and
 * downloads keep working whatever the repository's visibility.
 *
 * Usage:
 *   node scripts/publish-downloads.mjs <assets-dir> <staging-dir>
 * with VERSION, IS_PRERELEASE ("true" or "false"), PUBLISHED_AT, NOTES_FILE,
 * PAGE_URL and PUBLIC_ORIGIN, the bucket's public address, set.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  DOWNLOADS_ORIGIN,
  RELEASES_INDEX,
  downloadsToKeep,
  pointFeedAtDownloads,
  readReleasesIndex,
  withRelease,
} from '../electron/shared/distribution/releases.ts';

const [assetsDir, stagingDir] = process.argv.slice(2);
const { VERSION, IS_PRERELEASE, PUBLISHED_AT, NOTES_FILE, PAGE_URL, PUBLIC_ORIGIN } = process.env;
if (!assetsDir || !stagingDir || !VERSION || !PUBLISHED_AT) {
  console.error('usage: VERSION=… PUBLISHED_AT=… node scripts/publish-downloads.mjs <assets-dir> <staging-dir>');
  process.exit(2);
}
// The app reads the address it was built with; publishing anywhere else would reach nobody.
if (PUBLIC_ORIGIN && PUBLIC_ORIGIN.replace(/\/+$/, '') !== DOWNLOADS_ORIGIN) {
  console.error(`The bucket is served from ${PUBLIC_ORIGIN}, but the app reads ${DOWNLOADS_ORIGIN}.`);
  process.exit(1);
}

/** What is published already: nothing on the very first run, and a failure, not an empty list, if it cannot be read. */
async function publishedIndex() {
  const response = await fetch(`${DOWNLOADS_ORIGIN}/${RELEASES_INDEX}`, { cache: 'no-store' });
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    throw new Error(
      `The published index answered ${response.status}; refusing to replace it with this release alone.`,
    );
  }
  return readReleasesIndex(await response.json());
}

// The .deb files are served by the apt repository already, from the same bucket.
const isInstaller = (name) => !name.endsWith('.deb') && !name.endsWith('.yml');
const isFeed = (name) => /^latest(-[a-z0-9-]+)?\.yml$/.test(name);

const assets = readdirSync(assetsDir);
const versionDir = path.join(stagingDir, 'download', VERSION);
mkdirSync(versionDir, { recursive: true });
assets.filter(isInstaller).forEach((name) => copyFileSync(path.join(assetsDir, name), path.join(versionDir, name)));

// Every release reaches the beta feed, since a stable release is newer than the betas before it.
const isPrerelease = IS_PRERELEASE === 'true';
const channels = isPrerelease ? ['beta'] : ['beta', 'stable'];
const feeds = assets.filter(isFeed);
channels.forEach((channel) => {
  const feedDir = path.join(stagingDir, 'feed', channel);
  mkdirSync(feedDir, { recursive: true });
  feeds.forEach((name) => {
    const manifest = readFileSync(path.join(assetsDir, name), 'utf8');
    writeFileSync(path.join(feedDir, name), pointFeedAtDownloads(manifest, DOWNLOADS_ORIGIN, VERSION));
  });
});

const index = withRelease(await publishedIndex(), {
  version: VERSION,
  isPrerelease,
  publishedAt: PUBLISHED_AT,
  notes: NOTES_FILE && existsSync(NOTES_FILE) ? readFileSync(NOTES_FILE, 'utf8') : '',
  pageUrl: PAGE_URL ?? '',
});
// Read back through the same checks the app makes, so a missing page address is published as the default one.
const published = { releases: readReleasesIndex(index) };
writeFileSync(path.join(stagingDir, RELEASES_INDEX), `${JSON.stringify(published, null, 2)}\n`);
writeFileSync(path.join(stagingDir, 'keep.txt'), `${downloadsToKeep(published.releases).join('\n')}\n`);

console.log(
  `Staged ${VERSION} for ${channels.join(' and ')}: ${readdirSync(versionDir).length} installers, ${feeds.length} feeds.`,
);
