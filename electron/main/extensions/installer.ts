// Libs
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Utils
import { verifyWebStoreCrx } from './crx';
import { readZip, writeEntries } from './zip';
import { readManifest, type Manifest } from './manifest';
import { t } from '../../shared/i18n/translate';

// A store CRX is the archive with its signatures; the largest in the store are well under this.
export const MOST_CRX_BYTES = 256 * 1024 * 1024;

/** How the CRX is fetched, passed in so none of this needs a network to be tested. */
export type FetchBytes = (url: string, maxBytes: number) => Promise<Buffer>;

/** The address Chrome itself asks for a store extension at, for the Chromium version this build runs. */
export function webStoreDownloadUrl(id: string, chromiumVersion: string): string {
  const query = new URLSearchParams({
    response: 'redirect',
    prodversion: chromiumVersion,
    acceptformat: 'crx3',
    x: `id=${id}&uc`,
  });
  return `https://clients2.google.com/service/update2/crx?${query.toString()}`;
}

/** An extension fetched and checked, unpacked to a folder of its own, not yet added. */
export interface StagedExtension {
  id: string;
  folder: string;
  manifest: Manifest;
}

/**
 * Fetches a store extension, checks it is the store's own and the one asked
 * for, and unpacks it into a fresh folder under `extensionsDirectory`. Nothing
 * is loaded: the person is asked first, and `discard` takes the folder away
 * if they say no.
 */
export async function stageFromWebStore(
  id: string,
  extensionsDirectory: string,
  fetchBytes: FetchBytes,
  chromiumVersion: string,
): Promise<StagedExtension> {
  const file = await fetchBytes(webStoreDownloadUrl(id, chromiumVersion), MOST_CRX_BYTES);
  const verified = verifyWebStoreCrx(file, id);
  const entries = readZip(verified.archive);
  // A fresh folder every time, so a failed or refused install never touches one already in use.
  const folder = path.join(extensionsDirectory, id, `staged-${randomUUID()}`);
  try {
    writeEntries(entries, folder);
    const manifest = readManifest(folder);
    // The store leaves the developer's key out; with it back, Chromium gives the extension its store id here too.
    writeFileSync(
      path.join(folder, 'manifest.json'),
      JSON.stringify({ ...manifest.raw, key: verified.publicKey.toString('base64') }, null, 2),
    );
    return { id, folder, manifest };
  } catch (error) {
    rmSync(folder, { recursive: true, force: true });
    throw error;
  }
}

/** Moves a staged extension to its version's folder, replacing an earlier copy of the same version. */
export function keepStaged(staged: StagedExtension): string {
  const target = path.join(path.dirname(staged.folder), safeVersion(staged.manifest.version));
  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
  }
  renameSync(staged.folder, target);
  return target;
}

export function discardStaged(staged: StagedExtension): void {
  rmSync(staged.folder, { recursive: true, force: true });
}

/** An extension someone is building, read where it is and never copied. */
export function readUnpacked(folder: string): Manifest {
  if (!existsSync(path.join(folder, 'manifest.json'))) {
    throw new Error(t('main.extensions.install.badManifest'));
  }
  return readManifest(folder);
}

/** The id Chromium will give an unpacked extension: from the manifest's key when it has one, otherwise its path. */
export function manifestKey(folder: string): string | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(path.join(folder, 'manifest.json'), 'utf8'));
    return typeof raw === 'object' && raw !== null && typeof Reflect.get(raw, 'key') === 'string'
      ? String(Reflect.get(raw, 'key'))
      : null;
  } catch {
    return null;
  }
}

/** A version as a folder name: digits and dots, as the manifest format requires. */
function safeVersion(version: string): string {
  return /^\d+(\.\d+){0,3}$/.test(version) ? version : 'unversioned';
}
