import { app, dialog, nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { Profile } from './app/profile';
import { devIconPath, isDevelopment } from './app/env';
import { registerIpcHandlers, removeIpcHandlers } from './app/ipc';
import { installApplicationMenu } from './menus/menu';
import { applyPrivacySwitches } from './system/command-line';
import { handleAppProtocol, registerAppProtocolScheme } from './security/protocol';
import { describeError, log, startDiagnostics } from './system/diagnostics';
import { applyLaunchMode } from './system/launch-mode';
import { markQuit, markRunning } from './system/exit-marker';
import { watchCertificateErrors } from './security/certificate-exceptions';
import { urlFromArguments } from './system/default-browser';
import { isPageNavigableUrl } from '../shared/url';
import { FIRST_PROFILE_ID } from '../shared/partitions';

// Both must run before `app.ready`: Chromium reads its command line once, and
// the scheme has to be registered to be treated as a real, secure origin.
applyPrivacySwitches(app.commandLine);
registerAppProtocolScheme();

// A browser with two copies of itself running would fight over the session
// directory and the saved tab list. Hand the argument to the running instance.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // A rejected start used to disappear: no window, no message, no log line, and
  // an application in the dock doing nothing. Whatever failed is written down
  // and said out loud, because a browser that will not open is the one failure
  // nobody can work around.
  start().catch((error: unknown) => {
    console.error('[copacetic] failed to start', error);
    log.error('failed to start', describeError(error));
    dialog.showErrorBox('Copacetic could not start', sentenceFor(error));
    app.exit(1);
  });
}

/** What to put in front of a person when something failed before they could act. */
function sentenceFor(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() || 'Something went wrong, and the diagnostics log says what.';
}

// One for the life of the app; windows come and go inside it.
let profile: Profile | null = null;

async function start(): Promise<void> {
  app.setName('Copacetic');
  applyDevelopmentIcon();

  // Held when an address arrives before there is anywhere to put it, which on
  // macOS is the ordinary case: the event fires while the app is still starting.
  let pendingUrl: string | null = null;

  const openUrl = (url: string) => {
    if (!profile) {
      pendingUrl = url;
      return;
    }
    // macOS keeps the app alive with no window, and this arrives regardless, so it may need one.
    void profile.focusedOrNew().then((browser) => {
      browser.tabs.create(url, { activate: true });
      browser.window.focus();
    });
  };

  // macOS never puts the address on the command line; it sends this instead.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (isPageNavigableUrl(url)) {
      openUrl(url);
    }
  });

  app.on('second-instance', (_event, argv) => {
    const url = urlFromArguments(argv);
    const browser = profile?.focused();
    if (browser) {
      if (browser.window.isMinimized()) {
        browser.window.restore();
      }
      browser.window.focus();
    }
    // Through the same path as every other address, which holds it when there
    // is nowhere to put it yet. Opening a link while this app is still starting
    // used to drop it silently - the second copy exits, the first has no window
    // yet, and the address is gone.
    if (url) {
      openUrl(url);
    }
  });

  await app.whenReady();
  applyLaunchMode();
  // Before anything else that can fail, so that when it does there is a record.
  startDiagnostics(app.getPath('userData'));
  watchCertificateErrors();
  log.info('started', { version: app.getVersion(), platform: process.platform, electron: process.versions.electron });
  handleAppProtocol();

  const didLastRunEndBadly = markRunning(app.getPath('userData'));
  profile = new Profile(FIRST_PROFILE_ID, app.getPath('userData'));
  registerIpcHandlers(profile);
  installApplicationMenu(profile);
  profile.start();
  await profile.restoreWindows(didLastRunEndBadly);

  // Cold start: the address is either on the command line, or was handed over
  // by the system before there was a window to put it in.
  const requested = pendingUrl ?? urlFromArguments(process.argv);
  pendingUrl = null;
  if (requested) {
    openUrl(requested);
  }

  app.on('activate', () => {
    if (!profile || profile.allWindows().length > 0) {
      return;
    }
    // macOS keeps an application running after its last window closes, and
    // clicking the dock icon is how a person asks for it back. Returning early
    // here left the app alive with no window and no way to open one - running,
    // in the dock, and unusable until it was force-quit.
    void profile.openWindow().catch((error: unknown) => {
      log.error('could not reopen the window', describeError(error));
      dialog.showErrorBox('Copacetic could not open a window', sentenceFor(error));
    });
  });
}

app.on('window-all-closed', () => {
  // macOS apps conventionally stay running with no windows; everywhere else,
  // closing the last window means quit.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  profile?.prepareForQuit();
});

/**
 * Logging out, shutting down, or being killed is still a quit.
 *
 * Every store writes on a debounce, so at any moment there is up to a second of
 * browsing that exists only in memory: the tabs that were open, the last few
 * pages visited, a download that had just finished.
 *
 * Measured rather than assumed: on macOS, Electron already runs its own quit
 * path for SIGTERM, so `before-quit` fires and this changes nothing there.
 * Removing it leaves the durability spec passing. It is kept for SIGINT and
 * SIGHUP, and for the platforms where that is not true, and the flush is
 * synchronous because asking the app to quit and hoping the normal path wins is
 * a race against an operating system that is already closing the process.
 */
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    try {
      profile?.prepareForQuit();
      markQuit(app.getPath('userData'));
    } finally {
      app.exit(0);
    }
  });
}

app.on('will-quit', () => {
  removeIpcHandlers();
  // Only once there is a profile: a second copy that quits at once must not clear the first one's mark.
  if (profile) {
    markQuit(app.getPath('userData'));
  }
});

// Unpackaged runs have no bundle for macOS to read an icon out of, so the dock falls back to the Electron atom.
function applyDevelopmentIcon(): void {
  if (!isDevelopment() || process.platform !== 'darwin') {
    return;
  }
  const iconPath = devIconPath();
  if (!existsSync(iconPath)) {
    return;
  }

  const icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) {
    app.dock?.setIcon(icon);
  }
}

process.on('uncaughtException', (error) => {
  console.error('[copacetic] uncaught exception in the main process', error);
  log.error('uncaught exception in the main process', describeError(error));
  if (isDevelopment()) {
    throw error;
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('[copacetic] unhandled rejection in the main process', reason);
  log.error('unhandled rejection in the main process', describeError(reason));
});
