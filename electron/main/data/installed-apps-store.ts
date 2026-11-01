// Utils
import { PersistedFile, asNumber, asString, isRecord, newId } from './persistence';
import { type InstalledApp, isAppId } from '../../shared/data/installed-apps';
import { isPageNavigableUrl, isWebUrl, siteOfUrl } from '../../shared/browsing/url';

function reviveApps(raw: unknown): InstalledApp[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  return raw.filter(isRecord).flatMap((entry): InstalledApp[] => {
    const id = asString(entry.id);
    const url = asString(entry.url);
    return isAppId(id) && isPageNavigableUrl(url)
      ? [{ id, name: asString(entry.name) || url, url, createdAt: asNumber(entry.createdAt) }]
      : [];
  });
}

// Longer than a site's name needs to be, so a page title cannot make a shortcut name unwieldy.
const LONGEST_NAME = 60;

/** The sites installed as apps in one profile, in apps.json. */
export class InstalledApps {
  private readonly file: PersistedFile<InstalledApp[]>;

  constructor(
    directory: string,
    private readonly now: () => number = Date.now,
  ) {
    this.file = new PersistedFile<InstalledApp[]>('apps.json', () => [], reviveApps, { directory });
  }

  list(): InstalledApp[] {
    return this.file.get();
  }

  get(id: string): InstalledApp | null {
    return this.file.get().find((installed) => installed.id === id) ?? null;
  }

  /** The app for this address's site if there is one already, rather than a second of the same. */
  install(name: string, url: string): InstalledApp | null {
    if (!isWebUrl(url)) {
      return null;
    }
    const existing = this.file.get().find((installed) => siteOfUrl(installed.url) === siteOfUrl(url));
    if (existing) {
      return existing;
    }
    const installed = {
      id: newId(),
      name: name.trim().slice(0, LONGEST_NAME) || new URL(url).hostname,
      url,
      createdAt: this.now(),
    };
    this.file.set([...this.file.get(), installed]);
    return installed;
  }

  remove(id: string): InstalledApp | null {
    const removed = this.get(id);
    this.file.set(this.file.get().filter((installed) => installed.id !== id));
    return removed;
  }

  flush(): void {
    this.file.flush();
  }
}
