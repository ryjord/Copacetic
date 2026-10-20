// Libs
import { app, net, shell } from 'electron';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';

// Utils
import { compareVersions, isNewerVersion, parseVersion } from '../../shared/version';
import { t } from '../../shared/i18n/translate';
import { installerFor, plainReleaseNotes, readManifestFiles } from './update-manifest';

// Types
import type { UpdateChannel, UpdateDelivery, UpdateState, UpdateStatus } from '../../shared/types';

const REPO = 'ryjord/Copacetic';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
// The latest-release endpoint skips prereleases, so a beta build would never hear of the next beta from it.
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=20`;
const releaseApiFor = (version: string) => `https://api.github.com/repos/${REPO}/releases/tags/v${version}`;
const downloadUrlFor = (version: string, file: string) =>
  `https://github.com/${REPO}/releases/download/v${version}/${encodeURIComponent(file)}`;

export interface ReleaseFound {
  version: string;
  notes: string | null;
  pageUrl: string;
}

function readRelease(entry: unknown): (ReleaseFound & { isPrerelease: boolean; isDraft: boolean }) | null {
  if (typeof entry !== 'object' || entry === null) {
    return null;
  }
  const { tag_name: tag, body, html_url: pageUrl, prerelease, draft } = entry as Record<string, unknown>;
  if (typeof tag !== 'string' || !parseVersion(tag)) {
    return null;
  }
  return {
    version: stripV(tag),
    notes: typeof body === 'string' ? plainReleaseNotes(body) : null,
    pageUrl: typeof pageUrl === 'string' && pageUrl.startsWith('https://github.com/') ? pageUrl : RELEASES_URL,
    isPrerelease: prerelease === true,
    isDraft: draft === true,
  };
}

/** The newest release in GitHub's list, a prerelease only when betas are wanted, and never a draft. */
export function newestRelease(payload: unknown, includesBetas: boolean): ReleaseFound | null {
  const releases = (Array.isArray(payload) ? payload : [payload])
    .map(readRelease)
    .filter((release) => release !== null)
    .filter((release) => !release.isDraft && (includesBetas || !release.isPrerelease))
    .toSorted((aRelease, bRelease) => compareVersions(bRelease.version, aRelease.version));
  const newest = releases[0];
  return newest ? { version: newest.version, notes: newest.notes, pageUrl: newest.pageUrl } : null;
}

export function isBetaVersion(version: string): boolean {
  return (parseVersion(version)?.prerelease.length ?? 0) > 0;
}

/** Long enough that it is not a heartbeat, short enough to matter. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
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
}

/** The whole platform decision, as a pure function so it can be tested for every combination rather than only the one this machine happens to be. */
export function describeDelivery({ platform, isPackaged, isAppImage }: DeliveryInputs): DeliveryDescription {
  if (!isPackaged) {
    return { delivery: 'unsupported', manualReason: t('main.updates.manual.development') };
  }

  if (platform === 'darwin') {
    // macOS refuses to auto-update an unsigned app, and signing needs a paid
    // Apple Developer account. Saying so is better than a button that fails.
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
  private found: ReleaseFound | null = null;
  // A beta build is always offered newer betas: it was chosen by someone who wanted them.
  private includesBetas = isBetaVersion(app.getVersion());

  private readonly delivery: UpdateDelivery;
  private readonly manualReason: string | null;

  constructor(private readonly onChanged: () => void) {
    const described = describeDelivery({
      platform: process.platform,
      isPackaged: app.isPackaged,
      isAppImage: Boolean(process.env.APPIMAGE),
    });
    this.delivery = described.delivery;
    this.manualReason = described.manualReason;
  }

  getState(): UpdateState {
    return {
      status: this.status,
      delivery: this.delivery,
      manualReason: this.manualReason,
      lastCheckedAt: this.lastCheckedAt,
      releasesUrl: this.found?.pageUrl ?? RELEASES_URL,
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
    if (!enabled || this.delivery === 'unsupported') {
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
    if (this.inFlight || this.delivery === 'unsupported') {
      return;
    }
    this.inFlight = true;
    this.setStatus({ state: 'checking' });

    try {
      if (this.delivery === 'automatic') {
        await this.checkViaUpdater();
      } else {
        await this.checkViaGitHub();
      }
    } catch (error) {
      this.setStatus({ state: 'error', message: messageFor(error) });
    } finally {
      this.inFlight = false;
      this.lastCheckedAt = Date.now();
      this.onChanged();
    }
  }

  // Ask GitHub for the latest tag and compare it ourselves.
  private async checkViaGitHub(): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await net.fetch(this.includesBetas ? RELEASES_API : LATEST_API, {
        signal: controller.signal,
        headers: GITHUB_HEADERS(),
      });
      if (!response.ok) {
        throw new Error(t('main.updates.githubAnswered', { status: response.status }));
      }

      const newest = newestRelease(await response.json(), this.includesBetas);
      if (!newest) {
        throw new Error(t('main.updates.noVersionTag'));
      }

      const isNewer = isNewerVersion(newest.version, app.getVersion());
      this.found = isNewer ? newest : null;
      this.setStatus(isNewer ? { state: 'available', version: newest.version } : { state: 'current' });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async checkViaUpdater(): Promise<void> {
    const autoUpdater = await loadAutoUpdater();
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
    await shell.openExternal(this.found?.pageUrl ?? RELEASES_URL);
  }

  // Best effort: an update with no notes is still an update.
  private async fetchNotes(version: string): Promise<void> {
    try {
      const response = await net.fetch(releaseApiFor(version), { headers: GITHUB_HEADERS() });
      this.found = response.ok ? newestRelease(await response.json(), true) : null;
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
    if (this.status.state !== 'available' || !this.getState().canOpenInstaller) {
      return;
    }
    const { version } = this.status;
    try {
      const manifest = await net.fetch(downloadUrlFor(version, 'latest-mac.yml'));
      if (!manifest.ok) {
        throw new Error(t('main.updates.githubAnswered', { status: manifest.status }));
      }
      const installer = installerFor(readManifestFiles(await manifest.text()), process.arch);
      if (!installer) {
        throw new Error(t('main.updates.noInstaller'));
      }
      const target = path.join(app.getPath('downloads'), path.basename(installer.url));
      await this.saveVerified(downloadUrlFor(version, installer.url), target, installer.sha512, installer.size);
      this.setStatus({ state: 'installerOpened', version });
      const problem = await shell.openPath(target);
      if (problem) {
        throw new Error(problem);
      }
    } catch (error) {
      this.setStatus({ state: 'error', message: messageFor(error) });
    }
  }

  private async saveVerified(url: string, target: string, sha512: string, size: number): Promise<void> {
    const response = await net.fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(t('main.updates.githubAnswered', { status: response.status }));
    }
    const hash = createHash('sha512');
    const file = createWriteStream(target);
    const reader = response.body.getReader();
    let received = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        hash.update(value);
        received += value.length;
        if (!file.write(value)) {
          await new Promise<void>((resolve) => file.once('drain', () => resolve()));
        }
        const percent = Math.min(100, Math.round((received / size) * 100));
        // Once per percent: a status per chunk would push the whole state thousands of times.
        if (this.status.state !== 'downloading' || this.status.percent !== percent) {
          this.setStatus({ state: 'downloading', percent });
        }
      }
      await new Promise<void>((resolve, reject) =>
        file.end((error?: Error | null) => (error ? reject(error) : resolve())),
      );
    } catch (error) {
      file.destroy();
      await rm(target, { force: true });
      throw error;
    }
    if (hash.digest('base64') !== sha512) {
      await rm(target, { force: true });
      throw new Error(t('main.updates.installerMismatch'));
    }
  }

  private setStatus(status: UpdateStatus): void {
    this.status = status;
    this.onChanged();
  }
}

/** The updater, from whichever shape the import gives back. */
export function pickAutoUpdater(imported: unknown): AutoUpdaterLike {
  const namespace = imported as { autoUpdater?: unknown; default?: { autoUpdater?: unknown } };
  const updater = namespace.autoUpdater ?? namespace.default?.autoUpdater;
  if (!updater || typeof updater !== 'object') {
    throw new Error(t('main.updates.loadFailed'));
  }
  return updater as AutoUpdaterLike;
}

/** Only the parts of the updater this file touches. */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  allowPrerelease: boolean;
  autoInstallOnAppQuit: boolean;
  removeAllListeners(): void;
  on(event: string, listener: (...args: never[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
}

async function loadAutoUpdater(): Promise<AutoUpdaterLike> {
  return pickAutoUpdater(await import('electron-updater'));
}

const GITHUB_HEADERS = () => ({
  accept: 'application/vnd.github+json',
  'user-agent': `Copacetic/${app.getVersion()}`,
});

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
