import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { describeError, log } from '../system/diagnostics';
import { inTransaction } from './database';

/**
 * Brings what a JSON file from an earlier version held into the database, once.
 *
 * In one transaction, so a failure leaves nothing half-imported, and the file
 * is renamed rather than deleted afterwards: a problem with the import can
 * still be recovered from, and the file is never read a second time. A file
 * that cannot be read is left exactly where it was.
 */
export function importLegacyFile<T>(
  database: DatabaseSync,
  directory: string,
  filename: string,
  revive: (raw: unknown) => T | null,
  insert: (value: T) => void,
): void {
  const file = path.join(directory, filename);
  if (!existsSync(file)) {
    return;
  }
  try {
    const value = revive(JSON.parse(readFileSync(file, 'utf8')));
    if (value !== null) {
      inTransaction(database, () => insert(value));
    }
    renameSync(file, `${file}.imported`);
  } catch (error) {
    log.warn('a file from an earlier version could not be imported and was left where it was', {
      file: filename,
      ...describeError(error),
    });
  }
}

/** The JSON stores 2.0 moves into the database, or rewrites, on its first launch. */
const FILES_THE_MIGRATION_CHANGES = [
  'history.json',
  'bookmarks.json',
  'bookmark-folders.json',
  'favicons.json',
  'downloads.json',
  'settings.json',
  'session.json',
  'schema.json',
];

/** Where a 1.x profile's files are copied before 2.0 changes them; copying them back is a full rollback. */
export const BACKUP_BEFORE_MIGRATION = 'before-2.0';

/**
 * Copies a 1.x profile's files aside before the first 2.0 launch touches them.
 *
 * Only once, and only for a profile that has files to lose: one with no
 * database yet but a store from an earlier version. 1.x cannot read the
 * database, so without this copy going back to it finds an empty browser.
 */
export function backUpBeforeMigrating(directory: string): string | null {
  const present = FILES_THE_MIGRATION_CHANGES.filter((name) => existsSync(path.join(directory, name)));
  const backup = path.join(directory, BACKUP_BEFORE_MIGRATION);
  const isFirstMigration = !existsSync(path.join(directory, 'copacetic.db')) && !existsSync(backup);
  if (!isFirstMigration || !present.some((name) => name !== 'schema.json')) {
    return null;
  }
  try {
    mkdirSync(backup, { recursive: true });
    present.forEach((name) => copyFileSync(path.join(directory, name), path.join(backup, name)));
    log.info("copied an earlier version's files aside before migrating", { files: present.length });
    return backup;
  } catch (error) {
    log.warn("could not copy an earlier version's files aside", describeError(error));
    return null;
  }
}
