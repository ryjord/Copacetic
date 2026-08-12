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

export function preloadPath(): string {
  return path.join(__dirname, '..', 'preload', 'index.js');
}

/** The source icon, used only when running unpackaged. */
export function devIconPath(): string {
  return path.join(app.getAppPath(), 'build', 'icon.png');
}
