import { randomBytes } from 'node:crypto';
import { FIRST_PROFILE_ID } from '../../shared/partitions';
import { MAX_PROFILE_NAME, type ProfileSummary } from '../../shared/profiles';
import { GROUP_COLOURS, type GroupColourId } from '../../shared/tab-groups';
import { PersistedFile, isRecord } from './persistence';

interface ProfilesFile {
  profiles: ProfileSummary[];
  /** The profiles that had windows open last, to open again at the next launch. */
  openAtQuit: string[];
}

const FIRST_PROFILE: ProfileSummary = { id: FIRST_PROFILE_ID, name: 'Personal', colour: 'ocean' };

// Part of a folder name and a partition name, so lowercase hex only: nothing a disk could fold together.
const PROFILE_ID = /^[0-9a-f]{12}$/;

const fallback = (): ProfilesFile => ({ profiles: [FIRST_PROFILE], openAtQuit: [FIRST_PROFILE_ID] });

/** Every profile there is, which is app-wide, so it is kept in the app's own folder. */
export class ProfilesStore {
  private readonly file = new PersistedFile<ProfilesFile>('profiles.json', fallback, reviveProfiles);

  list(): ProfileSummary[] {
    return this.file.get().profiles;
  }

  find(id: string): ProfileSummary | null {
    return this.list().find((profile) => profile.id === id) ?? null;
  }

  add(name: string, colour: GroupColourId): ProfileSummary {
    const profile: ProfileSummary = { id: randomBytes(6).toString('hex'), name: nameFrom(name), colour };
    this.file.update((current) => ({ ...current, profiles: [...current.profiles, profile] }));
    return profile;
  }

  update(id: string, changes: { name?: string; colour?: GroupColourId }): void {
    this.file.update((current) => ({
      ...current,
      profiles: current.profiles.map((profile) =>
        profile.id === id
          ? {
              ...profile,
              name: changes.name === undefined ? profile.name : nameFrom(changes.name),
              colour: changes.colour ?? profile.colour,
            }
          : profile,
      ),
    }));
  }

  /** The first profile is where everything from before profiles lives, so it cannot be removed. */
  remove(id: string): boolean {
    if (id === FIRST_PROFILE_ID || !this.find(id)) {
      return false;
    }
    this.file.update((current) => ({
      profiles: current.profiles.filter((profile) => profile.id !== id),
      openAtQuit: current.openAtQuit.filter((openId) => openId !== id),
    }));
    return true;
  }

  openAtQuit(): string[] {
    return this.file.get().openAtQuit;
  }

  setOpenAtQuit(ids: readonly string[]): void {
    this.file.update((current) => ({ ...current, openAtQuit: ids.filter((id) => this.find(id) !== null) }));
  }

  flush(): void {
    this.file.flush();
  }
}

function nameFrom(value: string): string {
  return value.trim().slice(0, MAX_PROFILE_NAME) || 'Profile';
}

function isGroupColour(value: unknown): value is GroupColourId {
  return GROUP_COLOURS.some((colour) => colour.id === value);
}

/** Read from disk, so nothing in it is trusted: an id here becomes a folder and a partition name. */
export function reviveProfiles(raw: unknown): ProfilesFile | null {
  if (!isRecord(raw) || !Array.isArray(raw.profiles)) {
    return null;
  }
  const seen = new Set<string>([FIRST_PROFILE_ID]);
  const stored = raw.profiles.filter(isRecord);
  const first = stored.find((entry) => entry.id === FIRST_PROFILE_ID);
  const others = stored
    .filter((entry) => typeof entry.id === 'string' && PROFILE_ID.test(entry.id))
    .filter((entry) => {
      const id = String(entry.id);
      if (seen.has(id)) {
        return false;
      }
      seen.add(id);
      return true;
    });
  const profiles = [
    {
      ...FIRST_PROFILE,
      name: typeof first?.name === 'string' ? nameFrom(first.name) : FIRST_PROFILE.name,
      colour: isGroupColour(first?.colour) ? first.colour : FIRST_PROFILE.colour,
    },
    ...others.map((entry) => ({
      id: String(entry.id),
      name: typeof entry.name === 'string' ? nameFrom(entry.name) : 'Profile',
      colour: isGroupColour(entry.colour) ? entry.colour : FIRST_PROFILE.colour,
    })),
  ];
  const openAtQuit = Array.isArray(raw.openAtQuit)
    ? raw.openAtQuit.filter((id): id is string => typeof id === 'string' && seen.has(id))
    : [];
  return { profiles, openAtQuit: openAtQuit.length > 0 ? openAtQuit : [FIRST_PROFILE_ID] };
}
