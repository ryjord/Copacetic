import type { GroupColourId } from '../tabs/tab-groups';

/** One person's browsing: its own history, bookmarks, passwords, cookies and settings. */
export interface ProfileSummary {
  id: string;
  name: string;
  colour: GroupColourId;
  /** When the picture was last set, so a window knows to ask for it again; null shows initials instead. */
  pictureVersion: number | null;
}

export const MAX_PROFILE_NAME = 40;

/** A chosen photo is read up to this size, then kept as a small square. */
export const MAX_PROFILE_PICTURE_BYTES = 10 * 1024 * 1024;

/** The first letters of the first two words, which is what a profile without a photo shows. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toLocaleUpperCase();
}

/** Settings the whole app has one of, whichever profile changes them: each is applied to every window at once. */
export type AppWideSetting = 'appearance' | 'dnsMode' | 'dnsResolverId' | 'checkForUpdates' | 'shortcutOverrides';
