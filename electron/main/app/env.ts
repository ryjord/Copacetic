import { app } from 'electron';
import path from 'node:path';

/** Custom scheme the packaged renderer is served from. */
export const APP_SCHEME = 'copacetic-app';
export const APP_HOST = 'chrome';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

export const DEV_SERVER_ORIGIN = 'http://localhost:3000';

export function isDevelopment(): boolean {
  return !app.isPackaged && process.env.NODE_ENV !== 'production';
}

/** Where the chrome window loads its document from. */
export function chromeEntryUrl(): string {
  return isDevelopment() ? `${DEV_SERVER_ORIGIN}/` : `${APP_ORIGIN}/`;
}

/** Root of the exported Next build, used by the custom protocol handler. */
export function rendererRoot(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'app.asar', 'out') : path.join(app.getAppPath(), 'out');
}

/**
 * Where the filter lists live once built.
 *
 * Packaged, they sit inside the asar next to the rest of the main process; in
 * development they sit in dist, which is where the build put them.
 */
export function filtersRoot(): string {
  return path.join(app.getAppPath(), 'dist', 'electron', 'filters');
}

export function preloadPath(): string {
  // From the app root rather than by counting `../` off __dirname, so moving
  // this file between folders cannot quietly break the preload path.
  return path.join(app.getAppPath(), 'dist', 'electron', 'preload', 'index.js');
}

/** The source icon, used only when running unpackaged. */
export function devIconPath(): string {
  return path.join(app.getAppPath(), 'build', 'icon.png');
}
