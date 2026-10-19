import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ImportedBookmarks } from '../../shared/bookmark-import';
import type { ImportSource } from '../../shared/types';
import { bookmarksFromChromium } from './chromium-bookmarks';
import { type ImportedVisit, readChromiumHistory } from './chromium-history';
import { type Machine, findChromiumProfiles } from './chromium-profiles';
import { readFirefoxBookmarks, readFirefoxHistory } from './firefox-places';
import { findFirefoxProfiles } from './firefox-profiles';

/** Another browser's profile, and how to read what it keeps; something it does not keep reads as null. */
export interface ReadableProfile extends ImportSource {
  readBookmarks: () => ImportedBookmarks | null;
  readHistory: (options: { since: number; limit: number }) => ImportedVisit[] | null;
}

/** Every profile on this computer that can be imported from, Chromium-family first, then Firefox. */
export function findReadableProfiles(machine: Machine): ReadableProfile[] {
  const chromium = findChromiumProfiles(machine).map<ReadableProfile>((profile) => {
    const bookmarksFile = path.join(profile.directory, 'Bookmarks');
    const historyFile = path.join(profile.directory, 'History');
    return {
      id: profile.id,
      label: profile.label,
      readBookmarks: () =>
        existsSync(bookmarksFile) ? bookmarksFromChromium(JSON.parse(readFileSync(bookmarksFile, 'utf8'))) : null,
      readHistory: (options) => (existsSync(historyFile) ? readChromiumHistory(historyFile, options) : null),
    };
  });
  const firefox = findFirefoxProfiles(machine).map<ReadableProfile>((profile) => {
    // Firefox keeps bookmarks and history in the one database.
    const places = path.join(profile.directory, 'places.sqlite');
    return {
      id: profile.id,
      label: profile.label,
      readBookmarks: () => readFirefoxBookmarks(places),
      readHistory: (options) => readFirefoxHistory(places, options),
    };
  });
  return [...chromium, ...firefox];
}
