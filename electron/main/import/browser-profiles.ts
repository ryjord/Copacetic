// Libs
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

// Utils
import { bookmarksFromChromium } from './chromium-bookmarks';
import { type ImportedVisit, readChromiumHistory } from './chromium-history';
import { type Machine, findChromiumProfiles } from './chromium-profiles';
import { MAX_IMPORT_FILE_BYTES } from './copy-aside';
import { readFirefoxBookmarks, readFirefoxHistory } from './firefox-places';
import { findFirefoxProfiles } from './firefox-profiles';

// Types
import type { ImportedBookmarks } from '../../shared/data/bookmark-import';
import type { ImportSource } from '../../shared/types';

/** Another browser's profile, and how to read what it keeps; something it does not keep reads as null. */
export interface ReadableProfile extends ImportSource {
  readBookmarks: () => Promise<ImportedBookmarks | null>;
  readHistory: (options: { since: number; limit: number }) => Promise<ImportedVisit[] | null>;
}

/** Every profile on this computer that can be imported from, Chromium-family first, then Firefox. */
export function findReadableProfiles(machine: Machine): ReadableProfile[] {
  const chromium = findChromiumProfiles(machine).map<ReadableProfile>((profile) => {
    const bookmarksFile = path.join(profile.directory, 'Bookmarks');
    const historyFile = path.join(profile.directory, 'History');
    return {
      id: profile.id,
      label: profile.label,
      readBookmarks: async () => {
        if (!existsSync(bookmarksFile)) {
          return null;
        }
        if ((await stat(bookmarksFile)).size > MAX_IMPORT_FILE_BYTES) {
          throw new Error('the bookmarks file is too large to import');
        }
        return bookmarksFromChromium(JSON.parse(await readFile(bookmarksFile, 'utf8')));
      },
      readHistory: async (options) => (existsSync(historyFile) ? readChromiumHistory(historyFile, options) : null),
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
