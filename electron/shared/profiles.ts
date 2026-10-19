import type { GroupColourId } from './tab-groups';

/** One person's browsing: its own history, bookmarks, passwords, cookies and settings. */
export interface ProfileSummary {
  id: string;
  name: string;
  colour: GroupColourId;
}

export const MAX_PROFILE_NAME = 40;

/** Settings the whole app has one of, whichever profile changes them: each is applied to every window at once. */
export type AppWideSetting = 'appearance' | 'dnsMode' | 'dnsResolverId' | 'checkForUpdates';
