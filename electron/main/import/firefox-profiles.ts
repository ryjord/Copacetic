import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Machine } from './chromium-profiles';
import type { ImportSource } from '../../shared/types';
import { t } from '../../shared/i18n/translate';

/** A Firefox profile found on disk. As with Chromium, the directory never leaves the main process. */
export interface FirefoxProfile extends ImportSource {
  directory: string;
}

/** Where Firefox keeps `profiles.ini`: the usual install, and on Linux the Snap and Flatpak ones too. */
function firefoxRoots(machine: Machine): string[] {
  if (machine.platform === 'darwin') {
    return [path.join(machine.home, 'Library', 'Application Support', 'Firefox')];
  }
  if (machine.platform === 'win32') {
    return machine.env.APPDATA ? [path.join(machine.env.APPDATA, 'Mozilla', 'Firefox')] : [];
  }
  return [
    path.join(machine.home, '.mozilla', 'firefox'),
    path.join(machine.home, 'snap', 'firefox', 'common', '.mozilla', 'firefox'),
    path.join(machine.home, '.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox'),
  ];
}

/** The `[Profile…]` sections of `profiles.ini`, each a set of keys. Anything else in the file is ignored. */
export function profileSections(ini: string): Record<string, string>[] {
  const sections: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  ini.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    const heading = /^\[(.+)\]$/.exec(line);
    if (heading) {
      current = /^Profile\d+$/.test(heading[1] ?? '') ? {} : null;
      if (current) {
        sections.push(current);
      }
      return;
    }
    const separator = line.indexOf('=');
    if (current && separator > 0) {
      current[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  });
  return sections;
}

/** Every Firefox profile on this computer with a places database to bring in. */
export function findFirefoxProfiles(machine: Machine): FirefoxProfile[] {
  const found = firefoxRoots(machine).flatMap((root) => {
    const ini = path.join(root, 'profiles.ini');
    if (!existsSync(ini)) {
      return [];
    }
    let sections: Record<string, string>[];
    try {
      sections = profileSections(readFileSync(ini, 'utf8'));
    } catch {
      return [];
    }
    return sections
      .filter((section) => section.Path)
      .map((section) => ({
        name: section.Name || t('main.import.firefox.defaultProfile'),
        directory: section.IsRelative === '0' ? (section.Path ?? '') : path.join(root, section.Path ?? ''),
      }))
      .filter((profile) => existsSync(path.join(profile.directory, 'places.sqlite')));
  });
  return found.map((profile) => ({
    id: `firefox:${path.basename(profile.directory)}`,
    label: found.length > 1 ? `Firefox (${profile.name})` : 'Firefox',
    directory: profile.directory,
  }));
}
