// Libs
import { existsSync } from 'node:fs';
import path from 'node:path';

// Utils
import { PersistedFile, asNumber, isRecord } from '../data/persistence';
import { isExtensionId } from './crx';

// Types
import type { ExtensionSource } from '../../shared/extensions/extensions';

/** One extension this profile has, and where its files are. */
export interface InstalledExtension {
  id: string;
  source: ExtensionSource;
  /** The unpacked folder: inside the profile for one from the store, wherever it was chosen for one in development. */
  folder: string;
  isEnabled: boolean;
  /** Shown on the toolbar, rather than only in the extensions menu. */
  isPinned: boolean;
  installedAt: number;
}

/** The extensions a profile has, kept beside its other files. */
export class ExtensionStore {
  private readonly file: PersistedFile<InstalledExtension[]>;

  constructor(private readonly directory: string) {
    this.file = new PersistedFile(
      'extensions.json',
      () => [],
      (raw) => this.revive(raw),
      { directory },
    );
  }

  /** Where store extensions are unpacked, one folder per id and version. */
  get extensionsDirectory(): string {
    return path.join(this.directory, 'Extensions');
  }

  list(): InstalledExtension[] {
    return this.file.get();
  }

  find(id: string): InstalledExtension | null {
    return this.list().find((entry) => entry.id === id) ?? null;
  }

  put(entry: InstalledExtension): void {
    this.file.update((entries) => [...entries.filter((existing) => existing.id !== entry.id), entry]);
  }

  change(id: string, change: Partial<Pick<InstalledExtension, 'isEnabled' | 'isPinned'>>): void {
    this.file.update((entries) => entries.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)));
  }

  remove(id: string): void {
    this.file.update((entries) => entries.filter((entry) => entry.id !== id));
  }

  flush(): void {
    this.file.flush();
  }

  /** Read off disk, so a store extension's folder must be inside the profile and every folder must still be there. */
  private revive(raw: unknown): InstalledExtension[] | null {
    if (!Array.isArray(raw)) {
      return null;
    }
    const inside = path.resolve(this.extensionsDirectory) + path.sep;
    return raw.flatMap((item) => {
      if (!isRecord(item) || !isExtensionId(item.id) || typeof item.folder !== 'string') {
        return [];
      }
      const source: ExtensionSource = item.source === 'folder' ? 'folder' : 'store';
      const folder = path.resolve(item.folder);
      if ((source === 'store' && !folder.startsWith(inside)) || !existsSync(folder)) {
        return [];
      }
      return [
        {
          id: item.id,
          source,
          folder,
          isEnabled: item.isEnabled !== false,
          isPinned: item.isPinned !== false,
          installedAt: asNumber(item.installedAt, Date.now()),
        },
      ];
    });
  }
}
