import { type ImportedBookmarks, MAX_IMPORTED_TITLE, isImportable } from '../../shared/bookmark-import';
import { sanitiseChromeText } from '../../shared/chrome-text';
import { isRecord } from '../data/persistence';
import { millisecondsFromChromiumTime } from './chromium-time';

interface ChromiumUrlNode {
  url: string;
  name: string;
  dateAdded: unknown;
}

/** Every saved address under a node, however deep in folders. */
function urlsIn(node: unknown): ChromiumUrlNode[] {
  if (!isRecord(node)) {
    return [];
  }
  if (node.type === 'url' && typeof node.url === 'string') {
    return [
      { url: node.url.trim(), name: typeof node.name === 'string' ? node.name : '', dateAdded: node.date_added },
    ];
  }
  return Array.isArray(node.children) ? node.children.flatMap(urlsIn) : [];
}

/** The bookmarks in a Chromium profile's `Bookmarks` file, flattened as the HTML import flattens them. */
export function bookmarksFromChromium(raw: unknown): ImportedBookmarks {
  const roots = isRecord(raw) && isRecord(raw.roots) ? Object.values(raw.roots) : [];
  const nodes = roots.flatMap(urlsIn);
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
      };
    });
  return { bookmarks, skipped: nodes.length - importable.length };
}
