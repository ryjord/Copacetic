import { existsSync, readFileSync, renameSync } from 'node:fs';
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
