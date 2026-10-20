// Libs
import { app, shell } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Utils
import { t } from '../../shared/i18n/translate';

const FILE = 'LICENSES.chromium.html';

/**
 * Where the page is: beside the executable on Windows and Linux, where
 * electron-builder leaves it; in Resources on macOS, where the build puts it;
 * in the Electron download when running from source.
 */
export function chromiumLicencesCandidates(execPath: string, resourcesPath: string, appPath: string): string[] {
  return [
    path.join(path.dirname(execPath), FILE),
    path.join(resourcesPath, FILE),
    path.join(appPath, 'node_modules', 'electron', 'dist', FILE),
  ];
}

export async function openChromiumLicences(): Promise<string> {
  const found = chromiumLicencesCandidates(process.execPath, process.resourcesPath, app.getAppPath()).find((file) =>
    existsSync(file),
  );
  if (!found) {
    return t('main.chromiumLicences.missing');
  }
  return shell.openPath(found);
}
