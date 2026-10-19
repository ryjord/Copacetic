import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { orphanedGroupPartitions } from '../../shared/tab-groups';
import { describeError, log } from '../system/diagnostics';

/**
 * Deletes the sessions of groups that no longer exist.
 *
 * Run before any session is opened, because a partition Chromium has open
 * cannot be deleted from under it. A group removed while its tabs stayed open
 * keeps its session until here, so those tabs are not signed out mid-page.
 */
export function sweepOrphanedGroupPartitions(appDataDirectory: string, liveGroupIds: readonly string[]): number {
  const partitionsDirectory = path.join(appDataDirectory, 'Partitions');
  let directoryNames: string[];
  try {
    directoryNames = readdirSync(partitionsDirectory);
  } catch {
    return 0;
  }

  const orphans = orphanedGroupPartitions(directoryNames, liveGroupIds);
  for (const name of orphans) {
    try {
      rmSync(path.join(partitionsDirectory, name), { recursive: true, force: true });
    } catch (error) {
      log.warn('could not remove a deleted group session', describeError(error));
    }
  }
  return orphans.length;
}
