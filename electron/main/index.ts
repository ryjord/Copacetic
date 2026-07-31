import { app, nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { Browser } from './browser';
import { showPageContextMenu } from './context-menu';
import { devIconPath, isDevelopment } from './env';
import { registerIpcHandlers, removeIpcHandlers } from './ipc';
import { installApplicationMenu } from './menu';
import { handleAppProtocol, registerAppProtocolScheme } from './protocol';

// Must run before `app.ready`, or the scheme will not be treated as a real,
// secure origin and the chrome loses storage and fetch.
registerAppProtocolScheme();

// A browser with two copies of itself running would fight over the session
// directory and the saved tab list. Hand the argument to the running instance.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void start();
}

let browser: Browser | null = null;

async function start(): Promise<void> {
  app.setName('Copacetic');
  applyDevelopmentIcon();

  app.on('second-instance', (_event, argv) => {
    if (!browser) return;
    if (browser.window.isMinimized()) browser.window.restore();
    browser.window.focus();
    const url = argv.find((argument) => argument.startsWith('http://') || argument.startsWith('https://'));
    if (url) browser.tabs.create(url, { activate: true });
  });

  await app.whenReady();
  handleAppProtocol();

  browser = new Browser();
  browser.tabs.onPageContextMenu((tabId, params) => {
    if (browser) showPageContextMenu(browser, tabId, params);
  });
  registerIpcHandlers(browser);
  installApplicationMenu(browser);

  await browser.start();

  app.on('activate', () => {
    if (!browser) return;
    if (browser.window.isDestroyed()) return;
    browser.window.show();
  });
}

app.on('window-all-closed', () => {
  // macOS apps conventionally stay running with no windows; everywhere else,
  // closing the last window means quit.
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  browser?.prepareForQuit();
});

app.on('will-quit', () => {
  removeIpcHandlers();
});

/**
 * Unpackaged runs have no bundle for macOS to read an icon out of, so the dock
 * falls back to the Electron atom. Setting it explicitly means development
 * looks like the thing being built.
 */
function applyDevelopmentIcon(): void {
  if (!isDevelopment() || process.platform !== 'darwin') return;
  const iconPath = devIconPath();
  if (!existsSync(iconPath)) return;

  const icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) app.dock?.setIcon(icon);
}

process.on('uncaughtException', (error) => {
  console.error('[copacetic] uncaught exception in the main process', error);
  if (isDevelopment()) throw error;
});

process.on('unhandledRejection', (reason) => {
  console.error('[copacetic] unhandled rejection in the main process', reason);
});
