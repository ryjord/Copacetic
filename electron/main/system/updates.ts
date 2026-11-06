// Libs
import path from 'node:path';

// Utils
import { app } from '../engine/app';
import { net } from '../engine/requests';
import { loadAutoUpdater } from '../engine/updater';
import { isStoreBuild, shell } from '../engine/system';
import { compareVersions, isNewerVersion, parseVersion } from '../../shared/version';
import {
  DOWNLOADS_ORIGIN,
  type FeedChannel,
  RELEASES_INDEX,
  RELEASES_PAGE,
  type ReleaseEntry,
  downloadUrl,
  feedUrl,
  isOwnDownload,
  readReleasesIndex,
} from '../../shared/distribution/releases';
import { isThisCopySigned } from './code-signature';
import { t } from '../../shared/i18n/translate';
import { writeVerified } from './installer-download';
import { installerFor, plainReleaseNotes, readManifestFiles } from './update-manifest';

// Types
import type { UpdateChannel, UpdateDelivery, UpdateState, UpdateStatus } from '../../shared/types';

const INDEX_URL = `${DOWNLOADS_ORIGIN}/${RELEASES_INDEX}`;

export interface ReleaseFound {
  version: string;
  notes: string | null;
  pageUrl: string;
}

/** The newest release in the published index, a prerelease only when betas are wanted. */
export function newestRelease(index: readonly ReleaseEntry[], includesBetas: boolean): ReleaseFound | null {
  const newest = index
    .filter((release) => includesBetas || !release.isPrerelease)
    .filter((release) => parseVersion(release.version) !== null)
    .toSorted((aRelease, bRelease) => compareVersions(bRelease.version, aRelease.version))[0];
  return newest ? { version: newest.version, notes: plainReleaseNotes(newest.notes), pageUrl: newest.pageUrl } : null;
}

export function isBetaVersion(version: string): boolean {
  return (parseVersion(version)?.prerelease.length ?? 0) > 0;
}

/** Long enough that it is not a heartbeat, short enough to matter. */
export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** A check must never hang the settings panel waiting for a spinner. */
const REQUEST_TIMEOUT_MS = 10_000;

export interface DeliveryDescription {
  delivery: UpdateDelivery;
  /** Why this build cannot install its own updates, written for a person. */
  manualReason: string | null;
}

export interface DeliveryInputs {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  /** Set by the AppImage runtime, and only by it. */
  isAppImage: boolean;
  /** Installed from the Microsoft Store, which updates it. */
  isStoreBuild: boolean;
  /** Signed by its developer; macOS only lets such an app replace itself. */
  isSigned: boolean;
}

/** The whole platform decision, as a pure function so it can be tested for every combination rather than only the one this machine happens to be. */
export function describeDelivery({
  platform,
  isPackaged,
  isAppImage,
  isStoreBuild: fromStore,
  isSigned,
}: DeliveryInputs): DeliveryDescription {
  if (!isPackaged) {
    return { delivery: 'unsupported', manualReason: t('main.updates.manual.development') };
  }

  if (fromStore) {
    return { delivery: 'system', manualReason: t('main.updates.manual.store') };
  }

  if (platform === 'darwin' && !isSigned) {
    // macOS refuses to auto-update an unsigned app. Saying so is better than a button that fails.
    return {
      delivery: 'manual',
      manualReason: t('main.updates.manual.macos'),
    };
  }

  if (platform === 'linux' && !isAppImage) {
    // A .deb belongs to dpkg, so the app must never write over itself. The
    // package registers Copacetic's signed apt repository when it installs, so
    // the upgrade arrives the way every other upgrade on the machine does.
    return {
      delivery: 'system',
      manualReason: t('main.updates.manual.linuxPackage'),
    };
  }

  return { delivery: 'automatic', manualReason: null };
}

/** Keeps the app honest about whether it is out of date. */
export class UpdateManager {
  private status: UpdateStatus = { state: 'idle' };
  private lastCheckedAt: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;
  private isFetchingInstaller = false;
  private found: ReleaseFound | null = null;
  // A beta build is always offered newer betas: it was chosen by someone who wanted them.
  private includesBetas = isBetaVersion(app.getVersion());

  private delivery: UpdateDelivery;
  private manualReason: string | null;
  /** Settled once the signature is read; nothing checks before then, since the answer decides how. */
  private readonly described: Promise<void>;

  constructor(private readonly onChanged: () => void) {
    const inputs = {
      platform: process.platform,
      isPackaged: app.isPackaged,
      isAppImage: Boolean(process.env.APPIMAGE),
      isStoreBuild: isStoreBuild(),
    };
    // Unsigned until the signature says otherwise, so the pane never promises more than it can do.
    ({ delivery: this.delivery, manualReason: this.manualReason } = describeDelivery({ ...inputs, isSigned: false }));
    this.described = isThisCopySigned().then((isSigned) => {
      ({ delivery: this.delivery, manualReason: this.manualReason } = describeDelivery({ ...inputs, isSigned }));
      this.onChanged();
    });
  }

  private channel(): FeedChannel {
    return this.includesBetas ? 'beta' : 'stable';
  }

  getState(): UpdateState {
    return {
      status: this.status,
      delivery: this.delivery,
      manualReason: this.manualReason,
      lastCheckedAt: this.lastCheckedAt,
      releasesUrl: this.found?.pageUrl ?? RELEASES_PAGE,
      releaseNotes: this.found?.notes ?? null,
      currentVersion: app.getVersion(),
      includesBetas: this.includesBetas,
      canOpenInstaller: this.delivery === 'manual' && process.platform === 'darwin',
    };
  }

  setChannel(channel: UpdateChannel): void {
    this.includesBetas = channel === 'betas' || isBetaVersion(app.getVersion());
    this.onChanged();
  }

  /** Called once the window exists, and whenever the setting is turned on. */
  start(enabled: boolean): void {
    this.stop();
    if (!enabled || !app.isPackaged || isStoreBuild()) {
      return;
    }

    // Not on the very first tick: launch is busy enough without a network call.
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
    setTimeout(() => void this.check(), 8_000).unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = null;
  }

  async check(): Promise<void> {
    if (this.inFlight) {
      return;
    }
    this.inFlight = true;
    await this.described;
    // The Store updates its own copy, and a development build has nothing to update to.
    if (this.delivery === 'unsupported' || isStoreBuild()) {
      this.inFlight = false;
      return;
    }
    this.setStatus({ state: 'checking' });
    try {
      if (this.delivery === 'automatic') {
        await this.checkViaUpdater();
      } else {
        await this.checkViaIndex();
      }
    } catch (error) {
      this.setStatus({ state: 'error', message: messageFor(error) });
    } finally {
      this.inFlight = false;
      this.lastCheckedAt = Date.now();
      this.onChanged();
    }
  }

  /** The published list of releases, which says what is newest and what each one changed. */
  private async releasesIndex(): Promise<ReleaseEntry[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await net.fetch(INDEX_URL, { signal: controller.signal, headers: REQUEST_HEADERS() });
      if (!response.ok) {
        throw new Error(t('main.updates.serverAnswered', { status: response.status }));
      }
      return readReleasesIndex(await response.json());
    } finally {
      clearTimeout(timeout);
    }
  }

  // Read the published list and compare its newest release ourselves.
  private async checkViaIndex(): Promise<void> {
    const newest = newestRelease(await this.releasesIndex(), this.includesBetas);
    if (!newest) {
      throw new Error(t('main.updates.noReleases'));
    }
    const isNewer = isNewerVersion(newest.version, app.getVersion());
    this.found = isNewer ? newest : null;
    this.setStatus(isNewer ? { state: 'available', version: newest.version } : { state: 'current' });
  }

  private async checkViaUpdater(): Promise<void> {
    const autoUpdater = await loadAutoUpdater();
    // The bucket rather than the repository's releases, so updates work whatever the repository's visibility.
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl(DOWNLOADS_ORIGIN, this.channel()) });
    autoUpdater.autoDownload = true;
    autoUpdater.allowPrerelease = this.includesBetas;
    // Unsigned builds have only TLS and the feed's hash behind them, so nothing installs until someone presses Restart.
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.removeAllListeners();

    autoUpdater.on('update-available', (info: { version: string }) => {
      this.setStatus({ state: 'downloading', percent: 0 });
      void this.fetchNotes(stripV(info.version));
    });
    autoUpdater.on('update-not-available', () => this.setStatus({ state: 'current' }));
    autoUpdater.on('download-progress', (progress: { percent: number }) => {
      this.setStatus({ state: 'downloading', percent: Math.round(progress.percent) });
    });
    autoUpdater.on('update-downloaded', (info: { version: string }) => {
      this.setStatus({ state: 'ready', version: stripV(info.version) });
    });
    autoUpdater.on('error', (error: Error) => this.setStatus({ state: 'error', message: messageFor(error) }));

    await autoUpdater.checkForUpdates();
  }

  /** Restart into the downloaded update. Only ever reachable when one is ready. */
  async install(): Promise<void> {
    if (this.status.state !== 'ready' || this.delivery !== 'automatic') {
      return;
    }
    const autoUpdater = await loadAutoUpdater();
    autoUpdater.quitAndInstall();
  }

  /** The manual path: hand the release page to the system browser. */
  async openReleasesPage(): Promise<void> {
    await shell.openExternal(this.found?.pageUrl ?? RELEASES_PAGE);
  }

  // Best effort: an update with no notes is still an update.
  private async fetchNotes(version: string): Promise<void> {
    try {
      const entry = (await this.releasesIndex()).filter((release) => release.version === version);
      this.found = newestRelease(entry, true);
      this.onChanged();
    } catch {
      this.found = null;
    }
  }

  /**
   * The macOS installer for the release found, saved to Downloads and opened.
   * Checked against the SHA-512 in the release's own manifest before it is
   * opened: the build is not signed, so that hash is all that says the file
   * is the one that was published.
   */
  async downloadInstaller(): Promise<void> {
    // Marked at once: a second press while the manifest is still coming would write the same file twice over.
    if (this.isFetchingInstaller || this.status.state !== 'available' || !this.getState().canOpenInstaller) {
      return;
    }
    this.isFetchingInstaller = true;
    const { version } = this.status;
    try {
      const manifest = await net.fetch(`${feedUrl(DOWNLOADS_ORIGIN, this.channel())}latest-mac.yml`);
      if (!manifest.ok) {
        throw new Error(t('main.updates.serverAnswered', { status: manifest.status }));
      }
      const installer = installerFor(readManifestFiles(await manifest.text()), process.arch);
      if (!installer) {
        throw new Error(t('main.updates.noInstaller'));
      }
      // The feed names its installers by full address; one anywhere but Copacetic's own downloads is not fetched.
      const source = isOwnDownload(DOWNLOADS_ORIGIN, installer.url)
        ? installer.url
        : downloadUrl(DOWNLOADS_ORIGIN, version, installer.url);
      const target = path.join(app.getPath('downloads'), decodeURIComponent(path.basename(new URL(source).pathname)));
      await this.saveVerified(source, target, installer.sha512, installer.size);
      this.setStatus({ state: 'installerOpened', version });
      const problem = await shell.openPath(target);
      if (problem) {
        throw new Error(problem);
      }
    } catch (error) {
      this.setStatus({ state: 'error', message: messageFor(error) });
    } finally {
      this.isFetchingInstaller = false;
    }
  }

  private async saveVerified(url: string, target: string, sha512: string, size: number): Promise<void> {
    const response = await net.fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(t('main.updates.serverAnswered', { status: response.status }));
    }
    await writeVerified(response.body, target, { sha512, size }, (percent) => {
      // Once per percent: a status per chunk would push the whole state thousands of times.
      if (this.status.state !== 'downloading' || this.status.percent !== percent) {
        this.setStatus({ state: 'downloading', percent });
      }
    });
  }

  private setStatus(status: UpdateStatus): void {
    this.status = status;
    this.onChanged();
  }
}

const REQUEST_HEADERS = () => ({ 'user-agent': `Copacetic/${app.getVersion()}` });

function stripV(value: string): string {
  return value.replace(/^v/, '');
}

function messageFor(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return t('main.updates.timedOut');
  }
  if (error instanceof Error) {
    return error.message;
  }
  return t('main.updates.failed');
}
