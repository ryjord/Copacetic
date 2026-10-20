// Libs
import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

// Utils
import { type ProfilePartitions, orphanedGroupPartitions } from '../../shared/data/partitions';
import { describeError, log } from '../system/diagnostics';

/**
 * Deletes the sessions of groups that no longer exist.
 *
 * Run before any session is opened, because a partition Chromium has open
 * cannot be deleted from under it. Removing or closing a group clears its
 * session at once; this takes away the folder that is left, and anything a
 * clear did not finish before the app quit.
 */
export function sweepOrphanedGroupPartitions(
  appDataDirectory: string,
  liveGroupIds: readonly string[],
  partitions: ProfilePartitions,
): number {
  const partitionsDirectory = path.join(appDataDirectory, 'Partitions');
  let directoryNames: string[];
  try {
    directoryNames = readdirSync(partitionsDirectory);
  } catch {
    return 0;
  }

  const orphans = orphanedGroupPartitions(directoryNames, liveGroupIds, partitions);
  for (const name of orphans) {
    try {
      rmSync(path.join(partitionsDirectory, name), { recursive: true, force: true });
    } catch (error) {
      log.warn('could not remove a deleted group session', describeError(error));
    }
  }
  return orphans.length;
}
