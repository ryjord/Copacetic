import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { FIRST_PROFILE_ID, removedProfilePartitions } from '../../shared/partitions';
import { describeError, log } from '../system/diagnostics';

const PROFILES_FOLDER = 'profiles';

/** Where a profile keeps everything. The first keeps the app's own folder, where everything from before profiles is. */
export function profileDirectory(appDataDirectory: string, profileId: string): string {
  return profileId === FIRST_PROFILE_ID ? appDataDirectory : path.join(appDataDirectory, PROFILES_FOLDER, profileId);
}

function namesIn(directory: string): string[] {
  try {
    return readdirSync(directory);
  } catch {
    return [];
  }
}

function removeQuietly(target: string): void {
  try {
    rmSync(target, { recursive: true, force: true });
  } catch (error) {
    log.warn('could not remove what a deleted profile left', describeError(error));
  }
}

/**
 * Deletes what removed profiles left behind: their folders, and their sessions.
 *
 * Run at launch, before any session is open, because Chromium will not let a
 * session it has open be deleted, and a profile removed while running had its
 * sessions open until it quit.
 */
export function sweepRemovedProfiles(appDataDirectory: string, liveProfileIds: readonly string[]): void {
  const profilesFolder = path.join(appDataDirectory, PROFILES_FOLDER);
  namesIn(profilesFolder)
    .filter((name) => !liveProfileIds.includes(name))
    .forEach((name) => removeQuietly(path.join(profilesFolder, name)));
  const partitionsFolder = path.join(appDataDirectory, 'Partitions');
  removedProfilePartitions(namesIn(partitionsFolder), liveProfileIds).forEach((name) =>
    removeQuietly(path.join(partitionsFolder, name)),
  );
}
