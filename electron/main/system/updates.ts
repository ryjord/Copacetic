import { app, net, shell } from 'electron';
import type { UpdateDelivery, UpdateState, UpdateStatus } from '../../shared/types';
import { isNewerVersion } from '../../shared/version';

const REPO = 'ryjord/Copacetic';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;

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
    return { delivery: 'unsupported', manualReason: 'This is a development build, so there is nothing to update.' };
  }

  if (platform === 'darwin') {
    // macOS refuses to auto-update an unsigned app, and signing needs a paid
    // Apple Developer account. Saying so is better than a button that fails.
    return {
      delivery: 'manual',
      manualReason:
        'Copacetic for macOS is not code-signed, so it cannot install updates itself. New versions have to be downloaded and replaced by hand.',
    };
  }

  if (platform === 'linux' && !isAppImage) {
    // A .deb belongs to dpkg, so the app must never write over itself. The
    // package registers Copacetic's signed apt repository when it installs, so
    // the upgrade arrives the way every other upgrade on the machine does.
    return {
      delivery: 'system',
      manualReason:
        'Your package manager installs updates for this build. Copacetic adds its own signed apt repository, so new versions arrive with a normal system update.',
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
      releasesUrl: RELEASES_URL,
    };
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
      const response = await net.fetch(LATEST_API, {
        signal: controller.signal,
        headers: { accept: 'application/vnd.github+json', 'user-agent': `Copacetic/${app.getVersion()}` },
      });
      if (!response.ok) {
        throw new Error(`GitHub answered ${response.status}`);
      }

      const payload: unknown = await response.json();
      const tag = readTag(payload);
      if (!tag) {
        throw new Error('That release has no version tag.');
      }

      this.setStatus(
        isNewerVersion(tag, app.getVersion()) ? { state: 'available', version: stripV(tag) } : { state: 'current' },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async checkViaUpdater(): Promise<void> {
    const autoUpdater = await loadAutoUpdater();
    autoUpdater.autoDownload = true;
    // The app applies it on quit rather than restarting underneath someone.
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.removeAllListeners();

    autoUpdater.on('update-available', (info: { version: string }) => {
      this.setStatus({ state: 'downloading', percent: 0 });
      void info;
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
    await shell.openExternal(RELEASES_URL);
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
    throw new Error('The updater could not be loaded.');
  }
  return updater as AutoUpdaterLike;
}

/** Only the parts of the updater this file touches. */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  removeAllListeners(): void;
  on(event: string, listener: (...args: never[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
}

async function loadAutoUpdater(): Promise<AutoUpdaterLike> {
  return pickAutoUpdater(await import('electron-updater'));
}

function stripV(value: string): string {
  return value.replace(/^v/, '');
}

function readTag(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const tag = (payload as { tag_name?: unknown }).tag_name;
  return typeof tag === 'string' && tag.length > 0 ? tag : null;
}

function messageFor(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'The check timed out.';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'The check failed.';
}
