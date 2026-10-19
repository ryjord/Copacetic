/** The profile every install starts with, and the only one before profiles existed. */
export const FIRST_PROFILE_ID = 'default';

/** The sessions one profile's tabs run in, none of them shared with another profile. */
export interface ProfilePartitions {
  web: string;
  /** No `persist:` prefix - that is what keeps a Hush session in memory and off the disk. */
  hush: string;
  /** What each group's own partition is named from, and what tells its folder apart from anything else. */
  groupPrefix: string;
}

/** The first profile keeps the names it always had, so nobody is signed out of anything by an update. */
export function partitionsFor(profileId: string): ProfilePartitions {
  if (profileId === FIRST_PROFILE_ID) {
    return { web: 'persist:copacetic-web', hush: 'copacetic-hush', groupPrefix: 'copacetic-group-' };
  }
  return {
    web: `persist:copacetic-profile-${profileId}-web`,
    hush: `copacetic-profile-${profileId}-hush`,
    groupPrefix: `copacetic-profile-${profileId}-group-`,
  };
}

export function groupPartition(partitions: ProfilePartitions, groupId: string): string {
  return `persist:${partitions.groupPrefix}${groupId}`;
}

/**
 * Partition directories left behind by groups that no longer exist.
 *
 * Removing a group never removed its session, so its cookies and logins stayed
 * on disk with nothing left that could name them. Only directories this code
 * would have created for this profile are ever returned, whatever else is in the folder.
 */
export function orphanedGroupPartitions(
  directoryNames: readonly string[],
  liveGroupIds: readonly string[],
  partitions: ProfilePartitions,
): string[] {
  const live = new Set(liveGroupIds.map((groupId) => `${partitions.groupPrefix}${groupId}`));
  return directoryNames.filter((name) => name.startsWith(partitions.groupPrefix) && !live.has(name));
}

/**
 * Whether downloads started in a partition are written down.
 *
 * Everything is, except Hush. A download's address, its redirect chain and the
 * time it happened are browsing, and a Hush tab's whole claim is that none of
 * that reaches the disk - the file itself is on disk because it was asked for.
 * Read from the name, because what keeps a session off the disk is the name.
 */
export function remembersDownloads(partition: string): boolean {
  return partition.startsWith('persist:');
}

// Every partition a profile other than the first is given starts with this, followed by its id.
const PROFILE_PARTITION_START = 'copacetic-profile-';

/** Partition directories of profiles that have been removed. The first profile's never match: they carry no id. */
export function removedProfilePartitions(
  directoryNames: readonly string[],
  liveProfileIds: readonly string[],
): string[] {
  return directoryNames.filter((name) => {
    if (!name.startsWith(PROFILE_PARTITION_START)) {
      return false;
    }
    const id = name.slice(PROFILE_PARTITION_START.length).split('-')[0] ?? '';
    return !liveProfileIds.includes(id);
  });
}
