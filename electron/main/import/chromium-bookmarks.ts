// Utils
import {
  type ImportedBookmarks,
  MAX_IMPORTED_FOLDER_NAME,
  MAX_IMPORTED_TITLE,
  isImportable,
} from '../../shared/bookmark-import';
import { sanitiseChromeText } from '../../shared/chrome-text';
import { isRecord } from '../data/persistence';
import { millisecondsFromChromiumTime } from './chromium-time';
import { t } from '../../shared/i18n/translate';

interface ChromiumUrlNode {
  url: string;
  name: string;
  dateAdded: unknown;
  folders: string[];
}

/** Every saved address under a node, however deep, with the folders on the way down; the roots are folders too. */
function urlsIn(node: unknown, folders: string[]): ChromiumUrlNode[] {
  if (!isRecord(node)) {
    return [];
  }
  const name = typeof node.name === 'string' ? node.name : '';
  if (node.type === 'url' && typeof node.url === 'string') {
    return [{ url: node.url.trim(), name, dateAdded: node.date_added, folders }];
  }
  const inside = [
    ...folders,
    sanitiseChromeText(name, MAX_IMPORTED_FOLDER_NAME) || t('main.import.bookmarks.unnamedFolder'),
  ];
  return Array.isArray(node.children) ? node.children.flatMap((child) => urlsIn(child, inside)) : [];
}

/** The bookmarks in a Chromium profile's `Bookmarks` file, each with its folders. */
export function bookmarksFromChromium(raw: unknown): ImportedBookmarks {
  const roots = isRecord(raw) && isRecord(raw.roots) ? Object.values(raw.roots) : [];
  const nodes = roots.flatMap((root) => urlsIn(root, []));
  const importable = nodes.filter((node) => isImportable(node.url));
  const seen = new Set<string>();
  const bookmarks = importable
    .filter((node) => {
      if (seen.has(node.url)) {
        return false;
      }
      seen.add(node.url);
      return true;
    })
    .map((node) => {
      const addedAtMs = millisecondsFromChromiumTime(node.dateAdded);
      return {
        url: node.url,
        title: sanitiseChromeText(node.name, MAX_IMPORTED_TITLE) || node.url,
        addedAt: addedAtMs === null ? null : Math.floor(addedAtMs / 1000),
        folders: node.folders,
      };
    });
  return { bookmarks, skipped: nodes.length - importable.length };
}
