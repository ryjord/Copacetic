// Utils
import { t } from '../../shared/i18n/translate';

/** Only the parts of the updater Copacetic touches. */
export interface AutoUpdaterLike {
  autoDownload: boolean;
  allowPrerelease: boolean;
  autoInstallOnAppQuit: boolean;
  removeAllListeners(): void;
  on(event: string, listener: (...args: never[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  quitAndInstall(): void;
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

/** Loaded on first use, so a build that never updates itself never loads it. */
export async function loadAutoUpdater(): Promise<AutoUpdaterLike> {
  return pickAutoUpdater(await import('electron-updater'));
}
