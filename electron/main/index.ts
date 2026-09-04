import { app, dialog, nativeImage } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Browser } from './app/browser';
import { showPageContextMenu } from './menus/context-menu';
import { devIconPath, isDevelopment } from './app/env';
import { registerIpcHandlers, removeIpcHandlers } from './app/ipc';
import { installApplicationMenu } from './menus/menu';
import { applyDnsSwitches, applyPrivacySwitches, readDnsPreference } from './app/command-line';
import { handleAppProtocol, registerAppProtocolScheme } from './security/protocol';
import { describeError, log, startDiagnostics } from './system/diagnostics';
import { allowLocalCertificates } from './security/local-certificates';
import { urlFromArguments } from './app/default-browser';
import { isPageNavigableUrl } from '../shared/url';

// Both must run before `app.ready`: Chromium reads its command line once, and
// the scheme has to be registered to be treated as a real, secure origin.
applyPrivacySwitches(app.commandLine);
applyDnsSwitches(
  app.commandLine,
  readDnsPreference(path.join(app.getPath('userData'), 'settings.json'), (file) => readFileSync(file, 'utf8')),
);
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

let browser: Browser | null = null;

async function start(): Promise<void> {
  app.setName('Copacetic');
  applyDevelopmentIcon();

  // Held when an address arrives before there is anywhere to put it, which on
  // macOS is the ordinary case: the event fires while the app is still starting.
  let pendingUrl: string | null = null;

  const openUrl = (url: string) => {
    // macOS keeps the app alive with no window, and this arrives regardless.
    if (browser && !browser.window.isDestroyed()) {
      browser.tabs.create(url, { activate: true });
      browser.window.focus();
    } else {
      pendingUrl = url;
    }
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
    if (browser && !browser.window.isDestroyed()) {
      if (browser.window.isMinimized()) {
        browser.window.restore();
      }
      browser.window.focus();
    }
    // Through the same path as every other address, which holds it when there
    // is nowhere to put it yet. Opening a link while this app is still starting
    // used to drop it silently — the second copy exits, the first has no window
    // yet, and the address is gone.
    if (url) {
      openUrl(url);
    }
  });

  await app.whenReady();
  // Before anything else that can fail, so that when it does there is a record.
  startDiagnostics(app.getPath('userData'));
  allowLocalCertificates();
  log.info('started', { version: app.getVersion(), platform: process.platform, electron: process.versions.electron });
  handleAppProtocol();

  await openWindow();

  // Cold start: the address is either on the command line, or was handed over
  // by the system before there was a window to put it in.
  const requested = pendingUrl ?? urlFromArguments(process.argv);
  pendingUrl = null;
  if (requested) {
    openUrl(requested);
  }

  app.on('activate', () => {
    if (browser && !browser.window.isDestroyed()) {
      browser.window.show();
      return;
    }
    // macOS keeps an application running after its last window closes, and
    // clicking the dock icon is how a person asks for it back. Returning early
    // here left the app alive with no window and no way to open one — running,
    // in the dock, and unusable until it was force-quit.
    void openWindow().catch((error: unknown) => {
      log.error('could not reopen the window', describeError(error));
      dialog.showErrorBox('Copacetic could not open a window', sentenceFor(error));
    });
  });
}

/**
 * Builds the window and everything wired to it.
 *
 * Written once because it happens twice: at startup, and again when someone
 * clicks the dock icon of an application whose last window they closed.
 */
async function openWindow(): Promise<void> {
  // Registered against the previous window otherwise, which is gone.
  removeIpcHandlers();

  browser = new Browser();
  browser.tabs.onPageContextMenu((tabId, params) => {
    if (browser) {
      showPageContextMenu(browser, tabId, params);
    }
  });
  registerIpcHandlers(browser);
  installApplicationMenu(browser);

  await browser.start();
}

app.on('window-all-closed', () => {
  // macOS apps conventionally stay running with no windows; everywhere else,
  // closing the last window means quit.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  browser?.prepareForQuit();
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
      browser?.prepareForQuit();
    } finally {
      app.exit(0);
    }
  });
}

app.on('will-quit', () => {
  removeIpcHandlers();
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
