// Libs
import { execFile } from 'node:child_process';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

// Utils
import { app } from '../engine/app';
import { shell } from '../engine/system';
import { type InstalledApp, appLinkFor } from '../../shared/data/installed-apps';
import { describeError, log } from './diagnostics';

const run = promisify(execFile);

// The folder macOS and Windows list the apps in, so Copacetic's are kept together and nothing else is touched.
const APPS_FOLDER = 'Copacetic Apps';

/** A name the file system takes on every platform: no separators, reserved marks or control characters. */
export function fileNameFor(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    // A leading dot hides a file on macOS and Linux, so none survive.
    .replace(/^[.\s]+/, '')
    .slice(0, 60)
    .trim();
  return cleaned || 'Copacetic app';
}

/** Where the shortcut for an app lives, for a home folder and an application data folder. */
export function shortcutPathFor(
  platform: string,
  installed: InstalledApp,
  folders: { home: string; appData: string },
): string | null {
  if (platform === 'darwin') {
    return path.join(folders.home, 'Applications', APPS_FOLDER, `${fileNameFor(installed.name)}.app`);
  }
  if (platform === 'win32') {
    return path.join(
      folders.appData,
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      APPS_FOLDER,
      `${fileNameFor(installed.name)}.lnk`,
    );
  }
  if (platform === 'linux') {
    return path.join(folders.home, '.local', 'share', 'applications', `copacetic-app-${installed.id}.desktop`);
  }
  return null;
}

// A desktop entry's quoted argument escapes these four, as the specification says.
const quoteForExec = (value: string) => `"${value.replace(/[\\"`$]/g, (mark) => `\\${mark}`)}"`;
const oneLine = (value: string) => value.replace(/[\r\n]+/g, ' ');

/** The Linux .desktop file: opens Copacetic with --app, so the app comes up in a window of its own. */
export function desktopEntryFor(installed: InstalledApp, executable: string, iconPath: string | null): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${oneLine(installed.name)}`,
    `Comment=${oneLine(installed.url)}, in Copacetic`,
    `Exec=${quoteForExec(executable)} --app=${installed.id}`,
    ...(iconPath ? [`Icon=${iconPath}`] : []),
    'Categories=Network;',
    'Terminal=false',
    '',
  ].join('\n');
}

const escapeXml = (value: string) =>
  value.replace(
    /[<>&'"]/g,
    (mark) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[mark] ?? mark,
  );

/** The two files of a macOS launcher: an Info.plist, and a script that opens the app's copacetic-app:// link. */
export function macLauncherFor(installed: InstalledApp, hasIcon: boolean): { plist: string; script: string } {
  // A bundle identifier takes letters, digits, - and . only.
  const bundleId = `uk.mrenigma.copacetic.app.${installed.id.replace(/[^A-Za-z0-9-]/g, '-')}`;
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundleIdentifier</key><string>${escapeXml(bundleId)}</string>
  <key>CFBundleName</key><string>${escapeXml(installed.name)}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  ${hasIcon ? '<key>CFBundleIconFile</key><string>icon</string>' : ''}
</dict>
</plist>
`;
  // The id is letters, digits, - and _ only, so the link needs no escaping in the script.
  const script = `#!/bin/sh\nexec /usr/bin/open '${appLinkFor(installed.id)}'\n`;
  return { plist, script };
}

function folders() {
  return { home: app.getPath('home'), appData: app.getPath('appData') };
}

/**
 * Writes the app's shortcut where the system lists apps, and resolves with
 * where it went, or null when it could not. `icon` is a PNG of the site's
 * icon, used where the platform can take one.
 */
export async function createShortcut(installed: InstalledApp, icon: Buffer | null): Promise<string | null> {
  const target = shortcutPathFor(process.platform, installed, folders());
  if (!target) {
    return null;
  }
  try {
    if (process.platform === 'darwin') {
      const contents = path.join(target, 'Contents');
      await mkdir(path.join(contents, 'MacOS'), { recursive: true });
      await mkdir(path.join(contents, 'Resources'), { recursive: true });
      const hasIcon = icon !== null && (await macIconFrom(icon, path.join(contents, 'Resources', 'icon.icns')));
      const { plist, script } = macLauncherFor(installed, hasIcon);
      await writeFile(path.join(contents, 'Info.plist'), plist);
      await writeFile(path.join(contents, 'MacOS', 'launch'), script);
      await chmod(path.join(contents, 'MacOS', 'launch'), 0o755);
    } else if (process.platform === 'win32') {
      await mkdir(path.dirname(target), { recursive: true });
      const isWritten = shell.writeShortcutLink(target, {
        target: process.execPath,
        args: `--app=${installed.id}`,
        description: installed.url,
      });
      if (!isWritten) {
        return null;
      }
    } else {
      await mkdir(path.dirname(target), { recursive: true });
      const iconPath = icon ? target.replace(/\.desktop$/, '.png') : null;
      if (icon && iconPath) {
        await writeFile(iconPath, icon);
      }
      // An AppImage runs from a mount that moves each launch; the variable names the file itself.
      const executable = process.env.APPIMAGE ?? process.execPath;
      await writeFile(target, desktopEntryFor(installed, executable, iconPath));
      await chmod(target, 0o755);
    }
    return target;
  } catch (error) {
    log.warn('could not write an app shortcut', describeError(error));
    return null;
  }
}

async function macIconFrom(png: Buffer, icnsPath: string): Promise<boolean> {
  const pngPath = icnsPath.replace(/\.icns$/, '.png');
  try {
    await writeFile(pngPath, png);
    await run('/usr/bin/sips', ['-s', 'format', 'icns', pngPath, '--out', icnsPath]);
    return true;
  } catch {
    return false;
  } finally {
    await rm(pngPath, { force: true });
  }
}

/** Removes only the app's own shortcut, and its icon beside it on Linux. */
export async function removeShortcut(installed: InstalledApp): Promise<void> {
  const target = shortcutPathFor(process.platform, installed, folders());
  if (!target) {
    return;
  }
  try {
    await rm(target, { recursive: process.platform === 'darwin', force: true });
    if (process.platform === 'linux') {
      await rm(target.replace(/\.desktop$/, '.png'), { force: true });
    }
  } catch (error) {
    log.warn('could not remove an app shortcut', describeError(error));
  }
}
