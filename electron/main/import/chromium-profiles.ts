// Libs
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Utils
import { isRecord } from '../data/persistence';

// Types
import type { ImportSource } from '../../shared/types';

interface ChromiumBrowser {
  id: string;
  name: string;
  /** Where it keeps its profiles, under each platform's application data folder; absent where it does not run. */
  folders: Partial<Record<NodeJS.Platform, readonly string[]>>;
}

const CHROMIUM_BROWSERS: readonly ChromiumBrowser[] = [
  {
    id: 'chrome',
    name: 'Google Chrome',
    folders: {
      darwin: ['Google', 'Chrome'],
      win32: ['Google', 'Chrome', 'User Data'],
      linux: ['google-chrome'],
    },
  },
  {
    id: 'brave',
    name: 'Brave',
    folders: {
      darwin: ['BraveSoftware', 'Brave-Browser'],
      win32: ['BraveSoftware', 'Brave-Browser', 'User Data'],
      linux: ['BraveSoftware', 'Brave-Browser'],
    },
  },
  {
    id: 'edge',
    name: 'Microsoft Edge',
    folders: { darwin: ['Microsoft Edge'], win32: ['Microsoft', 'Edge', 'User Data'], linux: ['microsoft-edge'] },
  },
  {
    id: 'vivaldi',
    name: 'Vivaldi',
    folders: { darwin: ['Vivaldi'], win32: ['Vivaldi', 'User Data'], linux: ['vivaldi'] },
  },
  {
    id: 'chromium',
    name: 'Chromium',
    folders: { darwin: ['Chromium'], win32: ['Chromium', 'User Data'], linux: ['chromium'] },
  },
  { id: 'arc', name: 'Arc', folders: { darwin: ['Arc', 'User Data'] } },
];

/** A profile found on disk. The directory never leaves the main process; the renderer names a source by id. */
export interface ChromiumProfile extends ImportSource {
  directory: string;
}

export interface Machine {
  platform: NodeJS.Platform;
  home: string;
  env: NodeJS.ProcessEnv;
}

function applicationDataFolder(machine: Machine): string | null {
  if (machine.platform === 'darwin') {
    return path.join(machine.home, 'Library', 'Application Support');
  }
  if (machine.platform === 'win32') {
    return machine.env.LOCALAPPDATA ?? null;
  }
  return machine.env.XDG_CONFIG_HOME ?? path.join(machine.home, '.config');
}

/** The names people gave their profiles, which the folders themselves do not carry. */
function profileNames(root: string): Record<string, string> {
  try {
    const localState: unknown = JSON.parse(readFileSync(path.join(root, 'Local State'), 'utf8'));
    const cache = isRecord(localState) && isRecord(localState.profile) ? localState.profile.info_cache : null;
    if (!isRecord(cache)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(cache)
        .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
        .filter(([, info]) => typeof info.name === 'string')
        .map(([directory, info]) => [directory, String(info.name)]),
    );
  } catch {
    return {};
  }
}

const defaultFirst = (directory: string) => (directory === 'Default' ? 0 : 1);

function profilesIn(browser: ChromiumBrowser, root: string): ChromiumProfile[] {
  const names = profileNames(root);
  const directories = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => ['Bookmarks', 'History'].some((file) => existsSync(path.join(root, name, file))))
    .sort((aName, bName) => defaultFirst(aName) - defaultFirst(bName) || aName.localeCompare(bName));
  return directories.map((directory) => ({
    id: `${browser.id}:${directory}`,
    label: directories.length > 1 ? `${browser.name} (${names[directory] ?? directory})` : browser.name,
    directory: path.join(root, directory),
  }));
}

/** Every Chromium-family profile on this computer with bookmarks or history to bring in. */
export function findChromiumProfiles(machine: Machine): ChromiumProfile[] {
  const base = applicationDataFolder(machine);
  if (!base) {
    return [];
  }
  return CHROMIUM_BROWSERS.flatMap((browser) => {
    const folder = browser.folders[machine.platform];
    const root = folder ? path.join(base, ...folder) : null;
    return root && existsSync(root) ? profilesIn(browser, root) : [];
  });
}
